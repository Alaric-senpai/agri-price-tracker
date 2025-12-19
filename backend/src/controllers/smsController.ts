import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { sendBulkSms } from '../services/smsService';
import { Prisma } from '../../generated/prisma/client';
import type { SendSmsRequest, SmsTemplate, SmsLog, SmsSubscription, ApiResponse } from '../types/index';

export const sendSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      recipients,
      message,
      sms_type,
      template_id,
      template_variables
    }: SendSmsRequest = req.body;

    const sentBy = req.user!.id;
    let finalMessage = message;

    // If template is used, process variables
    if (template_id && template_variables) {
      const templateRecord = await prisma.sms_templates.findUnique({
        where: { id: template_id },
        select: { template: true }
      });

      if (templateRecord) {
        finalMessage = templateRecord.template;
        // Replace variables in template
        Object.entries(template_variables).forEach(([key, value]) => {
          finalMessage = finalMessage.replace(new RegExp(`{${key}}`, 'g'), String(value));
        });
      }
    }

    // Send SMS
    const smsResults = await sendBulkSms(recipients, finalMessage, sms_type, sentBy);

    logger.info(`SMS sent to ${recipients.length} recipients by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: `SMS sent to ${smsResults.length} recipients`,
      data: {
        sent: smsResults.filter(r => r.status === 'sent').length,
        failed: smsResults.filter(r => r.status === 'failed').length,
        results: smsResults
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getSmsLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 20, status, sms_type, date_from, date_to } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const where: Prisma.sms_logsWhereInput = {};

    if (status) {
      where.status = status as any; // Cast to enum if needed, or string
    }
    if (sms_type) {
      where.sms_type = sms_type as any;
    }
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) where.created_at.gte = new Date(date_from as string);
      if (date_to) where.created_at.lte = new Date(date_to as string);
    }

    // Check if created_at object is empty and remove it if so to avoid query error? Typescript should handle it.
    if (where.created_at && Object.keys(where.created_at).length === 0) delete where.created_at;

    const [logs, total] = await prisma.$transaction([
      prisma.sms_logs.findMany({
        where,
        include: {
          users: {
            select: { full_name: true }
          }
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: Number(limit)
      }),
      prisma.sms_logs.count({ where })
    ]);

    const pages = Math.ceil(total / Number(limit));

    const mappedLogs = logs.map(log => ({
      ...log,
      sent_by_name: log.users?.full_name || null
    }));

    const response: ApiResponse<any[]> = {
      success: true,
      message: 'SMS logs retrieved successfully',
      data: mappedLogs,
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

export const createSmsTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, template, variables, sms_type } = req.body;
    const createdBy = req.user!.id;

    const newTemplate = await prisma.sms_templates.create({
      data: {
        name,
        template,
        variables: variables ? JSON.parse(JSON.stringify(variables)) : [],
        sms_type,
        created_by: createdBy
      }
    });

    logger.info(`SMS template created: ${name} by ${req.user!.email}`);

    const response: ApiResponse<SmsTemplate> = {
      success: true,
      message: 'SMS template created successfully',
      data: newTemplate as any
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const getSmsTemplates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { sms_type, is_active = true } = req.query;

    const where: Prisma.sms_templatesWhereInput = {
      is_active: String(is_active) === 'true'
    };

    if (sms_type) {
      where.sms_type = sms_type as any;
    }

    const templates = await prisma.sms_templates.findMany({
      where,
      include: {
        users: { select: { full_name: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    const mappedTemplates = templates.map(t => ({
      ...t,
      created_by_name: t.users?.full_name || null
    }));

    const response: ApiResponse<any[]> = {
      success: true,
      message: 'SMS templates retrieved successfully',
      data: mappedTemplates
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const updateSmsTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) throw new ApiError('ID required', 400);

    const { name, template, variables, sms_type, is_active } = req.body;

    const data: Prisma.sms_templatesUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (template !== undefined) data.template = template;
    if (variables !== undefined) data.variables = variables ? JSON.parse(JSON.stringify(variables)) : Prisma.JsonNull;
    if (sms_type !== undefined) data.sms_type = sms_type;
    if (is_active !== undefined) data.is_active = is_active;
    data.updated_at = new Date();

    try {
      const updated = await prisma.sms_templates.update({
        where: { id },
        data
      });

      logger.info(`SMS template updated: ${id} by ${req.user!.email}`);

      const response: ApiResponse<SmsTemplate> = {
        success: true,
        message: 'SMS template updated successfully',
        data: updated as any
      };

      res.json(response);
    } catch (e) {
      throw new ApiError('SMS template not found', 404);
    }
  } catch (error) {
    next(error);
  }
};

export const deleteSmsTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) throw new ApiError('ID required', 400);

    try {
      await prisma.sms_templates.delete({
        where: { id }
      });

      logger.info(`SMS template deleted: ${id} by ${req.user!.email}`);

      const response: ApiResponse = {
        success: true,
        message: 'SMS template deleted successfully'
      };

      res.json(response);
    } catch (e) {
      throw new ApiError('SMS template not found', 404);
    }
  } catch (error) {
    next(error);
  }
};

export const subscribeSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone, crops, regions, alert_types } = req.body;
    const userId = req.user?.id;

    const subscription = await prisma.sms_subscriptions.upsert({
      where: { phone },
      update: {
        crops: crops ? JSON.parse(JSON.stringify(crops)) : [],
        regions: regions ? JSON.parse(JSON.stringify(regions)) : [],
        alert_types: alert_types ? JSON.parse(JSON.stringify(alert_types)) : [],
        is_active: true,
        updated_at: new Date()
      },
      create: {
        phone,
        user_id: userId || null,
        crops: crops ? JSON.parse(JSON.stringify(crops)) : [],
        regions: regions ? JSON.parse(JSON.stringify(regions)) : [],
        alert_types: alert_types ? JSON.parse(JSON.stringify(alert_types)) : [],
        is_active: true
      }
    });

    logger.info(`SMS subscription created/updated: ${phone}`);

    const response: ApiResponse<SmsSubscription> = {
      success: true,
      message: 'SMS subscription updated successfully',
      data: subscription as any
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getSmsSubscriptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 20, is_active = true } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const activeBool = String(is_active) === 'true';

    const [subs, total] = await prisma.$transaction([
      prisma.sms_subscriptions.findMany({
        where: { is_active: activeBool },
        include: {
          users: { select: { full_name: true } }
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: Number(limit)
      }),
      prisma.sms_subscriptions.count({ where: { is_active: activeBool } })
    ]);

    const pages = Math.ceil(total / Number(limit));

    const mappedSubs = subs.map(s => ({
      ...s,
      user_name: s.users?.full_name || null
    }));

    const response: ApiResponse<any[]> = {
      success: true,
      message: 'SMS subscriptions retrieved successfully',
      data: mappedSubs,
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

export const unsubscribeSms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { phone } = req.params;
    if (!phone) throw new ApiError('Phone required', 400);

    try {
      await prisma.sms_subscriptions.update({
        where: { phone },
        data: {
          is_active: false,
          updated_at: new Date()
        }
      });

      logger.info(`SMS unsubscribed: ${phone}`);

      const response: ApiResponse = {
        success: true,
        message: 'Successfully unsubscribed from SMS alerts'
      };

      res.json(response);
    } catch (e) {
      throw new ApiError('SMS subscription not found', 404);
    }
  } catch (error) {
    next(error);
  }
};

export const getSmsStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [todaySent, activeSubscriptions, pending, failed] = await prisma.$transaction([
      prisma.sms_logs.count({
        where: {
          created_at: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      prisma.sms_subscriptions.count({ where: { is_active: true } }),
      prisma.sms_logs.count({ where: { status: 'pending' } }),
      prisma.sms_logs.count({ where: { status: 'failed' } })
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'SMS stats retrieved successfully',
      data: {
        todaySent,
        activeSubscriptions,
        pending,
        failed
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};