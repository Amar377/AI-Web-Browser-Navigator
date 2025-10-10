import express from 'express';
import { chromium } from 'playwright';
import axios from 'axios';

const router = express.Router();
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const SUMMARY_MODEL =
  process.env.PRICE_SUMMARY_MODEL || process.env.DEFAULT_MODEL || 'phi3';
const DEFAULT_CURRENCY = (
  process.env.PRICE_DEFAULT_CURRENCY || 'INR'
).toUpperCase();

const googleApiConfig = {
  endpoint: process.env.GOOGLE_PRICE_API_URL,
  key: process.env.GOOGLE_PRICE_API_KEY,
  engine: process.env.GOOGLE_PRICE_API_ENGINE || 'google_shopping',
  country: process.env.GOOGLE_PRICE_API_COUNTRY || 'in',
  language: process.env.GOOGLE_PRICE_API_LANGUAGE || 'en'
};

const isGoogleApiEnabled =
  Boolean(googleApiConfig.endpoint && googleApiConfig.key) &&
  (process.env.GOOGLE_PRICE_API_ENABLED || 'true') !== 'false';

const PRICE_SITES = [
  {
    key: 'amazon-in',
    name: 'Amazon India',
    buildUrl: (query) =>
      `https://www.amazon.in/s?k=${encodeURIComponent(query)}`,
    parser: parseAmazonResults
  },
  {
    key: 'flipkart',
    name: 'Flipkart',
    buildUrl: (query) =>
      `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
    parser: parseFlipkartResults
  },
  {
    key: 'myntra',
    name: 'Myntra',
    buildUrl: (query) =>
      `https://www.myntra.com/search/${encodeURIComponent(query)}`,
    fallbackUrls: (query) => [
      `https://www.myntra.com/${encodeURIComponent(query.replace(/\s+/g, '-'))}`,
      `https://www.myntra.com/${encodeURIComponent(query)}`,
      `https://www.myntra.com/search?q=${encodeURIComponent(query)}`,
      `https://www.myntra.com/shop/${encodeURIComponent(
        query.replace(/\s+/g, '-')
      )}`,
      `https://m.myntra.com/${encodeURIComponent(query.replace(/\s+/g, '-'))}`
    ],
    parser: parseMyntraResults
  },
  {
    key: 'reliance-digital',
    name: 'Reliance Digital',
    buildUrl: (query) =>
      `https://www.reliancedigital.in/search?q=${encodeURIComponent(
        query
      )}:relevance`,
    parser: parseRelianceDigitalResults
  },
  {
    key: 'tatacliq',
    name: 'Tata Cliq',
    buildUrl: (query) =>
      `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(
        query
      )}`,
    parser: parseTataCliqResults
  },
  {
    key: 'croma',
    name: 'Croma',
    buildUrl: (query) =>
      `https://www.croma.com/search/?text=${encodeURIComponent(query)}`,
    parser: parseCromaResults
  }
];

