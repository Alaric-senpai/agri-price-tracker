import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiResponse } from '../types';

export const getPublicStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const farmerCount = await prisma.users.count({
      where: {
        role: 'farmer',
        is_active: true
      }
    });

    const response: ApiResponse = {
      success: true,
      message: 'Public stats retrieved',
      data: {
        farmers: farmerCount
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};