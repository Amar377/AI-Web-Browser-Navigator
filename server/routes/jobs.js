import express from 'express';
import multer from 'multer';
import path from 'path';
import { chromium } from 'playwright';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'resume-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, DOC, and DOCX files are allowed'));
  }
});

// Store job application sessions
const jobSessions = new Map();

// Upload resume
router.post('/upload-resume', upload.single('resume'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    path: req.file.path
  });
});

// Start job application automation
router.post('/start', async (req, res) => {
  const { resumePath, companies, roles, sessionId } = req.body;

  if (!companies || !roles) {
    return res.status(400).json({ error: 'Companies and roles are required' });
  }

  try {
    console.log(`Starting job application session ${sessionId}`);
    
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Parse companies and roles
    const companyList = companies.split('\n').filter(c => c.trim());
    const roleList = roles.split('\n').filter(r => r.trim());

    // Create application queue
    const applications = [];
    for (const company of companyList) {
      for (const role of roleList) {
        applications.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          company: company.trim(),
          position: role.trim(),
          status: 'pending',
          progress: 0
        });
      }
    }

    // Store session
    jobSessions.set(sessionId, {
      browser,
      context,
      page,
      resumePath,
      applications,
      currentIndex: 0
    });

    res.json({
      sessionId,
      status: 'started',
      applications
    });

  } catch (error) {
    console.error('Job application error:', error);
    res.status(500).json({ 
      error: 'Failed to start job applications',
      message: error.message 
    });
  }
});

// Get application status
router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = jobSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    sessionId,
    applications: session.applications,
    currentIndex: session.currentIndex
  });
});

// Stop job applications
router.post('/stop/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = jobSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    await session.browser.close();
    jobSessions.delete(sessionId);
    res.json({ sessionId, status: 'stopped' });
  } catch (error) {
    console.error('Error stopping job session:', error);
    res.status(500).json({ 
      error: 'Failed to stop job session',
      message: error.message 
    });
  }
});

export default router;
