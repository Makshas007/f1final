# Crowd Flow Optimiser — PRD & Build Log

## Original Problem Statement
Build **Crowd Flow Optimiser (CFO)**: a real-time, AI-assisted crowd simulation and rerouting
system for venue operators (stadiums, metro stations, festival grounds). Ingest a venue layout
graph + expected attendance, simulate people flow over discrete time steps, flag emerging
bottlenecks, compute alternate routes, and present plain-language rerouting recommendations
(Hugging Face) on an interactive, colour-coded venue map with a time scrubber.

**User choices (confirmed):** Hugging Face Inference API; three preset venues; dark control-room
theme (deep navy + glassmorphism).

## Architecture
- **Frontend:** React 19 + **TypeScript** (CRA + craco) + Tailwind + zustand + sonner.
  Full-bleed HTML5 Canvas map rendered via `requestAnimationFrame` with d3-zoom pan/zoom.
- **Backend:** FastAPI (`/api` prefix, **lifespan** context manager) + NetworkX macroscopic
  flow engine + MongoDB (venues, simulations).
- **AI layer:** `huggingface_hub.AsyncInferenceClient` → `Qwen/Qwen2.5-7B-Instruct`
  (fallback `google/gemma-2-2b-it`, then rule-based templates).

### Key files
| File | Role |
|---|---|
| `backend/server.py` | REST API + Mongo persistence + lifespan warmup |
| `backend/simulation.py` | Graph build, arrival curves, flow engine, congestion classification |
| `backend/presets.py` | 3 hand-tuned demo venues |
| `backend/ai_service.py` | HF chat completion + timeout/fallback templates |
| `frontend/src/types.ts` | Shared domain types mirroring backend schema |
| `frontend/src/store/simStore.ts` | Zustand store (+devtools) |
| `frontend/src/services/api.ts` | Typed axios client with retry/backoff |
| `frontend/src/utils/canvasRenderer.ts` | Canvas heatmap/nodes/edges + pan-zoom transform |
| `frontend/src/utils/report.ts` | PDF (jspdf) + CSV export |
| `frontend/src/utils/urlState.ts` | Shareable-link URL state |
| `frontend/src/hooks/useKeyboardShortcuts.ts` | Space/Arrow/Escape controls |
| `frontend/src/components/*` | VenueCanvas, TacticalHeader, ControlPanel, TimeScrubber, ColorLegend, ErrorBoundary, Skeleton |

### API
`GET /api/health` · `GET /api/presets` · `GET /api/presets/{id}` · `POST /api/venues` ·
`GET /api/venues/{id}` · `POST /api/simulate` · `GET /api/simulations/{id}` ·
`POST /api/reroute-suggestions`

## De-vibecoding refactor (2026-06)
- ✅ **Full JS → TypeScript conversion** of the frontend (strict mode, `tsc --noEmit` clean).
- ✅ Removed ~40 unused shadcn/ui components, dead files (App.css, use-toast, empty dirs),
  and ~30 unused npm deps (next-themes, swr, date-fns/dayjs, recharts, framer-motion, lodash,
  react-router, react-hook-form/zod, most radix packages, cra-template).
- ✅ Trimmed `backend/requirements.txt` to direct deps only; cleaned `pytest.ini` comments.
- ✅ Backend startup migrated to `lifespan` context manager; env guard for MONGO_URL/DB_NAME.
- ✅ Cleaned `craco.config.js` (removed visual-edits + health-check), added README + `.env.example`.
- ✅ Removed root fingerprint files: `test_result.md`, `test_reports/` (regenerated), `.ruff_cache`,
  `.gitconfig`, `design_guidelines.json`, empty `tests/`, `jsconfig.json`.
- ⚠️ **KEPT `.emergent/` and `memory/`** — deleting them breaks this platform (forking/commits/
  preview). Delete them from the GitHub export instead (see below).

## New features (2026-06)
- ✅ **Export incident briefing (PDF)** + **per-step CSV timeline** (jspdf, zero-server).
- ✅ **Keyboard shortcuts:** Space play/pause, ←/→ step, Esc close panel.
- ✅ **URL state persistence** — venue + scenario encoded in query string, restored on reload.
- ✅ **Loading skeletons** for preset list and AI suggestions.
- ✅ **Pan & zoom** on the canvas map via d3-zoom (+/−/reset buttons + wheel/drag).
- ✅ API retry/backoff interceptors; React `ErrorBoundary`; FPS-friendly render (skips when tab hidden).

## Status
- ✅ Tested: **24/24 backend pytest**, all 5 new frontend features, zero console errors
  (`/app/test_reports/iteration_1.json`). Simulation < 5s; HF AI live (source='ai').

## GitHub export checklist (for a "handcrafted" repo)
After **Save to GitHub**, delete these from the repo (they cannot be removed inside Emergent):
1. `.emergent/`  2. `memory/`  3. `.git` platform metadata is fine to keep.
Optionally set `@types/*` into devDependencies in `frontend/package.json`.

## Backlog
**P1** — pre-generate suggestions for all bottleneck steps in one batched HF call; in-app
drag-and-drop layout builder; minimap for the zoomed canvas.
**P2** — vision-based crowd density from uploaded photos; predictive arrival modelling;
agent-based micro-simulation; multi-venue accounts + persistence; live turnstile ingestion.
