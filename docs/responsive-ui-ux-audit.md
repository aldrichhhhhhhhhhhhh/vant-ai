# VANT Responsive UI/UX — Audit and Implementation Plan

## Scope
Adaptive VANT: preserve the existing desktop experience and adapt it for tablet and phone layouts. Phone navigation uses a slide-out sidebar drawer. This phase is read-only until the audit plan is agreed; no production changes or deployment are authorized by this plan.

## Confirmed findings from `src/App.jsx` on `main`
- The top-level authenticated application shell sets `height: 100vh`, `minHeight: 640`, and `overflow: hidden` (near line 5126). This can force a 640px minimum on short phone viewports and can interact poorly with mobile browser chrome/keyboard.
- The primary `Sidebar` uses a fixed 224px width and `flexShrink: 0` (near line 506), and the shell always renders it (near line 5134). At narrow widths, the sidebar consumes a large fraction of the viewport; there is no slide-out drawer or menu button in the current app shell.
- The current media query at max-width 760px only hides `.vant-sidebar-label`, but the primary navigation labels in `Sidebar` have no such class. As written, the rule does not collapse the primary labels.
- The `TopBar` applies fixed 24px horizontal padding and does not currently expose a mobile navigation control (near line 4299).
- The top-level page viewport is an independently scrolling `overflow: auto` container (near line 5137), so keyboard/viewport behavior should be reviewed alongside the fixed-height shell.
- Several elements use intentional overflow handling (e.g. code/math/table renderers), while Education widgets include fixed-width floating panels (see `src/VantEducationWidgets.jsx` around the panel base style). These need scoped, component-level responsive treatment rather than broad global CSS.
- The anonymous entry/auth screen also includes fixed vertical spacing and overlays; validate it separately from the authenticated shell.
- The repo’s `package.json` runs `scripts/restore-app.cjs` before dev/build. Keep the restoration mechanism intact and verify a reproducible build from a clean checkout.

## Prioritized work
### P0 — Verify build source and establish preview workflow
1. Confirm `src/App.jsx` is the canonical current entry and examine the restore script's no-op path when the file exists.
2. Confirm Vercel preview deployment branch settings and make sure changes stay on this feature branch.
3. Set up reproducible local/preview build checks without touching production.

### P1 — Shared shell and navigation
1. Remove the 640px forced minimum for the app shell; use a mobile-safe dynamic viewport strategy with a fallback.
2. Add an accessible menu trigger to the top bar on tablet/phone.
3. Reuse the existing Sidebar component in a responsive drawer for narrow viewports; keep persistent sidebar behavior on desktop.
4. Add backdrop dismissal, Escape dismissal, correct focus behavior, scroll containment, active item selection and close-on-navigation.
5. Ensure the page content, header, and drawer fit the viewport without horizontal scrolling.

### P2 — AI Chat
1. Validate chat history and message list width on phones.
2. Reflow the composer, attachment preview list, action controls and model/status affordances.
3. Test virtual keyboard, safe areas, send/cancel, loading state and long responses.

### P3 — Shared overlays and layout primitives
1. Make auth/settings/project modal widths and max-heights responsive.
2. Review fixed-width inner sidebars, dropdowns/popovers and table layouts.
3. Preserve intentional inner horizontal scrolling for tables, code and equations without causing body overflow.

### P4 — Other product areas
1. Education: cards/grid, saved materials, flashcards, quiz/planner and fixed-width floating widgets.
2. Projects: project lists, workspace panel, members/roles and team chat.
3. Tools, Dashboard, CoWork, Integrations, and Memory: stacked cards, responsive forms, chart/table widths and long labels.

### P5 — Verification and release
Test at 320, 360, 390, 430, 768, 1024, 1280 and 1440 CSS pixels, including portrait/landscape and short viewports. Check no document-level horizontal scroll, no unreachable controls behind keyboard, usable navigation, overlay dismissal, attachments, auth, Education saves and existing desktop behavior. Deploy a preview first; production only after review and explicit release decision.

## Proposed breakpoints
Use the current code as the starting point, then verify:
- Phone: < 768px — drawer navigation, single-column flows.
- Tablet: 768–1023px — responsive drawer / compact workspace where needed.
- Desktop: >= 1024px — retain the persistent sidebar and existing layout wherever feasible.

## Not in scope
No API, Supabase schema, auth policy, engine, feature behavior or production deployment changes unless separately necessary and agreed.
