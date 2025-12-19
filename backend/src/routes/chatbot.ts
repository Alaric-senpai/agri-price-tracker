import { Router } from 'express';
import { validate, schemas } from '../middleware/validation';
import { optionalAuth, authenticate, requireAdmin } from '../middleware/auth';
import { chatRateLimiter } from '../middleware/rateLimiter';
import {
  sendMessage,
  getConversation,
  getUserConversations,
  deleteConversation,
  getChatStats
} from '../controllers/chatbotController.js';

const router: Router = Router();

// Public/authenticated routes
/**
 * @swagger
 * tags:
 *   name: Chatbot
 *   description: AI-powered agricultural assistant
 */

/**
 * @swagger
 * /chatbot/message:
 *   post:
 *     summary: Send a message to the chatbot
 *     tags: [Chatbot]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               conversation_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Bot response
 */
router.post('/message', optionalAuth, chatRateLimiter, validate(schemas.chatMessage), sendMessage);

/**
 * @swagger
 * /chatbot/conversation/{session_id}:
 *   get:
 *     summary: Get conversation history
 *     tags: [Chatbot]
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation history
 */
router.get('/conversation/:session_id', optionalAuth, getConversation);

/**
 * @swagger
 * /chatbot/conversations:
 *   get:
 *     summary: Get user conversations
 *     tags: [Chatbot]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
 */
router.get('/conversations', authenticate, getUserConversations);

/**
 * @swagger
 * /chatbot/conversations/{id}:
 *   delete:
 *     summary: Delete a conversation
 *     tags: [Chatbot]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation deleted
 */
router.delete('/conversations/:id', authenticate, deleteConversation);

/**
 * @swagger
 * /chatbot/stats:
 *   get:
 *     summary: Get chatbot statistics (admin only)
 *     tags: [Chatbot]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chatbot usage statistics
 *       403:
 *         description: Admin access required
 */
router.get('/stats', authenticate, requireAdmin, getChatStats);

export default router;