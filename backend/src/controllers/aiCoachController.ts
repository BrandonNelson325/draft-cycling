import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { aiCoachService } from '../services/aiCoachService';
import { chatGreetingService } from '../services/chatGreetingService';
import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';

export const analyzeTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const analysis = await aiCoachService.analyzeTraining(req.user.id);

    res.json({ analysis });
  } catch (error) {
    logger.error('Analyze training error:', error);
    res.status(500).json({ error: 'Failed to analyze training' });
  }
};

export const chat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { conversation_id, message, client_date } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const result = await aiCoachService.chat(
      req.user.id,
      conversation_id || null,
      message,
      client_date
    );

    logger.debug('AI Coach service returned:', result);

    // Get the assistant message that was just created
    const { data: assistantMessage, error: fetchError } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', result.conversationId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError) {
      logger.error('Error fetching assistant message:', fetchError);
    }

    logger.debug('Assistant message from DB:', assistantMessage);

    // Return in format frontend expects
    const response = {
      message: assistantMessage || {
        id: `temp-${Date.now()}`,
        conversation_id: result.conversationId,
        role: 'assistant' as const,
        content: result.response,
        created_at: new Date().toISOString(),
      },
      conversation_id: result.conversationId,
    };

    logger.debug('Sending response to frontend:', response);

    res.json(response);
  } catch (error: any) {
    logger.error('Chat error:', error);
    res.status(500).json({ error: error.message || 'Chat failed' });
  }
};

export const chatStream = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { conversation_id, message, client_date } = req.body;

  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx/proxy buffering
  res.flushHeaders();

  const sendEvent = (data: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await aiCoachService.chatStream(
      req.user.id,
      conversation_id || null,
      message,
      client_date,
      sendEvent
    );
  } catch (error: any) {
    sendEvent({ type: 'error', error: error.message || 'Chat failed' });
  } finally {
    res.end();
  }
};

export const getConversations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { data: conversations, error } = await supabaseAdmin
      .from('chat_conversations')
      .select('*')
      .eq('athlete_id', req.user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
      return;
    }

    res.json({ conversations: conversations || [] });
  } catch (error) {
    logger.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
};

export const deleteConversation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const conversationId = req.params.conversationId;

    if (!conversationId) {
      res.status(400).json({ error: 'Conversation ID is required' });
      return;
    }

    // Delete messages first
    const { error: messagesError } = await supabaseAdmin
      .from('chat_messages')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('athlete_id', req.user.id);

    if (messagesError) {
      logger.error('Error deleting messages:', messagesError);
      res.status(500).json({ error: 'Failed to delete messages' });
      return;
    }

    // Delete conversation
    const { error: conversationError } = await supabaseAdmin
      .from('chat_conversations')
      .delete()
      .eq('id', conversationId)
      .eq('athlete_id', req.user.id);

    if (conversationError) {
      logger.error('Error deleting conversation:', conversationError);
      res.status(500).json({ error: 'Failed to delete conversation' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};

export const getConversationMessages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const conversationId = req.params.conversationId;

    if (!conversationId) {
      res.status(400).json({ error: 'Conversation ID is required' });
      return;
    }

    // Verify conversation belongs to user
    const { data: conversation } = await supabaseAdmin
      .from('chat_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('athlete_id', req.user.id)
      .single();

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Get messages
    const { data: messages, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
      return;
    }

    res.json({ messages: messages || [] });
  } catch (error) {
    logger.error('Get conversation messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

export const analyzeRide = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const activityId = req.params.activityId;

    if (!activityId || Array.isArray(activityId)) {
      res.status(400).json({ error: 'Activity ID is required' });
      return;
    }

    const analysis = await aiCoachService.analyzeRide(req.user.id, parseInt(activityId, 10));

    res.json({ analysis });
  } catch (error) {
    logger.error('Analyze ride error:', error);
    res.status(500).json({ error: 'Failed to analyze ride' });
  }
};

export const suggestWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { workoutType } = req.body;

    const suggestion = await aiCoachService.suggestWorkout(
      req.user.id,
      workoutType
    );

    res.json({ suggestion });
  } catch (error) {
    logger.error('Suggest workout error:', error);
    res.status(500).json({ error: 'Failed to suggest workout' });
  }
};

export const startConversation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Generate contextual greeting
    const greeting = await chatGreetingService.generateGreeting(req.user.id);

    // Create new conversation
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('chat_conversations')
      .insert({
        athlete_id: req.user.id,
        title: 'New Chat',
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (convError) {
      throw new Error(`Failed to create conversation: ${convError.message}`);
    }

    // Store greeting as first assistant message
    const { data: message, error: msgError } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        conversation_id: conversation.id,
        athlete_id: req.user.id,
        role: 'assistant',
        content: greeting,
      })
      .select()
      .single();

    if (msgError) {
      throw new Error(`Failed to create greeting message: ${msgError.message}`);
    }

    res.json({
      conversation_id: conversation.id,
      message: message,
    });
  } catch (error: any) {
    logger.error('Start conversation error:', error);
    res.status(500).json({ error: error.message || 'Failed to start conversation' });
  }
};
