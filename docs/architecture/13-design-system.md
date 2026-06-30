# 13 — Design System

> Status: this is the **target design-system spec for the next Radar OIP frontend pass**.
> It does **not** mean the shipped web app has already migrated. The current implementation is still
> documented in [`DESIGN.md`](../DESIGN.md) and [`UIUX.md`](../UIUX.md).

## 1. Design philosophy

Radar OIP should feel like a premium developer SaaS console built for operators making revenue decisions.
It is dark-first, compact, calm, precise, and action-focused.

- Inspired by the clarity of Supabase's dark product surfaces, but with original Radar branding.
- Never a colorful CRM dashboard.
- Never heavy enterprise chrome.
- AI is present, explainable, and editable, not magical.
- Every major screen should help the operator decide what to do next.

## 2. Color tokens

Use semantic tokens first. Raw hex belongs in token definitions only.

```css
:root {
  --background: #0B0F0D;
  --background-secondary: #111715;

  --surface-100: #151C19;
  --surface-200: #1B2420;
  --surface-300: #223029;

  --border: #26332D;
  --border-muted: #1D2823;
  --border-strong: #33443B;

  --text: #F4F7F5;
  --text-light: #C9D3CE;
  --text-muted: #7E8B85;

  --brand: #3DDC97;
  --brand-hover: #34C987;
  --brand-soft: rgba(61, 220, 151, 0.12);
  --brand-border: rgba(61, 220, 151, 0.28);

  --warning: #EAB308;
  --danger: #EF4444;
  --info: #38BDF8;
}
```

Recommended semantic aliases:

- `bg-background`, `bg-background-secondary`
- `bg-surface-100`, `bg-surface-200`, `bg-surface-300`
- `text-foreground`, `text-foreground-light`, `text-muted`
- `border-border`, `border-border-muted`, `border-border-strong`
- `bg-brand`, `text-brand`, `border-brand`, `bg-brand-soft`

## 3. Typography

- **UI font:** Inter or Geist Sans
- **Mono font:** JetBrains Mono or Geist Mono

Type scale:

| Element | Size |
|---------|------|
| Page title | 24-32px |
| Section title | 16-18px |
| Body text | 14px |
| Table text | 13px |
| Metadata / helper | 12px |

Rules:

- Use medium weight for labels, tabs, pills, and actions.
- Avoid oversized CRM-style hero metrics.
- Use mono for IDs, logs, prompt/version metadata, and job/debug surfaces.

## 4. Spacing

- Base rhythm: 4px for micro spacing, 8px for normal layout intervals.
- Card padding should usually land in the 16-24px range.
- Dense data surfaces can drop to 12-16px internal padding, but should not feel cramped.
- Keep vertical rhythm tighter than horizontal rhythm on dense admin surfaces.

## 5. Border radius

- Inputs, pills, compact buttons: 8px
- Standard cards, tables, dropdowns: 10-12px
- Larger panels, modals, drawers: 12-16px
- Full-pill badges: 999px

Rounded, but never soft or playful.

## 6. Shadows

- Prefer borders and layered surfaces over large shadows.
- Default cards: no visible drop shadow.
- Overlays only: soft shadow with low spread and low opacity.
- Avoid glows unless they communicate state, such as focus or active AI processing.

## 7. Buttons

| Variant | Use |
|---------|-----|
| Primary | strongest positive action; emerald brand background |
| Default | standard action on dark surface with border |
| Secondary | lower-emphasis action in grouped controls |
| Danger | destructive action only |
| Ghost | topbar, sidebar, contextual icon actions |
| Link / text | tertiary actions inside dense panels |

Rules:

- One primary action per view.
- Primary actions use emerald; never use the brand style for every button on a screen.
- Icon-only buttons must have tooltip and accessible label.

## 8. Badges

Badges are for:

- score
- priority
- source
- status
- AI confidence
- urgency

Priority mapping:

- `critical` -> danger
- `high` -> brand
- `medium` -> warning
- `low` -> muted

Badges should read as compact signals, not decoration.

## 9. Cards

Card contract:

- dark surface
- 1px border
- 8-12px radius
- minimal or no shadow
- optional header / content / footer

Use cards for grouped content, not as a nesting habit. Avoid card-inside-card-inside-card layouts.

## 10. Tables

- Compact row height
- Quiet, muted table headers
- Subtle row hover using `surface-300`
- Right-aligned row actions for dense operational flows
- Empty state always present
- Horizontal scroll is acceptable for logs and analytics tables
- Sticky header can be added later, but density rules should assume it

