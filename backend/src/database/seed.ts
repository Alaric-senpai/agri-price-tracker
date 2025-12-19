import { prisma } from '../../lib/prisma';
import { logger } from '../utils/logger';
import bcrypt from 'bcryptjs';
import { sms_type } from '../../generated/prisma/client';

export const seedDatabase = async (): Promise<void> => {
  try {
    logger.info('Starting database seeding...');

    // Seed regions
    const regions = [
      { name: 'Central Kenya', code: 'CENTRAL' },
      { name: 'Western Kenya', code: 'WESTERN' },
      { name: 'Eastern Kenya', code: 'EASTERN' },
      { name: 'Rift Valley', code: 'RIFT_VAL' },
      { name: 'Coast', code: 'COAST' },
      { name: 'Northern Kenya', code: 'NORTHERN' },
      { name: 'Nyanza', code: 'NYANZA' }
    ];

    for (const region of regions) {
      await prisma.regions.upsert({
        where: { name: region.name },
        update: {},
        create: {
          name: region.name,
          code: region.code
        }
      });
    }

    // Seed crops
    const crops = [
      { name: 'Maize', category: 'cereals' },
      { name: 'Beans', category: 'legumes' },
      { name: 'Tomatoes', category: 'vegetables' },
      { name: 'Potatoes', category: 'vegetables' },
      { name: 'Onions', category: 'vegetables' },
      { name: 'Bananas', category: 'fruits' },
      { name: 'Rice', category: 'cereals' },
      { name: 'Wheat', category: 'cereals' },
      { name: 'Carrots', category: 'vegetables' },
      { name: 'Cabbage', category: 'vegetables' },
      { name: 'Kale', category: 'vegetables' },
      { name: 'Spinach', category: 'vegetables' },
      { name: 'Mangoes', category: 'fruits' },
      { name: 'Avocados', category: 'fruits' },
      { name: 'Oranges', category: 'fruits' },
      { name: 'Pineapples', category: 'fruits' },
      { name: 'Green Grams', category: 'legumes' },
      { name: 'Cowpeas', category: 'legumes' },
      { name: 'Groundnuts', category: 'legumes' },
      { name: 'Sweet Potatoes', category: 'vegetables' }
    ];

    for (const crop of crops) {
      await prisma.crops.upsert({
        where: { name: crop.name },
        update: {},
        create: {
          name: crop.name,
          category: crop.category
        }
      });
    }

    // Seed markets
    const markets = [
      { name: 'Nairobi Central Market', region: 'Central Kenya' },
      { name: 'Kiambu Market', region: 'Central Kenya' },
      { name: 'Thika Market', region: 'Central Kenya' },
      { name: 'Kisumu Market', region: 'Western Kenya' },
      { name: 'Bungoma Market', region: 'Western Kenya' },
      { name: 'Kakamega Market', region: 'Western Kenya' },
      { name: 'Meru Market', region: 'Eastern Kenya' },
      { name: 'Machakos Market', region: 'Eastern Kenya' },
      { name: 'Kitui Market', region: 'Eastern Kenya' },
      { name: 'Nakuru Market', region: 'Rift Valley' },
      { name: 'Eldoret Market', region: 'Rift Valley' },
      { name: 'Kericho Market', region: 'Rift Valley' },
      { name: 'Mombasa Market', region: 'Coast' },
      { name: 'Malindi Market', region: 'Coast' },
      { name: 'Kisii Market', region: 'Nyanza' },
      { name: 'Homa Bay Market', region: 'Nyanza' }
    ];

    for (const market of markets) {
      const region = await prisma.regions.findUnique({
        where: { name: market.region }
      });

      if (region) {
        await prisma.markets.upsert({
          where: {
            name_region_id: {
              name: market.name,
              region_id: region.id
            }
          },
          update: {},
          create: {
            name: market.name,
            region_id: region.id
          }
        });
      }
    }

    // Create super admin user
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const adminEmail = 'admin@agriprice.co.ke';

    await prisma.users.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        password_hash: hashedPassword,
        full_name: 'System Administrator',
        role: 'super_admin',
        region: 'Central Kenya',
        organization: 'AgriPrice System',
        is_active: true,
        email_verified: true
      }
    });

    // Seed SMS templates
    const smsTemplates = [
      {
        name: 'Price Alert',
        template: 'AGRI ALERT: {crop} price has {trend} by {percentage}% to KSh {price}/kg in {region}. Current market: {market}',
        variables: ['crop', 'trend', 'percentage', 'price', 'region', 'market'],
        type: 'alert'
      },
      {
        name: 'Daily Price Update',
        template: 'AGRI UPDATE: Today\'s prices - {crop}: KSh {price}/kg ({region}). Prediction: {prediction}. For more info, reply HELP',
        variables: ['crop', 'price', 'region', 'prediction'],
        type: 'update'
      },
      {
        name: 'Weather Alert',
        template: 'AGRI WEATHER: {weather_condition} expected in {region} for next {days} days. Protect your {crop}. More: reply WEATHER',
        variables: ['weather_condition', 'region', 'days', 'crop'],
        type: 'weather'
      }
    ];

    const admin = await prisma.users.findUnique({
      where: { email: adminEmail }
    });

    if (admin) {
      for (const template of smsTemplates) {
        await prisma.sms_templates.upsert({
          where: { name: template.name },
          update: {},
          create: {
            name: template.name,
            template: template.template,
            variables: template.variables, // Json type handling is automatic in Prisma
            sms_type: template.type as sms_type,
            created_by: admin.id
          }
        });
      }
    }

    // Seed system settings
    const systemSettings = [
      {
        key: 'kamis_sync_enabled',
        value: true,
        description: 'Enable automatic KAMIS data synchronization'
      },
      {
        key: 'sms_alerts_enabled',
        value: true,
        description: 'Enable SMS alert system'
      },
      {
        key: 'ml_predictions_enabled',
        value: true,
        description: 'Enable ML price predictions'
      },
      {
        key: 'max_price_variance',
        value: 50,
        description: 'Maximum price variance percentage for alerts'
      }
    ];

    for (const setting of systemSettings) {
      await prisma.system_settings.upsert({
        where: { key: setting.key },
        update: {},
        create: {
          key: setting.key,
          value: setting.value, // Json type handling
          description: setting.description
        }
      });
    }

    logger.info('Database seeding completed successfully');
  } catch (error) {
    logger.error('Seeding failed:', error);
    throw error;
  }
};

// // Run seeding if this file is executed directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//   seedDatabase()
//     .then(() => {
//       logger.info('Seeding completed');
//       process.exit(0);
//     })
//     .catch((error) => {
//       logger.error('Seeding failed:', error);
//       process.exit(1);
//     });
// }

seedDatabase()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })