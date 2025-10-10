import express from 'express';
import { chromium } from 'playwright';
import axios from 'axios';

const router = express.Router();
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Search for product prices
router.post('/search', async (req, res) => {
  const { query, imageUrl } = req.body;

  if (!query && !imageUrl) {
    return res.status(400).json({ error: 'Query or image URL is required' });
  }

  try {
    console.log('Searching prices for:', query || 'image');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Search on Google Shopping
    const searchQuery = encodeURIComponent(query || 'product');
    await page.goto(`https://www.google.com/search?q=${searchQuery}&tbm=shop`);

    // Wait for results
    await page.waitForTimeout(2000);

    // Extract price data (this is a simplified example)
    const results = await page.evaluate(() => {
      const items = [];
      const productCards = document.querySelectorAll('[data-merchant-id]');
      
      productCards.forEach((card, index) => {
        if (index < 5) { // Limit to 5 results
          const priceEl = card.querySelector('[data-price]');
          const titleEl = card.querySelector('[data-product-title]');
          const linkEl = card.querySelector('a');
          
          if (priceEl && titleEl) {
            items.push({
              id: `result-${index}`,
              store: 'Google Shopping',
              price: parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')),
              currency: 'USD',
              url: linkEl?.href || '',
              availability: 'in-stock',
              title: titleEl.textContent
            });
          }
        }
      });
      
      return items;
    });

    await browser.close();

    // Generate AI summary using Ollama
    let summary = '';
    if (results.length > 0) {
      const prices = results.map(r => r.price);
      const avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
      const minPrice = Math.min(...prices).toFixed(2);
      const maxPrice = Math.max(...prices).toFixed(2);

      const prompt = `Analyze this price data and provide a brief summary:
Product: ${query}
Number of results: ${results.length}
Average price: $${avgPrice}
Lowest price: $${minPrice}
Highest price: $${maxPrice}

Provide a helpful 2-3 sentence summary for the user.`;

      try {
        const aiResponse = await axios.post(`${OLLAMA_URL}/api/generate`, {
          model: 'phi3',
          prompt,
          stream: false
        });
        summary = aiResponse.data.response;
      } catch (error) {
        console.error('AI summary error:', error);
        summary = `Found ${results.length} results with prices ranging from $${minPrice} to $${maxPrice}. Average price is $${avgPrice}.`;
      }
    }

    res.json({
      results,
      summary
    });

  } catch (error) {
    console.error('Price search error:', error);
    res.status(500).json({ 
      error: 'Failed to search prices',
      message: error.message 
    });
  }
});

export default router;
