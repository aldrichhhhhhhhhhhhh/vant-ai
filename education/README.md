# VANT Education

Standalone VANT Education environment extracted from VANT WorkPlatform.

Includes the same Education library and student widgets, plus Study Assistant, Notes Summarizer & Study Guide, Flashcards & Practice Quizzes, Study Planner & Assignment Tracker, Essay & Writing Assistant, Citation & Bibliography Formatter, Math & Formula Explainer, Presentation & Report Generator, and Research Paper Organizer.

The app uses the same Supabase project as VANT WorkPlatform to preserve access to each user's own `study_materials` and `education_tasks`. No database migration is required.

AI generation uses the existing VANT GPT-OSS engine via server-side `/api/vant`. Provider credentials must stay server-side.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required Vercel variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NVIDIA_API_KEY`.
