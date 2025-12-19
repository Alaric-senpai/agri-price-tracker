import cron from 'node-cron';
import { prisma } from '../../lib/prisma';
import { logger } from '../utils/logger';
import { sendDailyPriceUpdate } from './smsService';
import { syncKamisData } from './kamisService';
import { generateDailyPredictions } from './mlService';

export const startCronJobs = (): void => {
  logger.info('Starting cron jobs...');

  // Daily price update SMS - 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    logger.info('Running daily price update SMS job');
    try {
      await sendDailyPriceUpdate();
    } catch (error) {
      logger.error('Daily price update SMS job failed:', error);
    }
  });

  // KAMIS data sync - Every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    logger.info('Running KAMIS data sync job');
    try {
      await syncKamisData();
    } catch (error) {
      logger.error('KAMIS data sync job failed:', error);
    }
  });

  // ML predictions generation - Daily at 6:00 AM
  cron.schedule('0 6 * * *', async () => {
    logger.info('Running ML predictions generation job');
    try {
      await generateDailyPredictions();
    } catch (error) {
      logger.error('ML predictions generation job failed:', error);
    }
  });

  // Cleanup old logs - Weekly on Sunday at 2:00 AM
  cron.schedule('0 2 * * 0', async () => {
    logger.info('Running cleanup job');
    try {
      await cleanupOldLogs();
    } catch (error) {
      logger.error('Cleanup job failed:', error);
    }
  });

  logger.info('Cron jobs started successfully');
};

const cleanupOldLogs = async (): Promise<void> => {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Delete SMS logs older than 90 days
    await prisma.sms_logs.deleteMany({
      where: { created_at: { lt: ninetyDaysAgo } }
    });

    // Delete chat conversations older than 30 days (for anonymous users)
    await prisma.chat_conversations.deleteMany({
      where: {
        user_id: null,
        created_at: { lt: thirtyDaysAgo }
      }
    });

    // Delete old KAMIS sync logs (keep last 100)
    // First, find the IDs of the 100 most recent logs
    const logsToKeep = await prisma.kamis_sync_logs.findMany({
      select: { id: true },
      orderBy: { started_at: 'desc' },
      take: 100
    });

    if (logsToKeep.length === 100) {
      const idsToKeep = logsToKeep.map(log => log.id);

      await prisma.kamis_sync_logs.deleteMany({
        where: {
          id: { notIn: idsToKeep }
        }
      });
    }

    logger.info('Cleanup completed successfully');
  } catch (error) {
    logger.error('Cleanup failed:', error);
    throw error;
  }
};