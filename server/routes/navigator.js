import express from 'express';
import { chromium } from 'playwright';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  logActivity,
  getSessionLogs,
  initSessionSummary,
  saveSessionSummary,
  updateSessionStatus,
  getSessionSummary
} from '../db/index.js';

const router = express.Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const SUMMARY_MODEL =
  process.env.NAVIGATOR_SUMMARY_MODEL || process.env.DEFAULT_MODEL || 'phi3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const browserDataRoot = path.join(__dirname, '..', 'browser-data');
const USER_PROFILE_PATH = path.join(browserDataRoot, 'primary-profile');

fs.mkdirSync(USER_PROFILE_PATH, { recursive: true });

const siteConfigs = {
  amazon: {
    displayName: 'Amazon',
    baseUrl: process.env.AMAZON_URL || 'https://www.amazon.com/',
    aliases: ['amazon', 'amazon.com'],
    searchSelectors: ['#twotabsearchtextbox'],
    submitSelectors: ['#nav-search-submit-button'],
    resultSelector: 'div[data-component-type="s-search-result"] h2 a'
  },
  flipkart: {
    displayName: 'Flipkart',
    baseUrl: 'https://www.flipkart.com/',
    aliases: ['flipkart', 'flipkart.com'],
    dismissSelectors: ['button._2KpZ6l._2doB4z'],
    searchSelectors: [
      'input[title="Search for products, brands and more"]',
      'input[name="q"]'
    ],
    submitSelectors: ['button[type="submit"]']
  },
  myntra: {
    displayName: 'Myntra',
    baseUrl: 'https://www.myntra.com/',
    aliases: ['myntra', 'myntra.com'],
    searchSelectors: [
      'input[placeholder="Search for products, brands and more"]',
      'input[name="searchVal"]'
    ],
    submitSelectors: ['span.desktop-iconSearch']
  },
  walmart: {
    displayName: 'Walmart',
    baseUrl: 'https://www.walmart.com/',
    aliases: ['walmart', 'walmart.com'],
    searchSelectors: ['input[aria-label="Search"]', 'input[name="query"]'],
    submitSelectors: ['button[aria-label="Search"]', 'button[type="submit"]'],
    resultSelector: 'div[data-item-id] a'
  },
  target: {
    displayName: 'Target',
    baseUrl: 'https://www.target.com/',
    aliases: ['target', 'target.com'],
    searchSelectors: ['input#search', 'input[name="searchTerm"]'],
    submitSelectors: ['button[data-test="searchButton"]']
  },
  ebay: {
    displayName: 'eBay',
    baseUrl: 'https://www.ebay.com/',
    aliases: ['ebay', 'ebay.com'],
    searchSelectors: [
      'input[aria-label="Search for anything"]',
      'input[name="_nkw"]'
    ],
    submitSelectors: ['input[type="submit"][value="Search"]']
  },
  bestbuy: {
    displayName: 'Best Buy',
    baseUrl: 'https://www.bestbuy.com/',
    aliases: ['bestbuy', 'best buy', 'bestbuy.com'],
    searchSelectors: [
      'input[type="search"][aria-label="Search Best Buy"]',
      'input#gh-search-input'
    ],
    submitSelectors: ['button[type="submit"][aria-label="search"]']
  }
};

const sessions = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

router.post('/start', async (req, res) => {
  const { task, sessionId } = req.body;

  if (!task || !sessionId) {
    return res.status(400).json({ error: 'Task and sessionId are required' });
  }

  try {
    console.log(`Starting navigation session ${sessionId} for task: ${task}`);

    const context = await chromium.launchPersistentContext(USER_PROFILE_PATH, {
      headless: false,
      viewport: { width: 1280, height: 960 }
    });
    const existingPages = context.pages();
    await Promise.all(
      existingPages.map(async (p) => {
        try {
          if (!p.isClosed()) {
            await p.close();
          }
        } catch (closeError) {
          console.warn('Failed to close existing page:', closeError);
        }
      })
    );
    const page = await context.newPage();
    await page.bringToFront();
    const browser = context.browser();

    const session = {
      sessionId,
      browser,
      context,
      page,
      task,
      isPaused: false,
      awaitingUserAction: null,
      metadata: {},
      status: 'running'
    };

    sessions.set(sessionId, session);
    initSessionSummary(sessionId, task);
    updateSessionStatus(sessionId, 'running');

    const log = logActivity(
      sessionId,
      'start',
      `Started automation task: ${task}`
    );

    res.json({
      sessionId,
      status: 'started',
      log
    });

    runAutomation(sessionId).catch((error) => {
      console.error(`Automation error for ${sessionId}:`, error);
    });
  } catch (error) {
    console.error('Navigation error:', error);
    res.status(500).json({
      error: 'Failed to start navigation',
      message: error.message
    });
  }
});

