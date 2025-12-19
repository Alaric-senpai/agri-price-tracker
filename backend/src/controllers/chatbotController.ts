import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { generateChatResponse } from '../services/geminiService';
import type { ChatRequest, ChatMessage, ChatConversation, ApiResponse } from '../types/index';
import { Prisma } from '../../generated/prisma/client';

/**
 * send message
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export const sendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { message, session_id, context }: ChatRequest = req.body;
    const userId = req.user?.id;

    // Get or create conversation
    let conversation: any;

    if (session_id) {
      conversation = await prisma.chat_conversations.findFirst({
        where: { session_id }
      });

      if (!conversation) {
        // Create new conversation
        conversation = await prisma.chat_conversations.create({
          data: {
            user_id: userId || null,
            session_id,
            messages: [],
            context: (context || {}) as Prisma.InputJsonValue
          }
        });
      }
    } else {
      // Create new conversation without session_id
      conversation = await prisma.chat_conversations.create({
        data: {
          user_id: userId || null,
          messages: [],
          context: (context || {}) as Prisma.InputJsonValue
        }
      });
    }

    // Add user message to conversation
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };

    const currentMessages = (conversation.messages as unknown as ChatMessage[]) || [];
    const messages = [...currentMessages, userMessage];

    // Generate AI response using Gemini
    const aiResponse = await generateChatResponse(message, messages, context);

    // Add AI response to conversation
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    };

    const updatedMessages = [...messages, assistantMessage];

    // Update conversation in database
    const updatedConversation = await prisma.chat_conversations.update({
      where: { id: conversation.id },
      data: {
        messages: updatedMessages as unknown as Prisma.InputJsonValue,
        context: (context || {}) as Prisma.InputJsonValue,
        updated_at: new Date()
      }
    });

    logger.info(`Chat message processed for session: ${session_id || conversation.id}`);

    const response: ApiResponse = {
      success: true,
      message: 'Chat response generated successfully',
      data: {
        response: aiResponse,
        session_id: session_id || conversation.id,
        conversation_id: conversation.id
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * get conversation
 * @param req 
 * @param res 
 * @param next 
 */
export const getConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { session_id } = req.params;
    const userId = req.user?.id;

    if (!session_id) {
      throw new ApiError('Session ID is required', 400);
    }

    const where: Prisma.chat_conversationsWhereInput = {
      session_id
    };

    if (userId) {
      where.OR = [
        { user_id: userId },
        { user_id: null }
      ];
    }

    const conversation = await prisma.chat_conversations.findFirst({
      where,
      orderBy: { updated_at: 'desc' }
    });

    if (!conversation) {
      throw new ApiError('Conversation not found', 404);
    }

    const response: ApiResponse<ChatConversation> = {
      success: true,
      message: 'Conversation retrieved successfully',
      data: conversation as unknown as ChatConversation
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * get user conversations
 * @param req 
 * @param res 
 * @param next 
 */
export const getUserConversations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const [conversations, total] = await prisma.$transaction([
      prisma.chat_conversations.findMany({
        where: { user_id: userId },
        orderBy: { updated_at: 'desc' },
        skip: offset,
        take: Number(limit),
        select: {
          id: true,
          session_id: true,
          context: true,
          created_at: true,
          updated_at: true,
          messages: true
        }
      }),
      prisma.chat_conversations.count({ where: { user_id: userId } })
    ]);

    const pages = Math.ceil(total / Number(limit));

    // Map to include last_message manually since we can't easily select it with Prisma like SQL
    const mappedConversations = conversations.map(conv => {
      const msgs = conv.messages as unknown as ChatMessage[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastMsg = msgs && msgs.length > 0 ? (msgs[msgs.length - 1] as any).content ?? (msgs[msgs.length - 1] as unknown as string) : null;
      // We don't return the full messages array in the list view to stay efficient
      const { messages, ...rest } = conv;
      return {
        ...rest,
        last_message: lastMsg
      };
    });

    const response: ApiResponse<any[]> = {
      success: true,
      message: 'User conversations retrieved successfully',
      data: mappedConversations,
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

/**
 * delete conversation
 * @param req 
 * @param res 
 * @param next 
 */
export const deleteConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    if (!id) {
      throw new ApiError('Conversation ID is required', 400);
    }

    // First check if it exists and belongs to user
    const conversation = await prisma.chat_conversations.findFirst({
      where: { id, user_id: userId }
    });

    if (!conversation) {
      throw new ApiError('Conversation not found or access denied', 404);
    }

    await prisma.chat_conversations.delete({
      where: { id }
    });

    logger.info(`Conversation deleted: ${id} by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: 'Conversation deleted successfully'
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * get chat stats
 * @param req 
 * @param res 
 * @param next 
 */
export const getChatStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayConversations, uniqueUsers, totalConversations, avgMessagesResult] = await prisma.$transaction([
      prisma.chat_conversations.count({
        where: {
          created_at: { gte: today }
        }
      }),
      prisma.chat_conversations.groupBy({
        by: ['user_id'],
        where: { user_id: { not: null } },
        orderBy: { user_id: 'asc' }
      }),
      prisma.chat_conversations.count(),
      prisma.$queryRaw`SELECT AVG(jsonb_array_length(messages)) as avg_messages
             FROM chat_conversations
             WHERE jsonb_array_length(messages) > 0`
    ]);

    const avgMessages = (avgMessagesResult as any)[0]?.avg_messages || 0;

    const response: ApiResponse = {
      success: true,
      message: 'Chat stats retrieved successfully',
      data: {
        todayConversations,
        uniqueUsers: uniqueUsers.length,
        totalConversations,
        avgMessagesPerConversation: parseFloat(avgMessages.toString())
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};