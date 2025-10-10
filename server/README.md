# AI Assistant Local Server

Local Node.js Express server that handles Ollama and Playwright integration for the AI Assistant application.

## Prerequisites

- **Node.js** (v18 or higher)
- **Ollama** running at `http://localhost:11434` with phi3 model installed
- **Playwright browsers** (will be installed automatically)

## Installation

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Install Playwright browsers:
```bash
npx playwright install chromium
```

4. Create `.env` file from the example:
```bash
cp .env.example .env
```

## Configuration

Edit the `.env` file to configure:
- `PORT` - Server port (default: 3001)
- `OLLAMA_URL` - Ollama API URL (default: http://localhost:11434)
- `FRONTEND_URL` - Frontend URL for CORS (default: http://localhost:8080)
- `DEFAULT_MODEL` - Default Ollama model (default: phi3)

## Running the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

The server will start at `http://localhost:3001`

## API Endpoints

### Chat (Ollama Integration)
- `GET /api/chat/models` - Get available Ollama models
- `POST /api/chat/stream` - Stream chat responses
- `POST /api/chat/message` - Send single message

### Browser Navigator (Playwright)
- `POST /api/navigator/start` - Start navigation session
- `POST /api/navigator/pause/:sessionId` - Pause session
- `POST /api/navigator/resume/:sessionId` - Resume session
- `POST /api/navigator/stop/:sessionId` - Stop session
- `GET /api/navigator/logs/:sessionId` - Get session logs
- `POST /api/navigator/action/:sessionId` - Execute browser action

### Job Applications
- `POST /api/jobs/upload-resume` - Upload resume file
- `POST /api/jobs/start` - Start job application automation
- `GET /api/jobs/status/:sessionId` - Get application status
- `POST /api/jobs/stop/:sessionId` - Stop automation

### Price Comparison
- `POST /api/price/search` - Search product prices

## Ollama Setup

1. Install Ollama from https://ollama.ai
2. Pull the phi3 model:
```bash
ollama pull phi3
```
3. Verify it's running:
```bash
curl http://localhost:11434/api/tags
```

## Testing

Test the server is running:
```bash
curl http://localhost:3001/health
```

Test Ollama integration:
```bash
curl http://localhost:3001/api/chat/models
```

## File Structure

```
server/
├── index.js              # Main server file
├── routes/
│   ├── chat.js          # Ollama chat integration
│   ├── navigator.js     # Playwright browser automation
│   ├── jobs.js          # Job application automation
│   └── price.js         # Price comparison
├── uploads/             # Uploaded files (resumes, etc)
├── package.json
├── .env
└── README.md
```

## Troubleshooting

**Ollama not connecting:**
- Make sure Ollama is running: `ollama serve`
- Check if phi3 is installed: `ollama list`
- Verify URL in `.env` file

**Playwright errors:**
- Install browsers: `npx playwright install`
- For Linux, install dependencies: `npx playwright install-deps`

**CORS errors:**
- Check `FRONTEND_URL` in `.env` matches your frontend
- Make sure frontend is making requests to correct server URL

## Security Notes

This is a local development server. For production:
- Add authentication
- Implement rate limiting
- Validate all inputs
- Use HTTPS
- Add proper error handling
- Implement request logging
