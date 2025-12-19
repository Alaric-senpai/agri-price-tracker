import { Request, Response, NextFunction } from 'express';
import * as kamisService from '../services/kamisService';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { prisma } from '../../lib/prisma';
import fs from 'fs';

export const triggerKamisSync = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    logger.info(`Manual KAMIS sync triggered by ${req.user?.email || 'admin'}`);

    const result = await kamisService.syncKamisData();

    res.json({
      success: true,
      message: 'Sync completed successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

export const uploadKamisData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      throw new ApiError('No file uploaded', 400);
    }

    logger.info(`Processing uploaded file: ${req.file.originalname}`);

    let fileBuffer: Buffer;

    if (req.file.buffer) {
      fileBuffer = req.file.buffer;
    } else if (req.file.path) {
      fileBuffer = fs.readFileSync(req.file.path);
      fs.unlinkSync(req.file.path);
    } else {
      throw new ApiError('File upload failed: No data received', 500);
    }

    const result = await kamisService.processKamisFile(fileBuffer, req.file.originalname);

    res.json({
      success: true,
      message: 'KAMIS file processed successfully',
      data: result
    });

  } catch (error) {
    next(error);
  }
};

export const getKamisStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = await kamisService.getKamisSyncStatus();
    res.json({
      success: true,
      message: 'KAMIS sync status retrieved successfully',
      data: status
    });
  } catch (error) {
    next(error);
  }
};

export const getKamisLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const [logs, total] = await prisma.$transaction([
      prisma.kamis_sync_logs.findMany({
        orderBy: { started_at: 'desc' },
        take: Number(limit),
        skip: offset
      }),
      prisma.kamis_sync_logs.count()
    ]);

    const pages = Math.ceil(total / Number(limit));

    res.json({
      success: true,
      message: 'KAMIS sync logs retrieved successfully',
      data: logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages
      }
    });
  } catch (error) {
    next(error);
  }
};