router.post('/pause/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.isPaused = true;
  session.status = 'paused';
  session.awaitingUserAction = session.awaitingUserAction || 'manual-pause';
  updateSessionStatus(sessionId, 'paused');
  const log = logActivity(
    sessionId,
    'pause',
    'Session paused by user request',
    'warning'
  );

  res.json({ sessionId, status: 'paused', log });
});

router.post('/resume/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.isPaused = false;
  session.status = 'running';
  session.awaitingUserAction = null;
  updateSessionStatus(sessionId, 'running');
  const log = logActivity(
    sessionId,
    'resume',
    'Session resumed',
    'info'
  );

  res.json({ sessionId, status: 'resumed', log });
});

router.post('/stop/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  const metadata = session?.metadata;
  const summary = getSessionSummary(sessionId);

  try {
    if (session) {
      if (session.page && !session.page.isClosed()) {
        await session.page.close().catch(() => {});
      }
      await session.context.close();
      sessions.delete(sessionId);
    }

    const status = summary?.status === 'completed' ? 'completed' : 'stopped';
    updateSessionStatus(sessionId, status);
    logActivity(sessionId, 'stop', 'Session stopped by user', 'warning');
    await generateSessionSummaries(sessionId, status, metadata);

    res.json({ sessionId, status });
  } catch (error) {
    console.error('Error stopping session:', error);
    res.status(500).json({
      error: 'Failed to stop session',
      message: error.message
    });
  }
});

router.get('/logs/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const logs = getSessionLogs(sessionId);
  const session = sessions.get(sessionId);
  const summary = getSessionSummary(sessionId);

  if (!session && !summary && logs.length === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    sessionId,
    logs,
    isPaused: session?.isPaused ?? false,
    status: summary?.status || session?.status || 'unknown',
    processSummary: summary?.processSummary || '',
    finalSummary: summary?.finalSummary || ''
  });
});

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

    switch (action) {
      case 'click':
        await page.click(selector);
        logActivity(
          sessionId,
          'click',
          `Clicked on ${selector}`
        );
        break;
      case 'type':
        await page.fill(selector, value);
        logActivity(
          sessionId,
          'type',
          `Typed "${value}" into ${selector}`
        );
        break;
      case 'screenshot': {
        const screenshot = await page.screenshot({ encoding: 'base64' });
        logActivity(sessionId, 'extract', 'Captured screenshot');
        return res.json({
          sessionId,
          screenshot
        });
      }
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    res.json({ sessionId, status: 'ok' });
  } catch (error) {
    console.error('Action error:', error);
    logActivity(
      sessionId,
      'error',
      `Failed to execute action: ${error.message}`,
      'error'
    );
    res.status(500).json({
      error: 'Failed to execute action',
      message: error.message
    });
  }
});

async function runAutomation(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  const plan = deriveAutomationPlan(session.task);
  const planMessage = plan.product
    ? `Target: ${plan.displayName}, focus: ${plan.product}`
    : `Target: ${plan.displayName}`;
  logActivity(sessionId, 'plan', planMessage);

  try {
    let outcome = 'manual';

    switch (plan.siteKey) {
      case 'amazon':
        await handleAmazonOrder(sessionId, plan);
        logActivity(
          sessionId,
          'success',
          'Amazon automation finished. Review the cart to continue checkout.'
        );
        outcome = 'completed';
        break;
      case 'generic':
        outcome = await handleGenericWebSearch(sessionId, plan);
        break;
      default:
        outcome = await handleConfiguredSite(sessionId, plan);
        break;
    }

    await generateSessionSummaries(
      sessionId,
      outcome,
      sessions.get(sessionId)?.metadata
    );
  } catch (error) {
    if (session) {
      session.status = 'failed';
    }
    logActivity(
      sessionId,
      'error',
      `Automation failed: ${error.message}`,
      'error'
    );
    await generateSessionSummaries(
      sessionId,
      'failed',
      sessions.get(sessionId)?.metadata
    );
  }
}

