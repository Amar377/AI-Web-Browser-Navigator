import express from 'express';
import axios from 'axios';
import {
  ensureChatSession,
  saveChatMessages,
  saveChatMessage,
  updateChatSummary,
  getChatTranscript
} from '../db/index.js';

const router = express.Router();
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'phi3';
const SUMMARY_MODEL =
  process.env.CHAT_SUMMARY_MODEL || process.env.DEFAULT_MODEL || 'phi3';

const createSessionId = () =>
  `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const toPrompt = (messages) =>
  messages
    .map(
      (msg) =>
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    )
    .join('\n') + '\nAssistant:';

function deriveChatTitle(messages = []) {
  const firstUserMessage = messages.find((msg) => msg.role === 'user');
  if (!firstUserMessage) {
    return 'New conversation';
  }
  return firstUserMessage.content.slice(0, 80);
}

async function buildChatSummary(sessionId, assistantContent) {
  const transcript = getChatTranscript(sessionId);

  if (!transcript.length) {
    return '';
  }

  const conversation = transcript
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join('\n');

  const prompt = `
You are a helpful assistant summarizing a search conversation.

Conversation transcript:
${conversation}

Most recent assistant response:
${assistantContent}

Provide a concise, user-friendly summary focusing on:
1. What the user asked you to find or accomplish.
2. The final answer or search result you delivered.
3. Any next steps the user should take.

Respond in 2-3 sentences. Return plain text with no additional formatting.`;

  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: SUMMARY_MODEL,
        prompt,
        stream: false
      },
      { timeout: 60_000 }
    );

    return response.data?.response?.trim() || '';
  } catch (error) {
    console.error('Failed to generate chat summary:', error.message);

    const latestUser = [...transcript]
      .reverse()
      .find((entry) => entry.role === 'user');

    return latestUser
      ? `Request: ${latestUser.content}. Latest answer: ${assistantContent}.`
      : assistantContent.slice(0, 200);
  }
}

// Get available models
router.get('/models', async (req, res) => {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching models:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch models',
      message: 'Make sure Ollama is running at ' + OLLAMA_URL
    });
  }
});

// Send message (streaming)
router.post('/stream', async (req, res) => {
  const {
    messages,
    model = DEFAULT_MODEL,
    sessionId: providedSessionId,
    title
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  try {
    const sessionId = providedSessionId || createSessionId();
    const chatTitle = title || deriveChatTitle(messages);
    ensureChatSession(sessionId, chatTitle);

    const formattedMessages = messages.map((msg) => ({
      messageId: msg.id ?? null,
      role: msg.role,
      content: msg.content
    }));
    saveChatMessages(
      sessionId,
      formattedMessages.filter((msg) => msg.role === 'user')
    );

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ sessionId })}\n\n`);

    const prompt = toPrompt(messages);
    let assistantContent = '';
    const assistantMessageId = `assistant-${Date.now().toString(36)}`;

    // Stream from Ollama
    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model,
        prompt,
        stream: true
      },
      {
        responseType: 'stream'
      }
    );

    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            assistantContent += data.response;
            res.write(`data: ${JSON.stringify({ content: data.response })}\n\n`);
          }
          if (data.done) {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.write('data: [DONE]\n\n');
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      }
    });

    response.data.on('end', async () => {
      try {
        if (assistantContent.trim()) {
          saveChatMessage(sessionId, {
            messageId: assistantMessageId,
            role: 'assistant',
            content: assistantContent.trim()
          });
        }

        const summary = await buildChatSummary(sessionId, assistantContent);
        if (summary) {
          updateChatSummary(sessionId, summary);
          res.write(`data: ${JSON.stringify({ summary })}\n\n`);
        }
      } catch (error) {
        console.error('Post-stream handling failed:', error);
      } finally {
        res.end();
      }
    });

    response.data.on('error', (error) => {
      console.error('Stream error:', error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('Error streaming chat:', error.message);
    res.status(500).json({ 
      error: 'Failed to stream chat response',
      message: error.message
    });
  }
});

// Send message (non-streaming)
router.post('/message', async (req, res) => {
  const {
    messages,
    model = DEFAULT_MODEL,
    sessionId: providedSessionId,
    title
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  try {
    const sessionId = providedSessionId || createSessionId();
    const chatTitle = title || deriveChatTitle(messages);
    ensureChatSession(sessionId, chatTitle);

    const formattedMessages = messages.map((msg) => ({
      messageId: msg.id ?? null,
      role: msg.role,
      content: msg.content
    }));
    saveChatMessages(
      sessionId,
      formattedMessages.filter((msg) => msg.role === 'user')
    );

    const prompt = toPrompt(messages);

    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model,
      prompt,
      stream: false
    });

    const assistantContent = response.data.response?.trim() || '';
    const assistantMessageId = `assistant-${Date.now().toString(36)}`;

    if (assistantContent) {
      saveChatMessage(sessionId, {
        messageId: assistantMessageId,
        role: 'assistant',
        content: assistantContent
      });
    }

    const summary = await buildChatSummary(sessionId, assistantContent);
    if (summary) {
      updateChatSummary(sessionId, summary);
    }

    res.json({
      content: assistantContent,
      model: response.data.model,
      sessionId,
      summary
    });
  } catch (error) {
    console.error('Error sending message:', error.message);
    res.status(500).json({ 
      error: 'Failed to get chat response',
      message: error.message
    });
  }
});

export default router;
