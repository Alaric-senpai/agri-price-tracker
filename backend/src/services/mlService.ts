import axios from 'axios';
import { prisma } from '../../lib/prisma';
import { logger } from '../utils/logger';
import { Prisma } from '../../generated/prisma/client';
import type { PredictionResponse } from '../types/index';

export interface MLPredictionRequest {
  commodity: string;
  market: string;
  county: string;
  prediction_days: number;
}

const storePrediction = async (prediction: PredictionResponse): Promise<void> => {
  try {
    const mainPrediction = prediction.predicted_prices[0];
    if (!mainPrediction) {
      throw new Error('Prediction data is missing predicted_prices');
    }

    const existing = await prisma.price_predictions.findFirst({
      where: {
        crop_id: prediction.crop_id,
        region_id: prediction.region_id,
        prediction_date: new Date(mainPrediction.date)
      }
    });

    const data = {
      crop_id: prediction.crop_id,
      region_id: prediction.region_id,
      current_price: prediction.current_price,
      predicted_price: mainPrediction.price,
      prediction_date: new Date(mainPrediction.date),
      confidence_score: mainPrediction.confidence,
      model_version: prediction.model_version,
      factors: prediction.factors ? JSON.parse(JSON.stringify(prediction.factors)) : Prisma.JsonNull
    };

    if (existing) {
      await prisma.price_predictions.update({
        where: { id: existing.id },
        data: {
          predicted_price: data.predicted_price,
          confidence_score: data.confidence_score,
          factors: data.factors
        }
      });
    } else {
      await prisma.price_predictions.create({
        data
      });
    }

  } catch (error: any) {
    logger.error('Failed to store prediction:', error);
  }
};

const generateSimplePrediction = async (
  cropId: string,
  regionId: string,
  predictionDays: number
): Promise<PredictionResponse | null> => {
  try {
    const result = await prisma.price_entries.findMany({
      where: {
        crop_id: cropId,
        region_id: regionId,
        is_verified: true
      },
      select: {
        price: true,
        entry_date: true
      },
      orderBy: { entry_date: 'desc' },
      take: 30
    });

    if (result.length < 5) {
      return null;
    }

    const prices = result
      .map(row => Number(row.price))
      .filter(price => !isNaN(price) && price > 0);

    if (prices.length === 0) {
      logger.warn(`No valid prices found for ${cropId} in ${regionId} for fallback`);
      return null;
    }

    const currentPrice = prices[0]!;

    const recentPrices = prices.slice(0, Math.min(7, prices.length));
    const average = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;

    const trendFactor = prices.length >= 14 ? (() => {
      const oldPrices = prices.slice(7, 14);
      const oldAverage = oldPrices.reduce((sum, price) => sum + price, 0) / oldPrices.length;
      return average / oldAverage;
    })() : 1.0;

    const predictedPrice = currentPrice * trendFactor;

    const prediction: PredictionResponse = {
      crop_id: cropId,
      region_id: regionId,
      current_price: currentPrice,
      predicted_prices: [{
        date: new Date(Date.now() + predictionDays * 24 * 60 * 60 * 1000),
        price: Math.max(predictedPrice, currentPrice * 0.8),
        confidence: prices.length >= 14 ? 0.7 : 0.5
      }],
      factors: {
        method: 'simple_trend',
        trend_factor: trendFactor,
        data_points: prices.length
      },
      model_version: 'fallback-v1.0'
    };

    await storePrediction(prediction);
    return prediction;

  } catch (error: any) {
    logger.error('Simple prediction failed:', error);
    return null;
  }
};

export const generatePricePrediction = async (
  commodityName: string,
  marketName: string,
  countyName: string,
  cropId: string,
  regionId: string,
  predictionDays: number = 7
): Promise<PredictionResponse | null> => {
  try {

    const requestData: MLPredictionRequest = {
      commodity: commodityName,
      market: marketName,
      county: countyName,
      prediction_days: predictionDays
    };

    const response = await axios.post(
      `${process.env.ML_MODEL_URL}/predict`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    const predictionResult = response.data;

    const mainPrediction = predictionResult.predictions[0];
    const trend = predictionResult.trend;

    const dbPrediction: PredictionResponse = {
      crop_id: cropId,
      region_id: regionId,
      current_price: predictionResult.current_price,
      predicted_prices: [{
        date: new Date(mainPrediction.date),
        price: mainPrediction.predicted_price,
        confidence: 0.75
      }],
      factors: {
        method: 'ml-random-forest',
        trend: trend,
        recommendation: predictionResult.recommendation
      },
      model_version: 'RandomForest-v1'
    };

    await storePrediction(dbPrediction);

    logger.info(`ML Prediction generated for ${commodityName} in ${marketName}`);
    return dbPrediction;

  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response) {
      logger.error(`ML prediction failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else {
      logger.error('ML prediction failed:', error.message);
    }
    logger.warn(`ML service failed. Falling back to simple prediction for ${commodityName}.`);
    return generateSimplePrediction(cropId, regionId, predictionDays);
  }
};

export const generateDailyPredictions = async (): Promise<void> => {
  try {
    logger.info('Starting daily predictions generation');

    const combinations = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT 
        pe.crop_id, 
        pe.region_id, 
        pe.market_id,
        c.name as crop_name, 
        r.name as region_name,
        m.name as market_name
      FROM price_entries pe
      JOIN crops c ON pe.crop_id = c.id
      JOIN regions r ON pe.region_id = r.id
      JOIN markets m ON pe.market_id = m.id
      WHERE pe.entry_date >= CURRENT_DATE - INTERVAL '30 days'
        AND pe.is_verified = true
      GROUP BY pe.crop_id, pe.region_id, pe.market_id, c.name, r.name, m.name
      HAVING COUNT(pe.id) >= 5
    `;

    let generated = 0;
    let failed = 0;

    for (const combo of combinations) {
      try {
        const prediction = await generatePricePrediction(
          combo.crop_name,
          combo.market_name,
          combo.region_name,
          combo.crop_id,
          combo.region_id,
          7
        );

        if (prediction) {
          generated++;
        } else {
          failed++;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        logger.error(`Failed to generate prediction for ${combo.crop_name} in ${combo.market_name}:`, error.message);
        failed++;
      }
    }

    logger.info(`Daily predictions completed: ${generated} generated, ${failed} failed`);

  } catch (error: any) {
    logger.error('Daily predictions generation failed:', error);
    throw error;
  }
};

export const getPredictions = async (
  cropId?: string,
  regionId?: string,
  limit: number = 20
): Promise<any[]> => {
  try {
    const where: Prisma.price_predictionsWhereInput = {
      prediction_date: {
        gte: new Date(new Date().setHours(0, 0, 0, 0))
      }
    };

    if (cropId) where.crop_id = cropId;
    if (regionId) where.region_id = regionId;

    const predictions = await prisma.price_predictions.findMany({
      where,
      include: {
        crops: { select: { name: true } },
        regions: { select: { name: true } }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    return predictions.map(p => ({
      ...p,
      crop_name: p.crops.name,
      region_name: p.regions.name
    }));

  } catch (error: any) {
    logger.error('Failed to get predictions:', error);
    return [];
  }
};