function deriveAutomationPlan(task) {
  const product = extractProductFromTask(task);
  const siteInfo = detectSiteFromTask(task);

  return {
    siteKey: siteInfo.siteKey,
    displayName: siteInfo.displayName,
    baseUrl: siteInfo.baseUrl,
    product:
      product || (siteInfo.siteKey === 'amazon' ? 'popular item' : ''),
    rawTask: task,
    siteHint: siteInfo.siteHint
  };
}

function detectSiteFromTask(task) {
  const lowerTask = task.toLowerCase();
  const entries = Object.entries(siteConfigs);

  for (const [key, config] of entries) {
    if (
      config.aliases?.some((alias) =>
        lowerTask.includes(alias.toLowerCase())
      )
    ) {
      return {
        siteKey: key,
        displayName: config.displayName,
        baseUrl: config.baseUrl,
        siteHint: config.displayName
      };
    }
  }

  const urlMatch = task.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    const normalized = normalizeUrl(urlMatch[0]);
    const hostname = normalized
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '');
    const cleanHostname = hostname.replace(/^www\./i, '').toLowerCase();

    const matchingConfig = entries.find(([_, config]) =>
      config.aliases?.some((alias) =>
        cleanHostname.includes(alias.replace(/\s+/g, '').toLowerCase())
      )
    );

    if (matchingConfig) {
      const [key, config] = matchingConfig;
      return {
        siteKey: key,
        displayName: config.displayName,
        baseUrl: config.baseUrl,
        siteHint: config.displayName
      };
    }

    return {
      siteKey: 'custom',
      displayName: cleanHostname,
      baseUrl: normalized,
      siteHint: cleanHostname
    };
  }

  const domainMatch = task.match(
    /\b([a-z0-9-]+\.(?:com|net|org|in|co\.uk|co|shop|store|ca|de|fr|it|es|ae|au|sg))\b/i
  );

  if (domainMatch) {
    const domain = domainMatch[1].toLowerCase();
    const cleanDomain = domain.replace(/^www\./, '');
    const matchingConfig = entries.find(([_, config]) =>
      config.aliases?.some((alias) =>
        cleanDomain.includes(alias.replace(/\s+/g, '').toLowerCase())
      )
    );

    if (matchingConfig) {
      const [key, config] = matchingConfig;
      return {
        siteKey: key,
        displayName: config.displayName,
        baseUrl: config.baseUrl,
        siteHint: config.displayName
      };
    }

    return {
      siteKey: 'custom',
      displayName: cleanDomain,
      baseUrl: normalizeUrl(cleanDomain),
      siteHint: cleanDomain
    };
  }

  return {
    siteKey: 'generic',
    displayName: 'the web',
    baseUrl: '',
    siteHint: ''
  };
}

