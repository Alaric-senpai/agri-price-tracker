import { Router } from 'express';
import { validate, schemas, validateQuery, querySchemas } from '../middleware/validation';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth';
import { priceSubmissionRateLimiter } from '../middleware/rateLimiter';
import {
  getPrices,
  createPriceEntry,
  updatePriceEntry,
  deletePriceEntry,
  getPendingVerifications,
  verifyPriceEntry,
  rejectPriceEntry
} from '../controllers/priceController';

const router: Router = Router();

// Public routes (with optional auth)
/**
 * @swagger
 * tags:
 *   name: Prices
 *   description: Price monitoring and submission
 */

/**
 * @swagger
 * /prices:
 *   get:
 *     summary: Get prices
 *     tags: [Prices]
 *     parameters:
 *       - in: query
 *         name: crop_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: region_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of prices
 */
router.get('/', optionalAuth, validateQuery(querySchemas.priceQuery), getPrices);

/**
 * @swagger
 * /prices/submit:
 *   post:
 *     summary: Public price submission
 *     tags: [Prices]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - crop_id
 *               - price
 *               - market_id
 *             properties:
 *               crop_id:
 *                 type: string
 *               price:
 *                 type: number
 *               market_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Price submitted
 */
router.post('/submit', createPriceEntry);

/**
 * @swagger
 * /prices:
 *   post:
 *     summary: Submit price (authenticated)
 *     tags: [Prices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - crop_id
 *               - price
 *               - market_id
 *             properties:
 *               crop_id:
 *                 type: string
 *               price:
 *                 type: number
 *               market_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Price submitted
 */
router.post('/', authenticate, priceSubmissionRateLimiter, validate(schemas.createPriceEntry), createPriceEntry);

/**
 * @swagger
 * /prices/pending:
 *   get:
 *     summary: Get pending price verifications
 *     tags: [Prices]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending verifications
 *       403:
 *         description: Admin access required
 */
router.get('/pending', authenticate, requireAdmin, getPendingVerifications);

/**
 * @swagger
 * /prices/{id}:
 *   put:
 *     summary: Update a price entry
 *     tags: [Prices]
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
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Price updated
 */
router.put('/:id', authenticate, requireAdmin, validate(schemas.updatePriceEntry), updatePriceEntry);

/**
 * @swagger
 * /prices/{id}:
 *   delete:
 *     summary: Delete a price entry
 *     tags: [Prices]
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
 *         description: Price deleted
 */
router.delete('/:id', authenticate, requireAdmin, deletePriceEntry);

/**
 * @swagger
 * /prices/{id}/verify:
 *   put:
 *     summary: Verify a price entry
 *     tags: [Prices]
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
 *         description: Price verified
 */
router.put('/:id/verify', authenticate, requireAdmin, verifyPriceEntry);

/**
 * @swagger
 * /prices/{id}/reject:
 *   delete:
 *     summary: Reject a price entry
 *     tags: [Prices]
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
 *         description: Price rejected
 */
router.delete('/:id/reject', authenticate, requireAdmin, rejectPriceEntry);

export default router;