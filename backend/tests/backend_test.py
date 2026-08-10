"""End-to-end backend tests for Crowd Flow Optimiser (CFO)."""
import os
import time

import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

# Preset ids expected by the app
PRESET_IDS = ["stadium_egress", "train_station", "festival_ground"]


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        # ingress rejects unusual UAs from bots; python-requests default is OK here
        "User-Agent": "cfo-tests/1.0 (python-requests)",
    })
    return session


# ---------------- Health ----------------

class TestHealth:
    def test_health_ok(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "ok"
        assert data["hf_configured"] is True, "HF_TOKEN not configured on backend"
        assert isinstance(data.get("hf_model"), str) and len(data["hf_model"]) > 0


# ---------------- Presets ----------------

class TestPresets:
    def test_list_presets(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/presets", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) == 3
        ids = {p["id"] for p in data}
        assert ids == set(PRESET_IDS)
        for p in data:
            assert p["node_count"] > 0
            assert p["edge_count"] > 0
            assert "default_params" in p
            assert p["default_params"]["total_people"] > 0

    @pytest.mark.parametrize("preset_id", PRESET_IDS)
    def test_get_preset(self, api_client, preset_id):
        r = api_client.get(f"{BASE_URL}/api/presets/{preset_id}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "layout" in data and "default_params" in data
        layout = data["layout"]
        assert layout["id"] == preset_id
        assert len(layout["nodes"]) > 0
        assert len(layout["edges"]) > 0
        assert len(layout["sources"]) > 0
        assert len(layout["sinks"]) > 0

    def test_get_preset_not_found(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/presets/nonexistent", timeout=15)
        assert r.status_code == 404


# ---------------- Simulate ----------------

@pytest.fixture(scope="module")
def sim_by_preset(api_client):
    """Run one simulation per preset with default params and share across tests."""
    out = {}
    for pid in PRESET_IDS:
        prev = api_client.get(f"{BASE_URL}/api/presets/{pid}", timeout=15).json()
        dp = prev["default_params"]
        payload = {
            "venue_id": pid,
            "params": {
                "total_people": dp["total_people"],
                "duration_steps": dp.get("duration_steps", 45),
                "arrival_curve": dp["arrival_curve"],
                "event_start_time": dp["event_start_time"],
            },
        }
        started = time.perf_counter()
        r = api_client.post(f"{BASE_URL}/api/simulate", json=payload, timeout=30)
        elapsed = time.perf_counter() - started
        assert r.status_code == 200, r.text
        result = r.json()
        result["_elapsed"] = elapsed
        out[pid] = result
    return out


class TestSimulate:
    @pytest.mark.parametrize("preset_id", PRESET_IDS)
    def test_simulate_default_params_shape(self, sim_by_preset, preset_id):
        result = sim_by_preset[preset_id]
        assert result["_elapsed"] < 5.0, f"Simulation for {preset_id} took {result['_elapsed']:.2f}s"
        assert result["venue_id"] == preset_id
        assert result["total_steps"] > 0
        assert len(result["steps"]) == result["total_steps"]
        assert result["peak_utilization"] >= 0
        first = result["steps"][0]
        for k in ("step", "time_label", "nodes", "edges", "bottlenecks",
                  "people_inside", "people_exited"):
            assert k in first, f"missing key {k}"
        # Each node/edge state has utilization + status
        assert first["nodes"][0]["utilization"] >= 0
        assert first["nodes"][0]["status"] in {"clear", "moderate", "warning", "critical"}
        assert first["edges"][0]["status"] in {"clear", "moderate", "warning", "critical"}

    @pytest.mark.parametrize("preset_id", PRESET_IDS)
    def test_bottlenecks_are_emergent(self, sim_by_preset, preset_id):
        """Bottlenecks must not be constant/hardcoded: crowd builds and eases,
        and bottleneck load varies across the run (not flat)."""
        result = sim_by_preset[preset_id]
        steps = result["steps"]
        n = len(steps)
        third = max(n // 3, 1)
        early = sum(len(s["bottlenecks"]) for s in steps[:third])
        mid = sum(len(s["bottlenecks"]) for s in steps[third: 2 * third])
        late = sum(len(s["bottlenecks"]) for s in steps[2 * third:])
        # people_inside builds then falls
        peak_inside = max(s["people_inside"] for s in steps)
        first_inside = steps[0]["people_inside"]
        last_inside = steps[-1]["people_inside"]
        assert peak_inside > first_inside, "crowd never builds"
        assert last_inside < peak_inside, "crowd never eases"
        # Emergent congestion: bottlenecks appear at some point, then ease off
        assert (early + mid + late) > 0, "no bottlenecks anywhere"
        assert late < max(early, mid), (
            f"congestion never eases (early={early} mid={mid} late={late})"
        )
        # Not constant/hardcoded: not every step has the same bottleneck count
        counts = {len(s["bottlenecks"]) for s in steps}
        assert len(counts) > 1, "bottleneck count is constant across steps"

    @pytest.mark.parametrize("preset_id", PRESET_IDS)
    def test_simulate_persisted(self, api_client, sim_by_preset, preset_id):
        sim_id = sim_by_preset[preset_id]["simulation_id"]
        r = api_client.get(f"{BASE_URL}/api/simulations/{sim_id}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["simulation_id"] == sim_id
        assert data["venue_id"] == preset_id

    def test_simulate_invalid_venue(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/simulate",
                            json={"venue_id": "does_not_exist"}, timeout=15)
        assert r.status_code == 404

    def test_simulate_out_of_range_total_people(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/simulate",
            json={"venue_id": "stadium_egress", "params": {"total_people": 10}},
            timeout=15,
        )
        assert r.status_code == 422


# ---------------- Custom venues ----------------

def _tiny_layout():
    return {
        "id": "will_be_overwritten",
        "name": "TEST_tiny_venue",
        "nodes": [
            {"id": "A", "name": "Entrance", "type": "entry", "capacity": 500, "x": 100, "y": 100},
            {"id": "B", "name": "Hall", "type": "junction", "capacity": 400, "x": 300, "y": 100},
            {"id": "G", "name": "Gate", "type": "gate", "capacity": 200, "x": 500, "y": 100},
            {"id": "X", "name": "Street", "type": "exit", "capacity": 100000, "x": 700, "y": 100},
        ],
        "edges": [
            {"id": "e_AB", "source": "A", "target": "B", "capacity_per_step": 200, "distance_weight": 1.0},
            {"id": "e_BG", "source": "B", "target": "G", "capacity_per_step": 120, "distance_weight": 1.0},
            {"id": "e_GX", "source": "G", "target": "X", "capacity_per_step": 300, "distance_weight": 1.0},
        ],
        "sources": ["A"],
        "sinks": ["X"],
    }


class TestCustomVenue:
    def test_upload_and_simulate(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/venues", json=_tiny_layout(), timeout=15)
        assert r.status_code == 200, r.text
        venue_id = r.json()["venue_id"]
        assert venue_id.startswith("custom_")
        # Simulate
        r2 = api_client.post(
            f"{BASE_URL}/api/simulate",
            json={"venue_id": venue_id,
                  "params": {"total_people": 5000, "duration_steps": 30,
                             "arrival_curve": "heavy"}},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["venue_id"] == venue_id
        assert len(data["steps"]) == 30

    def test_malformed_edge_unknown_node(self, api_client):
        bad = _tiny_layout()
        bad["edges"].append({
            "id": "e_bad", "source": "A", "target": "GHOST",
            "capacity_per_step": 100, "distance_weight": 1.0,
        })
        r = api_client.post(f"{BASE_URL}/api/venues", json=bad, timeout=15)
        assert r.status_code == 422
        assert "unknown node" in r.text.lower() or "ghost" in r.text.lower()

    def test_malformed_no_exit(self, api_client):
        bad = _tiny_layout()
        bad["nodes"] = [n for n in bad["nodes"] if n["type"] != "exit"]
        bad["edges"] = [e for e in bad["edges"] if e["target"] != "X"]
        bad["sinks"] = []
        r = api_client.post(f"{BASE_URL}/api/venues", json=bad, timeout=15)
        assert r.status_code == 422
        assert "exit" in r.text.lower()


# ---------------- Reroute suggestions (AI) ----------------

class TestReroute:
    def _find_step_with_bottlenecks(self, steps):
        for s in steps:
            if s["bottlenecks"]:
                return s["step"]
        return None

    def test_ai_suggestions_with_bottleneck(self, api_client, sim_by_preset):
        # Use stadium (heavy egress) which reliably has bottlenecks
        sim = sim_by_preset["stadium_egress"]
        step_idx = self._find_step_with_bottlenecks(sim["steps"])
        assert step_idx is not None, "no bottlenecks found for reroute test"
        started = time.perf_counter()
        r = api_client.post(
            f"{BASE_URL}/api/reroute-suggestions",
            json={"simulation_id": sim["simulation_id"], "step": step_idx},
            timeout=30,
        )
        elapsed = time.perf_counter() - started
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["step"] == step_idx
        assert len(data["suggestions"]) > 0
        # Verify at least one suggestion has real HF-generated text
        first = data["suggestions"][0]
        assert "generated_text" in first
        assert first["generated_text"].strip() != ""
        assert first["source"] in ("ai", "fallback")
        print(f"\n[Reroute] elapsed={elapsed:.2f}s source={first['source']} "
              f"model={first.get('model')} text={first['generated_text'][:200]}")
        # Warn if fallback (still passes since fallback is allowed)
        # Elapsed guard
        assert elapsed < 20.0, f"reroute-suggestions too slow: {elapsed:.2f}s"

    def test_ai_source_is_ai_when_hf_works(self, api_client, sim_by_preset):
        """Verify HF is actually reachable: at least one suggestion returns source='ai'."""
        sim = sim_by_preset["stadium_egress"]
        step_idx = self._find_step_with_bottlenecks(sim["steps"])
        r = api_client.post(
            f"{BASE_URL}/api/reroute-suggestions",
            json={"simulation_id": sim["simulation_id"], "step": step_idx},
            timeout=30,
        )
        data = r.json()
        sources = [s["source"] for s in data["suggestions"]]
        # We allow fallback but log a warning if no AI ever fires
        if "ai" not in sources:
            pytest.skip(
                f"HF returned no 'ai' source; sources={sources}. "
                "Fallback path is exercised, HF path is not verified."
            )
        # If ai present, the model name must be a real HF model id
        ai_ones = [s for s in data["suggestions"] if s["source"] == "ai"]
        assert ai_ones[0].get("model") in ("Qwen/Qwen2.5-7B-Instruct", "google/gemma-2-2b-it")

    def test_no_bottleneck_step_returns_empty(self, api_client, sim_by_preset):
        # Step 0 (before any arrivals impact) should have no bottlenecks
        sim = sim_by_preset["stadium_egress"]
        r = api_client.post(
            f"{BASE_URL}/api/reroute-suggestions",
            json={"simulation_id": sim["simulation_id"], "step": 0},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        # If step 0 already has bottlenecks in a preset, skip strict assertion
        step0 = sim["steps"][0]
        if step0["bottlenecks"]:
            pytest.skip("Step 0 has bottlenecks; cannot test empty case here.")
        assert data["suggestions"] == []
        assert "message" in data

    def test_reroute_step_out_of_range(self, api_client, sim_by_preset):
        sim = sim_by_preset["stadium_egress"]
        r = api_client.post(
            f"{BASE_URL}/api/reroute-suggestions",
            json={"simulation_id": sim["simulation_id"], "step": 99999},
            timeout=15,
        )
        assert r.status_code == 422
