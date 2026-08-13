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

## Judge-feedback upgrades (2026-06, iteration 3)
Targets the 72→90 rubric jump. All tested (`/app/test_reports/iteration_3.json`:
53 backend tests, 12/12 frontend assertions, 0 console errors).
- ✅ **1A Structured AI reasoning** — Qwen returns JSON (action / priority /
  affected_zones / estimated_impact), parsed and shown as coloured pills + impact line.
- ✅ **1B Second HF model** — `facebook/bart-large-mnli` zero-shot risk classifier
  produces an "AI risk" badge (stampede_risk / flow_disruption / minor_delay / safe),
  concurrent with text gen, with a rule fallback and a downgrade-guard (a critical
  bottleneck is never labelled "safe"). Both HF models confirmed live (source='ai').
- ✅ **Track 2 What-If mode** — `POST /api/simulate-whatif`; close a gate / −50% capacity
  → whole-sim re-solve (`apply_overrides`, deep-copied so the original is untouched) →
  delta card (peak load + risk events before→after); overridden elements highlighted
  blue on the canvas.
- ✅ **3B Sparkline** — crowd-over-time SVG in the header, coloured by LOS band.
- ✅ **4C Optional seed** — `SimulationParams.seed`; reproducible runs; UI input.
- ✅ **4A/4B Unit tests** — `tests/test_simulation.py`, `tests/test_ai_service.py`,
  `tests/conftest.py` (pure, no server); testing agent added `tests/test_new_endpoints.py`.
- ✅ **5A Research references** — Fruin LOS / NDMA comments in simulation & presets.
- ✅ **6A Docker Compose** — `docker-compose.yml` + backend/frontend Dockerfiles.
- ✅ Hover tooltips (3A) were already implemented in the TS rewrite.

### Deferred (not yet built)
Responsive mobile layout (3E), WebSocket streaming (4D), evacuation mode (7A),
ControlPanel refactor into sub-components (3D), sound alerts (7C).

## GitHub export checklist (for a "handcrafted" repo)
After **Save to GitHub**, delete these from the repo (they cannot be removed inside Emergent):
1. `.emergent/`  2. `memory/`  3. `.git` platform metadata is fine to keep.
Optionally set `@types/*` into devDependencies in `frontend/package.json`.

## Backlog
**P1** — pre-generate suggestions for all bottleneck steps in one batched HF call; in-app
drag-and-drop layout builder; minimap for the zoomed canvas.
**P2** — vision-based crowd density from uploaded photos; predictive arrival modelling;
agent-based micro-simulation; multi-venue accounts + persistence; live turnstile ingestion.
