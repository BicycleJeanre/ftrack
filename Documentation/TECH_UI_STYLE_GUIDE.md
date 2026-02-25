# FTrack UI Style Guide

**Version**: 1.0.0  
**Last Updated**: February 25, 2026  
**Purpose**: Defines layout, formatting, and styling rules for the application. Used by AI and developers to apply consistent UI. No business logic or content changes are within scope of this document.

---

## 1.0 Design Tokens

### 1.1 Colour Palette

| Token | Value | Usage |
|---|---|---|
| `bg-base` | `#1a1a1a` | Page/app background |
| `bg-surface` | `#1e1e1e` | Cards, panels, row bodies |
| `bg-raised` | `#222` | Elevated cards, filter bars, stats bars |
| `bg-header` | `#252525` | Row headers, section title bars |
| `bg-toolbar` | `#1e1e1e` | Row toolbars (inside body) |
| `bg-inline-editor` | `#202020` | Inline edit forms |
| `border-subtle` | `#2a2a2a` | Row/panel dividers |
| `border-default` | `#3a3a3a` | Cards, inputs, table rows |
| `border-hover` | `#4a4a4a` | Hovered card borders |
| `accent-cyan` | `#00d4ff` | Primary accent — active states, left borders, highlights |
| `accent-cyan-dim` | `rgba(0,212,255,0.1)` | Active tab backgrounds |
| `accent-cyan-border` | `rgba(0,212,255,0.35–0.4)` | Active tab / edit form borders |
| `accent-cyan-fill` | `rgba(0,212,255,0.07–0.15)` | Totals card backgrounds, btn-action-primary bg |
| `text-primary` | `#e0e0e0` | Main body text, values |
| `text-secondary` | `#999` | Labels, metadata, card titles |
| `text-muted` | `#666–#777` | Dimmer labels, filter labels, icon buttons default |
| `text-faint` | `#555` | Chevrons, inactive icons |
| `positive` | `#4ade80` | Positive values, income |
| `negative` | `#f87171` | Negative values, debt |
| `neutral` | `#999` | Neutral values |

### 1.2 Typography

| Use | Font size | Weight | Case | Color |
|---|---|---|---|---|
| Row title | `16px` | `700` | Normal | `#e0e0e0` |
| Section heading | `clamp(18px,2vw,24px)` | `700` | Normal | `#e0e0e0` |
| Card title / label | `13px` | `600` | Uppercase | `#999` |
| Column header | `11px` | `600` | Uppercase | `#777` |
| Group label | `11px` | `600` | Uppercase | `#666` |
| Body text / cell | `13px` | `400` | Normal | `#e0e0e0` |
| Small meta / date | `12px` | `400–500` | Normal | `#666–#777` |
| Filter / toolbar label | `12px` | `400` | Normal | `#666` |
| Sidebar section title | `12px` | `600` | Uppercase | `#999` |
| Sidebar item | `13px` | `400` | Normal | `#999` (active: `#00d4ff`) |
| Page title (topbar) | `clamp(13px,1.2vw,17px)` | `600` | Normal | `#e0e0e0` |

All letter-spacing on uppercase labels: `0.4–0.6px`.  
Font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.

### 1.3 Spacing Scale

Consistent `8px` base unit. Common values: `4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24px`.  
`clamp()` is used for grid gaps and card padding at page level to respond to viewport width.

### 1.4 Border Radius

| Element | Radius |
|---|---|
| Dash rows | `6px` |
| Cards, grids, filter bars, inputs | `6px` |
| KPI / projection cards | `8px` |
| Buttons (action, tab, icon) | `4px` |
| Pill / standalone tag | `4px` |
| Progress bars, scrollbars | `3px` |

---

## 2.0 App Shell Layout

### 2.1 Top-level Structure

```
body (overflow: hidden)
└── .app-container  (flex row, 100vw × 100vh)
    ├── .sidebar
    └── .main-content  (flex col, flex: 1)
        ├── .topbar
        └── .content-area  (flex col, flex: 1, overflow: hidden)
            └── .dash-layout
```

### 2.2 Sidebar

