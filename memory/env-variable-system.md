---
name: env-variable-system
description: Environment variable system implementation details — multi-env with Rust-side substitution
metadata:
  type: project
---

Environment variable system added with these design choices:

- **Multi-environment**: Multiple named environments (e.g. Development/Staging/Production) each with their own variable set
- **Rust-side substitution**: `{{variable}}` interpolation happens in `send_request` Rust command via `substitute_variables()` before the reqwest call. Applied to URL, header values, body, and content_type
- **Persistence**: Stored as `environments.json` in Tauri's `app_data_dir` via Rust file I/O (`load_environments`/`save_environments` commands)
- **UI**: Sidebar third "Envs" tab with `EnvironmentPanel` — environment list (radio for active, inline rename, delete) + per-environment variable editor (key/value/enabled table). Switching only via sidebar, no URL bar dropdown
- **Data types**: `Environment`/{id, name, variables}, `EnvironmentVariable`/{key, value, enabled}, `EnvironmentData`/{environments, active_id} — mirrored in both Rust and TypeScript

**Why:** Postman-like workflow where you can define `{{base_url}}` etc. and switch between envs without editing URLs manually. Rust-side substitution means the resolved values never leave the backend.

**How to apply:** When adding new request fields that should support variable substitution, add the `substitute_variables()` call in the Rust `send_request` function. If adding new fields to `EnvironmentVariable`, update both Rust struct (lib.rs) and TypeScript interface (types/index.ts).
