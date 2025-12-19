import { Router } from 'express';
import { validate, schemas } from '../middleware/validation';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth';
import { smsRateLimiter } from '../middleware/rateLimiter';
import {
  sendSms,
  getSmsLogs,
  createSmsTemplate,
  getSmsTemplates,
  updateSmsTemplate,
  deleteSmsTemplate,
  subscribeSms,
  getSmsSubscriptions,
  unsubscribeSms,
  getSmsStats
} from '../controllers/smsController';

const router: Router = Router();

// Public routes
/**
 * @swagger
 * tags:
 *   name: SMS
 *   description: SMS management and logs
 */

/**
 * @swagger
 * /sms/subscribe:
 *   post:
 *     summary: Subscribe to SMS updates
 *     tags: [SMS]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone_number
 *             properties:
 *               phone_number:
 *                 type: string
 *               crop_id:
 *                 type: string
 *               region_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscribed successfully
 */
router.post('/subscribe', optionalAuth, validate(schemas.smsSubscription), subscribeSms);

/**
 * @swagger
 * /sms/unsubscribe/{phone}:
 *   delete:
 *     summary: Unsubscribe from SMS updates
 *     tags: [SMS]
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Unsubscribed successfully
 */
router.delete('/unsubscribe/:phone', unsubscribeSms);

// Admin routes
/**
 * @swagger
 * /sms/send:
 *   post:
 *     summary: Send SMS (admin only)
 *     tags: [SMS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: SMS sent
 *       403:
 *         description: Admin access required
 */
router.post('/send', authenticate, requireAdmin, smsRateLimiter, validate(schemas.sendSms), sendSms);

/**
 * @swagger
 * /sms/logs:
 *   get:
 *     summary: Get SMS logs (admin only)
 *     tags: [SMS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SMS logs
 *       403:
 *         description: Admin access required
 */
router.get('/logs', authenticate, requireAdmin, getSmsLogs);

/**
 * @swagger
 * /sms/stats:
 *   get:
 *     summary: Get SMS statistics (admin only)
 *     tags: [SMS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SMS statistics
 *       403:
 *         description: Admin access required
 */
router.get('/stats', authenticate, requireAdmin, getSmsStats);

/**
 * @swagger
 * /sms/subscriptions:
 *   get:
 *     summary: Get SMS subscriptions (admin only)
 *     tags: [SMS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SMS subscriptions
 *       403:
 *         description: Admin access required
 */
router.get('/subscriptions', authenticate, requireAdmin, getSmsSubscriptions);

// Template management
/**
 * @swagger
 * /sms/templates:
 *   get:
 *     summary: Get SMS templates (admin only)
 *     tags: [SMS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SMS templates
 *       403:
 *         description: Admin access required
 */
router.get('/templates', authenticate, requireAdmin, getSmsTemplates);

/**
 * @swagger
 * /sms/templates:
 *   post:
 *     summary: Create SMS template (admin only)
 *     tags: [SMS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - content
 *             properties:
 *               name:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Template created
 *       403:
 *         description: Admin access required
 */
router.post('/templates', authenticate, requireAdmin, validate(schemas.createSmsTemplate), createSmsTemplate);

/**
 * @swagger
 * /sms/templates/{id}:
 *   put:
 *     summary: Update SMS template (admin only)
 *     tags: [SMS]
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
 *             properties:
 *               name:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Template updated
 *       403:
 *         description: Admin access required
 */
router.put('/templates/:id', authenticate, requireAdmin, validate(schemas.updateSmsTemplate), updateSmsTemplate);

/**
 * @swagger
 * /sms/templates/{id}:
 *   delete:
 *     summary: Delete SMS template (admin only)
 *     tags: [SMS]
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
 *         description: Template deleted
 *       403:
 *         description: Admin access required
 */
router.delete('/templates/:id', authenticate, requireAdmin, deleteSmsTemplate);

export default router;