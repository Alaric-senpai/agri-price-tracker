import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { Prisma } from '../../generated/prisma/client';
import type { PriceEntry, CreatePriceEntry, PriceQueryParams, ApiResponse } from '../types/index';

export const getPrices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 20,
      crop_id,
      region_id,
      market_id,
      market,
      source,
      verified,
      date_from,
      date_to,
      sort: sortQuery = 'entry_date',
      order: orderQuery = 'desc'
    } = req.query as PriceQueryParams;


    const sortWhitelist = [
      'price', 'entry_date', 'created_at',
      'crop_name', 'region_name', 'market_name'
    ];
    const sort = sortWhitelist.includes(sortQuery) ? sortQuery : 'entry_date';
    const order = orderQuery.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (Number(page) - 1) * Number(limit);

    // Using $queryRawUnsafe since we are dynamically building the query conditions
    const conditions: string[] = ['pe.price > 20'];
    const params: any[] = [];
    let paramIndex = 1;

    if (verified !== undefined) {
      conditions.push(`pe.is_verified = $${paramIndex++}`);
      params.push(String(verified).toLowerCase() === 'true');
    } else {
      conditions.push(`pe.is_verified = true`);
    }

    if (crop_id) {
      conditions.push(`pe.crop_id = $${paramIndex++}::uuid`);
      params.push(crop_id);
    }
    if (region_id) {
      conditions.push(`pe.region_id = $${paramIndex++}::uuid`);
      params.push(region_id);
    }
    if (market_id) {
      conditions.push(`pe.market_id = $${paramIndex++}::uuid`);
      params.push(market_id);
    }
    if (market) {
      conditions.push(`pe.market_id IN (SELECT id FROM markets WHERE name ILIKE $${paramIndex++})`);
      params.push(`%${market}%`);
    }
    if (source) {
      conditions.push(`pe.source = $${paramIndex++}`);
      params.push(source);
    }

    if (date_from) {
      conditions.push(`pe.entry_date >= $${paramIndex++}`);
      params.push(date_from);
    }
    if (date_to) {
      conditions.push(`pe.entry_date <= $${paramIndex++}`);
      params.push(date_to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Use raw SQL for the complex window function query
    const sqlQuery = `
      WITH RankedPrices AS (
        SELECT 
          pe.*, 
          c.name as crop_name,
          c.category as crop_category,   
          c.unit as crop_unit,           
          r.name as region_name,
          m.name as market_name,
          u1.full_name as entered_by_name,
          u2.full_name as verified_by_name, 
          LAG(pe.price, 1) OVER (
            PARTITION BY pe.crop_id, pe.region_id, pe.market_id 
            ORDER BY pe.entry_date DESC
          ) AS previous_price
        FROM price_entries pe
        JOIN crops c ON pe.crop_id = c.id
        JOIN regions r ON pe.region_id = r.id
        LEFT JOIN markets m ON pe.market_id = m.id
        LEFT JOIN users u1 ON pe.entered_by = u1.id
        LEFT JOIN users u2 ON pe.verified_by = u2.id
        ${whereClause} 
      ) 
      SELECT * FROM RankedPrices
      ORDER BY ${sort} ${order}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const queryParams = [...params, Number(limit), offset];

    const prices = await prisma.$queryRawUnsafe<any[]>(sqlQuery, ...queryParams);

    // Count query
    const countQuery = `SELECT COUNT(*)::int as count FROM price_entries pe ${whereClause}`;
    const countResult = await prisma.$queryRawUnsafe<{ count: number }[]>(countQuery, ...params);

    const total = countResult[0]?.count || 0;
    const pages = Math.ceil(total / Number(limit));

    const mappedPrices = prices.map(item => ({
      ...item,
      price: Number(item.price),
      previous_price: item.previous_price ? Number(item.previous_price) : null
    }));

    const response: ApiResponse<PriceEntry[]> = {
      success: true,
      message: 'Prices retrieved successfully',
      data: mappedPrices,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const createPriceEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      crop_id,
      region_id,
      market,
      market_id,
      price,
      unit = 'kg',
      source = 'farmer',
      notes,
      entry_date
    }: CreatePriceEntry = req.body;

    const enteredBy = req.user?.id;
    let resolvedMarketId = market_id;

    // If market_id not provided but market name is
    if (!resolvedMarketId && market) {
      const existingMarket = await prisma.markets.findFirst({
        where: {
          name: { equals: market.trim(), mode: 'insensitive' },
          region_id: region_id
        },
        select: { id: true }
      });

      if (existingMarket) {
        resolvedMarketId = existingMarket.id;
      } else {
        const insertMarket = await prisma.markets.create({
          data: {
            name: market.trim(),
            region_id: region_id,
            is_active: true
          }
        });
        resolvedMarketId = insertMarket.id;
        logger.info(`New market added to DB: ${market} (Region: ${region_id})`);
      }
    }

    // Insert into price_entries
    const newEntry = await prisma.price_entries.create({
      data: {
        crop_id,
        region_id,
        market_id: resolvedMarketId || null,
        price,
        unit,
        source,
        entered_by: enteredBy || null,
        notes: notes || null,
        entry_date: entry_date ? new Date(entry_date) : new Date(),
      }
    });

    logger.info(` Price entry added for crop ${crop_id} at market ${resolvedMarketId} by ${req.user?.email || 'system'}`);

    const response: ApiResponse<any> = {
      success: true,
      message: 'Price entry created successfully',
      data: newEntry
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};


export const updatePriceEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ApiError('ID parameter is required', 400);
    }

    const { price, notes, is_verified } = req.body;
    const userId = req.user!.id;

    // Build data object dynamically
    const data: Prisma.price_entriesUpdateInput = {};
    if (price !== undefined) data.price = price;
    if (notes !== undefined) data.notes = notes;
    if (is_verified !== undefined) {
      data.is_verified = is_verified;
      if (is_verified === true) {
        data.users_price_entries_verified_byTousers = { connect: { id: userId } };
      }
    }
    data.updated_at = new Date();

    try {
      const updatedEntry = await prisma.price_entries.update({
        where: { id },
        data
      });

      logger.info(`Price entry updated: ${id} by ${req.user!.email}`);

      const response: ApiResponse<any> = {
        success: true,
        message: 'Price entry updated successfully',
        data: updatedEntry
      };

      res.json(response);
    } catch (e) {
      // Prisma throws error if not found
      throw new ApiError('Price entry not found', 404);
    }

  } catch (error) {
    next(error);
  }
};

export const deletePriceEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ApiError('ID parameter is required', 400);
    }

    try {
      await prisma.price_entries.delete({
        where: { id }
      });

      logger.info(`Price entry deleted: ${id} by ${req.user!.email}`);

      const response: ApiResponse = {
        success: true,
        message: 'Price entry deleted successfully'
      };

      res.json(response);
    } catch (e) {
      throw new ApiError('Price entry not found', 404);
    }
  } catch (error) {
    next(error);
  }
};

export const getPendingVerifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const [entries, total] = await prisma.$transaction([
      prisma.price_entries.findMany({
        where: { is_verified: false },
        include: {
          crops: { select: { name: true } },
          regions: { select: { name: true } },
          markets: { select: { name: true } },
          users_price_entries_entered_byTousers: { select: { full_name: true } }
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: Number(limit)
      }),
      prisma.price_entries.count({ where: { is_verified: false } })
    ]);

    const pages = Math.ceil(total / Number(limit));

    const mappedEntries = entries.map(entry => ({
      ...entry,
      crop_name: entry.crops.name,
      region_name: entry.regions.name,
      market_name: entry.markets?.name || null,
      entered_by_name: entry.users_price_entries_entered_byTousers?.full_name || null
    }));

    const response: ApiResponse<any[]> = {
      success: true,
      message: 'Pending verifications retrieved successfully',
      data: mappedEntries,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const verifyPriceEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    if (!id) {
      throw new ApiError('ID parameter is required', 400);
    }

    // Check if it exists and is not verified
    const entry = await prisma.price_entries.findFirst({
      where: { id, is_verified: false }
    });

    if (!entry) {
      throw new ApiError('Price entry not found or already verified', 404);
    }

    const updatedEntry = await prisma.price_entries.update({
      where: { id },
      data: {
        is_verified: true,
        users_price_entries_verified_byTousers: { connect: { id: userId } },
        updated_at: new Date()
      }
    });

    logger.info(`Price entry verified: ${id} by ${req.user!.email}`);

    const response: ApiResponse<any> = {
      success: true,
      message: 'Price entry verified successfully',
      data: updatedEntry
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const rejectPriceEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ApiError('ID parameter is required', 400);
    }

    // Check if it exists and is not verified
    const entry = await prisma.price_entries.findFirst({
      where: { id, is_verified: false }
    });

    if (!entry) {
      throw new ApiError('Price entry not found or already verified', 404);
    }

    await prisma.price_entries.delete({
      where: { id }
    });

    logger.info(`Price entry rejected: ${id} by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: 'Price entry rejected successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};