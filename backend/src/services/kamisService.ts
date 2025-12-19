import { prisma } from '../../lib/prisma';
import { logger } from '../utils/logger';
import { parse as csvParseSync } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Prisma } from '../../generated/prisma/client';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(PROJECT_ROOT, 'data/raw');
const LATEST_FILE = path.join(DATA_DIR, 'kamis_latest.csv');
const SCRAPER_SCRIPT = path.join(PROJECT_ROOT, 'src/scripts/kamis_scraper_optimized.py');

const categorizeCrop = (commodityName: string): string => {
  const lowerName = (commodityName || '').toLowerCase();

  if (lowerName.match(/fertilizer/)) return 'farm_inputs';
  if (lowerName.match(/sunflower cake|cotton seed cake|bran|pollard/)) return 'animal_feeds';
  if (lowerName.match(/oil|cooking fat/)) return 'processed_products';
  if (lowerName.match(/tea|coffee|cotton|macadamia|cashew|korosho|sisal|pyrethrum|sunflower/)) return 'cash_crops';
  if (lowerName.match(/donkey|cattle|cow|bull|goat|sheep|camel|pig|livestock|heifer|steer|rabbit/)) return 'livestock';
  if (lowerName.match(/chicken|poultry|turkey|duck|geese|hen/)) return 'poultry';
  if (lowerName.match(/fish|tilapia|omena|nile perch|catfish|mudfish|haplochromis|trout|carp|protopterus|bass|labeo|mormyrus|eel|synodontis|alestes|barbus|snapper|demersal|barracuda|kasumba|tuna|mackerel|shark|sardine|lobster|kamba|prawn|crab|kaa|shrimp|octopus|pweza|squid|ngisi|oyster|scavenger|changu|tangu|grouper|grunt|taamamba|kora|mullet|fumi|threadfin|bream|jack|trevally|kolekole|halfbeak|anchov|herring|marlin|pelagic|rockcode|tewa/)) return 'fisheries';
  if (lowerName.match(/egg|milk|honey|beef|mutton|pork|meat/)) return 'animal_products';
  if (lowerName.match(/maize|rice|wheat|sorghum|millet|barley|oat|cereal/)) return 'cereals';
  if (lowerName.match(/bean|pea|gram|cowpea|lentil|njahi|dolichos|pulse|soya|ground\s?nut|peanut|njugu mawe/)) return 'legumes';
  if (lowerName.match(/potato|cassava|yam|arrow root|sweet potato|cocoyam|tuber/)) return 'roots_tubers';
  if (lowerName.match(/banana|mango|orange|pineapple|pawpaw|watermelon|avocado|passion|lemon|lime|tangerine|guava|jackfruit|berry|berries|melon|grape|apple|dragon\s?fruit|coconut/)) return 'fruits';
  if (lowerName.match(/tomato|kales|sukuma|cabbage|onion|spinach|carrot|pepper|chilli|brinjal|lettuce|managu|terere|vegetable|broccoli|cauliflower|cucumber|kunda|mrenda|spider\s?flower|saga|jute|pumpkin|butternut|capsicum|crotolaria|mito|miro|courgette|okra|gumbo|lady\'s\s?finger/)) return 'vegetables';
  if (lowerName.match(/ginger|garlic|coriander|dhania|chives|turmeric|pepper|chilies/)) return 'spices_herbs';

  return 'general';
};

const determineUnit = (category: string, commodityName: string): string => {
  const lowerName = (commodityName || '').toLowerCase();
  if (category === 'livestock') return 'head';
  if (category === 'poultry') return 'bird';
  if (lowerName.match(/milk|oil|juice|honey|yoghurt/)) return 'litre';
  if (lowerName.match(/egg/)) return 'tray';
  if (lowerName.match(/timber|post|pole|pineapple|watermelon|coconut|pumpkin|butternut|cabbage/)) return 'piece';
  return 'kg';
};


export const syncKamisData = async (): Promise<any> => {
  const syncId = await startSyncLog();

  try {
    logger.info('🔄 Starting KAMIS data synchronization...');
    logger.info(`   Script Path: ${SCRAPER_SCRIPT}`);

    try {
      const { stdout, stderr } = await execPromise(`python "${SCRAPER_SCRIPT}"`);
      logger.info(`Scraper stdout: ${stdout}`);
      if (stderr && !stderr.includes("UserWarning")) {
        logger.warn(`Scraper stderr: ${stderr}`);
      }
    } catch (err: any) {
      logger.error(`Scraper execution failed: ${err.message}`);
    }

    if (!fs.existsSync(LATEST_FILE)) {
      throw new Error('Scraper finished but no output file found at ' + LATEST_FILE);
    }

    const fileBuffer = fs.readFileSync(LATEST_FILE);
    const result = await processKamisFile(fileBuffer, 'kamis_latest.csv');

    await updateSyncLog(syncId, result.total_rows, result.inserted, 0, 'completed');
    logger.info(`KAMIS sync completed: ${result.inserted} inserted.`);

    return {
      records_synced: result.inserted,
      details: result
    };

  } catch (error: any) {
    logger.error('KAMIS synchronization failed:', error);
    await updateSyncLog(syncId, 0, 0, 0, 'failed', error.message);
    throw error;
  }
};

export async function processKamisFile(buffer: Buffer, filename: string) {
  const ext = (path.extname(filename) || '').toLowerCase();
  let rows: any[] = [];

  try {
    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('No sheets found in workbook');
      }
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        throw new Error('Sheet is undefined');
      }
      rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    } else {
      const text = buffer.toString('utf8');
      const cleanText = text.replace(/^\uFEFF/, '');
      rows = csvParseSync(cleanText, { columns: true, skip_empty_lines: true, trim: true });
    }
  } catch (err) {
    throw new Error('Failed to parse file: ' + String(err));
  }

  return await prisma.$transaction(async (tx) => {
    let insertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const rawRow of rows) {
      try {
        const row: any = {};
        for (const k of Object.keys(rawRow)) {
          row[k.toLowerCase().trim()] = rawRow[k];
        }

        const cropName = (row.crop || row.crop_name || row['commodity'] || row['crop name'] || row['productname'] || '').toString().trim();
        const regionName = (row.region || row.region_name || row['county'] || row['district'] || '').toString().trim();
        const marketName = (row.market || row.market_name || row['market name'] || '').toString().trim();

        const priceRaw = row.price ?? row['unit price'] ?? row['wholesale'] ?? row['retail'];
        const priceVal = parseFloat(String(priceRaw).replace(/,/g, ''));

        const dateRaw = row.entry_date || row.date || row['date'] || new Date();
        const entryDate = new Date(dateRaw);

        if (!cropName || !regionName || isNaN(priceVal)) {
          skippedCount++;
          continue;
        }

        let cropId;
        const cropRes = await tx.crops.findFirst({
          where: { name: { equals: cropName, mode: 'insensitive' } },
          select: { id: true }
        });

        if (cropRes) {
          cropId = cropRes.id;
        } else {
          const cat = categorizeCrop(cropName);
          const unit = determineUnit(cat, cropName);
          const newCrop = await tx.crops.create({
            data: { name: cropName, category: cat, unit, is_active: true }
          });
          cropId = newCrop.id;
        }

        let regionId;
        const regionRes = await tx.regions.findFirst({
          where: { name: { equals: regionName, mode: 'insensitive' } },
          select: { id: true }
        });

        if (regionRes) {
          regionId = regionRes.id;
        } else {
          const newRegion = await tx.regions.create({
            data: {
              name: regionName,
              code: regionName.toUpperCase().replace(/\s/g, '_'),
              is_active: true
            }
          });
          regionId = newRegion.id;
        }

        let marketId = null;
        if (marketName) {
          const marketRes = await tx.markets.findFirst({
            where: {
              name: { equals: marketName, mode: 'insensitive' },
              region_id: regionId
            },
            select: { id: true }
          });

          if (marketRes) {
            marketId = marketRes.id;
          } else {
            const newMarket = await tx.markets.create({
              data: { name: marketName, region_id: regionId, is_active: true }
            });
            marketId = newMarket.id;
          }
        }

        const startOfDay = new Date(entryDate); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(entryDate); endOfDay.setHours(23, 59, 59, 999);

        const dupCheck = await tx.price_entries.findFirst({
          where: {
            crop_id: cropId,
            region_id: regionId,
            market_id: marketId,
            entry_date: {
              gte: startOfDay,
              lte: endOfDay
            }
          },
          select: { id: true }
        });

        if (!dupCheck) {
          await tx.price_entries.create({
            data: {
              crop_id: cropId,
              region_id: regionId,
              market_id: marketId,
              price: priceVal,
              entry_date: entryDate,
              source: 'kamis',
              is_verified: true,
              unit: 'kg'
            }
          });
          insertedCount++;
        } else {
          skippedCount++;
        }

      } catch (rowError) {
        errorCount++;
        logger.error('Row import error', rowError);
      }
    }

    return {
      inserted: insertedCount,
      skipped: skippedCount,
      errors: errorCount,
      total_rows: rows.length
    };
  }, {
    timeout: 20000
  });
}


const startSyncLog = async (): Promise<string> => {
  const log = await prisma.kamis_sync_logs.create({
    data: {
      status: 'running',
      started_at: new Date(),
      sync_date: new Date()
    }
  });
  return log.id;
};

const updateSyncLog = async (id: string, processed: number, inserted: number, updated: number, status: string, errorMessage?: string) => {
  await prisma.kamis_sync_logs.update({
    where: { id },
    data: {
      records_processed: processed,
      records_inserted: inserted,
      records_updated: updated,
      status,
      error_message: errorMessage || null,
      completed_at: new Date()
    }
  });
};

export const getKamisSyncStatus = async (): Promise<any> => {
  try {
    const row = await prisma.kamis_sync_logs.findFirst({
      orderBy: { started_at: 'desc' }
    });

    if (!row) return { last_sync: null, records_synced: 0, is_active: false };

    return {
      last_sync: row.started_at,
      records_synced: (row.records_inserted || 0) + (row.records_updated || 0),
      is_active: row.status === 'running'
    };
  } catch (e) {
    return { last_sync: null, records_synced: 0, is_active: false };
  }
};