router.post('/search', async (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Product query is required' });
  }

  const trimmedQuery = query.trim();

  try {
    console.log('🔍 Running price comparison for:', trimmedQuery);

    const aggregatedResults = [];
    const siteErrors = [];
    let usedApi = false;
    let usedScrape = false;
    let usedModelFallback = false;

    if (isGoogleApiEnabled) {
      try {
        const apiResults = await fetchGooglePriceApi(trimmedQuery);
        if (apiResults.length) {
          aggregatedResults.push(...apiResults);
          usedApi = true;
        }
      } catch (apiError) {
        console.error('Google price API error:', apiError.message);
        siteErrors.push({
          site: 'Google Price API',
          message: apiError.message
        });
      }
    }

    const scrapeDisabled = process.env.PRICE_DISABLE_SCRAPE === '1';
    const minResultsSetting = Number.parseInt(
      process.env.PRICE_MIN_RESULTS || '3',
      10
    );
    const minResults =
      Number.isFinite(minResultsSetting) && minResultsSetting > 0
        ? minResultsSetting
        : 3;
    const shouldScrape =
      !scrapeDisabled && aggregatedResults.length < minResults;

    if (shouldScrape) {
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-http2',
          '--disable-features=NetworkService,NetworkServiceInProcess',
          '--disable-blink-features=AutomationControlled'
        ]
      });
      const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        userAgent:
          process.env.PRICE_SCRAPER_USER_AGENT ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        locale: 'en-IN',
        timezoneId: 'Asia/Kolkata'
      });

      for (const site of PRICE_SITES) {
        try {
          const page = await context.newPage();
          const primaryUrl = site.buildUrl(trimmedQuery);
          const candidates = [primaryUrl];
          if (typeof site.fallbackUrls === 'function') {
            candidates.push(...site.fallbackUrls(trimmedQuery));
          }

          const visitedUrl = await navigateWithFallback(page, candidates);
          await waitForSiteReady(page, site.key);

          const siteResults = await site.parser(page, site.name);
          siteResults.forEach((item, index) => {
            aggregatedResults.push({
              ...item,
              id: `${site.key}-${index}`,
              store: item.store || site.name,
              source: site.name,
              url: item.url || visitedUrl
            });
          });

          await page.close().catch(() => {});
          usedScrape = true;
        } catch (siteError) {
          console.error(
            `Price scrape error for ${site.name}:`,
            siteError.message
          );
          siteErrors.push({
            site: site.name,
            message: siteError.message
          });
        }
      }

      await context.close();
      await browser.close();
    }

    let cleanedResults = dedupeResults(aggregatedResults);

    let summary = '';
    if (!cleanedResults.length) {
      const modelFallback = await generateModelFallback(trimmedQuery);
      if (modelFallback.results.length) {
        cleanedResults = modelFallback.results;
        summary = modelFallback.summary || '';
        usedModelFallback = true;
      }
    }

    cleanedResults = cleanedResults.map((item, index) => ({
      ...item,
      id: item.id || `result-${index}`,
      currency: normalizeCurrency(item.currency),
      availability: normalizeAvailability(item.availability),
      source:
        item.source ||
        (usedModelFallback
          ? 'AI estimated'
          : usedApi
          ? 'Google Price API'
          : usedScrape
          ? 'Web scrape'
          : 'Unknown')
    }));

    if (!summary && cleanedResults.length) {
      summary = await buildSummary(trimmedQuery, cleanedResults);
    }

    if (!summary) {
      summary =
        'No live prices were detected automatically. Try refining your search or verifying the websites manually.';
    }

    let mode = 'none';
    if (usedModelFallback) {
      mode = 'llm';
    } else if (usedApi && usedScrape) {
      mode = 'api+scrape';
    } else if (usedApi) {
      mode = 'api';
    } else if (usedScrape) {
      mode = 'scrape';
    }

    res.json({
      query: trimmedQuery,
      results: cleanedResults,
      summary,
      mode,
      errors: siteErrors
    });
  } catch (error) {
    console.error('Price search error:', error);
    res.status(500).json({
      error: 'Failed to search prices',
      message: error.message
    });
  }
});

function parsePriceString(value) {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const price = parseFloat(cleaned);
  return Number.isFinite(price) ? price : null;
}

async function parseGoogleShopping(page, storeName) {
  const items = await page
    .evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-merchant-id]'));
      const sanitize = (text) => (text || '').replace(/\s+/g, ' ').trim();

      return cards.slice(0, 6).map((card) => {
        const priceEl =
          card.querySelector('[data-price]') ||
          card.querySelector('.T14wmb span');
        const titleEl =
          card.querySelector('[data-product-title]') ||
          card.querySelector('.tAxDx');
        const linkEl =
          card.querySelector('a[href]') ||
          card.querySelector('a.shntl[href]');
        const merchantEl = card.querySelector('.aULzUe span.E5ocAb');

        return {
          title: sanitize(titleEl?.textContent || ''),
          priceText: priceEl?.textContent || '',
          url: linkEl?.href || '',
          store: sanitize(merchantEl?.textContent || 'Google Shopping')
        };
      });
    })
    .catch(() => []);

  return items
    .map((item) => ({
      ...item,
      price: parsePriceString(item.priceText),
      currency: DEFAULT_CURRENCY,
      availability: 'in-stock'
    }))
    .filter((item) => item.price);
}

