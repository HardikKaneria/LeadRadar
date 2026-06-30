# CONVENTIONS.md — Coding Standards

> Follow the surrounding code. These are the defaults; when a file already does
> something differently, match the file and note it if it's wrong.

---

## General

- **TypeScript everywhere.** No `any` unless unavoidable; prefer precise types from
  `@leadradar/shared`.
- **Small, focused diffs.** One task per change. Don't reformat unrelated code.
- **No new dependencies** without a note in `DECISIONS.md` and a good reason. Prefer
  what's already in the stack (Ant Design, dayjs, supabase-js).
- **Naming:** files are `kebab-case.tsx` (e.g. `add-lead-modal.tsx`, `lead-detail-page.tsx`).
  Components are `PascalCase`, hooks are `useThing`, helpers are `camelCase`.

## Frontend (`apps/web`) — Next.js App Router + Ant Design 6

> **Read [`docs/DESIGN.md`](../DESIGN.md) (visual system) and [`docs/UIUX.md`](../UIUX.md)
> (experience rules) before doing any web work.** They are the source of truth; the notes
> below are the short version. (Stack is Next.js 15 App Router — _not_ the legacy Vite/
> react-router setup some older docs mention. See [[D-011]].)

- React 19 function components + hooks only.
- **Ant Design 6 for every interactive element** — `Form`, `Input`/`Select`/`DatePicker`/
  `InputNumber`/`Switch`/`Radio`/`Checkbox`/`Upload`, `Table`, `Tag`, `Modal`, `Dropdown`,
  `Result`, `Empty`, `Skeleton`, etc. **Never** use native `<input>/<select>/<button>/<textarea>`
  or browser dropdowns. Native HTML only for pure layout.
- **Tokens, not hex.** Colors/spacing/radius/shadows come from `src/theme/tokens.ts` (dark theme).
  Don't hard-code colors in components. Tailwind is for layout utilities only, not component styling.
- **dayjs** for all date/time work (AntD's date components expect dayjs; it's a direct dep).
- Feedback via `App.useApp()` (`message`/`notification`), inline issues via `Alert`.
- Pages live in `src/app/(group)/.../page.tsx`; reusable UI in `src/components/`; pure helpers and
  typed data layers in `src/lib/`. Page data goes through `lib/*` + `useAuth()` — don't scatter
  Supabase calls across components.
- Every data surface implements all four states (loading / empty / error / loaded) + a
  permission-denied state, and uses the canonical status→color mapping (`DESIGN.md §2.4`).
- Run the per-page Definition-of-Done checklist in `UIUX.md §11` before calling a page done.

## Shared (`packages/shared`)

- This is the **contract** between web and worker. Changing an exported type is a
  breaking change — announce it in `WORKLOG.md` and rebuild both consumers.
- Keep enums as `as const` tuples with a derived union type (existing pattern in
  `leads.ts`).

## Backend / data (`supabase`, `apps/worker`)

- **Migrations are additive and idempotent-friendly.** Never drop columns/tables that
  hold lead data in Stage 1. Use `IF NOT EXISTS` / `ADD COLUMN` style.
- Each migration is a dated file in `supabase/migrations/`; pair schema with its RLS
  file when relevant (see the existing `_rls.sql`).
- RLS must be considered for every new table — leads are tenant/owner-scoped.
- Worker code: keep services, repositories, and templates separated as they already are.

## Commits & git

- Don't commit, push, branch, or open PRs unless the user asks.
- When you do commit (on request): present-tense summary, scope-limited, no secrets.
- Never commit `.env*`, keys, or tokens.

## Comments

- Comment the *why*, not the *what*. Match the existing comment density (this codebase
  is light on comments — don't over-annotate).
