import { Router } from 'express';
import { validate, schemas } from '../middleware/validation';
import { authenticate, requireAdmin } from '../middleware/auth';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../utils/apiError';
import type { ApiResponse } from '../types/index';

const router: Router = Router();

/**
 * @swagger
 * tags:
 *   name: Regions
 *   description: Region management
 */

/**
 * @swagger
 * /regions:
 *   get:
 *     summary: Get all regions
 *     tags: [Regions]
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of regions
 */
router.get('/', async (req, res, next) => {
    try {
        const { is_active = true } = req.query as { is_active?: boolean };

        const regions = await prisma.regions.findMany({
            where: is_active !== undefined ? { is_active: Boolean(is_active) } : {},
            orderBy: { name: 'asc' }
        });

        const response: ApiResponse = {
            success: true,
            message: 'Regions retrieved successfully',
            data: regions
        };

        res.json(response);
    } catch (error) {
        next(error);
    }
});

// Get region by ID (public)
/**
 * @swagger
 * /regions/{id}:
 *   get:
 *     summary: Get region by ID
 *     tags: [Regions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Region details
 *       404:
 *         description: Region not found
 */
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params as { id: string };

        const region = await prisma.regions.findUnique({
            where: { id }
        });

        if (!region) {
            throw new ApiError('Region not found', 404);
        }

        const response: ApiResponse = {
            success: true,
            message: 'Region retrieved successfully',
            data: region
        };

        res.json(response);
    } catch (error) {
        next(error);
    }
});

// Create region (admin only)
/**
 * @swagger
 * /regions:
 *   post:
 *     summary: Create region
 *     tags: [Regions]
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
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Region created
 *       403:
 *         description: Admin access required
 */
router.post('/', authenticate, requireAdmin, validate(schemas.createRegion), async (req, res, next) => {
    try {
        const { name, code, description } = req.body;

        const region = await prisma.regions.create({
            data: {
                name,
                code,
                description
            }
        });

        const response: ApiResponse = {
            success: true,
            message: 'Region created successfully',
            data: region
        };

        res.status(201).json(response);
    } catch (error) {
        next(error);
    }
});

// Update region (admin only)
/**
 * @swagger
 * /regions/{id}:
 *   put:
 *     summary: Update region
 *     tags: [Regions]
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
 *               code:
 *                 type: string
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Region updated
 *       403:
 *         description: Admin access required
 */
router.put('/:id', authenticate, requireAdmin, validate(schemas.updateRegion), async (req, res, next) => {
    try {
        const { id } = req.params as { id: string };
        const { name, code, description, is_active } = req.body;

        const region = await prisma.regions.update({
            where: { id },
            data: {
                name,
                code,
                description,
                is_active
            }
        });

        const response: ApiResponse = {
            success: true,
            message: 'Region updated successfully',
            data: region
        };

        res.json(response);
    } catch (error) {
        if (error.code === 'P2025') {
            next(new ApiError('Region not found', 404));
        } else {
            next(error);
        }
    }
});

// Delete region (admin only)
/**
 * @swagger
 * /regions/{id}:
 *   delete:
 *     summary: Delete region
 *     tags: [Regions]
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
 *         description: Region deleted
 *       403:
 *         description: Admin access required
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
    try {
        const { id } = req.params as { id: string };

        await prisma.regions.delete({
            where: { id }
        });

        const response: ApiResponse = {
            success: true,
            message: 'Region deleted successfully'
        };

        res.json(response);
    } catch (error) {
        if (error.code === 'P2025') {
            next(new ApiError('Region not found', 404));
        } else {
            next(error);
        }
    }
});
export default router;
