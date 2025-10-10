import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import axios from 'axios';
import pdfParseRaw from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { chromium } from 'playwright';

const router = express.Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'phi3';
const RESUME_ANALYZER_MODEL =
  process.env.RESUME_ANALYZER_MODEL || DEFAULT_MODEL;
const COVER_LETTER_MODEL =
  process.env.COVER_LETTER_MODEL || process.env.RESUME_ANALYZER_MODEL || DEFAULT_MODEL;
const APPLICATION_DELAY_MS = Number.parseInt(
  process.env.JOBS_APPLICATION_DELAY_MS || '1500',
  10
);
const MAX_RESUME_TOKENS = Number.parseInt(
  process.env.RESUME_TOKEN_LIMIT || '1500',
  10
);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'resume-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|txt/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, DOCX, DOC, and TXT files are allowed'));
  }
});

// Store job application sessions
const jobSessions = new Map();
const resumeInsightsCache = new Map();

// Upload resume
router.post('/upload-resume', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const absolutePath = path.isAbsolute(req.file.path)
      ? req.file.path
      : path.resolve(req.file.path);

    let cached = resumeInsightsCache.get(absolutePath);
    if (!cached) {
      const resumeText = await extractResumeText(absolutePath);
      const resumeInsights = await analyzeResume(resumeText);
      cached = { resumeText, resumeInsights };
      resumeInsightsCache.set(absolutePath, cached);
    }

    res.json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      resumeInsights: cached.resumeInsights
    });
  } catch (error) {
    console.error('Resume upload processing failed:', error);
    res.status(200).json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      warning:
        'Resume uploaded, but automatic analysis failed. The assistant will retry when starting the automation.'
    });
  }
});

