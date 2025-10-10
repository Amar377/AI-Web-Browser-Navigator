# Local-First AI Assistant - Setup Guide

Complete setup guide for running your local-first AI web application.

## Prerequisites

### 1. Install Ollama
Download and install Ollama from [https://ollama.ai](https://ollama.ai)

After installation, pull the phi3 model:
```bash
ollama pull phi3
```

Verify Ollama is running:
```bash
ollama list
curl http://localhost:11434/api/tags
```

### 2. Install Node.js
Download and install Node.js (v18 or higher) from [https://nodejs.org](https://nodejs.org)

Verify installation:
```bash
node --version
npm --version
```

## Installation

### 1. Install Frontend Dependencies
```bash
npm install
```

### 2. Install Backend Dependencies
```bash
cd server
npm install
npx playwright install chromium
```

Create `.env` file:
```bash
cp .env.example .env
```

## Running the Application

You need to run both the frontend and backend servers.

### Terminal 1: Start Backend Server
```bash
cd server
npm run dev
```

Server will start at `http://localhost:3001`

### Terminal 2: Start Frontend
```bash
npm run dev
```

Frontend will start at `http://localhost:8080`

## Verify Everything Works

1. **Check Ollama**: Visit http://localhost:11434/api/tags
   - Should return list of installed models

2. **Check Backend**: Visit http://localhost:3001/health
   - Should return `{"status":"ok","timestamp":"..."}`

3. **Check Frontend**: Visit http://localhost:8080
   - Should see the AI Assistant interface

## Using the Application

### Chat with AI
1. Navigate to "Chat" page
2. Type a message and press Enter
3. AI responses will stream in real-time from your local Ollama instance

### Browser Navigator
1. Navigate to "Browser Navigator"
2. Enter a target URL (e.g., https://example.com)
3. Describe the task you want to automate
4. Click "Start Navigation"
5. Watch as Playwright automates the browser

### Job Application Assistant
1. Navigate to "Job Assistant"
2. Upload your resume (PDF, DOC, or DOCX)
3. Enter target companies (one per line)
4. Enter target roles (one per line)
5. Click "Start Applications"

### Price Comparison
1. Navigate to "Price Comparison"
2. Enter a product name or upload an image
3. Click "Search"
4. View results with AI-generated summary

## Troubleshooting

### Ollama Connection Issues
**Error**: "Failed to connect to Ollama"

**Solutions**:
- Start Ollama service: `ollama serve`
- Check if phi3 is installed: `ollama list`
- Verify Ollama is running: `curl http://localhost:11434/api/tags`

### Backend Server Issues
**Error**: "Failed to connect to local server"

**Solutions**:
- Make sure backend is running: `cd server && npm run dev`
- Check port 3001 is not in use
- Review server logs for errors

### Playwright Issues
**Error**: "Browser not found"

**Solutions**:
- Install browsers: `cd server && npx playwright install`
- For Linux: `npx playwright install-deps`

### CORS Errors
**Error**: "CORS policy blocked"

**Solutions**:
- Check `FRONTEND_URL` in `server/.env` matches your frontend URL
- Make sure both servers are running
- Clear browser cache

## Architecture Overview

```
┌─────────────────┐
│   Frontend      │ http://localhost:8080
│   (React)       │ 
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Backend Server  │ http://localhost:3001
│ (Node.js/Express)│
└────┬───────┬────┘
     │       │
     ▼       ▼
┌─────────┐ ┌──────────┐
│ Ollama  │ │Playwright│
│ :11434  │ │          │
└─────────┘ └──────────┘
```

## Configuration

### Backend Configuration (server/.env)
```env
PORT=3001
OLLAMA_URL=http://localhost:11434
FRONTEND_URL=http://localhost:8080
DEFAULT_MODEL=phi3
```

### Available Ollama Models
- **phi3** (default) - Fast, 3.8GB
- **llama2** - Powerful, 7GB
- **mistral** - Balanced, 7GB
- **llava** - Vision support, 4.7GB

Install additional models:
```bash
ollama pull llama2
ollama pull mistral
```

## Privacy & Security

✅ **100% Local** - All data stays on your machine
✅ **No Cloud Calls** - Unless you explicitly integrate external APIs
✅ **No Tracking** - No telemetry or analytics
✅ **Open Source** - Full transparency

## Next Steps

1. Customize the AI prompts in `server/routes/*.js`
2. Add more Playwright automation scripts
3. Integrate additional local models
4. Build custom workflows

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs: `cd server && npm run dev`
3. Check browser console for frontend errors
4. Verify all prerequisites are installed

## Development

### File Structure
```
├── server/              # Node.js backend
│   ├── routes/         # API routes
│   │   ├── chat.js     # Ollama integration
│   │   ├── navigator.js # Playwright automation
│   │   ├── jobs.js     # Job applications
│   │   └── price.js    # Price comparison
│   └── index.js        # Server entry point
│
├── src/                # React frontend
│   ├── pages/          # Page components
│   ├── components/     # UI components
│   └── config/         # Configuration
│
└── SETUP.md           # This file
```

Enjoy your local-first AI assistant! 🚀
