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

## Supabase Auth

VANT now requires a signed-in Supabase user before the workspace or `/api/chat` endpoint can be used.

Set these environment variables in the frontend/deployment environment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The serverless `/api/chat` function also requires:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `APP_ACCESS_CODE`
- `NVIDIA_API_KEY`

Do not put service-role keys or other secrets in `VITE_*` variables. The publishable key is safe for the browser; the NVIDIA key and access code must remain server-side.

Database RLS for `public.app_state` and `public.chat_conversations` is configured to allow only the `authenticated` role and only rows owned by `auth.uid()`.

## UX upgrade (Claude × ChatGPT × Grok mix)

This build improves the chat workspace with a blended UX:

- **Claude-inspired:** calmer work-session framing, clearer structure, “understand → analyze → act” thinking state
- **ChatGPT-inspired:** searchable / collapsible chat history, suggested follow-ups after answers, capability prompt packs on the empty state
- **Grok-inspired:** direct, no-fluff copy, sharper empty-state personality, lightweight keyboard power features

### Chat UX additions

- Collapsible history rail with search
- Prompt packs on the welcome screen (Ship / Write / Decide)
- Hover message actions (copy, edit, regenerate)
- Working indicator with stop (Esc)
- Suggested follow-ups after each completed answer
- Composer chips for Web search + attachment count
- Shortcuts: `⌘/Ctrl+N` new chat, `Esc` stop generation
