# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run tauri dev      # Launch Tauri app with hot-reload (Vite + Cargo)
npm run dev            # Vite dev server only (http://localhost:1420)
npm run build          # TypeScript check + Vite production build
npm run tauri build    # Full Tauri production build (.msi/.exe)
```

Rust commands run via `cargo` in `src-tauri/`:
```bash
cd src-tauri && cargo check     # Fast Rust compilation check
cd src-tauri && cargo build     # Debug build
cd src-tauri && cargo test      # Run Rust tests (none yet)
```

Frontend type checking:
```bash
npx tsc --noEmit        # TypeScript check without emitting
```

## Architecture

### Stack
- **Frontend**: React 18 + TypeScript + Vite 6 + Tailwind CSS 3.4
- **Backend**: Rust with Tauri 2 (desktop shell) + reqwest 0.12 (HTTP client)
- **Desktop**: Tauri v2 (WebView2 on Windows)

### Data Flow: Frontend → Rust → HTTP

```
React UI  ──invoke("send_request")──▶  Tauri Command  ──reqwest──▶  Target API
              (IPC via @tauri-apps/api/core)    (Rust in src-tauri/src/lib.rs)
                                                     │
Response JSON ◀─────── ResponseData ──────────────────┘
```

All HTTP requests execute in the Rust backend via Tauri commands, which avoids CORS restrictions. The frontend never calls `fetch()` directly — it uses `invoke()` from `@tauri-apps/api/core` to call the `send_request` Rust function.

### Key Structures

- **`src/hooks/usePulse.ts`** — Single hook owning all app state (request params, response, history, collections). Every component receives state+setters via props from `App.tsx`. No context/Redux — props drilling is intentional for this scale.
- **`src/types/index.ts`** — Mirrors Rust structs exactly (`HeaderInput`, `ResponseData`, `TimingInfo`). Keep in sync with `src-tauri/src/lib.rs` when changing types.
- **`tailwind.config.ts`** — Custom `pulse-*` color tokens (deep indigo/navy palette with amber/gold accent). Also defines `method-*` colors per HTTP verb.
- **`src-tauri/src/lib.rs`** — Single `send_request` Tauri command. Accepts `RequestInput`, returns `ResponseData` via IPC. Timing is estimated (reqwest doesn't expose per-step timing natively).

### Component Tree

```
App
├── Sidebar          — Collections list + History (tabs)
├── RequestPanel     — URL bar + method selector + Send button + Headers/Body tabs
└── ResponsePanel    — Status bar + WaterfallChart + Body/Headers tabs
```

### Design System (Tailwind Classes)

Use the custom `pulse-*` color classes everywhere instead of hardcoded colors:
- `bg-pulse-deepest`, `bg-pulse-surface`, `bg-pulse-elevated` — background hierarchy
- `text-pulse-text-primary/secondary/muted` — text hierarchy  
- `border-pulse-border` — all borders
- `bg-pulse-accent` / `text-pulse-accent` — amber/gold accent
- `text-method-get/post/put/patch/delete` — HTTP method colors

Convenience component classes in `src/index.css`: `.panel`, `.btn-primary`, `.btn-ghost`, `.input-field`, `.badge`, `.method-badge`.

### Known Limitations

- `#[tauri::command]` functions must NOT be `pub` (Rust 2021 macro namespace conflict with Tauri v2)
- Timing waterfall phases (DNS/TCP/TLS) are estimated as percentages of TTFB, not measured — reqwest lacks per-step timing hooks
- Icons are pre-generated via sharp in `src-tauri/icons/`; regenerate with `node -e "require('sharp')..."` if the SVG changes