function normalizeUrl(raw = '') {
  let cleaned = raw.trim();
  if (!cleaned) {
    return '';
  }

  cleaned = cleaned.replace(/,$/, '');
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned.replace(/^www\./i, '')}`;
  }

  return cleaned;
}

function extractProductFromTask(task) {
  const productMatch = task.match(
    /(?:order|buy|purchase|add|get)\s+([^.,;]+)/i
  );
  if (!productMatch) {
    return '';
  }

  return productMatch[1]
    .replace(/(from|on)\s+[a-z0-9 .-]+/i, '')
    .trim();
}

async function handleAmazonOrder(sessionId, plan) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session expired');
  }

  const { page, metadata } = session;
  const baseUrl = plan.baseUrl || siteConfigs.amazon.baseUrl;
  const searchQuery = plan.product || 'popular item';

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  metadata.orderSite = siteConfigs.amazon.displayName;
  logActivity(sessionId, 'navigate', `Opened Amazon homepage (${baseUrl})`);
  await detectManualBlocks(sessionId);

  await waitForSelectorSafe(page, '#twotabsearchtextbox', sessionId, 'search box');
  await waitForResume(sessionId);

  await page.fill('#twotabsearchtextbox', searchQuery);
  logActivity(sessionId, 'type', `Entered search query "${searchQuery}"`);

  await page.click('#nav-search-submit-button');
  logActivity(sessionId, 'click', 'Submitted Amazon search');
  await detectManualBlocks(sessionId);

  const resultSelector = 'div[data-cel-widget^="search_result_"] h2 a';
  await waitForSelectorSafe(page, resultSelector, sessionId, 'search results');

  const topResult = await page.$(resultSelector);
  if (!topResult) {
    throw new Error('No search results found on Amazon');
  }

  const resultTitle = (
    await topResult.evaluate((el) => el.textContent || '')
  ).trim();
  metadata.productQuery = searchQuery;
  metadata.searchResultTitle = resultTitle;
  logActivity(sessionId, 'extract', `Top search result: ${resultTitle}`);

  await topResult.click();
  logActivity(sessionId, 'navigate', 'Opened product detail page');
  await detectManualBlocks(sessionId);

  await page.waitForLoadState('domcontentloaded');
  await captureProductDetails(sessionId);

  const addToCartSelector = '#add-to-cart-button';
  await waitForSelectorSafe(page, addToCartSelector, sessionId, '"Add to Cart" button');

  await page.click(addToCartSelector);
  logActivity(sessionId, 'click', 'Clicked "Add to Cart"');

  await detectManualBlocks(sessionId);
  await page.waitForTimeout(4000);

  await captureCartConfirmation(sessionId);
  metadata.orderSite = siteConfigs.amazon.displayName;
}

async function handleConfiguredSite(sessionId, plan) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session expired');
  }

  const config =
    siteConfigs[plan.siteKey] ||
    (plan.baseUrl
      ? {
          displayName: plan.displayName,
          baseUrl: plan.baseUrl,
          aliases: [],
          searchSelectors: [],
          submitSelectors: []
        }
      : null);

  if (!config) {
    return handleGenericWebSearch(sessionId, plan);
  }

  const { page, metadata } = session;
  const targetUrl = config.baseUrl || plan.baseUrl;

  if (!targetUrl) {
    return handleGenericWebSearch(sessionId, plan);
  }

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  metadata.orderSite = config.displayName;
  logActivity(
    sessionId,
    'navigate',
    `Opened ${config.displayName} (${targetUrl})`
  );

  if (config.dismissSelectors?.length) {
    for (const selector of config.dismissSelectors) {
      try {
        const locator = page.locator(selector).first();
        if (await locator.count()) {
          await locator.click({ timeout: 2000 });
          logActivity(
            sessionId,
            'click',
            `Dismissed popup element ${selector}`
          );
          break;
        }
      } catch (error) {
        // Ignore popup dismissal failures
      }
    }
  }

  await detectManualBlocks(sessionId);

  if (!plan.product) {
    requestManualAction(
      sessionId,
      `Describe or locate the desired items on ${config.displayName}, then press Resume when you are ready for a summary.`,
      'missing-product'
    );
    await waitForResume(sessionId);
    metadata.finalUrl = page.url();
    logActivity(sessionId, 'extract', `Resumed on ${metadata.finalUrl}`);
    return 'manual';
  }

  const searchPerformed = await performSearchOnSite(
    page,
    plan.product,
    config,
    sessionId
  );

  if (!searchPerformed) {
    requestManualAction(
      sessionId,
      `I couldn't locate a search box on ${config.displayName}. Please search for "${plan.product}" manually, then press Resume.`,
      'search-missing'
    );
    await waitForResume(sessionId);
    metadata.finalUrl = page.url();
    logActivity(sessionId, 'extract', `Resumed on ${metadata.finalUrl}`);
    return 'manual';
  }

  logActivity(
    sessionId,
    'type',
    `Searched for "${plan.product}" on ${config.displayName}`
  );

  await detectManualBlocks(sessionId);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2000);
  await captureGenericResults(
    sessionId,
    config.displayName,
    plan.product,
    config.resultSelector
  );

  requestManualAction(
    sessionId,
    `Review the search results on ${config.displayName} and proceed with the order. Press Resume once you have finished.`,
    'manual-site-followup'
  );
  await waitForResume(sessionId);
  metadata.finalUrl = page.url();
  logActivity(sessionId, 'extract', `Resumed on ${metadata.finalUrl}`);
  return 'manual';
}

