import express from 'express';
import axios from 'axios';

const router = express.Router();
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'phi3';

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
  const { messages, model = DEFAULT_MODEL } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  try {
    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Convert messages to Ollama format
    const prompt = messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n') + '\nAssistant:';

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
            res.write(`data: ${JSON.stringify({ content: data.response })}\n\n`);
          }
          if (data.done) {
            res.write('data: [DONE]\n\n');
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      }
    });

    response.data.on('end', () => {
      res.end();
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
  const { messages, model = DEFAULT_MODEL } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  try {
    const prompt = messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n') + '\nAssistant:';

    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model,
      prompt,
      stream: false
    });

    res.json({
      content: response.data.response,
      model: response.data.model
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
