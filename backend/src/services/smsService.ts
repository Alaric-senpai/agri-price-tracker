import axios from 'axios';
import { prisma } from '../../lib/prisma';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/apiError';
import { Prisma } from '../../generated/prisma/client';

interface SmsLog {
  recipient: string;
  message: string;
  sms_type: string;
  status: 'sent' | 'failed' | 'pending';
  external_id?: string;
  sent_by?: string;
  error_message?: string;
}

const SMS_MODE_API_KEY = process.env.SMS_MODE_API_KEY || '';
const SENDER_ID = 'Agri Price';

const formatPhoneNumber = (phone: string): string => {
  let formatted = phone.replace(/\D/g, '');
  if (formatted.startsWith('0')) formatted = '254' + formatted.substring(1);
  else if (formatted.startsWith('7') || formatted.startsWith('1')) formatted = '254' + formatted;
  return formatted;
};

export const sendSmsMessage = async (
  recipient: string,
  message: string,
  smsType: string = 'general',
  sentBy?: string
): Promise<SmsLog> => {
  const formattedRecipient = formatPhoneNumber(recipient);
  let status: 'sent' | 'failed' = 'failed';
  let externalId = '';
  let errorMsg = '';

  if (SMS_MODE_API_KEY) {
    try {
      const response = await axios.post(
        'https://rest.smsmode.com/sms/v1/messages',
        {
          recipient: { to: formattedRecipient },
          body: { text: message },
          from: SENDER_ID
        },
        { headers: { 'X-Api-Key': SMS_MODE_API_KEY, 'Content-Type': 'application/json' } }
      );

      if (response.status === 201 || response.status === 200) {
        status = 'sent';
        externalId = response.data.id;
        logger.info(`SMS sent to ${formattedRecipient}`);
      } else {
        errorMsg = JSON.stringify(response.data);
        logger.error('SMS API Error:', response.data);
      }
    } catch (error: any) {
      errorMsg = error.response?.data?.message || error.message;
      logger.error('SMS Send Failed:', errorMsg);
    }
  } else {
    status = 'sent';
    externalId = 'dev-mock-id-' + Date.now();
    logger.info(`[Mock SMS] To: ${recipient} | Msg: ${message}`);
  }

  try {
    const log = await prisma.sms_logs.create({
      data: {
        recipient: formattedRecipient,
        message,
        sms_type: smsType as any,
        status,
        external_id: externalId || null,
        sent_by: sentBy || null,
        error_message: errorMsg || null,
        sent_at: status === 'sent' ? new Date() : null
      }
    });

    const resultLog: SmsLog = {
      recipient: log.recipient,
      message: log.message,
      sms_type: log.sms_type,
      status: (log.status as any) || 'pending'
    };
    if (log.external_id) resultLog.external_id = log.external_id;
    if (log.sent_by) resultLog.sent_by = log.sent_by;
    if (log.error_message) resultLog.error_message = log.error_message;

    return resultLog;
  } catch (dbError) {
    logger.error('Failed to save SMS log', dbError);
    return { recipient, message, sms_type: smsType, status, external_id: externalId };
  }
};


