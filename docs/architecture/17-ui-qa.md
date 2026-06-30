# 15 — UI QA Signoff

> Status: QA signoff for the current frontend design track implementation.
> Scope: shared primitives + shipped screens in `apps/web`.

## Screens reviewed

- Auth (`/login`, `/register`)
- Action Center (`/`)
- Discovery Inbox (`/inbox`)
- Capture (`/capture`)
- Jobs (`/jobs`)
- Company Brain (`/settings/company-brain`)
- Extension settings (`/settings/extension`)

## Shared primitives reviewed

- `PageHeader`
- `PageSection`
- `MetricCard`
- `EmptyState`
- `DiscoveryStatusTag`
- `JobStatusTag`
- `PriorityTag`
- `SourceTag`
- `SettingsSaveBar`

## Checklist

| Area | Result | Notes |
|------|--------|-------|
| Tokenized styling | Pass | Shared primitives use semantic surfaces/borders instead of page-local visual contracts. |
| One primary action per view | Pass | Reviewed main pages; no screen now uses multiple competing primary CTAs. |
| Empty/error/loading states | Pass | Shared `EmptyState` added and reused; section surfaces keep loading/error states explicit. |
| Status consistency | Pass | Discovery and job statuses now flow through shared tag components. |
| Settings save behavior | Pass | Company Brain now exposes a sticky save/reset bar only when edits are dirty. |
| Keyboard basics | Pass | Existing AntD controls retain focus behavior; no custom control removed outlines. |
| Responsive layout | Pass | Shared sections and metric cards wrap cleanly; verified via build/smoke and page structure audit. |
| Icon-only action labeling | Pass | Existing shell collapse and compact icon controls retain visible labels or accessible text. |
| Nested card sprawl | Improved | Section wrappers replace several page-local card-header patterns and reduce ad-hoc structure. |

## Fixes made during QA

1. Added a reusable page-section contract so cards, section headers, and section subtitles stay visually and behaviorally consistent.
2. Replaced duplicated discovery/job status renderers with shared tag components.
3. Added a shared empty-state contract so operational pages keep clearer zero-state messaging.
4. Added a sticky dirty-state save bar for Company Brain to match the settings-page interaction rules.
5. Refactored Jobs and Extension settings onto the shared section/metric primitives.

## Residual risks

- Authenticated live-path QA is still limited by the absence of a real local Supabase session in this environment.
- `FD-05` is complete for the current shipped UI layer, but future screens from later phases must rerun this checklist when they land.
- Browser-extension visual QA is limited to build/package verification here; install/load-unpacked testing in Chrome still needs a human session.

## Verification commands

```bash
pnpm --filter @radar/web lint
pnpm --filter @radar/web build
pnpm --filter @radar/extension build
pnpm -r typecheck
```
