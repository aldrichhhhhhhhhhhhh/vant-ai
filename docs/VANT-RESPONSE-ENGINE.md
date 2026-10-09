# VANT Response Engine v1 — Architecture Proposal

Status: design proposal only. This document does not change the live application or Supabase database.

## Goal

Make Projects → Ask VANT reliably complete long, multi-part answers without relying on ever-larger single model responses. Preserve completed work, resume failed sections, and never label an answer complete without evidence.

## Repository findings

- Projects → Ask VANT currently calls `/api/vant` synchronously.
- `api/vant.js` uses NVIDIA NIM with `openai/gpt-oss-20b`, an 8,192-token output cap, at most two completion passes, a 45-second upstream timeout, a 54-second internal budget, and a Vercel function maximum of 60 seconds.
- The route returns success for any `finish_reason` other than `length`, including a missing value. A missing/unknown finish reason must not be treated as verified completion.
- When bounded continuation is exhausted, the route returns an error without exposing its accumulated text as a resumable checkpoint.
- The frontend's Ask VANT request timer is shorter than the server's total internal budget.
- Supabase SQL migrations exist for project membership, project knowledge, and project context. No response-job/checkpoint migration was found in the repository migration list.
- The repository uses Vercel API routes and Supabase. No queue/workflow dependency is declared in `package.json`. The current Vercel deployment status check succeeding does not verify runtime completion behavior.
- The actual deployed Supabase migration state and Vercel environment configuration are not accessible from this repository inspection. They must be verified before applying a schema migration or enabling the new flow.

## Proposed architecture

Use a durable, database-backed job state machine. Keep the current NVIDIA provider for v1. Do not introduce multi-agent orchestration or a new model provider as part of this reliability project.

1. **Create job** — validate the user's session, access code, project membership, request size, and idempotency key. Persist the normalized request and initial job state before generation.
2. **Plan** — generate a compact answer outline with explicit required sections and completion criteria. Save the plan as a checkpoint.
3. **Generate one section per bounded invocation** — each worker invocation performs a single model request within a conservative per-invocation budget. It records the section output, provider finish reason, usage, elapsed time, and attempt count before moving on.
4. **Validate** — check provider finish metadata, required section coverage, empty output, and obvious continuation failure. Unknown or absent finish metadata is not a success signal. Validation is a guardrail, not a claim that semantic correctness can be proven automatically.
5. **Assemble** — concatenate the verified sections in plan order and persist the final answer plus a completion manifest.
6. **Resume** — on timeout or retryable provider error, preserve completed sections and retry only the failed section within bounded retry, elapsed-time, and cumulative-token limits.
7. **Deliver** — the frontend submits a job and polls its status. It can render progress and recover the final result after a reload. The answer becomes complete only after the final assembled result and completion manifest are persisted.

## State machine

- `queued`: accepted and stored, no work started.
- `planning`: outline generation is running.
- `generating`: a section is being generated.
- `validating`: generated sections are being checked.
- `assembling`: validated sections are being combined and persisted.
- `complete`: final answer and completion manifest are stored.
- `retryable_error`: a bounded retry or resume may continue from the last checkpoint.
- `failed`: retry policy or overall job budget exhausted; checkpoints remain available.
- `cancelled`: user cancellation has been recorded.

State changes must be conditional/atomic so duplicate requests cannot advance the same section twice. Each job needs a lease/claim token or equivalent concurrency guard.

## Storage model proposal

A new migration should be additive and reviewed against the deployed schema before applying.

### `public.vant_response_jobs`

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `project_id uuid null references public.projects(id)`
- `conversation_id text null`
- `idempotency_key text not null`
- `status text not null`
- `request jsonb not null` (validated, size-limited, and scoped to the owning user)
- `plan jsonb null`
- `final_answer text null`
- `completion_manifest jsonb null`
- `error_code text null`
- `attempt_count integer not null default 0`
- `total_input_tokens bigint not null default 0`
- `total_output_tokens bigint not null default 0`
- `created_at, updated_at, started_at, completed_at timestamptz`
- Unique constraint on `(user_id, idempotency_key)`; indexes on `(user_id, created_at desc)` and `(status, updated_at)`.

### `public.vant_response_sections`

- `id uuid primary key`
- `job_id uuid not null references public.vant_response_jobs(id) on delete cascade`
- `section_index integer not null`
- `title text not null`
- `status text not null`
- `content text null`
- `finish_reason text null`
- `usage jsonb null`
- `attempt_count integer not null default 0`
- `last_error_code text null`
- `started_at, completed_at, updated_at timestamptz`
- Unique constraint on `(job_id, section_index)`.

