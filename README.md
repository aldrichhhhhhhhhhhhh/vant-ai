# VANT

AI work platform — React + Vite + Supabase + NVIDIA NIM.

**UX mix:** Claude-style work framing · ChatGPT-style history/follow-ups · Grok-style direct copy.

## Quick start (recommended)

Use the ready package (UX already applied, no nested zips):

1. Download **vant-ai-main-ready.zip** from your project artifacts (or clone this repo and follow *Restore full UI* below).
2. Unzip and install:

```bash
unzip vant-ai-main-ready.zip
cd vant-ai-main
npm install
cp .env.example .env.local
# add NVIDIA_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

## Restore full UI from this GitHub repo

If `src/VantApp.jsx` is not present yet:

```bash
# Option A — from the ready zip (simplest)
# copy src/App.jsx from vant-ai-main-ready.zip over src/App.jsx

# Option B — after base64 parts are in src/ux-parts/
node scripts/restore-app.cjs
npm install
npm run dev
```

## Environment

Frontend (`.env.local` / Vercel):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server (`api/chat.js`):

- `NVIDIA_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `APP_ACCESS_CODE`

Never commit `.env.local` or secrets.

## UX features in this build

- Searchable + collapsible chat history
- Prompt packs (Ship / Write / Decide)
- Suggested follow-ups after answers
- Working indicator + Esc to stop
- Composer web-search chip
- Cmd/Ctrl+N new chat
- Hover message actions

## Deploy

Deploy to Vercel; set the env vars above. The browser calls `/api/chat` (serverless) so the NVIDIA key stays server-side.
