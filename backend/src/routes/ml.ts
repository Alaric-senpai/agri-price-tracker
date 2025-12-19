import { Router } from 'express';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth';
import { generatePricePrediction, getPredictions, generateDailyPredictions } from '../services/mlService';
import type { ApiResponse } from '../types/index';
import { prisma } from '../../lib/prisma';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/apiError';
import axios from 'axios';

const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: ML
 *   description: Machine Learning predictions
 */

/**
 * @swagger
 * /ml:
 *   get:
 *     summary: Check ML service status
 *     tags: [ML]
 *     responses:
 *       200:
 *         description: Service status
 *       503:
 *         description: Service unavailable
 */
router.get('/', optionalAuth, async (req, res, next): Promise<void> => {
  try {
    const mlServiceResponse = await axios.get(
      `${process.env.ML_MODEL_URL}/`,
      { timeout: 5000 }
    );

    const response: ApiResponse = {
      success: true,
      message: 'ML service status retrieved successfully',
      data: mlServiceResponse.data
    };
    res.json(response);

  } catch (error: any) {
    logger.error('Failed to connect to ML service:', error.message);
    next(new ApiError('ML service is unavailable', 503));
  }
});

/**
 * @swagger
 * /ml/predictions:
 *   get:
 *     summary: Get price predictions
 *     tags: [ML]
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
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of predictions
 */
router.get('/predictions', optionalAuth, async (req, res, next): Promise<void> => {
  try {
    const { crop_id, region_id, limit = 20 } = req.query;

    const predictions = await getPredictions(
      crop_id as string,
      region_id as string,
      Number(limit)
    );

    const response: ApiResponse = {
      success: true,
      message: 'Price predictions retrieved successfully',
      data: predictions
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});


/**
 * @swagger
 * /ml/predictions/generate:
 *   post:
 *     summary: Generate specific prediction
 *     tags: [ML]
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
 *               - region_id
 *               - market_id
 *             properties:
 *               crop_id:
 *                 type: string
 *               region_id:
 *                 type: string
 *               market_id:
 *                 type: string
 *               prediction_days:
 *                 type: integer
 *                 default: 7
 *     responses:
 *       200:
 *         description: Prediction generated
 *       403:
 *         description: Admin access required
 */
router.post('/predictions/generate', authenticate, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { crop_id, region_id, market_id, prediction_days = 7 } = req.body;

    if (!crop_id || !region_id || !market_id) {
      res.status(400).json({
        success: false,
        message: 'crop_id, region_id, and market_id are required'
      });
      return;
    }

    const [crop, region, market] = await Promise.all([
      prisma.crops.findUnique({
        where: { id: crop_id },
        select: { name: true }
      }),
      prisma.regions.findUnique({
        where: { id: region_id },
        select: { name: true }
      }),
      prisma.markets.findUnique({
        where: { id: market_id },
        select: { name: true }
      })
    ]);

    if (!crop || !region || !market) {
      const err: any = new Error('Could not find names for one or more IDs.');
      err.status = 500;
      throw err;
    }

    const crop_name = crop.name;
    const region_name = region.name;
    const market_name = market.name;

    if (!crop_name || !region_name || !market_name) {
      res.status(404).json({
        success: false,
        message: 'One or more IDs (crop, region, market) are invalid.'
      });
      return;
    }

    const prediction = await generatePricePrediction(
      crop_name,
      market_name,
      region_name,
      crop_id as string,
      region_id as string,
      Number(prediction_days)
    );

    if (!prediction) {
      res.status(400).json({
        success: false,
        message: 'Insufficient data to generate prediction'
      });
      return;
    }

    const response: ApiResponse = {
      success: true,
      message: 'Price prediction generated successfully',
      data: prediction
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /ml/predictions/run-daily-job:
 *   post:
 *     summary: Trigger daily prediction job
 *     tags: [ML]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Job started
 *       403:
 *         description: Admin access required
 */
router.post('/predictions/run-daily-job', authenticate, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    generateDailyPredictions();

    const response: ApiResponse = {
      success: true,
      message: 'Daily prediction job started in the background.'
    };
    res.status(202).json(response);

  } catch (error) {
    next(error);
  }
});

export default router;