import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../utils/apiError';
import type { ApiResponse, PaginationParams } from '../types/index';

const router: Router = Router();

// Get all users (admin only)
/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: List of users
 *       403:
 *         description: Admin access required
 */
router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, region, is_active } = req.query as PaginationParams & {
      role?: string;
      region?: string;
      is_active?: string | boolean;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};

    if (role) {
      where.role = role; // Assuming strict match or mapping to enum if needed, but string works if types match
    }

    if (region) {
      where.region = { contains: region, mode: 'insensitive' };
    }

    if (is_active !== undefined) {
      where.is_active = is_active === 'true' || is_active === true;
    }

    const [users, total] = await prisma.$transaction([
      prisma.users.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
        select: {
          id: true,
          email: true,
          full_name: true,
          phone: true,
          role: true,
          region: true,
          organization: true,
          is_active: true,
          email_verified: true,
          last_login: true,
          created_at: true,
          updated_at: true
        }
      }),
      prisma.users.count({ where })
    ]);

    const pages = Math.ceil(total / take);

    const response: ApiResponse = {
      success: true,
      message: 'Users retrieved successfully',
      data: users,
      pagination: {
        page: Number(page),
        limit: take,
        total,
        pages
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Get user by ID (admin only)
/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *       403:
 *         description: Admin access required
 */
router.get('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };

    const user = await prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        full_name: true,
        phone: true,
        role: true,
        region: true,
        organization: true,
        is_active: true,
        email_verified: true,
        last_login: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!user) {
      throw new ApiError('User not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      message: 'User retrieved successfully',
      data: user
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Update user status (admin only)
/**
 * @swagger
 * /users/{id}/status:
 *   put:
 *     summary: Update user status
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - is_active
 *             properties:
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User status updated
 *       403:
 *         description: Admin access required
 */
router.put('/:id/status', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { is_active } = req.body;

    const user = await prisma.users.update({
      where: { id },
      data: { is_active }, // Removing updated_at based on previous experience, assuming DB trigger or optional
      select: {
        id: true,
        email: true,
        full_name: true,
        phone: true,
        role: true,
        region: true,
        organization: true,
        is_active: true,
        email_verified: true,
        last_login: true,
        created_at: true,
        updated_at: true
      }
    });

    const response: ApiResponse = {
      success: true,
      message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
      data: user
    };

    res.json(response);
  } catch (error) {
    if (error.code === 'P2025') {
      next(new ApiError('User not found', 404));
    } else {
      next(error);
    }
  }
});

// Update user role (admin only)
/**
 * @swagger
 * /users/{id}/role:
 *   put:
 *     summary: Update user role
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [farmer, admin, super_admin]
 *     responses:
 *       200:
 *         description: User role updated
 *       403:
 *         description: Admin access required
 */
router.put('/:id/role', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { role } = req.body;

    if (!['farmer', 'admin', 'super_admin'].includes(role)) {
      throw new ApiError('Invalid role', 400);
    }

    // Type coercion for role if it's an enum in Prisma. 
    // Assuming Prisma converts string to enum automatically if valid.

    const user = await prisma.users.update({
      where: { id },
      data: { role: role as any }, // usage of any to bypass potential strict enum type issues if import is missing
      select: {
        id: true,
        email: true,
        full_name: true,
        phone: true,
        role: true,
        region: true,
        organization: true,
        is_active: true,
        email_verified: true,
        last_login: true,
        created_at: true,
        updated_at: true
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'User role updated successfully',
      data: user
    };

    res.json(response);
  } catch (error) {
    if (error.code === 'P2025') {
      next(new ApiError('User not found', 404));
    } else {
      next(error);
    }
  }
});

// Delete user (admin only)
/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted
 *       403:
 *         description: Admin access required
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };

    // Prevent deleting super admin
    const userCheck = await prisma.users.findUnique({
      where: { id },
      select: { role: true }
    });

    if (userCheck && userCheck.role === 'super_admin') {
      throw new ApiError('Cannot delete super admin user', 403);
    }

    if (!userCheck) {
      throw new ApiError('User not found', 404);
    }

    await prisma.users.delete({
      where: { id }
    });

    const response: ApiResponse = {
      success: true,
      message: 'User deleted successfully'
    };

    res.json(response);
  } catch (error) {
    if (error.code === 'P2025') {
      next(new ApiError('User not found', 404));
    } else {
      next(error);
    }
  }
});

export default router;