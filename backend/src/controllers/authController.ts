import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../utils/apiError';
import { generateToken, generateRefreshToken } from '../middleware/auth';
import { logger } from '../utils/logger';
import { sendEmail } from '../services/emailService';
import { sendSmsMessage } from '../services/smsService';
import type { User, CreateUserRequest, LoginRequest, AuthResponse, ApiResponse } from '../types/index';

/**
 * Register a new user
 * @param req - The request object
 * @param res - The response object
 * @param next - The next function
 */
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, full_name, phone, region, organization }: CreateUserRequest = req.body;

    // Check if user already exists
    const existingUser = await prisma.users.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new ApiError('User already exists with this email', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.users.create({
      data: {
        email,
        password_hash: passwordHash,
        full_name,
        phone: phone ?? null,
        region: region ?? null,
        organization: organization ?? null,

        is_active: true, // Default to true as per SQL logic implies (though SQL didn't set it explicitly, existing code returned it. schema usually has default)
        email_verified: false, // Default
        role: 'farmer' // Default role
      }
    });

    // Generate tokens
    // Cast to User type if needed, but Prisma result should be compatible 
    // except for Date fields which are Date objects in Prisma vs potentially strings in some raw driver settings, but here types say Date.
    const token = generateToken(user as unknown as User);
    const refreshToken = generateRefreshToken(user as unknown as User);

    logger.info(`New user registered: ${email}`);

    const response: ApiResponse<AuthResponse> = {
      success: true,
      message: 'User registered successfully',
      data: {
        user: user as unknown as User,
        token,
        refreshToken
      }
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * 
 * login functionality
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Get user with password
    const user = await prisma.users.findUnique({
      where: { email }
    });

    if (!user) {
      throw new ApiError('Invalid credentials', 401);
    }

    // Check if user is active
    if (!user.is_active) {
      throw new ApiError('Account is deactivated', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new ApiError('Invalid credentials', 401);
    }

    // Update last login
    await prisma.users.update({
      where: { id: user.id },
      data: { last_login: new Date() }
    });

    // Remove password from user object
    const { password_hash, ...userWithoutPassword } = user;

    // Generate tokens
    const token = generateToken(userWithoutPassword as unknown as User);
    const refreshToken = generateRefreshToken(userWithoutPassword as unknown as User);

    logger.info(`User logged in: ${email}`);

    const response: ApiResponse<AuthResponse> = {
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword as unknown as User,
        token,
        refreshToken
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * 
 * handle refresh token generation
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ApiError('Refresh token is required', 400);
    }

    // Verify refresh token logic would go here

    const response: ApiResponse = {
      success: true,
      message: 'Token refreshed successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * 
 * get current logged in users profile
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const response: ApiResponse<User> = {
      success: true,
      message: 'Profile retrieved successfully',
      data: req.user!
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * 
 * update current logged in users profile
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { full_name, phone, region, organization } = req.body;
    const userId = req.user!.id;

    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: {
        full_name,
        phone,
        region,
        organization,
        updated_at: new Date()
      }
    });

    const response: ApiResponse<User> = {
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser as unknown as User
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};


/**
 * change password
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user!.id;

    // Get current password hash
    const user = await prisma.users.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(current_password, user.password_hash);
    if (!isValidPassword) {
      throw new ApiError('Current password is incorrect', 400);
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(new_password, 12);

    // Update password
    await prisma.users.update({
      where: { id: userId },
      data: {
        password_hash: newPasswordHash,
        updated_at: new Date()
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Password changed successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};


/**
 * forgot password
 * 
 * @param req 
 * @param res 
 * @param next 
 * @returns 
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ApiError('Email is required', 400);
    }

    const user = await prisma.users.findUnique({
      where: { email }
    });

    const genericResponse: ApiResponse = {
      success: true,
      message: 'If an account with that email exists, a password reset link has been processed.',
    };

    if (!user) {
      logger.warn(`Password reset requested for non-existent email: ${email}`);
      res.json(genericResponse);
      return;
    }

    await prisma.$transaction(async (tx) => {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiration = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await tx.password_reset_tokens.deleteMany({
        where: { user_id: user.id }
      });

      await tx.password_reset_tokens.create({
        data: {
          user_id: user.id,
          token: resetToken,
          expires_at: tokenExpiration
        }
      });

      const resetUrl = `${process.env.CORS_ORIGIN}/#/reset-password?token=${resetToken}&email=${email}`;

      if (email.endsWith('@agriprice.local')) {
        if (!user.phone) {
          logger.error(`Farmer reset failed: User ${email} has no phone number on record.`);
          return;
        }

        logger.info(`Farmer password reset requested for: ${email}. Sending SMS to ${user.phone}.`);
        const smsContent = `To reset your AgriPrice password, click this link (expires in 1 hour): ${resetUrl}`;

        try {
          const cleanPhone = user.phone.replace(/\s/g, '');
          await sendSmsMessage(cleanPhone, smsContent, 'password-reset');
          logger.info(`Password reset SMS sent to user: ${email} (phone: ${cleanPhone})`);
        } catch (smsError) {
          logger.error(`FAILED to send SMS for user ${email}.`, smsError);
          logger.warn(`FALLBACK SMS LINK for ${user.phone}: ${resetUrl}`);
        }

      } else {
        logger.info(`Admin password reset requested for: ${email}. Sending email.`);

        const emailContent = {
          to: email,
          subject: '🔑 Password Reset Request for AgriPrice System',
          text: `Dear ${user.full_name},\n\nYou requested a password reset. Please click the following link to reset your password: ${resetUrl}\n\nThis link will expire in one hour. If you did not request this, please ignore this email.`,
          html: `<p>Dear ${user.full_name},</p>
                <p>You requested a password reset. Click the link below to set a new password:</p>
                <p><a href="${resetUrl}"><strong>Reset My Password</strong></a></p>
                <p>This link will expire in one hour.</p>
                <p>If you did not request this, please ignore this email.</p>`,
        };

        await sendEmail(emailContent);
        logger.info(`Password reset email sent for user: ${email}`);
      }
    });

    res.json(genericResponse);

  } catch (error) {
    logger.error('Error during forgot password process:', error);
    const securityMaskedResponse: ApiResponse = {
      success: true,
      message: 'If an account with that email exists, a password reset link has been processed.',
    };
    res.json(securityMaskedResponse);
  }
};

/**
 * 
 * reset password
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, email, new_password } = req.body;

    if (!token || !email || !new_password) {
      throw new ApiError('Token, email, and new password are required', 400);
    }

    // Find the token and associated user
    const resetTokenRecord = await prisma.password_reset_tokens.findFirst({
      where: { token },
      include: { users: true }
    });

    if (!resetTokenRecord || !resetTokenRecord.users || resetTokenRecord.users.email !== email) {
      throw new ApiError('Invalid or already used password reset token', 400);
    }

    if (new Date(resetTokenRecord.expires_at).getTime() < Date.now()) {
      await prisma.password_reset_tokens.deleteMany({ where: { user_id: resetTokenRecord.user_id } });
      throw new ApiError('Password reset token has expired', 400);
    }

    const newPasswordHash = await bcrypt.hash(new_password, 12);
    const userId = resetTokenRecord.user_id;

    await prisma.$transaction(async (tx) => {
      await tx.users.update({
        where: { id: userId },
        data: {
          password_hash: newPasswordHash,
          updated_at: new Date()
        }
      });

      await tx.password_reset_tokens.deleteMany({
        where: { user_id: userId }
      });
    });

    logger.info(`Password successfully reset for user ID: ${userId}`);

    const response: ApiResponse = {
      success: true,
      message: 'Password has been successfully reset. You can now log in.',
    };

    res.json(response);

  } catch (error) {
    next(error);
  }
};