```css
.sidebar {
    width: clamp(180px, 18vw, 280px);
    background: transparent;
    border-right: 1px solid #3a3a3a;
    display: flex; flex-direction: column;
    transition: width 0.3s ease;
    overflow: hidden;
}
.sidebar.collapsed { width: 0; border-right: none; }
```

- **`.sidebar-header`** — `padding: 16px`, flex row, space-between. Contains app name and optional toggle.
- **`.sidebar-content`** — `flex: 1`, `overflow-y: auto`, `padding: 16px`.
- **`.sidebar-section`** — `margin-bottom: 24px`. Groups of nav items.
- **`.sidebar-section-title`** — `12px`, `600`, uppercase, `#999`, `letter-spacing: 0.5px`.
- **`.sidebar-item`** — `padding: 8px 12px`, `13px`, `color: #999`. Active: `color: #00d4ff`, `border-left: 2px solid #00d4ff`.
- **`.sidebar-button`** — Full-width, `border: 1px solid #3a3a3a`, `color: #00d4ff`, `border-radius: 4px`. Hover: `border-color: #00d4ff`, faint cyan bg.

On `≤640px` the sidebar becomes a fixed overlay (`position: fixed`, slides in/out via `translateX`). A `.sidebar-backdrop` overlay (`rgba(0,0,0,0.55)`) covers the content area when open.

### 2.3 Topbar

```css
.topbar {
    background: transparent;
    padding: 12px 16px;
    border-bottom: 1px solid #3a3a3a;
    display: flex; align-items: center; gap: 16px;
}
```

- **Burger menu** — `.burger-menu` (32×32px), three `.burger-line` bars (20×2px, `#e0e0e0`).
- **Page title** — `.page-title`, `clamp(13px,1.2vw,17px)`, `600`, `#e0e0e0`.
- **Actions** — `.topbar-actions`, `margin-left: auto`, `gap: 8px`.

---

## 3.0 Dash Layout System

The main content area uses a vertical stack of collapsible rows.

### 3.1 Dash Layout Container

```css
.dash-layout {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden; min-height: 0;
    gap: 8px; padding: 8px;
}
```

All `.dash-row` elements are direct children. CSS `order` controls display sequence regardless of DOM order:

```css
#row-summary      { order: 1; }
#row-fund-summary { order: 2; }
#row-middle       { order: 3; }
#row-budget       { order: 4; }
#row-projections  { order: 5; }
```

### 3.2 Dash Row

Each section of the page is a `.dash-row`:

```css
.dash-row {
    display: flex; flex-direction: column;
    flex: 1; min-height: 220px;
    border: 1px solid #2a2a2a;
    border-radius: 6px; overflow: hidden;
    transition: flex 0.25s ease;
}
```

**States:**

| Class | Effect |
|---|---|
| *(default)* | Expands to fill available vertical space |
| `.collapsed` | `flex: 0 0 48px`, body hidden (`display:none`) |
| `.minimized` | `flex: 0 0 48px`, body invisible (`visibility:hidden`, retains space in scroll) |
| `.focused` | `flex: 3` (takes 3× share of vertical space) |

The `.row-middle` variant uses `flex: 2` and `min-height: 260px`.

### 3.3 Dash Row Header

```css
.dash-row-header {
    flex-shrink: 0; display: flex; align-items: center;
    height: 48px; padding: 0 16px;
    background: #252525;
    border-left: 3px solid #00d4ff;
    border-bottom: 1px solid #3a3a3a;
    gap: 10px; overflow: hidden;
    cursor: pointer; user-select: none;
}
.dash-row-header:hover { background: #2c2c2c; }
```

**Always contains (left → right):**
1. **`.dash-row-chevron`** — `color: #555`, 12×12px SVG downward arrow. Rotates `-90deg` when `.collapsed`.
2. **`.dash-row-title`** — `16px`, `700`, `#e0e0e0`.
3. **`.dash-row-controls`** — `margin-left: auto`, flex row, `gap: 4px`. Contains icon buttons only (Refresh, Minimize, Focus). Never contains tabs or action buttons.

Clicking the header calls `collapseRow(id)` to toggle `.collapsed`. The `.dash-row-controls` div does **not** stop propagation — all interactive elements inside it are icon buttons which bubble correctly.

### 3.4 Row Toolbar

Tabs and action buttons live inside the body, not the header:

