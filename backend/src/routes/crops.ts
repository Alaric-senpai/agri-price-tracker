import { Router } from 'express';
import { validate, schemas } from '../middleware/validation';
import { authenticate, requireAdmin } from '../middleware/auth';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../utils/apiError';
import type { ApiResponse } from '../types/index';

const router: Router = Router();

// Get all crops (public)
/**
 * @swagger
 * tags:
 *   name: Crops
 *   description: Crop management
 */

/**
 * @swagger
 * /crops:
 *   get:
 *     summary: Get all crops
 *     tags: [Crops]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of crops
 */
router.get('/', async (req, res, next) => {
  try {
    const { category, is_active } = req.query as { category?: string; is_active?: string };

    const where: any = {};
    if (is_active !== undefined) {
      where.is_active = is_active === 'true';
    } else {
      where.is_active = true;
    }

    if (category) {
      where.category = category;
    }

    const crops = await prisma.crops.findMany({
      where,
      orderBy: { name: 'asc' }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Crops retrieved successfully',
      data: crops
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Get crop by ID (public)
/**
 * @swagger
 * /crops/{id}:
 *   get:
 *     summary: Get crop by ID
 *     tags: [Crops]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Crop details
 *       404:
 *         description: Crop not found
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };

    const crop = await prisma.crops.findUnique({
      where: { id }
    });

    if (!crop) {
      throw new ApiError('Crop not found', 404);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Crop retrieved successfully',
      data: crop
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Create crop (admin only)
/**
 * @swagger
 * /crops:
 *   post:
 *     summary: Create a new crop
 *     tags: [Crops]
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
 *               - category
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *               unit:
 *                 type: string
 *     responses:
 *       201:
 *         description: Crop created
 *       403:
 *         description: Admin access required
 */
router.post('/', authenticate, requireAdmin, validate(schemas.createCrop), async (req, res, next) => {
  try {
    const { name, category, description, unit = 'kg' } = req.body;

    const crop = await prisma.crops.create({
      data: {
        name,
        category,
        description,
        unit
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Crop created successfully',
      data: crop
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// Update crop (admin only)
/**
 * @swagger
 * /crops/{id}:
 *   put:
 *     summary: Update crop
 *     tags: [Crops]
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
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *               unit:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Crop updated
 *       403:
 *         description: Admin access required
 */
router.put('/:id', authenticate, requireAdmin, validate(schemas.updateCrop), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { name, category, description, unit, is_active } = req.body;

    const crop = await prisma.crops.update({
      where: { id },
      data: {
        name,
        category,
        description,
        unit,
        is_active
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Crop updated successfully',
      data: crop
    };

    res.json(response);
  } catch (error) {
    if (error.code === 'P2025') {
      next(new ApiError('Crop not found', 404));
    } else {
      next(error);
    }
  }
});

// Delete crop (admin only)
/**
 * @swagger
 * /crops/{id}:
 *   delete:
 *     summary: Delete crop
 *     tags: [Crops]
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
 *         description: Crop deleted
 *       403:
 *         description: Admin access required
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };

    await prisma.crops.delete({
      where: { id }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Crop deleted successfully'
    };

    res.json(response);
  } catch (error) {
    if (error.code === 'P2025') {
      next(new ApiError('Crop not found', 404));
    } else {
      next(error);
    }
  }
});

export default router;