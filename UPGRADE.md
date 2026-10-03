# VANT UX upgrade applied

The full UI lives in `src/VantApp.jsx` (Claude × ChatGPT × Grok mix).

If `VantApp.jsx` is missing from this clone, download **vant-ai-main-ready.zip** from the project artifacts and copy:

- `src/App.jsx` → rename/use as `src/VantApp.jsx`, or replace `src/App.jsx` with the zip’s `src/App.jsx` and remove the re-export.

## Features

- Searchable / collapsible chat history
- Prompt packs (Ship / Write / Decide)
- Suggested follow-ups
- Working indicator + Esc to stop
- Composer web-search chip
- Cmd/Ctrl+N new chat