```css
.row-toolbar {
    display: flex; align-items: center; gap: 8px;
    margin: -14px -16px 12px;
    padding: 8px 16px;
    background: #1e1e1e;
    border-bottom: 1px solid #2a2a2a;
    flex-shrink: 0;
}
```

The negative margin bleeds the toolbar flush to the body edges. Tabs go left; action buttons go `margin-left: auto` in a flex wrapper on the right.

### 3.5 Dash Row Body

```css
.dash-row-body {
    flex: 1; overflow-y: auto;
    padding: 14px 16px;
    background: rgba(0,212,255,0.02);
    min-height: 0;
}
```

When `.minimized`, body gets `overflow: hidden; visibility: hidden`.

### 3.6 Middle Row — Side-by-Side Panels

`#row-middle` uses `.middle-panels` to place two `.dash-panel` columns:

```css
.middle-panels { display: flex; flex-direction: row; height: 100%; overflow: hidden; }
.dash-panel    { flex: 1; display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid #2a2a2a; }
.dash-panel:last-child { border-right: none; }
```

**`.dash-panel-header`** — `height: 38px`, `background: #1e1e1e`, `border-bottom: 1px solid #2a2a2a`. Contains panel label, view tabs, and icon buttons.  
**`.dash-panel-label`** — `11px`, `600`, uppercase, `#888`, `letter-spacing: 0.4px`.  
**`.dash-panel-body`** — `flex: 1`, `overflow-y: auto`, `padding: 12px`.

On `≤1023px`: panels stack vertically (`flex-direction: column`), each with `min-height: 260px`.

---

## 4.0 Components

### 4.1 View Tabs (`.view-tabs`)

Segmented button group. Adjacent buttons share borders to form a connected pill.

```css
.view-tab {
    padding: 5px 14px; background: transparent;
    color: #999; border: 1px solid #3a3a3a;
    border-radius: 4px; font-size: 13px; font-weight: 500;
}
.view-tabs .view-tab:not(:last-child) { border-radius: 4px 0 0 4px; border-right: none; }
.view-tabs .view-tab:last-child       { border-radius: 0 4px 4px 0; }
.view-tab.active  { background: rgba(0,212,255,0.1); color: #00d4ff; border-color: rgba(0,212,255,0.35); }
.view-tab:hover:not(.active) { color: #e0e0e0; }
.view-tab.standalone { border-radius: 4px !important; border-right: 1px solid #3a3a3a !important; }
```

Use `.standalone` for a single tab-styled button that is not part of a group.

### 4.2 Icon Buttons (`.icon-btn`)

28×28px click target, 14px SVG icon.

```css
.icon-btn {
    width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    background: transparent; border: none; border-radius: 4px;
    cursor: pointer; color: #666; padding: 0;
    transition: color 0.15s, background 0.15s;
}
.icon-btn:hover            { color: #e0e0e0; background: rgba(255,255,255,0.05); }
.icon-btn.icon-danger      { color: #f87171; }
.icon-btn.icon-danger:hover{ color: #ff9898; background: rgba(248,113,113,0.08); }
```

Standard icons in dash row controls: Refresh (14px), Minimize (12×2px), Focus (12×12px expand).

### 4.3 Action Buttons (`.btn-action`)

Small inline buttons for operations (e.g. Generate, Clear, Regenerate). Live in `.row-toolbar`, never in headers.

```css
.btn-action {
    padding: 6px 14px; background: transparent;
    color: #e0e0e0; border: 1px solid #3a3a3a;
    border-radius: 4px; font-size: 12px; font-weight: 500;
    white-space: nowrap;
}
.btn-action:hover { background: #2a2a2a; }
.btn-action-primary { background: rgba(0,212,255,0.15); color: #00d4ff; border-color: rgba(0,212,255,0.4); }
.btn-action-primary:hover { background: rgba(0,212,255,0.25); }
```

### 4.4 Save / Cancel Buttons

Used inside inline edit forms.

```css
.btn-save   { padding: 8px 20px; background: #00d4ff; color: #000; border: none; border-radius: 4px; font-size: 13px; font-weight: 600; }
.btn-cancel { padding: 8px 20px; background: #2e2e2e; color: #e0e0e0; border: 1px solid #3a3a3a; border-radius: 4px; font-size: 13px; }
```