// Start job application automation
router.post('/start', async (req, res) => {
  const { resumePath, companies, roles, sessionId } = req.body;

  if (!companies || !roles) {
    return res
      .status(400)
      .json({ error: 'Companies and roles are required' });
  }

  if (!resumePath) {
    return res
      .status(400)
      .json({ error: 'Resume path is required. Upload a resume first.' });
  }

  try {
    console.log(`Starting job application session ${sessionId}`);

    const absoluteResumePath = path.isAbsolute(resumePath)
      ? resumePath
      : path.resolve(resumePath);

    if (!fs.existsSync(absoluteResumePath)) {
      return res
        .status(400)
        .json({ error: 'Resume file not found on the server' });
    }

    let resumeText;
    let resumeInsights;
    const cached = resumeInsightsCache.get(absoluteResumePath);
    if (cached) {
      resumeText = cached.resumeText;
      resumeInsights = cached.resumeInsights;
    } else {
      resumeText = await extractResumeText(absoluteResumePath);
      resumeInsights = await analyzeResume(resumeText);
      resumeInsightsCache.set(absoluteResumePath, {
        resumeText,
        resumeInsights
      });
    }

    const browser = await chromium.launch({
      headless: false
    });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata'
    });
    const page = await context.newPage();

    // Parse companies and roles
    const companyList = companies
      .split('\n')
      .map((company) => company.trim())
      .filter(Boolean);
    const roleList = roles
      .split('\n')
      .map((role) => role.trim())
      .filter(Boolean);

    if (!companyList.length || !roleList.length) {
      await browser.close();
      return res
        .status(400)
        .json({ error: 'At least one company and role is required.' });
    }

    // Create application queue
    const applications = [];
    for (const company of companyList) {
      for (const role of roleList) {
        applications.push({
          id: `${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          company,
          position: role,
          status: 'pending',
          progress: 0,
          search: null,
          coverLetter: null,
          summary: '',
          error: null
        });
      }
    }

    const session = {
      browser,
      context,
      page,
      resumePath: absoluteResumePath,
      resumeText,
      resumeInsights,
      applications,
      currentIndex: 0,
      status: 'running',
      stopRequested: false,
      createdAt: new Date().toISOString()
    };

    jobSessions.set(sessionId, session);

    processApplications(sessionId).catch((error) => {
      console.error('Job application processing error:', error);
    });

    res.json({
      sessionId,
      status: 'started',
      resumeInsights,
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
    status: session.status,
    applications: session.applications,
    currentIndex: session.currentIndex,
    resumeInsights: session.resumeInsights,
    error: session.error || null
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
    session.stopRequested = true;
    session.status = 'stopping';
    if (session.browser && session.browser.isConnected()) {
      await session.browser.close();
    }
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

async function processApplications(sessionId) {
  const session = jobSessions.get(sessionId);
  if (!session) return;

  const { page } = session;

  try {
    for (let index = 0; index < session.applications.length; index++) {
      const currentSession = jobSessions.get(sessionId);
      if (!currentSession || currentSession.stopRequested) {
        break;
      }

      const application = currentSession.applications[index];
      if (!application) continue;

      application.status = 'in-progress';
      application.progress = 10;

      try {
        const searchData = await searchRoleAtCompany(
          page,
          application.company,
          application.position
        );
        application.search = searchData;
        application.status = 'research-complete';
        application.progress = 60;

        const coverLetter = await draftCoverLetter(
          application,
          currentSession.resumeInsights
        );
        application.coverLetter = coverLetter;
        application.summary = buildApplicationSummary(application);
        application.status = 'ready-to-apply';
        application.progress = 100;
      } catch (error) {
        application.status = 'error';
        application.error = error.message;
        console.error(
          `Application processing error for ${application.company} - ${application.position}:`,
          error
        );
      }

      currentSession.currentIndex = index + 1;
      await page.waitForTimeout(APPLICATION_DELAY_MS);
    }

    const finalSession = jobSessions.get(sessionId);
    if (finalSession) {
      finalSession.status = finalSession.stopRequested
        ? 'stopped'
        : 'completed';
      finalSession.completedAt = new Date().toISOString();
    }
  } catch (error) {
    const failingSession = jobSessions.get(sessionId);
    if (failingSession) {
      failingSession.status = 'error';
      failingSession.error = error.message;
    }
    console.error('Unhandled job processing error:', error);
  }
}

async function searchRoleAtCompany(page, company, role) {
  const query = `${company} "${role}" job apply India`;
  const searchUrl = `https://www.google.com/search?hl=en&gl=IN&igu=1&q=${encodeURIComponent(
    query
  )}`;

  await page.goto(searchUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 25_000
  });

  await handleGoogleConsent(page);
  await page.waitForTimeout(1500);

  const results =
    (await page
      .evaluate(() => {
        const items = [];
        const nodes = document.querySelectorAll('div.g, div[data-hveid]');
        nodes.forEach((node) => {
          const titleEl = node.querySelector('h3');
          const linkEl = node.querySelector('a');
          const snippetEl =
            node.querySelector('.VwiC3b, .aCOpRe, .MUxGbd, .KB4HRf');

          if (
            titleEl &&
            linkEl &&
            linkEl.href &&
            !linkEl.href.includes('googleusercontent.com')
          ) {
            items.push({
              title: titleEl.textContent.trim(),
              url: linkEl.href,
              snippet: snippetEl?.textContent?.trim() || ''
            });
          }
        });
        return items.slice(0, 5);
      })
      .catch(() => [])) || [];

  return {
    query,
    searchUrl,
    results,
    capturedAt: new Date().toISOString()
  };
}

async function draftCoverLetter(application, resumeInsights) {
  const topResult = application.search?.results?.[0];
  const prompt = `
You are a professional career coach. Write a short cover letter tailored to the role and company below.
Return JSON only with the following schema:
{
  "subject": "string",
  "opening": "string",
  "body": ["paragraph", "paragraph"],
  "closing": "string",
  "call_to_action": "string"
}

Role: ${application.position}
Company: ${application.company}
Resume summary: ${resumeInsights.summary || ''}
Key skills: ${(resumeInsights.keySkills || []).join(', ')}
Experience highlights: ${(resumeInsights.experienceHighlights || []).join(
    '; '
  )}
Achievements: ${(resumeInsights.achievements || []).join('; ')}
Top search result: ${
    topResult
      ? `${topResult.title} (${topResult.url}) - ${topResult.snippet}`
      : 'No external research available'
  }

Tone: professional, concise, confident. Do not invent work history.`;

  const raw = await callLLM(prompt, COVER_LETTER_MODEL);
  const parsed = parseJsonWithRepair(raw);

  return {
    subject: parsed.subject || '',
    opening: parsed.opening || '',
    body: Array.isArray(parsed.body) ? parsed.body : [],
    closing: parsed.closing || '',
    call_to_action: parsed.call_to_action || ''
  };
}

function buildApplicationSummary(application) {
  const top = application.search?.results?.[0];
  if (top) {
    return `Top lead: ${top.title} (${top.url})`;
  }
  return `Research completed for ${application.company} – ${application.position}`;
}

async function extractResumeText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = await fsPromises.readFile(filePath);

  if (ext === '.pdf') {
    const parsed = await pdfParse(buffer);
    return sanitizeResumeText(parsed.text);
  }

  if (ext === '.docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return sanitizeResumeText(value);
  }

  if (ext === '.doc') {
    throw new Error(
      'DOC format is not supported. Please upload the resume as PDF, DOCX, or TXT.'
    );
  }

  return sanitizeResumeText(buffer.toString('utf8'));
}

async function analyzeResume(resumeText) {
  const truncated = truncateText(resumeText, MAX_RESUME_TOKENS);
  const prompt = `
You are an expert resume analyst. Review the following resume text and return JSON only with this structure:
{
  "summary": "short professional summary",
  "keySkills": ["skill1", "skill2"],
  "experienceHighlights": ["bullet", "bullet"],
  "achievements": ["bullet", "bullet"]
}

Resume:
${truncated}
`;

  try {
    const response = await callLLM(prompt, RESUME_ANALYZER_MODEL);
    const parsed = parseJsonWithRepair(response);
    return {
      summary: parsed.summary || truncated.slice(0, 400),
      keySkills: Array.isArray(parsed.keySkills) ? parsed.keySkills : [],
      experienceHighlights: Array.isArray(parsed.experienceHighlights)
        ? parsed.experienceHighlights
        : [],
      achievements: Array.isArray(parsed.achievements)
        ? parsed.achievements
        : []
    };
  } catch (error) {
    console.error('Resume analysis failed:', error);
    return {
      summary: truncated.slice(0, 400),
      keySkills: [],
      experienceHighlights: [],
      achievements: []
    };
  }
}

async function callLLM(prompt, model = DEFAULT_MODEL) {
  const response = await axios.post(
    `${OLLAMA_URL}/api/generate`,
    {
      model,
      prompt,
      stream: false
    },
    { timeout: 60_000 }
  );

  return (response.data?.response || '').trim();
}

function parseJsonWithRepair(raw) {
  if (!raw) return {};
  const text = raw.trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1) {
    return {};
  }

  const payload = text.slice(jsonStart, jsonEnd + 1);
  try {
    return JSON.parse(payload);
  } catch (error) {
    const repaired = payload
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z0-9_-]+)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, (_, value) => {
        const escaped = value
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n');
        return `:"${escaped}"`;
      });
    try {
      return JSON.parse(repaired);
    } catch {
      return {};
    }
  }
}

function truncateText(text, maxWords) {
  if (!text) return '';
  const words = text.split(/\s+/);
  if (words.length <= maxWords) {
    return words.join(' ');
  }
  return words.slice(0, maxWords).join(' ');
}

function sanitizeResumeText(text) {
  if (!text) return '';
  return text
    .replace(/\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function handleGoogleConsent(page) {
  try {
    if (page.url().includes('consent.google.com')) {
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const label = (await button.textContent())?.toLowerCase?.() || '';
        if (
          label.includes('accept') ||
          label.includes('agree') ||
          label.includes('consent')
        ) {
          await button.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    }
  } catch (error) {
    console.warn('Consent handling skipped:', error.message);
  }
}

async function navigateWithFallback(page, urls = []) {
  let lastError;
  for (const url of urls) {
    if (!url) {
      continue;
    }
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 25_000
      });
      return url;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Failed to navigate to any candidate URL');
}
const pdfParse = pdfParseRaw.default || pdfParseRaw;
