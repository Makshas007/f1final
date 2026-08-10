import logging
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import ai_service  # noqa: E402
import presets as presets_mod  # noqa: E402
from models import (  # noqa: E402
    RerouteRequest,
    RerouteSuggestion,
    SimulateRequest,
    SimulationResult,
    VenueLayout,
)
from simulation import run_simulation  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Crowd Flow Optimiser API", version="1.0")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"message": "Crowd Flow Optimiser API"}


@api.get("/health")
async def health():
    return {
        "status": "ok",
        "hf_configured": bool(ai_service.HF_TOKEN),
        "hf_model": ai_service.HF_MODEL,
    }


@api.get("/presets")
async def list_presets():
    return presets_mod.list_presets()


@api.get("/presets/{preset_id}")
async def get_preset(preset_id: str):
    if preset_id not in presets_mod.PRESETS:
        raise HTTPException(status_code=404, detail="Preset not found")
    layout = presets_mod.get_layout(preset_id)
    return {
        "layout": layout.model_dump(),
        "default_params": presets_mod.PRESETS[preset_id]["default_params"],
    }


@api.post("/venues")
async def upload_venue(layout: VenueLayout):
    venue_id = f"custom_{uuid.uuid4().hex[:8]}"
    layout.id = venue_id
    try:
        from simulation import build_graph, resolve_endpoints

        build_graph(layout)
        resolve_endpoints(layout)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    doc = layout.model_dump()
    doc["_id"] = venue_id
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.venues.replace_one({"_id": venue_id}, doc, upsert=True)
    return {"venue_id": venue_id, "layout": layout.model_dump()}


@api.get("/venues/{venue_id}")
async def get_venue(venue_id: str):
    layout = await _load_layout(venue_id)
    return layout.model_dump()


async def _load_layout(venue_id: str) -> VenueLayout:
    if venue_id in presets_mod.PRESETS:
        return presets_mod.get_layout(venue_id)
    doc = await db.venues.find_one({"_id": venue_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Venue not found")
    doc.pop("_id", None)
    doc.pop("created_at", None)
    doc["id"] = venue_id
    return VenueLayout(**doc)


@api.post("/simulate", response_model=SimulationResult)
async def simulate(request: SimulateRequest):
    layout = await _load_layout(request.venue_id)
    started = time.perf_counter()
    try:
        result = run_simulation(layout, request.params)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    elapsed = time.perf_counter() - started
    logger.info(
        "Simulation %s on %s took %.3fs", result.simulation_id, layout.id, elapsed
    )
    doc = result.model_dump()
    doc["_id"] = result.simulation_id
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["runtime_seconds"] = round(elapsed, 3)
    await db.simulations.replace_one({"_id": result.simulation_id}, doc, upsert=True)
    return result


@api.get("/simulations/{simulation_id}", response_model=SimulationResult)
async def get_simulation(simulation_id: str):
    doc = await db.simulations.find_one({"_id": simulation_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Simulation not found")
    doc.pop("created_at", None)
    doc.pop("runtime_seconds", None)
    return SimulationResult(**doc)


@api.post("/reroute-suggestions")
async def reroute_suggestions(request: RerouteRequest):
    doc = await db.simulations.find_one({"_id": request.simulation_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Simulation not found")
    result = SimulationResult(
        **{k: v for k, v in doc.items() if k not in ("created_at", "runtime_seconds")}
    )
    if request.step < 0 or request.step >= len(result.steps):
        raise HTTPException(status_code=422, detail="Step out of range")
    step = result.steps[request.step]
    if not step.bottlenecks:
        return {
            "step": request.step,
            "time_label": step.time_label,
            "suggestions": [],
            "message": "No congestion detected at this time step.",
        }
    started = time.perf_counter()
    suggestions: List[RerouteSuggestion] = await ai_service.batch_generate(
        step.bottlenecks, step.time_label, result.venue_name
    )
    logger.info(
        "Generated %d suggestions in %.2fs", len(suggestions), time.perf_counter() - started
    )
    return {
        "step": request.step,
        "time_label": step.time_label,
        "suggestions": [s.model_dump() for s in suggestions],
    }


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    import asyncio

    asyncio.create_task(ai_service.warmup())


@app.on_event("shutdown")
async def shutdown():
    client.close()