## 11. Sidebar

The sidebar is the workspace anchor.

- Top: workspace or organization switcher
- Middle: grouped navigation
- Bottom: settings and user controls
- Later: collapsed rail mode

Visual rules:

- dark layout surface distinct from content canvas
- thin border or divider, not a heavy shadow
- active item uses the brand color with a restrained fill

## 12. Topbar

The topbar is a breadcrumb and context row, not a marketing header.

- Breadcrumbs come first
- Optional sub-navigation sits below, not mixed into breadcrumbs
- Command/search, notifications, quick actions, and user menu align to the right
- Keep height compact and consistent across screens

## 13. Page layout

Page primitives:

- `PageContainerSmall`
- `PageContainerDefault`
- `PageContainerFull`
- `PageSection`

Rules:

- Breadcrumbs first
- Page header only when it adds clarity
- Group related content into sections instead of improvising margins
- Use the optional right drawer for AI/context instead of modal-spamming dense workflows

## 14. Forms

- Compact field spacing
- Clear labels and helper text
- Inline validation
- Save/cancel footer for settings forms
- Field groups should be obvious at a glance

Use semantic input states:

- default
- hover
- focus
- error
- disabled

Do not rely on placeholder text as the only label.

## 15. Empty states

Empty states should answer:

- why this is empty
- what the user can do next
- which action is primary

They should be calm and direct, never cute or noisy.

## 16. Modals and drawers

- Use modals for confirmation or short, self-contained flows
- Use drawers for contextual editing, AI assistance, logs, and details that should not break page flow
- Prefer right-side drawers for operational continuity
- Destructive actions inside modals need clear consequence text

## 17. AI assistant drawer

The AI drawer is a contextual workspace, not a chatbot gimmick.

It should support:

- AI explanation
- suggested next action
- editable generated drafts
- confidence and reasoning
- hidden advanced metadata (prompt/version/provider/request id)

The drawer should be available on opportunity and lead pages first.

## 18. Score badges

Score presentation needs both rank and confidence.

- Numeric score pill for primary score
- Heat indicator for recency/urgency
- Confidence badge for explainability
- Expandable "Why this score?" surface

Do not show a score without reason, matched service, urgency, budget estimate, confidence, and recommended action.

## 19. Opportunity cards

Opportunity cards should foreground actionability.

Required anatomy:

- opportunity title or company
- score / heat / priority
- why it matters
- potential value
- recommended next action
- timing or urgency

These cards should feel closer to an operator queue than a sales CRM tile.

## 20. Status pills

Canonical status pills:

- `new`
- `processing`
- `analyzed`
- `approved`
- `ignored`
- `converted`
- `open`
- `qualified`
- `promoted_to_lead`
- `won`
- `lost`
- `on_hold`

Use clear semantic color mapping and consistent wording everywhere.

## 21. Timeline / activity UI

Timeline surfaces should be dense, readable, and audit-friendly.

- left rail or event markers
- short event titles
- metadata row in muted or mono text
- expandable note/details content
- clear actor, timestamp, and entity reference

Avoid oversized avatars and social-feed styling.

## 22. Job status UI

Jobs are operational UI, not decorative status chips.

Use:

- compact tables
- inline progress
- terminal-state pills
- log drawer or detail panel
- visible retry/cancel affordances when allowed

Queued, running, failed, and completed states must be easy to scan.

## 23. Audit log UI

Audit surfaces should prioritize clarity and traceability.

- dense, filterable table
- actor, action, target, organization, timestamp
- safe diff/details preview
- export affordance later

This screen should look more like a developer admin console than a CRM activity stream.

## 24. Responsive behavior

- Desktop-first, but fully usable on tablet and mobile
- Sidebar can collapse to rail or sheet
- Right drawer becomes full-width overlay on narrow screens
- Multi-pane layouts stack predictably: filters, list, detail
- Tables may scroll horizontally, but primary actions must remain reachable

## 25. Accessibility rules

- Maintain visible focus states
- Meet WCAG AA contrast on dark surfaces
- Keyboard-first operation for nav, forms, tables, and drawers
- Reduced-motion support for non-essential transitions
- Color is never the only signal
- Icon-only actions require accessible labels
- AI-generated content must be clearly labeled and editable

## Implementation notes

- Tokens should exist in Tailwind config, `globals.css`, and component variants.
- Prefer semantic classes over one-off utility piles.
- shadcn/ui-style primitives are a delivery style, not a branding system.
- Zustand is reserved for UI state only; TanStack Query owns server state.