async function performSearchOnSite(page, product, config, sessionId) {
  const triedSelectors = new Set();
  const searchSelectors = [
    ...(config.searchSelectors || []),
    'input[type="search"]',
    'input[aria-label*="search" i]',
    'input[name*="search" i]',
    'input[placeholder*="search" i]'
  ];

  for (const selector of searchSelectors) {
    if (!selector || triedSelectors.has(selector)) {
      continue;
    }
    triedSelectors.add(selector);

    try {
      const locator = page.locator(selector).first();
      if (!(await locator.count())) {
        continue;
      }

      if (!(await locator.isVisible())) {
        continue;
      }

      await locator.click({ timeout: 2000 });
      await locator.fill('');
      await locator.fill(product);

      let submitted = false;
      for (const submitSelector of config.submitSelectors || []) {
        try {
          const submitLocator = page.locator(submitSelector).first();
          if (await submitLocator.count()) {
            await submitLocator.click({ timeout: 2000 });
            submitted = true;
            break;
          }
        } catch (error) {
          // Try next submit selector
        }
      }

      if (!submitted) {
        try {
          await locator.press('Enter');
          submitted = true;
        } catch (error) {
          submitted = false;
        }
      }

      if (submitted) {
        return true;
      }
    } catch (error) {
      // Try next selector
    }
  }

  logActivity(
    sessionId,
    'manual',
    'Automated search input not found on this site. Manual action required.',
    'warning'
  );
  return false;
}

async function captureGenericResults(
  sessionId,
  displayName,
  product,
  customSelector
) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  const { page, metadata } = session;
  const results =
    (await page
      .evaluate(
        (selector) => {
          const sanitize = (text) =>
            (text || '').replace(/\s+/g, ' ').trim();

          const collectFromElements = (elements) => {
            const seen = new Set();
            const items = [];
            for (const el of elements) {
              const titleEl =
                el.querySelector('h2, h3, span, a') || el;
              const linkEl =
                el.tagName?.toLowerCase() === 'a'
                  ? el
                  : el.querySelector('a');
              if (!titleEl || !linkEl || !linkEl.href) {
                continue;
              }

              const title = sanitize(titleEl.textContent);
              const href = linkEl.href;

              if (!title || title.length < 5) {
                continue;
              }

              const key = `${title.toLowerCase()}|${href}`;
              if (seen.has(key)) {
                continue;
              }

              seen.add(key);
              items.push({ title, url: href });
              if (items.length >= 5) {
                break;
              }
            }
            return items;
          };

          if (selector) {
            const nodes = Array.from(document.querySelectorAll(selector));
            if (nodes.length) {
              return collectFromElements(nodes.slice(0, 5));
            }
          }

          const cardSelectors = [
            '[data-id]',
            '[data-item-id]',
            'article',
            '[data-component-type="s-search-result"]'
          ];

          for (const cardSelector of cardSelectors) {
            const cards = Array.from(
              document.querySelectorAll(cardSelector)
            );
            const items = collectFromElements(cards.slice(0, 5));
            if (items.length) {
              return items;
            }
          }

          const anchors = Array.from(document.querySelectorAll('a'))
            .filter((a) => {
              const title = sanitize(a.textContent);
              return (
                title.length >= 8 &&
                title.length <= 140 &&
                !/^https?:\/\//.test(title)
              );
            })
            .slice(0, 5);

          return collectFromElements(anchors);
        },
        customSelector || null
      )
      .catch(() => [])) || [];

  if (results.length) {
    metadata.searchResults = results;
    const preview = results
      .slice(0, 3)
      .map((item) => `• ${item.title}`)
      .join('\n');
    logActivity(
      sessionId,
      'extract',
      `Top matches on ${displayName} for "${product}":\n${preview}`
    );
  } else {
    logActivity(
      sessionId,
      'extract',
      `Could not automatically extract results on ${displayName}.`,
      'warning'
    );
  }
}

