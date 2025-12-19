import { Router } from 'express';
import multer from 'multer';
import {
  triggerKamisSync,
  uploadKamisData,
  getKamisStatus,
  getKamisLogs
} from '../controllers/kamisController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.use(authenticate);

router.use(requireAdmin);


/**
 * @swagger
 * tags:
 *   name: KAMIS
 *   description: KAMIS data integration
 */

/**
 * @swagger
 * /kamis/upload:
 *   post:
 *     summary: Upload KAMIS data file
 *     tags: [KAMIS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File processed
 *       403:
 *         description: Admin access required
 */
router.post('/upload', upload.single('file'), uploadKamisData);

/**
 * @swagger
 * /kamis/sync:
 *   post:
 *     summary: Trigger manual KAMIS sync
 *     tags: [KAMIS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync started
 *       403:
 *         description: Admin access required
 */
router.post('/sync', triggerKamisSync);

/**
 * @swagger
 * /kamis/status:
 *   get:
 *     summary: Get KAMIS sync status
 *     tags: [KAMIS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status
 *       403:
 *         description: Admin access required
 */
router.get('/status', getKamisStatus);

/**
 * @swagger
 * /kamis/logs:
 *   get:
 *     summary: Get KAMIS sync logs
 *     tags: [KAMIS]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync logs
 *       403:
 *         description: Admin access required
 */
router.get('/logs', getKamisLogs);

export default router;