async function parseAmazonResults(page, storeName) {
  const items = await page
    .evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll('div[data-component-type="s-search-result"]')
      );
      const sanitize = (text) => (text || '').replace(/\s+/g, ' ').trim();

      return cards.slice(0, 6).map((card) => {
        const titleEl = card.querySelector('h2 a span');
        const linkEl = card.querySelector('h2 a');
        const whole = card.querySelector('span.a-price-whole');
        const fraction = card.querySelector('span.a-price-fraction');

        const priceText =
          whole && fraction
            ? `${whole.textContent}.${fraction.textContent}`
            : whole?.textContent || '';

        return {
          title: sanitize(titleEl?.textContent || ''),
          priceText,
          url: linkEl?.href || ''
        };
      });
    })
    .catch(() => []);

  return items
    .map((item) => ({
      ...item,
      price: parsePriceString(item.priceText),
      currency: DEFAULT_CURRENCY,
      availability: 'in-stock',
      store: storeName
    }))
    .filter((item) => item.price);
}

async function parseFlipkartResults(page, storeName) {
  return parseIndianProductResults(page, storeName, [
    'div._13oc-S > div',
    'div._1AtVbE > div',
    'div._2kHMtA',
    'div._4ddWXP'
  ]);
}

async function parseMyntraResults(page, storeName) {
  return parseIndianProductResults(page, storeName, [
    'li.product-base',
    'div.product-base'
  ]);
}

async function parseRelianceDigitalResults(page, storeName) {
  return parseIndianProductResults(page, storeName, [
    'li.grid',
    '.pl__container .pl__card',
    '.category-product-list li'
  ]);
}

async function parseTataCliqResults(page, storeName) {
  return parseIndianProductResults(page, storeName, [
    '.ProductModule__Card',
    '.ProductModule__BaseComponent',
    '.product-list-container .product'
  ]);
}

async function parseCromaResults(page, storeName) {
  return parseIndianProductResults(page, storeName, [
    '.product-item',
    '.product-card',
    '.product-grid li'
  ]);
}

async function parseIndianProductResults(page, storeName, selectors) {
  try {
    await page.evaluate(() => {
      window.scrollTo(0, window.innerHeight);
    });
    await page.waitForTimeout(800);
  } catch {
    // ignore
  }

  const items = await page
    .evaluate((selectors) => {
      const sanitize = (text) => (text || '').replace(/\s+/g, ' ').trim();
      const maxResults = 8;
      const results = [];
      const seen = new Set();

      const containers = [];
      selectors.forEach((selector) => {
        document
          .querySelectorAll(selector)
          .forEach((element) => containers.push(element));
      });

      if (!containers.length) {
        document
          .querySelectorAll('a[href*="/p/"], a[href*="/product"]')
          .forEach((anchor) => {
            const container = anchor.closest('article, li, div');
            if (container) {
              containers.push(container);
            }
          });
      }

      for (const container of containers) {
        if (!container) continue;

        const anchor =
          container.querySelector('a[href*="/p/"]') ||
          container.querySelector('a[href*="/product"]') ||
          container.querySelector('a[href]');

        if (!anchor || !anchor.href) {
          continue;
        }

        const titleCandidate =
          anchor.getAttribute('title') ||
          anchor.innerText ||
          container.querySelector('h3, h2, h4, span')?.innerText ||
          '';

        const title = sanitize(titleCandidate);
        if (!title || title.length < 5 || seen.has(title)) {
          continue;
        }

        const priceMatch = (container.innerText || '').match(
          /(?:₹|Rs\.?|रु\.?)\s*[\d,.]+(?:\.\d+)?/i
        );

        if (!priceMatch) {
          continue;
        }

        results.push({
          title,
          priceText: priceMatch[0],
          url: anchor.href
        });

        seen.add(title);
        if (results.length >= maxResults) {
          break;
        }
      }

      return results;
    }, selectors)
    .catch(() => []);

  return items
    .map((item) => ({
      title: item.title,
      price: parsePriceString(item.priceText),
      currency: DEFAULT_CURRENCY,
      availability: 'in-stock',
      store: storeName,
      url: item.url
    }))
    .filter((item) => item.price);
}

const siteReadySelectors = {
  'amazon-in': 'div[data-component-type="s-search-result"]',
  flipkart: 'div._2kHMtA, div._4ddWXP',
  myntra: 'li.product-base, .product-list > li',
  'reliance-digital': 'li.grid, .pl__card',
  tatacliq: '.ProductModule__Card, .product-list-container .product',
  croma: '.product-item, .product-card'
};

