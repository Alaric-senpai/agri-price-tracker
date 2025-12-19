import { Router } from 'express';
import { validate, schemas } from '../middleware/validation';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import {
  createAdminRequest,
  getAdminRequests,
  reviewAdminRequest,
  getAdminStats,
  getSystemHealth
} from '../controllers/adminController.js';

const router: Router = Router();


/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management and monitoring
 */

/**
 * @swagger
 * /admin/request:
 *   post:
 *     summary: Request admin access
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: Request submitted successfully
 *       400:
 *         description: Invalid input
 */
router.post('/request', validate(schemas.adminRequest), createAdminRequest);

/**
 * @swagger
 * /admin/requests:
 *   get:
 *     summary: Get pending admin requests
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending requests
 *       403:
 *         description: Admin access required
 */
router.get('/requests', authenticate, requireAdmin, getAdminRequests);

/**
 * @swagger
 * /admin/requests/{id}/review:
 *   put:
 *     summary: Review an admin request
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Request ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *     responses:
 *       200:
 *         description: Request reviewed successfully
 *       403:
 *         description: Super Admin access required
 */
router.put('/requests/:id/review', authenticate, requireSuperAdmin, validate(schemas.reviewAdminRequest), reviewAdminRequest);

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Get system statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System statistics
 *       403:
 *         description: Admin access required
 */
router.get('/stats', authenticate, requireAdmin, getAdminStats);

/**
 * @swagger
 * /admin/health:
 *   get:
 *     summary: Get system health status
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System health status
 *       403:
 *         description: Admin access required
 */
router.get('/health', authenticate, requireAdmin, getSystemHealth);

export default router;