### 4.5 Standard Cards (`.card`)

```css
.card { background: transparent; border: 1px solid #3a3a3a; border-radius: 6px; padding: 16px; }
.card:hover { border-color: #4a4a4a; }
.card.with-bg { background: #2a2a2a; }
.card-title { font-size: 13px; font-weight: 600; color: #999; text-transform: uppercase; letter-spacing: 0.5px; }
.card-value { font-size: clamp(20px,2vw,28px); font-weight: 600; color: #e0e0e0; }
.card-value.large { font-size: clamp(24px,2.5vw,36px); }
.card-meta  { font-size: 12px; color: #999; }
```

### 4.6 Account Summary Cards (`.acct-summary-card`)

Horizontal inline card, sizing to content.

```css
.acct-summary-card {
    display: inline-flex; align-items: center; gap: 16px;
    padding: 11px 14px; border: 1px solid #3a3a3a;
    border-radius: 6px; background: #1e1e1e;
    cursor: pointer; width: fit-content; white-space: nowrap;
}
.acct-summary-card:hover  { border-color: #4a4a4a; }
.acct-summary-card.active { border-color: #00d4ff; }
```

- `.acct-card-name` — `14px`, `600`, `#e0e0e0`
- `.acct-card-meta` — `12px`, `#777`, flex row with `gap: 14px`
- `.acct-card-meta .balance` — `#e0e0e0`; `.balance.negative` — `#f87171`
- `.acct-card-actions` — flex row, `gap: 2px`

### 4.7 Inline Edit Form (`.acct-edit-form`)

Appears below its parent card, `width: fit-content`.

```css
.acct-edit-form {
    margin-top: 8px; padding: 14px;
    background: #202020; border: 1px solid rgba(0,212,255,0.4);
    border-radius: 6px; min-width: 240px; width: fit-content;
}
```

- `.field-label` — `10px`, `600`, uppercase, `#555`, `letter-spacing: 0.6px`
- `.field-display` — `padding: 7px 10px`, `background: #1a1a1a`, `border: 1px solid #3a3a3a`, `border-radius: 4px`
- `.acct-edit-actions` — flex row, `gap: 8px`, `margin-top: 14px`

### 4.8 Totals Card (`.totals-card`)

Banner strip showing key financial totals.

```css
.totals-card {
    display: flex; flex-wrap: wrap; gap: 4px 20px;
    padding: 10px 14px;
    background: rgba(0,212,255,0.07); border: 1px solid rgba(0,212,255,0.3);
    border-radius: 6px; white-space: nowrap;
}
.total-label { color: #666; font-size: 11px; min-width: 80px; }
.total-value { font-weight: 600; color: #e0e0e0; }
.total-value.positive { color: #4ade80; }
.total-value.negative { color: #f87171; }
.total-value.neutral  { color: #999; }
```

### 4.9 Filter Bar (`.filter-bar`)

```css
.filter-bar {
    display: flex; flex-wrap: wrap; gap: 12px 20px;
    padding: 10px 12px; background: #222;
    border: 1px solid #3a3a3a; border-radius: 6px; margin-bottom: 10px;
}
.filter-item   { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #666; }
.filter-control{ padding: 4px 10px; background: #1a1a1a; border: 1px solid #3a3a3a; border-radius: 4px; font-size: 12px; color: #e0e0e0; }
```

Period navigation: `.period-nav` contains `.period-btn` (24×24px, `background: #1a1a1a`, `border: 1px solid #3a3a3a`, `border-radius: 3px`).

### 4.10 Tabulator Grid (`.tab-grid`)

```css
.tab-grid   { border: 1px solid #3a3a3a; border-radius: 6px; overflow: hidden; }
.tab-header { display: flex; align-items: center; background: #222; border-bottom: 1px solid #3a3a3a; }
.tab-row    { display: flex; align-items: center; border-bottom: 1px solid #2e2e2e; background: #1e1e1e; }
.tab-row.expanded { background: #222; }
.tab-row:hover    { background: rgba(255,255,255,0.025); }
```

**Standard cell types:**