async function waitForSiteReady(page, siteKey) {
  const selector = siteReadySelectors[siteKey];
  if (!selector) {
    await page.waitForTimeout(2000);
    return;
  }

  try {
    await page.waitForSelector(selector, { timeout: 10000 });
  } catch {
    await page.waitForTimeout(2000);
  }
}

async function fetchGooglePriceApi(query) {
  const params = {
    api_key: googleApiConfig.key,
    q: query,
    engine: googleApiConfig.engine,
    gl: googleApiConfig.country,
    hl: googleApiConfig.language,
    num: 10
  };

  try {
    const response = await axios.get(googleApiConfig.endpoint, {
      params,
      timeout: 20_000
    });

    const normalized = normalizeGoogleApiResults(response.data);

    return normalized.map((item, index) => ({
      ...item,
      id: item.id || `api-${index}`,
      source: 'Google Price API'
    }));
  } catch (error) {
    const message =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message;
    throw new Error(message);
  }
}

function normalizeGoogleApiResults(data) {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const candidateArrays = [];
  if (Array.isArray(data.shopping_results)) {
    candidateArrays.push(data.shopping_results);
  }
  if (Array.isArray(data.items)) {
    candidateArrays.push(data.items);
  }
  if (Array.isArray(data.results)) {
    candidateArrays.push(data.results);
  }

  const flattened = candidateArrays.flat();

  return flattened
    .map((item) => {
      const title =
        item.title ||
        item.name ||
        item.product_title ||
        item.extracted_description ||
        '';

      const rawPrice =
        item.extracted_price ??
        item.price_numeric ??
        item.price_in_usd ??
        (typeof item.price === 'number' ? item.price : item.price) ??
        (item.prices && item.prices.current && item.prices.current.price) ??
        item.price_with_tax ??
        item.price_text;

      const price =
        typeof rawPrice === 'number'
          ? rawPrice
          : parsePriceString(String(rawPrice || ''));

      const url =
        item.link ||
        item.url ||
        (item.product_link && item.product_link.url) ||
        '';

      const store =
        item.store ||
        item.source ||
        item.seller ||
        item.shop_name ||
        'Google Shopping';

      const availability =
        item.availability?.toLowerCase() ||
        item.stock_status?.toLowerCase() ||
        'in-stock';

      const currency =
        item.currency ||
        item.price_currency ||
        (typeof item.price === 'string' &&
          item.price.match(/[€£¥₹]|USD|EUR|GBP|JPY|INR/i)?.[0]) ||
        DEFAULT_CURRENCY;

      return {
        title,
        store,
        price,
        currency: normalizeCurrency(currency),
        url,
        availability
      };
    })
    .filter((item) => item.price);
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

function dedupeResults(results = []) {
  const seen = new Map();

  for (const item of results) {
    if (!item.price || !item.title) {
      continue;
    }

    const key = `${item.store.toLowerCase()}|${item.title.toLowerCase()}`;
    if (!seen.has(key) || seen.get(key).price > item.price) {
      seen.set(key, item);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.price - b.price);
}

function normalizeAvailability(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('out')) {
    return 'out-of-stock';
  }
  if (text.includes('low')) {
    return 'low-stock';
  }
  return 'in-stock';
}

function normalizeCurrency(value) {
  if (value == null) {
    return DEFAULT_CURRENCY;
  }

  const symbolMap = {
    '$': 'USD',
    '£': 'GBP',
    '€': 'EUR',
    '¥': 'JPY',
    '₹': 'INR'
  };

  const raw = String(value).trim();
  if (!raw) {
    return DEFAULT_CURRENCY;
  }

  const firstChar = raw[0];
  if (symbolMap[firstChar]) {
    return symbolMap[firstChar];
  }

  const upper = raw.toUpperCase();
  if (symbolMap[upper]) {
    return symbolMap[upper];
  }

  if (/^[A-Z]{3}$/.test(upper)) {
    return upper;
  }

  return DEFAULT_CURRENCY;
}

function getCurrencySymbol(code) {
  const upper = (code || '').toUpperCase();
  switch (upper) {
    case 'INR':
      return '₹';
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'JPY':
      return '¥';
    case 'AUD':
      return 'A$';
    case 'CAD':
      return 'C$';
    default:
      return upper;
  }
}

async function buildSummary(query, results) {
  const prices = results.map((result) => result.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const currencyCode = results[0]?.currency || DEFAULT_CURRENCY;
  const currencySymbol = getCurrencySymbol(currencyCode);

  const cheapest = results.find((result) => result.price === minPrice);
  const groupedByStore = results.reduce((acc, result) => {
    acc[result.store] = (acc[result.store] || 0) + 1;
    return acc;
  }, {});

  const prompt = `You are an expert shopping assistant. Summarize these price findings in two short sentences.
Product: ${query}
Number of offers: ${results.length}
Stores searched: ${Object.keys(groupedByStore).join(', ')}
Cheapest offer: ${
    cheapest?.store || 'Unknown'
  } at ${currencySymbol}${minPrice.toFixed(2)} (${currencyCode})
Highest price: ${currencySymbol}${maxPrice.toFixed(2)}
Average price: ${currencySymbol}${averagePrice.toFixed(2)}

Use a friendly, helpful tone. Mention where the best deal is, call out any outliers, and advise the user on a next step.`;

  try {
    const aiResponse = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: SUMMARY_MODEL,
        prompt,
        stream: false
      },
      { timeout: 60_000 }
    );

    return aiResponse.data?.response?.trim() || '';
  } catch (error) {
    console.error('AI summary error:', error.message);
    return `Found ${results.length} offers. Prices range from ${currencySymbol}${minPrice.toFixed(
      2
    )} to ${currencySymbol}${maxPrice.toFixed(
      2
    )} (average ${currencySymbol}${averagePrice.toFixed(
      2
    )}). Best price: ${cheapest?.store || 'Unknown'} at ${currencySymbol}${minPrice.toFixed(
      2
    )}.`;
  }
}

