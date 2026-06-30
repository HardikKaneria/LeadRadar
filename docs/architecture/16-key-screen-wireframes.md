# 14 — Key Screen Wireframes

> Status: implementation-grade screen guidance for the current Radar OIP design direction.
> These wireframes are aligned to the shipped Ant Design shell and the shared primitives in
> `apps/web/src/components/ui/`.

## 1. Daily Action Center

```text
┌ Breadcrumbs ───────────────────────────────────────────────────────────── Quick action
├ Page title + one-line operator prompt
│
├ 3-column action lane grid
│  ├ High-value opportunities
│  │  ├ What should I do?
│  │  ├ Why now?
│  │  ├ Potential value
│  │  └ Next action
│  ├ Follow-ups due
│  └ Urgent actions
│
└ Discovery path CTA section
   ├ short explanation
   └ Company Brain / Open Inbox actions
```

Rules:
- One primary CTA only: capture or open the next workflow.
- Action cards answer the operator question before they show metrics.
- This page stays compact; no vanity KPI wall.

## 2. Discovery Inbox

```text
┌ Breadcrumbs ───────────────────────────────────────────────────────────── Refresh
├ Page title + triage subtitle
│
├ Filters rail (left, fixed width)
│  ├ Search
│  ├ Country
│  ├ Date range
│  ├ Sort
│  ├ Status groups
│  ├ Source groups
│  └ Apply / Reset
│
├ Discovery list (center)
│  ├ Bulk action bar when rows selected
│  ├ Compact row list
│  │  ├ status + source
│  │  ├ title / company
│  │  ├ captured date / budget / country
│  │  └ active row highlight
│  └ Pagination
│
└ Preview panel (right)
   ├ title / company / tags
   ├ approve / ignore / reviewed actions
   ├ normalized details
   ├ raw payload accordion
   └ empty / loading / error states
```

Rules:
- Left filter rail stays quiet; preview panel carries the decision weight.
- Bulk actions must appear only when the operator selects rows.
- The preview panel is the approval surface, not a decorative detail card.

## 3. Opportunity Detail

```text
┌ Breadcrumbs ─────────────────────────────────────────────── Owner / primary action
├ Title row
│  ├ score, priority, heat
│  └ primary next action
│
├ Main split
│  ├ Left (default width)
│  │  ├ value + fit summary
│  │  ├ AI explanation
│  │  ├ recommended action
│  │  ├ source evidence / raw discovery lineage
│  │  └ similar opportunities
│  └ Right
│     ├ contextual AI drawer trigger / panel
│     ├ outreach state
│     ├ owners / metadata
│     └ notes / attachments
```

Rules:
- The score and explanation lead; metadata stays secondary.
- The next move is visible above the fold.
- Similar opportunities and lineage are supporting evidence, not the headline.

## 4. Lead Workspace

```text
┌ Breadcrumbs ─────────────────────────────────────────────── Stage action / primary CTA
├ Title row
│
├ Main workspace
│  ├ Left
│  │  ├ stage summary
│  │  ├ next action card
│  │  ├ tasks queue
│  │  ├ outreach thread
│  │  └ proposal / meeting state
│  └ Right
│     ├ timeline
│     ├ notes
│     ├ relationship / company context
│     └ AI assistance
```

Rules:
- No active lead without a visible next action.
- Timeline and notes support execution; they do not bury stage clarity.
- The lead workspace feels like a cockpit, not a CRM record dump.

## 5. Knowledge

```text
┌ Breadcrumbs ───────────────────────────────────────────────────────────── Filters
├ Title row
│
├ Insight sections
│  ├ Conversion by source
│  ├ Conversion by service
│  ├ Win / loss reasons
│  ├ Demand radar
│  ├ Forecast
│  └ Resurrection opportunities
```

Rules:
- Insight cards are arranged by decision value, not chart novelty.
- Tables and summaries should explain what changed and what to do next.
- Charts stay restrained and never dominate the full page.

## 6. Settings

```text
┌ Breadcrumbs ─────────────────────────────────────────────── Context action (optional)
├ Title row
│
├ Compact metric cards
│
├ Main settings sections
│  ├ grouped cards / sections
│  ├ concise helper text
│  ├ controlled fields
│  └ inline validation / state feedback
│
└ Sticky save bar (only when dirty)
   ├ unsaved-change message
   ├ reset
   └ single primary save action
```

Rules:
- Settings pages are editors, not dashboards.
- Group related controls into a small number of sections instead of nesting cards deeply.
- Sticky save/reset appears only when the page is dirty.

## 7. Primitive mapping

These wireframes are expected to use:

- `PageHeader`
- `PageSection`
- `MetricCard`
- `EmptyState`
- `DiscoveryStatusTag` / `JobStatusTag` / `PriorityTag` / `SourceTag`
- `SettingsSaveBar`

That shared layer is the implementation contract for the next major UI pass.
