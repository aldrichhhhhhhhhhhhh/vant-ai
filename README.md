# VANT

VANT is an AI work platform prototype built with React + Vite.

## Local development

1. Install Node.js 18+.
2. Install dependencies:

```bash
npm install
```

3. Create a local environment file:

```bash
cp .env.example .env.local
```

Add your NVIDIA API key to `.env.local`:

```text
NVIDIA_API_KEY=...
```

4. Start VANT:

```bash
npm run dev
```

## AI backend

The browser calls `/api/chat`. The Vercel serverless function in `api/chat.js` calls NVIDIA NIM server-side, keeping the API key out of the browser.

Current test model:

`nvidia/nemotron-3.5-lightning-30b-a3b`

NVIDIA currently lists this model as a Free Endpoint and describes it as a 30B A3B MoE model for specialized agentic tasks, long-running agents, and text-to-text workloads.

## Production deployment

Deploy the repository to Vercel and add `NVIDIA_API_KEY` as a Vercel environment variable. Never commit `.env.local` or an API key to GitHub.