async function handleGenericWebSearch(sessionId, plan) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session expired');
  }

  const { page, metadata } = session;
  const queryParts = [];
  if (plan.siteHint) {
    queryParts.push(plan.siteHint);
  }
  if (plan.product) {
    queryParts.push(plan.product);
  } else {
    queryParts.push(plan.rawTask);
  }

  const query = queryParts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    query
  )}`;

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  metadata.orderSite = 'Google';
  metadata.productQuery = query;
  logActivity(
    sessionId,
    'navigate',
    `Ran Google search for "${query}"`
  );

  await detectManualBlocks(sessionId);
  await page.waitForTimeout(1500);
  const results = await extractGoogleResults(page);
  if (results.length) {
    metadata.searchResults = results;
    const preview = results
      .slice(0, 3)
      .map((item) => `• ${item.title}`)
      .join('\n');
    logActivity(
      sessionId,
      'extract',
      `Top Google results:\n${preview}`
    );
  }

  requestManualAction(
    sessionId,
    'Choose the most relevant result in Google and continue the workflow. Press Resume after you complete the necessary actions.',
    'manual-google'
  );
  await waitForResume(sessionId);
  metadata.finalUrl = page.url();
  logActivity(sessionId, 'extract', `Resumed on ${metadata.finalUrl}`);
  return 'manual';
}

async function extractGoogleResults(page) {
  try {
    const results = await page.evaluate(() => {
      const sanitize = (text) => (text || '').replace(/\s+/g, ' ').trim();
      const items = [];
      const cards = Array.from(document.querySelectorAll('div.g, div.Gx5Zad'));

      for (const card of cards) {
        const titleEl = card.querySelector('h3');
        const linkEl = card.querySelector('a');
        if (!titleEl || !linkEl || !linkEl.href) {
          continue;
        }
        const title = sanitize(titleEl.textContent);
        const href = linkEl.href;
        if (!title) {
          continue;
        }
        items.push({ title, url: href });
        if (items.length >= 5) {
          break;
        }
      }

      if (items.length) {
        return items;
      }

      const anchors = Array.from(document.querySelectorAll('a'))
        .filter((a) => {
          const title = sanitize(a.textContent);
          return title.length > 10 && !/^https?:\/\//.test(title);
        })
        .slice(0, 5);

      return anchors.map((a) => ({
        title: sanitize(a.textContent),
        url: a.href
      }));
    });

    return Array.isArray(results) ? results : [];
  } catch (error) {
    return [];
  }
}

async function waitForSelectorSafe(page, selector, sessionId, description) {
  try {
    await page.waitForSelector(selector, { timeout: 15000 });
  } catch (error) {
    await detectManualBlocks(sessionId);
    throw new Error(`Timed out waiting for ${description}`);
  }
}

async function captureProductDetails(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  const { page, metadata } = session;
  const titleEl = await page.$('#productTitle');
  if (titleEl) {
    const titleText = (await titleEl.textContent())?.trim();
    if (titleText) {
      metadata.productTitle = titleText;
      logActivity(sessionId, 'extract', `Product title: ${titleText}`);
    }
  }

  const priceEl = await page.$(
    '#corePriceDisplay_desktop_feature_div .a-offscreen, span.a-offscreen'
  );
  if (priceEl) {
    const priceText = (await priceEl.textContent())?.trim();
    if (priceText) {
      metadata.price = priceText;
      logActivity(sessionId, 'extract', `Detected price: ${priceText}`);
    }
  }
}

async function captureCartConfirmation(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  const { page, metadata } = session;
  const confirmationSelector =
    '#attachDisplayAddBaseAlert, #NATC_SMART_WAGON_CONF_MSG_SUCCESS, #sw-atc-details-single-container';
  const confirmationEl = await page.$(confirmationSelector);

  if (confirmationEl) {
    const confirmationText = (await confirmationEl.textContent())?.trim();
    if (confirmationText) {
      metadata.cartConfirmation = confirmationText;
      logActivity(
        sessionId,
        'success',
        `Cart confirmation: ${confirmationText}`
      );
      return;
    }
  }

  logActivity(
    sessionId,
    'success',
    'Item appears to be added to cart. Please verify in the browser before checkout.'
  );
}

async function detectManualBlocks(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  const { page } = session;
  const url = page.url();
  let needsWait = false;

  if (url.includes('signin')) {
    requestManualAction(
      sessionId,
      'Amazon requires you to sign in. Complete the login in the browser, then press Resume.',
      'login'
    );
    needsWait = true;
  }

  const content = await page.content();
  if (/captcha/i.test(content)) {
    requestManualAction(
      sessionId,
      'Captcha detected. Please solve it in the browser, then press Resume to continue.',
      'captcha'
    );
    needsWait = true;
  }

  if (needsWait) {
    await waitForResume(sessionId);
  }
}

function requestManualAction(sessionId, message, reason) {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  if (session.awaitingUserAction !== reason) {
    session.status = 'awaiting-user';
    logActivity(sessionId, 'manual', message, 'warning');
    session.awaitingUserAction = reason;
  }

  if (!session.isPaused) {
    session.isPaused = true;
    updateSessionStatus(sessionId, 'awaiting-user');
  }
}

async function waitForResume(sessionId) {
  while (true) {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error('Session ended while waiting for user input');
    }

    if (!session.isPaused) {
      session.awaitingUserAction = null;
      return session;
    }

    await sleep(1000);
  }
}

async function generateSessionSummaries(sessionId, status, metadataOverride) {
  const summaryRecord = getSessionSummary(sessionId);
  const session = sessions.get(sessionId);
  const task = session?.task || summaryRecord?.task || '';
  const metadata = metadataOverride || session?.metadata || {};
  const logs = getSessionLogs(sessionId);

  if (session) {
    session.status = status;
  }

  try {
    const { processSummary, finalSummary } = await buildSummaryWithModel(
      task,
      logs,
      metadata,
      status
    );

    saveSessionSummary(sessionId, task, status, processSummary, finalSummary);
  } catch (error) {
    console.error('Summary generation failed:', error);
    const fallback = buildFallbackSummary(task, logs, metadata, status);
    saveSessionSummary(
      sessionId,
      task,
      status,
      fallback.processSummary,
      fallback.finalSummary
    );
  }
}

async function buildSummaryWithModel(task, logs, metadata, status) {
  if (!logs.length) {
    return buildFallbackSummary(task, logs, metadata, status);
  }

  const logLines = logs
    .map((log) => `[${log.type}] ${log.message}`)
    .join('\n');

  const prompt = `