RLS must restrict job reads/writes to the owner and, for project-scoped work, verify project membership and the caller's role. Do not assume project membership alone grants permission to mutate project data. Never expose a service-role key to the browser. Server-side mutations should use an explicitly reviewed trusted execution path or user-scoped RLS, not bypass authorization accidentally.

## API shape (proposal)

- `POST /api/vant/jobs` — create or return the existing job for an idempotency key.
- `POST /api/vant/jobs/:id/step` — claim and process one bounded planning/section/validation/assembly step; safe to retry.
- `GET /api/vant/jobs/:id` — return status, progress, safe error details, and final answer only when complete; return checkpoints only when explicitly authorized.
- `POST /api/vant/jobs/:id/cancel` — mark the job cancelled if no in-flight operation can still commit a result.

Vercel file-based route conventions and the current frontend routing must be checked before choosing the exact endpoint filenames. The endpoint names above are logical API contracts, not files already implemented.

## Worker execution choice

First implementation should use bounded, individually invoked Vercel API steps plus persisted Supabase checkpoints, with the client polling and triggering the next step. This avoids pretending that an unawaited background promise is durable. Before implementation, verify that the Vercel plan/runtime supports the chosen per-step duration and that Supabase RLS/migrations are deployable. If automatic background recovery is required even when the browser closes, add a real scheduler/queue or durable workflow service as a separate, explicit infrastructure decision.

## Completion contract

A job may be marked `complete` only if all of the following are true:

- every required planned section has a persisted successful state;
- provider completion metadata is present and in an accepted terminal state for every generated section;
- no section is empty or left with an unresolved retryable error;
- final assembly is persisted successfully;
- the completion manifest records section IDs/order, model identifier, pass/attempt counts, elapsed time, finish reasons, and token usage.

A section that reaches the token limit must be continued or marked incomplete. Missing/unknown finish metadata must be treated as unverified. Avoid simplistic punctuation-only checks as proof of semantic completeness.

## Security and data integrity

- Validate the authenticated Supabase user and application access code on every API operation.
- Verify job ownership before status, step, cancellation, or checkpoint access.
- Verify project access independently for project-scoped jobs.
- Keep provider keys server-side.
- Never log raw prompts, full model output, auth tokens, access codes, or private project content by default. Log correlation ID, job ID, step, duration, status, finish reason, bounded usage metadata, and sanitized error codes.
- Apply request-size, section-count, retry-count, total-runtime, and cumulative-token ceilings.
- Make state transitions and checkpoint writes idempotent.
- Retain failed checkpoints according to a defined cleanup/retention policy; don't silently delete recoverable user work.

## Rollout plan

### Phase 0 — inspect and baseline
- Confirm deployed Supabase migrations and Vercel environment/plan settings.
- Capture one normal and one long Ask VANT request with sanitized runtime metadata.
- Establish baseline tests for current behavior.

### Phase 1 — response integrity (small isolated change)
- Reject missing/unknown completion metadata as verified success.
- Preserve recoverable output and metadata on bounded failure.
- Align frontend/backend time budgets and cleanup paths.
- Add unit tests for finish reasons, empty output, provider errors, token-limit continuation, and timeouts.

### Phase 2 — durable jobs and checkpoints
- Add additive SQL migration and RLS tests.
- Add job/section repository functions and bounded API step handlers.
- Add idempotency, concurrency/lease, retry, and cancellation tests.

### Phase 3 — Projects UI integration
- Replace the single long request only in Projects → Ask VANT.
- Show plan/section progress and clear retryable/final failure states.
- Recover in-progress jobs and completed results after reload.
- Do not modify general AI Chat, Conference Room, project membership, or unrelated UI.

### Phase 4 — validation and controlled rollout
- Test short answers, multi-section answers, token-limited sections, missing finish reason, timeout, provider outage, duplicate step, concurrent polling, cancellation, reload/resume, unauthorized access, and RLS isolation.
- Verify persistence after reload and confirm completed jobs return the same final answer.
- Deploy only through a reviewable pull request. Do not merge until tests and a live smoke test pass.

## Acceptance criteria

1. No missing/unknown finish reason can be silently marked complete.
2. Completed sections survive request timeout, browser reload, and retry.
3. A duplicate step request cannot duplicate section output or usage accounting.
4. Failed jobs expose a truthful status and preserve authorized checkpoints.
5. Only the owning user can read/cancel a job; project-scoped jobs enforce project access.
6. Projects → Ask VANT can complete a multi-section answer across bounded invocations without relying on a single oversized model response.
7. Existing chat history, Projects, Conference Room, and general chat behavior remain unchanged.
8. No code is merged or deployed without automated tests and a live smoke test.