async function generateModelFallback(query) {
  const prompt = `You are an experienced personal shopping assistant. The user searched for "${query}" but live price scraping failed. Produce JSON with this exact structure (use double quotes everywhere, no trailing commas):
{
  "results": [
    {
      "store": "Retailer name",
      "title": "Exact product title",
      "price": 123.45,
      "currency": "INR",
      "url": "https://store.example.com/product",
      "availability": "in-stock"
    }
  ],
  "summary": "Two short sentences summarising the prices and next steps."
}

Requirements:
- Provide 3 to 5 well-known Indian retailers (e.g., Amazon India, Flipkart, Myntra, Reliance Digital, Tata Cliq, Croma, Vijay Sales).
- Use plausible INR prices (numbers only, no currency symbol). The "currency" field must always be "INR".
- Availability must be one of: in-stock, low-stock, out-of-stock.
- URLs must be well-formed HTTPS links to the retailer (placeholders acceptable if unsure).
- Respond with JSON only (no extra words before or after the JSON, no Markdown).`;

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

    const text = response.data?.response?.trim() || '';
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('Model fallback did not return JSON.');
    }

    const jsonPayload = text.slice(jsonStart, jsonEnd + 1);
    const parsed = parseJsonWithRepair(jsonPayload);
    if (!Array.isArray(parsed.results)) {
      throw new Error('Model fallback results missing or invalid.');
    }

    const allowedAvailability = new Set(['in-stock', 'low-stock', 'out-of-stock']);
    const results = parsed.results
      .map((item, index) => {
        const price = Number(item.price);
        if (!Number.isFinite(price) || price <= 0) {
          return null;
        }

        const store = typeof item.store === 'string' ? item.store : `Store ${index + 1}`;
        const title = typeof item.title === 'string' ? item.title : store;
        const url =
          typeof item.url === 'string' && item.url.startsWith('http')
            ? item.url
            : `https://www.google.com/search?q=${encodeURIComponent(`${store} ${query}`)}`;
        const availability = allowedAvailability.has(item.availability)
          ? item.availability
          : 'in-stock';

        return {
          id: `llm-${index}`,
          store,
          title,
          price,
          currency: normalizeCurrency(item.currency),
          url,
          availability,
          source: 'AI estimated'
        };
      })
      .filter(Boolean);

    return {
      results,
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
    };
  } catch (error) {
    console.error('Model fallback error:', error.message);
    return { results: [], summary: '' };
  }
}

function parseJsonWithRepair(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const repaired = jsonText
      .replace(/^\uFEFF/, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z0-9_-]+)\s*:/g, '$1"$2":')
      .replace(/:\s*'([^']*)'/g, (_, value) => {
        const escaped = value
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n');
        return `:"${escaped}"`;
      });

    return JSON.parse(repaired);
  }
}

export default router;