Task: ${task}
Status: ${status}

Structured metadata:
${JSON.stringify(metadata, null, 2)}

Activity log:
${logLines}

Generate a JSON object with two keys: "processSummary" and "finalSummary".
- "processSummary" should contain 2-3 concise sentences describing the automation steps taken.
- "finalSummary" should focus on the order outcome (site, product, price, next manual steps).
Ensure the response is valid JSON with double-quoted keys.
`;

  const response = await axios.post(
    `${OLLAMA_URL}/api/generate`,
    {
      model: SUMMARY_MODEL,
      prompt,
      stream: false
    },
    { timeout: 60_000 }
  );

  const text = response.data?.response?.trim();
  if (!text) {
    throw new Error('Empty summary response from model');
  }

  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Model response did not contain JSON');
  }

  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  if (!parsed.processSummary || !parsed.finalSummary) {
    throw new Error('Model summary missing required keys');
  }

  return parsed;
}

function buildFallbackSummary(task, logs, metadata, status) {
  const processSummary = logs.length
    ? `Executed ${logs.length} logged automation steps for task "${task}". Latest action: ${logs[logs.length - 1].message}`
    : `Task "${task}" recorded no automation steps.`;

  const details = [];
  if (metadata.orderSite) {
    details.push(`Site: ${metadata.orderSite}`);
  }
  if (metadata.productTitle) {
    details.push(`Product: ${metadata.productTitle}`);
  } else if (metadata.productQuery) {
    details.push(`Product query: ${metadata.productQuery}`);
  }
  if (metadata.price) {
    details.push(`Price observed: ${metadata.price}`);
  }
  if (metadata.cartConfirmation) {
    details.push(`Cart status: ${metadata.cartConfirmation}`);
  }
  if (metadata.searchResults?.length) {
    details.push(`Top match: ${metadata.searchResults[0].title}`);
  }
  if (metadata.finalUrl) {
    details.push(`Current page: ${metadata.finalUrl}`);
  }

  const finalSummary = details.length
    ? `${details.join('; ')}. Status: ${status}.`
    : `Status: ${status}. Review the browser to confirm order progress.`;

  return { processSummary, finalSummary };
}

export default router;