| Class | Width | Notes |
|---|---|---|
| `.tab-cell-ctrl` | `36px fixed` | Icon cells (expand, copy, delete). `border-right: 1px solid #2e2e2e`. Height `38px` (row) / `34px` (header). |
| `.tab-cell-name` | `flex: 1` | Primary text cell, `padding: 0 12px`, `13px` |
| `.tab-cell-type` | `110px fixed` | Transaction type |
| `.tab-cell-acct` | `150px fixed` | Account |
| `.tab-cell-amount` | `110px fixed` | Right-aligned numeric, `font-weight: 600` |
| `.tab-cell-check` | `36px fixed` | Checkbox cell |
| `.tab-cell-planned` | `120px fixed` | Right-aligned, `color: #4ade80` |
| `.tab-cell-actual` | `120px fixed` | Right-aligned, `color: #4ade80` |
| `.tab-cell-date` | `104px fixed` | Date |
| `.tab-cell-desc` | `140px fixed` | Description |
| `.tab-cell-recur` | `140px fixed` | Recurrence |
| `.tab-cell-proj-acct` | `160px fixed` | Projection account |
| `.tab-cell-proj-num` | `130px fixed` | Right-aligned projection number |
| `.tab-cell-bal` | `flex: 1, min 110px` | Balance, right-aligned |
| `.tab-cell-acct-type` | `110px fixed` | Account type label |

Header cells share `.tab-header` class — all have `11px`, `600`, uppercase, `#777`, `letter-spacing: 0.4px`, `min-height: 34px`.  
Data row cells default to `13px`, `#e0e0e0`, `min-height: 38px`.  
For horizontally scrollable grids, wrap in `.tab-grid-scroll` (`overflow-x: auto`).

**Group row** (`.tab-group-row`) — `background: #1a1a1a`, `font-size: 12px`, `color: #4ade80`, `600`. Dual variant (`.tab-group-row.dual`): flex row, space-between.

### 4.11 Inline Row Editor (`.inline-editor`)

Sits between rows in a tabulator grid.

```css
.inline-editor {
    background: #202020; border-bottom: 1px solid #3a3a3a;
    padding: 14px 16px 14px 52px;
}
```

Uses same `.field-group` / `.field-label` / `.field-display` components as the account edit form. `.field-group` `margin-bottom: 10px`.

### 4.12 Stats Bar (`.proj-stats-bar`)

Horizontal key-value strip, similar to filter bar but read-only metrics.

```css
.proj-stats-bar {
    display: flex; flex-wrap: wrap; gap: 6px 20px;
    padding: 10px 14px; background: #222;
    border: 1px solid #3a3a3a; border-radius: 6px; margin-bottom: 10px;
}
.proj-stat-label { color: #666; font-size: 12px; }
.proj-stat-value { font-weight: 700; color: #e0e0e0; font-size: 12px; }
.proj-stat-value.positive { color: #4ade80; }
.proj-stat-value.negative { color: #f87171; }
.proj-stat-value.cyan     { color: #00d4ff; }
```

### 4.13 KPI Cards (`.proj-kpi-card`)

```css
.proj-kpi-card  { padding: 14px 18px; background: #222; border: 1px solid #3a3a3a; border-radius: 8px; min-width: 140px; }
.proj-kpi-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.4px; }
.proj-kpi-value { font-size: clamp(16px,1.8vw,22px); font-weight: 700; color: #e0e0e0; }
.proj-kpi-value.positive { color: #4ade80; }
.proj-kpi-value.negative { color: #f87171; }
.proj-kpi-value.cyan     { color: #00d4ff; }
```

### 4.14 Account Trajectory Cards (`.proj-acct-card`)

```css
.proj-acct-card   { padding: 14px 16px; background: #222; border: 1px solid #3a3a3a; border-radius: 8px; }
.proj-acct-name   { font-size: 13px; font-weight: 600; color: #e0e0e0; }
.proj-acct-meta   { font-size: 11px; color: #666; display: flex; gap: 16px; flex-wrap: wrap; }
.proj-acct-track  { height: 6px; background: #2a2a2a; border-radius: 3px; border: 1px solid #3a3a3a; }
.proj-acct-fill   { height: 100%; border-radius: 3px; background: linear-gradient(90deg, rgba(0,212,255,0.5), #4ade80); }
.proj-acct-fill.negative { background: linear-gradient(90deg, rgba(0,212,255,0.5), #f87171); }
```

