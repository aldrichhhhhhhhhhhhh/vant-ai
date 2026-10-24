# VANT Responsive UI/UX — Audit and Implementation Plan

## Current status
Phase 1 responsive shell overrides have been implemented on `feature/responsive-ui-ux-audit` and deployed to a Vercel preview. Production has not been changed. The first pass uses a compact icon rail on phone widths rather than a slide-out drawer; this is intentionally a safe additive change before deeper navigation refactoring.

## Implemented in this pass
- Added `src/responsive.css` and imported it from `src/main.jsx`.
- Applied mobile rail widths at 760px and 390px breakpoints while preserving the desktop sidebar width.
- Reduced top-bar padding and account-control spacing on narrow screens.
- Added dynamic viewport sizing (`100dvh`) and removed the effective forced 640px minimum for the app shell.
- Constrained dialogs to the viewport and allowed them to scroll.
- Added touch-action and reduced-motion refinements.
- No application feature logic, API, engine, Supabase schema/auth policy, or production alias was changed.

## Validation completed
- Vercel preview deployment reached `READY`.
- Preview HTML fetch returned HTTP 200.
- Vercel build log confirms `npm run build`, `scripts/restore-app.cjs`, and `vite build` ran. The restore script preserved the committed 343 KB `src/App.jsx`.
- This confirms the build/deploy pipeline, not visual behavior. Real browser/device testing at target widths is still required.

## Confirmed findings from `src/App.jsx`
- The app shell had `height: 100vh`, `minHeight: 640`, and `overflow: hidden`, which could force excess height on short phone viewports.
- The primary Sidebar used a fixed 224px width and was always rendered.
- An existing `max-width: 760px` rule targeted `.vant-sidebar-label`, but the primary navigation labels did not use that class.
- TopBar used 24px horizontal padding and had no mobile navigation control.
- The page viewport is independently scrollable.
- Education widgets include fixed-width floating panels that need component-level responsive treatment.
- The repository runs `scripts/restore-app.cjs` before build; this must remain intact.

## Next implementation phases
### P1 — Refine shared shell and navigation
1. Visually validate the compact rail and restore visible labels/tooltips in an accessible way.
2. Consider a true accessible drawer with a top-bar menu trigger, backdrop/Escape dismissal, focus handling, scroll containment and close-on-navigation.
3. Verify short viewport and keyboard behavior without changing desktop navigation.

### P2 — AI Chat
1. Validate chat history and message-list width on phones.
2. Reflow composer, attachment previews, action controls and model/status affordances.
3. Test virtual keyboard, safe areas, send/cancel, loading and long responses.

### P3 — Shared overlays and layout primitives
1. Make auth/settings/project modal widths and max-heights responsive.
2. Review fixed-width inner sidebars, dropdowns/popovers and table layouts.
3. Preserve intentional inner horizontal scrolling for tables, code and equations without causing body overflow.

### P4 — Other product areas
1. Education: cards/grid, saved materials, flashcards, quiz/planner and floating widgets.
2. Projects: lists, workspace panel, members/roles and team chat.
3. Tools, Dashboard, CoWork, Integrations, and Memory: stacked cards, responsive forms, chart/table widths and long labels.

### P5 — Verification and release
Test at 320, 360, 390, 430, 768, 1024, 1280 and 1440 CSS pixels, including portrait/landscape and short viewports. Check document-level horizontal scroll, keyboard reachability, navigation, overlay dismissal, attachments, auth, Education saves and existing desktop behavior. Preview first; production only after review and explicit release decision.

## Proposed breakpoints
- Phone: < 768px — compact navigation and single-column flows.
- Tablet: 768–1023px — compact workspace where needed.
- Desktop: >= 1024px — preserve persistent sidebar and existing layout wherever feasible.

## Not in scope
No API, Supabase schema, auth policy, engine, feature behavior or production deployment changes unless separately necessary and agreed.
