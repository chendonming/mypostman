# Pulse

> A modern, high-performance HTTP client for API testing and debugging — built with Tauri, Rust, and React.

Pulse is a cross-platform desktop application for crafting HTTP requests, inspecting responses, and organizing API workflows. It combines the speed and safety of a Rust backend with a responsive React frontend, delivering a native experience without Electron's overhead.

---

## Features

### Request Composition

- **7 HTTP methods** — GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **URL parameters** — key/value editor with per-parameter toggle
- **Headers** — enable/disable individual headers on the fly
- **Body editor** — raw body with content-type selection (JSON, form-urlencoded, plain text, XML, HTML)
- **Authentication** — Bearer token support, with collection-level "inherit" mode for shared credentials
- **cURL import** — paste a cURL command directly into the URL bar

### Response Inspection

- **Status & timing** — response code, duration, and size at a glance
- **Response body** — raw body viewer
- **Response headers** — full header breakdown
- **Timing waterfall** — visualize DNS lookup, TCP connection, TLS handshake, TTFB, and download phases

### Collections

- Organize requests into named collections
- Add, rename, and delete requests within collections
- Collection-level bearer token inheritance — set a token once on the collection, all child requests inherit it automatically
- Persistent local storage via the Rust backend

### Environment Variables

- Create and switch between named environments (development, staging, production, …)
- Define `{{variable}}` placeholders that are substituted into URLs, headers, and body fields before sending
- Per-variable enable/disable toggle for granular control
- Variables are substituted in the Rust backend — no JavaScript interpolation

### Request History

- Every request is automatically logged with method, URL, status, timing, size, and timestamp
- Full request/response capture including headers and body (truncated at 10 KB for performance)
- Real-time log viewer window with search and filtering
- Tail-click to replay any historical request
- Up to 2,000 entries kept in-memory, persisted per session

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  React UI                       │
│  (Vite + TypeScript + Tailwind CSS 3.4)         │
│                                                 │
│  invoke("send_request", payload)                │
│         │                                       │
│         ▼                                       │
│  ┌──────────────────────────────────────────┐   │
│  │           Tauri IPC (WebView2)           │   │
│  └──────────────────────────────────────────┘   │
│         │                                       │
├─────────┼─────────────────────────────────────────┤
│         ▼                                       │
│  ┌──────────────────────────────────────────┐   │
│  │        Rust Backend (src-tauri/)         │   │
│  │                                          │   │
│  │  • send_request — HTTP via reqwest       │   │
│  │  • {{variable}} substitution engine      │   │
│  │  • Collection & environment persistence  │   │
│  │  • Log store with Tauri event emission   │   │
│  └──────────────────────────────────────────┘   │
│         │                                       │
│         ▼                                       │
│  ┌──────────────────────────────────────────┐   │
│  │      Target API (external HTTP server)   │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

All HTTP requests execute in the Rust backend via Tauri commands, which avoids CORS restrictions. The frontend never calls `fetch()` directly — it uses `invoke()` from `@tauri-apps/api/core` to call the `send_request` Rust function.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop Shell** | [Tauri v2](https://v2.tauri.app/) (WebView2 on Windows) |
| **Frontend** | React 18 + TypeScript + Vite 6 |
| **Styling** | Tailwind CSS 3.4 with custom `pulse-*` design tokens |
| **Backend** | Rust with [reqwest](https://docs.rs/reqwest/) 0.12 |
| **IPC** | `@tauri-apps/api` (invoke / event system) |
| **Persistence** | JSON files in the OS app data directory |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) (WebView2 on Windows)

### Development

```bash
# Install frontend dependencies
npm install

# Launch the app in development mode (Vite HMR + Tauri window)
npm run tauri dev

# Vite dev server only (browser-based UI development)
npm run dev        # → http://localhost:1420
```

### Build

```bash
# TypeScript check
npx tsc --noEmit

# Production build
npm run build                # Frontend only
npm run tauri build           # Full Tauri desktop build (.msi/.exe)
```

### Rust Commands

```bash
cd src-tauri
cargo check        # Fast compilation check
cargo build        # Debug build
cargo test         # Run Rust tests
```

---

## Project Structure

```
pulse/
├── src/                          # React frontend
│   ├── App.tsx                   # Root component — state wiring
│   ├── main.tsx                  # React entry point
│   ├── LogViewer.tsx             # Real-time request log window
│   ├── hooks/
│   │   └── usePulse.ts           # Single hook owning all application state
│   ├── types/
│   │   └── index.ts              # TypeScript interfaces (mirrors Rust structs)
│   └── components/
│       ├── RequestPanel.tsx      # URL bar, method selector, tabs (auth/params/headers/body)
│       ├── ResponsePanel.tsx     # Response display (status, body, headers)
│       ├── WaterfallChart.tsx    # Timing waterfall visualization
│       ├── Sidebar.tsx           # Collections list, history, environment management
│       ├── AuthPanel.tsx         # Authentication configuration
│       └── EnvironmentPanel.tsx  # Environment variable editor
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   └── lib.rs                # Tauri commands, request execution, persistence
│   ├── tauri.conf.json           # Tauri application configuration
│   └── Cargo.toml                # Rust dependencies
├── tailwind.config.ts            # Custom color tokens and design system
├── package.json
└── vite.config.ts
```

---

## Design System

Pulse uses a custom dark-themed palette defined via Tailwind CSS. All UI components use the `pulse-*` token classes:

| Token | Purpose |
|-------|---------|
| `bg-pulse-deepest` | Primary background (level 0) |
| `bg-pulse-surface` | Elevated surface (level 1) |
| `bg-pulse-elevated` | Popover / modal surface (level 2) |
| `text-pulse-text-primary` | Primary text |
| `text-pulse-text-secondary` | Secondary / subdued text |
| `text-pulse-text-muted` | Muted / placeholder text |
| `border-pulse-border` | Borders and dividers |
| `bg-pulse-accent` / `text-pulse-accent` | Amber/gold accent |
| `text-method-{get,post,put,patch,delete}` | Per-HTTP-method semantic colors |

---

## Known Limitations

- **Timing waterfall**: DNS lookup, TCP connection, and TLS handshake phases are estimated as percentages of TTFB — reqwest does not expose per-step timing hooks natively.
- **Body truncation**: Request/response bodies over 10 KB are truncated in the history log to manage memory usage. Full content is always visible in the response panel.
- **Single-window UI**: The current release uses a single main window plus a dedicated log viewer window. A multi-tab interface is planned.

---

## License

[MIT](LICENSE)