export const sendBulkSms = async (
  recipients: string[],
  message: string,
  smsType: string = 'general',
  sentBy?: string
): Promise<SmsLog[]> => {
  const results: SmsLog[] = [];
  logger.info(`Starting bulk SMS (${smsType}) to ${recipients.length} users`);

  for (const phone of recipients) {
    const result = await sendSmsMessage(phone, message, smsType, sentBy);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return results;
};

export const subscribeUser = async (phone: string, cropIds: string[]) => {
  try {
    const formattedPhone = formatPhoneNumber(phone);

    const subscription = await prisma.sms_subscriptions.upsert({
      where: { phone: formattedPhone },
      update: {
        crops: JSON.parse(JSON.stringify(cropIds)),
        is_active: true,
        updated_at: new Date()
      },
      create: {
        phone: formattedPhone,
        crops: JSON.parse(JSON.stringify(cropIds)),
        is_active: true
      }
    });

    await sendSmsMessage(
      formattedPhone,
      `Welcome to AgriPrice! You are now tracking ${cropIds.length} crops. You will receive daily updates.`
    );

    return subscription;
  } catch (error) {
    logger.error('Subscription error:', error);
    throw new ApiError('Failed to subscribe user', 500);
  }
};

export const unsubscribeUser = async (phone: string) => {
  const formattedPhone = formatPhoneNumber(phone);
  await prisma.sms_subscriptions.update({
    where: { phone: formattedPhone },
    data: { is_active: false }
  });
  return true;
};

export const getSubscribedNumbers = async (
  cropNames?: string[],
  regionIds?: string[]
): Promise<string[]> => {
  try {
    if (cropNames && cropNames.length > 0) {
      const subscriptions = await prisma.sms_subscriptions.findMany({
        where: { is_active: true },
        select: { phone: true, crops: true }
      });

      const targetSet = new Set(cropNames);
      return subscriptions
        .filter(sub => {
          if (!sub.crops || !Array.isArray(sub.crops)) return false;
          const subCrops = sub.crops as string[];
          return subCrops.some(c => targetSet.has(c));
        })
        .map(s => s.phone);
    }

    // If no crop filter, just return all active
    const subs = await prisma.sms_subscriptions.findMany({
      where: { is_active: true },
      distinct: ['phone'],
      select: { phone: true }
    });

    return subs.map(s => s.phone);

  } catch (error) {
    logger.error('❌ Failed to get subscribed numbers:', error);
    return [];
  }
};

export const sendPriceAlert = async (
  cropName: string,
  price: number,
  region: string,
  trend: 'up' | 'down' | 'stable',
  percentage: number
): Promise<void> => {
  try {
    const direction = trend === 'up' ? 'risen' : trend === 'down' ? 'dropped' : 'remained stable';
    const message = `AgriPrice Alert: ${cropName} prices in ${region} have ${direction} by ${percentage}% to KSh ${price}.`;

    const subscribers = await getSubscribedNumbers([cropName]);

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message);
      logger.info(`✅ Price alert sent to ${subscribers.length} subscribers for ${cropName}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send price alert:', error);
  }
};

export const sendDailyPriceUpdate = async (): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const priceChanges = await prisma.price_entries.findMany({
      where: {
        entry_date: {
          gte: today,
          lt: tomorrow
        },
        is_verified: true
      },
      include: {
        crops: { select: { name: true } },
        regions: { select: { name: true } }
      },
      orderBy: { created_at: 'desc' },
      take: 5
    });

    if (priceChanges.length === 0) {
      logger.info('ℹ️ No price updates to send today');
      return;
    }

    let message = 'AGRI UPDATE: Today\'s prices: ';
    const priceList = priceChanges
      .map(entry => `${entry.crops.name}: ${entry.price}/= (${entry.regions.name})`)
      .join(', ');

    message += priceList;
    const subscribers = await getSubscribedNumbers();

    if (subscribers.length > 0) {
      await sendBulkSms(subscribers, message);
      logger.info(`✅ Daily update sent to ${subscribers.length} subscribers`);
    }
  } catch (error) {
    logger.error('❌ Failed to send daily price update:', error);
  }
};

export const processSmsWebhook = async (req: any): Promise<void> => {
  try {
    const { id, status, phoneNumber } = req.body;

    await prisma.sms_logs.updateMany({
      where: { external_id: id },
      data: {
        status: status, // Ensure status matches enum if strict
        delivered_at: new Date()
      }
    });

    logger.info(`📬 Delivery report updated: ${id} - ${status} (${phoneNumber})`);
  }
  catch (error) { logger.error('❌ Failed to process SMS webhook:', error); }
};