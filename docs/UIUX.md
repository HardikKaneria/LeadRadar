# UIUX.md — Radar OIP Experience Rules

> How Radar OIP **behaves**. Pair with [`DESIGN.md`](./DESIGN.md) (how it looks). Every page must
> satisfy the checklist in §11 before it's considered done.

---

## 1. Product north star

Radar answers one question: **"What should I do next that has the highest chance of winning
revenue?"** Every screen either (a) feeds that answer with clean signal, or (b) presents the
answer and makes acting on it one click. If a UI element doesn't serve that, cut it.

This is **not a CRM dashboard** — avoid vanity stats and chrome. Favor decisions and actions over
counters.

---

## 2. Information architecture

Primary nav (sidebar), in priority order:

1. **Action Center** — the homepage: today's highest-value moves.
2. **Capture** — add opportunities (manual + CSV; extension later).
3. **Discovery Inbox** — triage raw discoveries.
4. **Opportunities** — ranked, analyzed opportunities *(later phase)*.
5. **Pipeline** — leads by stage *(later)*.
6. **Tasks** — follow-up queues *(later)*.
7. **Company Brain** — targeting / ICP / bad-lead rules.
8. **Jobs** — async job monitor.
9. **Settings** — workspace, members, integrations *(later)*.

Rules:
- Nav items the user lacks permission for are **hidden**, not disabled.
- Not-yet-built items render disabled with a "Coming soon" tooltip — never a dead link.
- The active item is derived from the pathname (longest-prefix match).

---

## 3. Layout system

- **App frame:** fixed `Sider` + sticky `Header` + scrollable `Content`. Content max width
  ~1280–1440px, centered, with comfortable gutters.
- **Page header block (every page):** `Title level={3}` + one-line `Text type="secondary"`
  subtitle describing the job-to-be-done, and (optionally) a right-aligned primary action.
- **Two/three-pane work surfaces** (Inbox, Capture): filters/nav left, list center, detail/preview
  right. Collapse to stacked on narrow viewports.
- **12-col grid** via `Row`/`Col` with `gutter={[16,16]}` or `[24,24]`. Don't hand-roll widths.

---

## 4. Action hierarchy

- **One** `type="primary"` button per view = the main action ("Add discovery", "Start import",
  "Approve").
- Secondary actions = `default`; tertiary = `type="text"`/`link`.
- Destructive actions = `danger`, and **always** behind `Popconfirm`/`Modal.confirm`.
- Bulk actions appear in a sticky action bar only when ≥1 row is selected; show the count.
- Disable (don't hide) an action that's temporarily invalid, and explain why via Tooltip/helper.

---

## 5. Forms

- Always AntD `Form` with `Form.Item` labels, `rules` validation, and inline error messages.
- Validate on submit and on blur; never rely solely on the server to surface a missing field.
- Mirror shared zod contract constraints in `rules` so the client catches issues first; the
  server contract remains the source of truth.
- Required identifiers, sensible `placeholder`s, helper text under ambiguous fields
  (`extra` prop).
- Submit button shows `loading` and is disabled until the form is minimally valid.
- On success: clear/reset as appropriate, then confirm with `message.success` **and** show the
  resulting state (e.g. job progress), so the user sees what happened next.
- Numbers use `InputNumber` (with min/precision/formatter), money shows units; never a text field
  for a number.

---

## 6. The four states (mandatory per data surface)

Every list, table, panel, or async region implements all four:

1. **Loading** — `Skeleton` for content-shaped regions, `Spin` for inline, `Table loading`.
   Never a blank flash.
2. **Empty** — `Empty` with a one-line reason + a primary CTA toward the action that fills it
   (e.g. Inbox empty → "Capture your first discovery").
3. **Error** — inline `Alert type="error"` (recoverable) or `Result status="error"` (page-level),
   with a retry affordance. Show the real message; don't swallow it.
4. **Loaded** — the content. Preserve scroll/selection across refreshes where it matters.

Permission-denied is a distinct, explicit state ("Your role doesn't include `X`."), not an empty
list.

---

## 7. Feedback & async

- Transient confirmations → `message` (success/info). Richer or backgroundable events →
  `notification`. Inline, contextual problems → `Alert`.
- Always via `App.useApp()` so theme + context apply.
- **Long-running work is observable.** Anything that enqueues a job shows live `Progress` by
  polling `/jobs/:id` until a terminal status; on completion, link to where the result landed.
- Optimistic UI only when reversal is cheap; otherwise wait for confirmation.
- Poll intervals: ~2s for active jobs; back off on error. Stop polling at terminal status and
  on unmount.

---

## 8. Motion

- Subtle and fast (`motionDurationMid ~0.18s`). Use AntD's built-in transitions; don't add custom
  animation libraries.
- Motion communicates change (enter/exit, expand/collapse, progress) — never decoration.
- Respect `prefers-reduced-motion`: avoid large movement; keep essential state changes instant.

---

## 9. Content & voice

- **Verbs for actions** ("Approve", "Ignore", "Start import"), **nouns for things**.
- Say what happens next, not what the system is doing internally.
- Sentence case for everything except eyebrow/meta labels (UPPERCASE, tracked).
- Numbers: format with locale (`toLocaleString`); money with a currency/unit; relative time for
  recent, absolute on hover.
- Errors are plain and actionable: what failed + what to do. No stack traces in the UI.
- Empty states are encouraging and point to the next step.

---

## 10. Accessibility & input

- Maintain visible focus rings (AntD default keyboard focus — don't remove outlines).
- Every icon-only control has an `aria-label` and a `Tooltip`.
- Color is never the only signal — pair with text/`Tag` label/icon (see `DESIGN.md §2.4`).
- Hit targets ≥ control height 36; comfortable spacing between adjacent actions.
- Forms are fully keyboard-operable; `Enter` submits the primary form; `Esc` closes overlays.
- Target WCAG AA contrast on the dark surfaces (the token text scale is tuned for this).

---

## 11. Definition of done — per-page checklist

A page is "perfect" only when all are true:

- [ ] Page header block: `Title level={3}` + secondary subtitle (+ primary action if any).
- [ ] **Zero native form controls** — every input/select/checkbox/radio/date/upload/table is AntD.
- [ ] All four states implemented (loading / empty / error / loaded) + permission-denied state.
- [ ] Exactly one primary action; destructive actions confirmed.
- [ ] Status rendered with the canonical color mapping (`DESIGN.md §2.4`).
- [ ] Colors/spacing/radius come from tokens — no hard-coded hex/px in components.
- [ ] Async work shows live progress and links to the result.
- [ ] Responsive: panes collapse/stack gracefully; nothing overflows at ~1280 and ~768.
- [ ] Feedback via `App.useApp()`; copy follows §9 voice.
- [ ] Keyboard + screen-reader basics (§10) pass a quick manual check.
- [ ] `pnpm --filter @radar/web lint` + `build` green; page browser-smoked.
