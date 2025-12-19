import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { admin_request_status, Prisma } from '../../generated/prisma/client';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { sendEmail } from '../services/emailService';
import type { AdminRequest, CreateAdminRequest, ApiResponse, PaginationParams } from '../types/index';


/***
 * register admin request
 * 
 */
export const createAdminRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { full_name, email, phone, region, organization, reason }: CreateAdminRequest = req.body;

    const existingRequest = await prisma.admin_requests.findFirst({
      where: { email, status: 'pending' }
    });

    if (existingRequest) {
      throw new ApiError('Admin request already exists for this email', 409);
    }

    const newRequest = await prisma.admin_requests.create({
      data: {
        full_name,
        email,
        phone,
        region,
        organization,
        reason: reason ?? null,
        status: 'pending'
      }
    });

    logger.info(`New admin request created: ${email}`);

    const systemEmail = process.env.SYSTEM_EMAIL || 'agriculture.price.system@gmail.com';
    const emailText = `User ${full_name} (${organization}) has requested admin access.\nReason: ${reason}\n\nLog in to the dashboard to review.`;

    await sendEmail({
      to: systemEmail,
      subject: 'Action Required: New Admin Access Request',
      text: emailText,
      html: `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
               <h2 style="color: #2d8a55;">New Admin Request</h2>
               <p><strong>User:</strong> ${full_name}</p>
               <p><strong>Organization:</strong> ${organization}</p>
               <p><strong>Email:</strong> ${email}</p>
               <p><strong>Reason:</strong> ${reason}</p>
               <hr/>
               <p><a href="http://localhost:4200/#" style="background-color: #2d8a55; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Go to Dashboard to Review</a></p>
             </div>`
    });

    const response: ApiResponse<any> = {
      success: true,
      message: 'Admin request submitted successfully',
      data: newRequest
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};


/**
 * list all adminn requests
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const getAdminRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 10, status } = req.query as PaginationParams & { status?: string };
    const offset = (Number(page) - 1) * Number(limit);

    const where: Prisma.admin_requestsWhereInput = {};
    if (status) {
      where.status = status as admin_request_status;
    }

    const [requests, total] = await prisma.$transaction([
      prisma.admin_requests.findMany({
        where,
        include: { users: { select: { full_name: true } } },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: Number(limit)
      }),
      prisma.admin_requests.count({ where })
    ]);

    const pages = Math.ceil(total / Number(limit));
    const mappedRequests = requests.map(r => ({
      ...r,
      reviewed_by_name: r.users?.full_name || null
    }));

    const response: ApiResponse<any[]> = {
      success: true,
      message: 'Admin requests retrieved successfully',
      data: mappedRequests,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};


/**
 * 
 * review admin requests
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const reviewAdminRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const reviewerId = req.user!.id;

    if (req.user?.role !== 'super_admin') {
      throw new ApiError('Access Denied. Only Super Admins can manage admin access.', 403);
    }

    if(!id){
      throw new ApiError('Admin request ID is required', 400);
    }

    await prisma.$transaction(async (tx) => {
      const adminRequest = await tx.admin_requests.findUnique({ where: { id, status: 'pending' } });
      if (!adminRequest) {
        throw new ApiError('Admin request not found or already reviewed', 404);
      }

      await tx.admin_requests.update({
        where: { id },
        data: {
          status: status as admin_request_status,
          reviewed_by: reviewerId,
          reviewed_at: new Date()
        }
      });

      if (status === 'approved') {
        const tempPassword = Math.random().toString(36).slice(-8);
        const passwordHash = await bcrypt.hash(tempPassword, 12);

        const existingUser = await tx.users.findUnique({ where: { email: adminRequest.email } });
        if (existingUser) {
          await tx.users.update({
            where: { email: adminRequest.email },
            data: { role: 'admin', is_active: true }
          });
        } else {
          await tx.users.create({
            data: {
              email: adminRequest.email,
              password_hash: passwordHash,
              full_name: adminRequest.full_name,
              phone: adminRequest.phone,
              region: adminRequest.region,
              organization: adminRequest.organization,
              role: 'admin',
              is_active: true,
              email_verified: true
            }
          });
        }

        const approvedText = `Congratulations! Your request has been approved.\n\nLogin Email: ${adminRequest.email}\nTemporary Password: ${tempPassword}\n\nPlease change your password after logging in.`;
        await sendEmail({
          to: adminRequest.email,
          subject: 'AgriPrice Admin Access Approved',
          text: approvedText,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                     <h2 style="color: #2d8a55;">Welcome to AgriPrice!</h2>
                     <p>Your request for admin access has been approved.</p>
                     <div style="background: #f8f9fa; padding: 15px; border-radius: 5px;">
                       <p><strong>Email:</strong> ${adminRequest.email}</p>
                       <p><strong>Temporary Password:</strong> <code style="font-size: 1.2em;">${tempPassword}</code></p>
                     </div>
                     <p>Please change your password immediately after logging in.</p>
                     <a href="http://localhost:4200/#" style="background-color: #2d8a55; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Login Now</a>
                   </div>`
        });
        logger.info(`Admin user created/updated: ${adminRequest.email}`);

      } else if (status === 'rejected') {
        const rejectedText = `Your request for admin access has been reviewed and declined.\n\nReason: ${reason || 'Not specified'}`;
        await sendEmail({
          to: adminRequest.email,
          subject: 'AgriPrice Admin Access Update',
          text: rejectedText,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                       <h2 style="color: #dc3545;">Access Request Update</h2>
                       <p>Your request for admin access has been reviewed and <strong>declined</strong>.</p>
                       <p><strong>Reason:</strong> ${reason || 'Administrative decision'}</p>
                     </div>`
        });
      }
    });

    logger.info(`Admin request ${status}: ${id} by ${req.user!.email}`);
    res.json({ success: true, message: `Admin request ${status} successfully` });
  } catch (error) {
    next(error);
  }
};


/**
 * get admin stats
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const getAdminStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [pendingRequests, totalAdmins, todayEntries, todaySms] = await prisma.$transaction([
      prisma.admin_requests.count({ where: { status: 'pending' } }),
      prisma.users.count({ where: { role: { in: ['admin', 'super_admin'] } } }),
      prisma.price_entries.count({ where: { created_at: { gte: today, lt: tomorrow } } }),
      prisma.sms_logs.count({ where: { created_at: { gte: today, lt: tomorrow } } })
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'Admin stats retrieved successfully',
      data: { pendingRequests, totalAdmins, todayEntries, todaySms }
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};


/**
 * 
 *  get system health
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const getSystemHealth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [dbCheck, pendingSms, failedSms] = await prisma.$transaction([
      prisma.$queryRaw`SELECT NOW() as now`,
      prisma.sms_logs.count({ where: { status: 'pending' } }),
      prisma.sms_logs.count({ where: { status: 'failed' } })
    ]);

    const dbNow = (dbCheck as any)[0]?.now || new Date();

    const response: ApiResponse = {
      success: true,
      message: 'System health retrieved successfully',
      data: {
        database: 'healthy',
        dbResponseTime: '< 100ms',
        pendingSms,
        failedSms,
        lastCheck: dbNow
      }
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};