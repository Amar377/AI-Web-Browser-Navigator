import express from 'express';
import { chromium } from 'playwright';

const router = express.Router();

// Store active browser sessions
const sessions = new Map();

// Start navigation session
router.post('/start', async (req, res) => {
  const { url, task, sessionId } = req.body;

  if (!url || !task) {
    return res.status(400).json({ error: 'URL and task are required' });
  }

  try {
    console.log(`Starting navigation session ${sessionId} for ${url}`);
    
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    // Store session
    sessions.set(sessionId, {
      browser,
      context,
      page,
      url,
      task,
      logs: [],
      isPaused: false
    });

    // Navigate to URL
    await page.goto(url);
    
    const log = {
      id: Date.now().toString(),
      type: 'navigate',
      message: `Navigated to ${url}`,
      timestamp: new Date()
    };

    sessions.get(sessionId).logs.push(log);

    res.json({
      sessionId,
      status: 'started',
      log
    });

  } catch (error) {
    console.error('Navigation error:', error);
    res.status(500).json({ 
      error: 'Failed to start navigation',
      message: error.message 
    });
  }
});

// Pause session
router.post('/pause/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.isPaused = true;
  res.json({ sessionId, status: 'paused' });
});

// Resume session
router.post('/resume/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.isPaused = false;
  res.json({ sessionId, status: 'resumed' });
});

// Stop session
router.post('/stop/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    await session.browser.close();
    sessions.delete(sessionId);
    res.json({ sessionId, status: 'stopped' });
  } catch (error) {
    console.error('Error stopping session:', error);
    res.status(500).json({ 
      error: 'Failed to stop session',
      message: error.message 
    });
  }
});

// Get session logs
router.get('/logs/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({ 
    sessionId,
    logs: session.logs,
    isPaused: session.isPaused
  });
});

// Execute action (click, type, etc.)
router.post('/action/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { action, selector, value } = req.body;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.isPaused) {
    return res.status(400).json({ error: 'Session is paused' });
  }

  try {
    const { page } = session;
    let log;

    switch (action) {
      case 'click':
        await page.click(selector);
        log = {
          id: Date.now().toString(),
          type: 'click',
          message: `Clicked on ${selector}`,
          timestamp: new Date()
        };
        break;

      case 'type':
        await page.fill(selector, value);
        log = {
          id: Date.now().toString(),
          type: 'type',
          message: `Typed "${value}" into ${selector}`,
          timestamp: new Date()
        };
        break;

      case 'screenshot':
        const screenshot = await page.screenshot({ encoding: 'base64' });
        return res.json({
          sessionId,
          screenshot,
          log: {
            id: Date.now().toString(),
            type: 'extract',
            message: 'Captured screenshot',
            timestamp: new Date()
          }
        });

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    session.logs.push(log);
    res.json({ sessionId, log });

  } catch (error) {
    console.error('Action error:', error);
    const errorLog = {
      id: Date.now().toString(),
      type: 'error',
      message: error.message,
      timestamp: new Date()
    };
    session.logs.push(errorLog);
    
    res.status(500).json({ 
      error: 'Failed to execute action',
      message: error.message,
      log: errorLog
    });
  }
});

export default router;
