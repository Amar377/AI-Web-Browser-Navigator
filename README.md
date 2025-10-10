# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/e2af7625-af2f-424d-9620-4d8b9207c3fa

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/e2af7625-af2f-424d-9620-4d8b9207c3fa) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/e2af7625-af2f-424d-9620-4d8b9207c3fa) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)








 Quick Start Guide
1. Install Ollama

# Download from https://ollama.ai
ollama pull phi3
2. Start the Backend Server

cd server
npm install
npx playwright install chromium
cp .env.example .env
npm run dev
Server runs at: http://localhost:3001

3. Start the Frontend

# In another terminal, from project root
npm run dev
Frontend runs at: http://localhost:8080

4. Test Everything
Visit Settings page → Click "Test" button
Should show both Server and Ollama as "Online"
Try chatting - responses stream from your local AI!
📁 Server Structure
server/
├── index.js           # Main server
├── routes/
│   ├── chat.js       # Ollama integration
│   ├── navigator.js  # Playwright automation
│   ├── jobs.js       # Job applications
│   └── price.js      # Price comparison
├── package.json
└── .env              # Configuration
🔧 Configuration
Edit server/.env:


PORT=3001
OLLAMA_URL=http://localhost:11434
FRONTEND_URL=http://localhost:8080
DEFAULT_MODEL=phi3
📝 API Endpoints
Chat: /api/chat/stream, /api/chat/models Navigator: /api/navigator/start, /api/navigator/logs/:id Jobs: /api/jobs/upload-resume, /api/jobs/start Price: /api/price/search

Check server/README.md and SETUP.md for detailed documentation!

⚠️ Troubleshooting
"Failed to connect to local server" → Make sure cd server && npm run dev is running

"Ollama not connected" → Run ollama serve and verify with ollama list

Playwright errors → Run npx playwright install in server directory

Everything is ready! Start both servers and enjoy your fully local AI assistant. 🎉
