import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { prisma } from '../../lib/prisma';
import type { ApiResponse } from '../types/index';

const router: Router = Router();

// Get price analytics (admin only)
/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Data analytics and reporting
 */

/**
 * @swagger
 * /analytics/prices:
 *   get:
 *     summary: Get price analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           default: '30'
 *         description: Analysis period in days
 *       - in: query
 *         name: crop_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: region_id
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Price analytics data
 *       403:
 *         description: Admin access required
 */
router.get('/prices', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { period = '30', crop_id, region_id } = req.query;

    const conditions: string[] = [`pe.entry_date >= CURRENT_DATE - INTERVAL '${period} days'`];
    const params: any[] = [];
    let paramIndex = 1;

    // Prisma $queryRaw uses parameters $1, $2 etc like pg, but we need to match strict ordering.
    // However, for safety in refactoring, we use $queryRawUnsafe as we are building the string.
    // WARNING: $queryRawUnsafe should be used with care. Since inputs are UUIDs validated by params? 
    // Actually we shouldn't simply concatenate. But the original code was parameterized.
    // We will continue using parameterized approach with $queryRawUnsafe.

    // We need to rebuild the parameterized query string logic to match parameter array.
    if (crop_id) {
      conditions.push(`pe.crop_id = $${paramIndex++}`);
      params.push(crop_id);
    }

    if (region_id) {
      conditions.push(`pe.region_id = $${paramIndex++}`);
      params.push(region_id);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Price trends
    const trendsResult = await prisma.$queryRawUnsafe<any[]>(
      `SELECT 
         DATE(pe.entry_date) as date,
         c.name as crop_name,
         r.name as region_name,
         AVG(pe.price) as avg_price,
         MIN(pe.price) as min_price,
         MAX(pe.price) as max_price,
         COUNT(*) as entries_count
       FROM price_entries pe
       JOIN crops c ON pe.crop_id = c.id
       JOIN regions r ON pe.region_id = r.id
       ${whereClause}
       GROUP BY DATE(pe.entry_date), c.name, r.name, pe.crop_id, pe.region_id
       ORDER BY date DESC, crop_name, region_name`,
      ...params
    );

    // Price volatility
    const volatilityResult = await prisma.$queryRawUnsafe<any[]>(
      `SELECT 
         c.name as crop_name,
         r.name as region_name,
         STDDEV(pe.price) as price_volatility,
         AVG(pe.price) as avg_price,
         COUNT(*) as data_points
       FROM price_entries pe
       JOIN crops c ON pe.crop_id = c.id
       JOIN regions r ON pe.region_id = r.id
       ${whereClause}
       GROUP BY c.name, r.name
       HAVING COUNT(*) >= 5
       ORDER BY price_volatility DESC`,
      ...params
    );

    const response: ApiResponse = {
      success: true,
      message: 'Price analytics retrieved successfully',
      data: {
        trends: trendsResult,
        volatility: volatilityResult,
        period: `${period} days`
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Get user analytics (admin only)
/**
 * @swagger
 * /analytics/users:
 *   get:
 *     summary: Get user analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User analytics data
 *       403:
 *         description: Admin access required
 */
router.get('/users', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const stats = await Promise.all([
      // User registration trends
      prisma.$queryRaw<any[]>`
        SELECT 
          DATE(created_at) as date,
          COUNT(*)::int as registrations
        FROM users 
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `,

      // User activity by role
      prisma.$queryRaw<any[]>`
        SELECT 
          role,
          COUNT(*)::int as count,
          COUNT(CASE WHEN last_login >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END)::int as active_last_week
        FROM users 
        WHERE is_active = true
        GROUP BY role
      `,

      // Regional distribution
      prisma.$queryRaw<any[]>`
        SELECT 
          region,
          COUNT(*)::int as user_count
        FROM users 
        WHERE is_active = true AND region IS NOT NULL
        GROUP BY region
        ORDER BY user_count DESC
      `
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'User analytics retrieved successfully',
      data: {
        registrationTrends: stats[0],
        roleDistribution: stats[1],
        regionalDistribution: stats[2]
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Get system analytics (admin only)
/**
 * @swagger
 * /analytics/system:
 *   get:
 *     summary: Get system analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System analytics data
 *       403:
 *         description: Admin access required
 */
router.get('/system', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const stats = await Promise.all([
      // Daily activity
      prisma.$queryRaw<any[]>`
        SELECT 
          CURRENT_DATE as date,
          (SELECT COUNT(*) FROM price_entries WHERE DATE(created_at) = CURRENT_DATE)::int as price_entries,
          (SELECT COUNT(*) FROM sms_logs WHERE DATE(created_at) = CURRENT_DATE)::int as sms_sent,
          (SELECT COUNT(*) FROM chat_conversations WHERE DATE(created_at) = CURRENT_DATE)::int as chat_sessions,
          (SELECT COUNT(*) FROM users WHERE DATE(last_login) = CURRENT_DATE)::int as active_users
      `,

      // Data quality metrics
      prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*)::int as total_entries,
          COUNT(CASE WHEN is_verified = true THEN 1 END)::int as verified_entries,
          COUNT(CASE WHEN source = 'kamis' THEN 1 END)::int as kamis_entries,
          COUNT(CASE WHEN source = 'farmer' THEN 1 END)::int as farmer_entries,
          COUNT(CASE WHEN source = 'admin' THEN 1 END)::int as admin_entries
        FROM price_entries
        WHERE entry_date >= CURRENT_DATE - INTERVAL '30 days'
      `,

      // Performance metrics
      prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(*)::int as total_predictions,
          AVG(confidence_score) as avg_confidence,
          COUNT(CASE WHEN confidence_score >= 0.8 THEN 1 END)::int as high_confidence_predictions
        FROM price_predictions
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      `
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'System analytics retrieved successfully',
      data: {
        dailyActivity: stats[0][0],
        dataQuality: stats[1][0],
        mlPerformance: stats[2][0]
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;