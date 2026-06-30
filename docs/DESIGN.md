# DESIGN.md — Radar OIP Visual Design System

> The single source of truth for how Radar OIP **looks**. Pair with [`UIUX.md`](./UIUX.md)
> (how it **behaves**). Tokens here are implemented in
> [`apps/web/src/theme/tokens.ts`](../apps/web/src/theme/tokens.ts) and
> [`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css) — change values there, never
> hard-code them in components.

---

## 0. Golden rules

1. **AntD first, always.** Every interactive element is an Ant Design component. Never use a
   native `<input>`, `<select>`, `<button>`, `<textarea>`, `<table>`, checkbox, radio, or date
   field. Native HTML is only allowed for pure layout (`div`, `section`, `span`, `a` via AntD
   `Typography.Link`/`next/link`).
2. **Tokens, not hex.** Colors, spacing, radius, and shadows come from the theme. If you're
   typing a hex value in a component, stop — add/extend a token.
3. **Dark only.** Radar is a dark "mission-control" product. There is no light theme in v1.
4. **One primary action per view.** Everything else is secondary/tertiary. See `UIUX.md §4`.
5. **Density with air.** Data-dense but calm: generous padding inside cards, tight rhythm
   between related items.

---

## 1. Brand

**Name:** Radar OIP — *Opportunity Intelligence Platform.*
**Idea:** a radar that pulls signal from noise and tells you the single next move that wins
revenue. The UI should feel like a focused console: precise, quiet, confident, a little
futuristic — never loud or playful.

**Logo mark:** a concentric radar sweep (`RadarChartOutlined` as the interim mark) in Radar Blue
on the deepest surface, paired with the wordmark **Radar** (display font, 600) + a muted `OIP`.

**Voice in UI copy:** short, declarative, outcome-oriented. "Add discovery", not "Submit form".
Tell the user what happens next. See `UIUX.md §9`.

---

## 2. Color

### 2.1 Brand & semantic

| Token | Hex | Use |
|-------|-----|-----|
| `colorPrimary` (Radar Blue) | `#5E8BFF` | primary actions, focus rings, selected nav, links |
| primary hover | `#7BA0FF` | hover state of primary |
| primary active | `#4A78F0` | pressed state |
| Signal Cyan (accent) | `#22D3EE` | **sparing** live/active highlights, radar sweep, "now" markers |
| Success | `#3DD68C` | won, completed, healthy |
| Warning | `#FBBF24` | due-soon, processing, attention |
| Error | `#FF6B6B` | failed, lost, destructive |
| Info | `#5E8BFF` | neutral information (same as primary) |

> Cyan is a **seasoning**, not a main color. If two things on a screen are cyan, one of them is
> probably wrong.

### 2.2 Surfaces (dark neutral scale)

Deepest → brightest. Each "step up" = a layer closer to the user.

| Token | Hex | Use |
|-------|-----|-----|
| `--bg-base` | `#0A0D14` | app canvas (behind everything) |
| `--bg-layout` | `#0E121B` | sidebar + header |
| `--bg-container` | `#141A26` | cards, panels, the main content surfaces |
| `--bg-elevated` | `#1A2130` | dropdowns, modals, popovers, tooltips |
| `--bg-spotlight` | `#1E2636` | row hover, active/pressed surfaces |
| `--bg-field` | `#10151F` | inputs, selects, table headers |
| `--border` | `#242C3A` | default borders, dividers |
| `--border-subtle` | `#1C2330` | secondary/internal dividers |

### 2.3 Text

| Token | Hex | Use |
|-------|-----|-----|
| primary | `#E6E9F1` | headings, primary content |
| secondary | `#A7B0C0` | labels, descriptions, supporting copy |
| tertiary | `#6B7486` | meta, timestamps, placeholders |
| quaternary | `#454D60` | disabled |

### 2.4 Status → color mapping (be consistent everywhere)

- **Discovery status:** `new` → primary · `processing` → warning · `analyzed`/`reviewed` →
  cyan/info · `approved` → success · `ignored` → neutral (tertiary) · `converted` → purple-ish
  (use `geekblue`/`purple` AntD preset).
- **Job status:** `queued` → default · `running`/`retrying` → processing (warning) ·
  `completed` → success · `failed`/`cancelled` → error.
- Always render status as an AntD `Tag` or `Badge` with the mapped color — never a bare colored dot
  without a label.

---

## 3. Typography

Three families, loaded via `next/font` and exposed as CSS vars:

| Role | Family | Var | Where |
|------|--------|-----|-------|
| Display / headings | **Space Grotesk** | `--font-display` | `h1–h5`, page titles, wordmark, big stats |
| Body / UI | **Inter** | `--font-sans` | everything else (AntD `fontFamily`) |
| Mono | **JetBrains Mono** | `--font-mono` | IDs, code, raw JSON, batch/job ids, keyboard hints |

**Type scale** (AntD base `fontSize: 14`):

| Element | Size / weight | Notes |
|---------|---------------|-------|
| Page title (`Typography.Title level={3}`) | ~24px / 600 | display font, one per page |
| Section title (`level={5}`) | ~16px / 600 | card headers |
| Body | 14px / 400 | default |
| Secondary | 13–14px / 400, `type="secondary"` | descriptions |
| Caption / meta | 12px / 500, uppercase, `letter-spacing .14em` | eyebrow labels, meta rows |
| Stat value (`Statistic`) | 28–32px / 600 | display font |

Headings use a slight negative tracking (`-0.01em`, set globally). Don't override font-family in
components — the global rule already maps headings to the display face.

---

## 4. Spacing, radius, elevation, layout

- **Spacing:** 8px grid (AntD default). Card inner padding `24` (`paddingLG`). Gaps between
  cards `16–24`. Use AntD `Flex`/`Space`/`Row`/`Col` — avoid ad-hoc margins.
- **Radius:** `borderRadius 10` (controls/inputs `8`, cards `16`, tags pill `999`). Rounded but
  not bubbly.
- **Elevation:** dark shadows, low alpha. `boxShadow: 0 8px 24px -12px rgba(0,0,0,.6)`. Only
  elevated surfaces (dropdowns, modals, popovers, hover cards) cast shadows; flat cards rely on
  the surface-step + border, not shadow.
- **Borders over shadows.** On dark, a 1px `--border` separates surfaces more cleanly than a
  glow. Reserve shadow for true overlays.
- **App frame:** fixed left `Sider` (240px expanded / 72px collapsed), sticky `Header` (64px),
  scrollable `Content` (max readable width ~1280–1440, generous gutters). Canvas uses
  `.radar-canvas` ambient gradient.

---

## 5. Iconography

- **Library:** `@ant-design/icons` only (outlined set for nav + actions; filled only for
  selected/emphasis). Keep one visual weight per context.
- **Sidebar icons (canonical):**
  - Action Center → `CompassOutlined`
  - Capture → `PlusSquareOutlined`
  - Discovery Inbox → `InboxOutlined`
  - Opportunities → `RadarChartOutlined`
  - Pipeline → `FunnelPlotOutlined`
  - Tasks → `CheckSquareOutlined`
  - Company Brain → `BulbOutlined`
  - Jobs → `ThunderboltOutlined`
  - Settings → `SettingOutlined`
- **Sizing:** nav 18px, inline/button icons inherit. Always pair an icon with a text label in
  primary nav (icon-only allowed only in the collapsed rail, with a Tooltip).
- **Brand mark:** `RadarChartOutlined` in Radar Blue until a custom SVG lands.

---

## 6. AntD configuration

- Global theme via `ConfigProvider theme={radarTheme}` (`theme.darkAlgorithm`, `cssVar`).
- `App` wrapper supplies static `message`/`notification` — **always** use `App.useApp()` for
  feedback, never the importable `message.*` (those lose the theme/context).
- SSR styles via `@ant-design/nextjs-registry` `AntdRegistry` (in `providers.tsx`).
- Component-level tokens (Menu, Layout, Card, Table, Input, Select, Button, Tabs, Segmented,
  Modal, Tag, Progress) are tuned in `tokens.ts` — extend there, not inline.

### Component vocabulary (use these, don't reinvent)

| Need | Use |
|------|-----|
| Page container surface | `Card` (variant `borderless` on tinted sections) |
| Forms | `Form` + `Form.Item` + `Input` / `Input.Password` / `Input.TextArea` / `InputNumber` / `Select` / `DatePicker` / `Switch` / `Radio.Group` / `Checkbox.Group` |
| File upload | `Upload.Dragger` |
| Tabular data | `Table` (with `Tag`, `Progress`, row actions) |
| List/triage | `List` or stacked `Card`s with `Segmented` filters |
| Status | `Tag`, `Badge`, `Progress` |
| Key numbers | `Statistic` |
| Empty/loading/error | `Empty`, `Skeleton`, `Spin`, `Result`, `Alert` |
| Menus/overflow | `Dropdown`, `Menu` |
| Pickers | `Select`, `Cascader`, `TreeSelect`, `AutoComplete` — never native `<select>` |
| Confirm destructive | `Popconfirm` or `Modal.confirm` |
| Feedback | `App.useApp()` → `message` (transient), `notification` (richer), `Alert` (inline) |
| Spacing/layout | `Flex`, `Space`, `Row`/`Col`, `Divider` |
| Text | `Typography` (`Title`, `Text`, `Paragraph`, `Link`) |

---

## 7. Do / Don't

**Do**
- Reach for an AntD component before writing markup.
- Keep status colors consistent with §2.4 across every page.
- Give every async surface a loading, empty, and error state (`UIUX.md §6`).
- Use `Tooltip` on icon-only controls.

**Don't**
- Hard-code colors/hex/px shadows in components.
- Use native form controls or browser dropdowns.
- Stack more than one primary (`type="primary"`) button in a view.
- Use cyan as a general accent — it's reserved for live/now signals.
- Add a new dependency for something AntD already ships.
