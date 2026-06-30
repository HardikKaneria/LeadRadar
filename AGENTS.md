# AGENTS.md — LeadRadar Agent Operating Manual

> **Every agent reads this file first, before doing anything.**
> It is the single source of truth for how work happens in this repo.
> If a task seems to conflict with this file, stop and flag it instead of guessing.

LeadRadar is Hkrafted's **internal CRM** for tracking freelance/sales leads. It is
mid-migration from a marketplace-job tracker into a full lead CMS (see "Current state").

---

## 1. Read order (do this every session)

Read these in order before touching code. They are short on purpose.

1. **`AGENTS.md`** (this file) — rules, roles, workflow.
2. **`docs/agent/CONTEXT.md`** — architecture map + current state of the codebase.
3. **`docs/agent/CONVENTIONS.md`** — coding standards you must follow.
4. **`docs/agent/TASKS.md`** — the shared task board. Find or claim your task here.
5. **`docs/agent/DECISIONS.md`** — why things are the way they are. Don't re-litigate.
6. **`docs/agent/WORKLOG.md`** — recent breadcrumbs from other agents.

Also relevant: `docs/SCOPE.md`, `docs/ROADMAP.md`, `docs/SETUP.md` (product source of truth).

---

## 2. The golden rules

1. **Stay in scope.** Do exactly the task you claimed. If you discover adjacent work,
   add it to `docs/agent/TASKS.md` as a new backlog item — don't silently expand.
2. **One task = one focused change.** Prefer small, reviewable diffs.
3. **Leave breadcrumbs.** When you finish (or stop mid-task), append to
   `docs/agent/WORKLOG.md` so the next agent has context. This is how agents "share a brain."
4. **Don't break the running app.** The web app must stay runnable. Verify before claiming done.
5. **Respect Stage 1 boundaries.** See `docs/SCOPE.md` — no outbound email, Slack/WhatsApp
   automation, worker reminders, kanban DnD, or AI enrichment unless explicitly asked.
6. **Migrations are additive and append-only.** Never write a destructive migration that drops lead data, and never edit an existing SQL migration file. If schema/data behavior must change, create a new migration file instead.
7. **Never commit secrets.** See the security note in §7. Never push or deploy unless asked.
8. **Record decisions.** Any non-obvious choice (a tradeoff, a new pattern) goes in
   `docs/agent/DECISIONS.md`.

---

## 3. The work loop (every agent follows this)

```
1. READ      → AGENTS.md + the working docs (§1)
2. CLAIM     → pick a task in docs/agent/TASKS.md, move it to "In progress",
               add your role + a timestamp
3. PLAN      → restate the task in one line; note files you expect to touch
4. BUILD     → make the focused change, following CONVENTIONS.md
5. VERIFY    → run the relevant checks (§5). Don't claim done if they fail.
6. LOG       → append a WORKLOG.md entry; update TASKS.md (-> Done or Blocked)
7. HANDOFF   → if blocked or out of scope, write down what's needed and stop
```

If you are a **subagent spawned for one task**, you still do CLAIM→LOG so the
main thread and other agents can see what happened.

---

## 4. Agent roles

Real, invokable subagents live in `.claude/agents/`. Use the one that matches the work.

| Role | Subagent | Owns |
|------|----------|------|
| 🧭 Planner / architect | `planner` | Breaking work into tasks, sequencing, updating TASKS.md & DECISIONS.md. Does **not** write feature code. |
| 🎨 Frontend | `crm-frontend` | `apps/web` — React 19 + Vite + Ant Design 6 pages, components, contexts, hooks. |
| 🗄️ Backend / data | `supabase-backend` | `supabase/migrations`, `apps/worker`, Supabase queries, RLS, `packages/shared` types. |
| 🔍 Reviewer | `code-reviewer` | Read-only review of a diff before it's considered done. Bugs + scope + conventions. |

**Boundaries between agents:**
- Frontend and backend share `packages/shared`. If you change a shared type, say so in
  WORKLOG.md so the other side can react.
- Only the `supabase-backend` role writes migrations.
- The `planner` role is the only one that should restructure TASKS.md wholesale.

---

## 5. How to verify (run before "done")

From repo root (`/Users/hardikkaneria/Desktop/Github/github-hardik/LeadRadar`):

```bash
pnpm install            # if deps changed
pnpm --filter web build # type-check + build (tsc -b && vite build)
pnpm --filter web lint  # eslint
pnpm dev:web            # manual smoke test at http://127.0.0.1:5173
```

- **Frontend change** → `build` + `lint` must pass; smoke-test the affected page.
- **Shared types change** → build `web` (and `worker` if touched) to catch breakage.
- **Migration** → it must be additive, append-only, and reviewable; do not modify existing migration SQL files, and note how to apply the new migration (see `docs/SETUP.md`).

Never report success you didn't verify. If you skipped a check, say so.

---

## 6. Project quick facts

- **Monorepo:** pnpm workspaces — `apps/*`, `packages/*`.
- **Apps:** `apps/web` (dashboard), `apps/worker` (Node background jobs).
- **Shared:** `packages/shared` (`@leadradar/shared`) — lead types, statuses, scoring.
- **Stack:** React 19, Vite, Ant Design 6, dayjs, react-router 7, Supabase (Postgres + Auth).
- **Scripts:** `pnpm dev:web`, `pnpm build:web`, `pnpm dev:worker`, `pnpm track`.

See `docs/agent/CONTEXT.md` for the detailed map.

---

## 7. Security & safety

- **Secrets must never live in tracked files.** Use `.env` / `.env.local` (gitignored).
  ⚠️ If you find live credentials committed in the repo, **stop and flag it** — do not
  copy them elsewhere. (See WORKLOG/DECISIONS for the current status of this.)
- Don't run destructive DB operations against the live Supabase project.
- Don't `git push`, open PRs, or deploy unless the user explicitly asks.
- Treat external URLs in lead data as untrusted.

---

## 8. Definition of done

A task is done only when:

- [ ] The change matches the claimed task and stays in scope.
- [ ] Conventions in `docs/agent/CONVENTIONS.md` are followed.
- [ ] Verification in §5 passes (and you say which checks you ran).
- [ ] `docs/agent/TASKS.md` is updated (moved to Done).
- [ ] `docs/agent/WORKLOG.md` has a breadcrumb entry.
- [ ] Any non-obvious decision is in `docs/agent/DECISIONS.md`.