### 4.15 Fund Summary Cards (`.fsum-card`)

Used in the 3-column card grid within Fund Summary scopes.

```css
.fsum-card-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; margin-bottom: 4px; }
.fsum-card      { padding: 12px 14px; background: #222; border: 1px solid #3a3a3a; border-radius: 6px; min-height: 110px; }
.fsum-card.highlight  { border-color: rgba(0,212,255,0.5); background: rgba(0,212,255,0.04); }
.fsum-card-name { font-size: 13px; font-weight: 600; color: #e0e0e0; margin-bottom: 2px; }
.fsum-card-field { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; }
.fsum-card-field-label { color: #555; }
.fsum-card-field-val   { font-weight: 600; color: #e0e0e0; }
.fsum-card-field-val.positive { color: #4ade80; }
.fsum-card-field-val.negative { color: #f87171; }
.fsum-subtotal { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 6px; padding: 4px 6px 8px; font-size: 11px; color: #555; }
.fsum-subtotal-val { font-weight: 700; font-size: 12px; color: #00d4ff; }
```

**Group label** (`.fsum-group-label`) above each grid: `11px`, `600`, uppercase, `#666`, `padding: 10px 2px 4px`.

**Overall totals footer** (`.fsum-overall`): same visual as `.totals-card`, `margin-top: 12px`.

### 4.16 Fund Scope Panel (`.fund-scope-panel`)

```css
.fund-scope-panel { display: flex; align-items: center; gap: 16px; padding: 10px 14px; background: #1e1e1e; border: 1px solid #3a3a3a; border-radius: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.fund-scope-input { background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; color: #e0e0e0; font-size: 13px; padding: 4px 10px; }
.fund-scope-input:focus { outline: none; border-color: #00d4ff; }
```

### 4.17 Grid Layouts

Auto-fit column grids for card sections:

| Class | Min column | Columns |
|---|---|---|
| `.grid-2col` | `280px` | 2 (auto-fit) |
| `.grid-3col` | `220px` | 3 (auto-fit) |
| `.grid-4col` | `160px` | 4 (auto-fit) |

All use `gap: clamp(10px,1.5vw,24px)` and `margin-bottom: clamp(16px,2vw,30px)`.  
`.grid-4col` also has `padding-bottom: 20px; border-bottom: 1px solid #3a3a3a`.

### 4.18 Progress Bar

```css
.progress-bar  { width: 100%; height: 6px; background: #3a3a3a; border-radius: 3px; overflow: hidden; margin-top: 6px; }
.progress-fill { height: 100%; background: #00d4ff; }
.progress-fill.positive { background: #4ade80; }
```

### 4.19 Metric Values

Inline coloured value classes used throughout:

```css
.metric-positive { color: #4ade80; }
.metric-negative { color: #f87171; }
.metric-neutral  { color: #999; }
```

---

## 5.0 Interaction States

| State | Pattern |
|---|---|
| Hover (cards) | `border-color: #4a4a4a` |
| Active (cards, items) | `border-color: #00d4ff` |
| Active (tab) | cyan dim bg + cyan text + cyan border |
| Hover (header) | `background: #2c2c2c` |
| Hover (icon btn) | `color: #e0e0e0`, faint white bg |
| Row collapsed | `.collapsed` → chevron rotates -90°, body `display:none` |
| Row minimised | `.minimized` → body `visibility:hidden` |
| Row focused | `.focused` → `flex: 3` |
| Input focus | `border-color: #00d4ff`, no outline |
| Inline editor open | `.expanded` on parent row, `hidden` removed from editor |

---

## 6.0 Scrollbars

```css
::-webkit-scrollbar       { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #4a4a4a; }
```

---

## 7.0 Utility

```css
.hidden { display: none !important; }
```

Used with JS to toggle panel visibility (e.g. `view-panel` elements for tab switching).

---

## 8.0 Responsive Breakpoints

| Breakpoint | Behaviour |
|---|---|
| `≤640px` | Sidebar becomes fixed overlay; `body` scrolls (`overflow: auto`) |
| `≤1023px` | Middle row panels stack vertically |

