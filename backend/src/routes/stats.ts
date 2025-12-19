import { Router } from 'express';
import { getPublicStats } from '../controllers/statsController';

const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: Stats
 *   description: Public statistics
 */

/**
 * @swagger
 * /stats/public:
 *   get:
 *     summary: Get public system statistics
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Public stats
 */
router.get('/public', getPublicStats);

export default router;