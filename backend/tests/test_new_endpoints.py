"""Integration tests for the new endpoints/fields added in this iteration:
- POST /api/simulate-whatif
- POST /api/reroute-suggestions structured AI fields (1A) + risk classifier (1B)
- POST /api/simulate with params.seed (4C)
"""
import os
import time

import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "User-Agent": "cfo-tests/1.0 (python-requests)",
    })
    return session


@pytest.fixture(scope="module")
def stadium_baseline(api_client):
    """Run a baseline stadium egress simulation once, share across tests."""
    payload = {"venue_id": "stadium_egress"}
    r = api_client.post(f"{BASE_URL}/api/simulate", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- Track 2: What-If endpoint ----------------

class TestSimulateWhatIf:
    def test_close_turnstile_returns_valid_result(self, api_client, stadium_baseline):
        payload = {
            "venue_id": "stadium_egress",
            "params": {
                "total_people": stadium_baseline["params"]["total_people"],
                "duration_steps": 50,
                "arrival_curve": stadium_baseline["params"]["arrival_curve"],
                "event_start_time": stadium_baseline["params"]["event_start_time"],
                "seed": 7,
            },
            "overrides": [
                {"element_id": "T1", "override_type": "close", "value": 0}
            ],
        }
        r = api_client.post(f"{BASE_URL}/api/simulate-whatif", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["venue_id"] == "stadium_egress"
        assert data["total_steps"] == 50
        assert len(data["steps"]) == 50
        assert data["peak_utilization"] >= 0

    def test_closing_exit_never_lowers_peak(self, api_client):
        """Closing a turnstile bank should NOT reduce peak utilisation
        vs the same-parameter run without overrides."""
        params = {
            "total_people": 28000,
            "duration_steps": 50,
            "arrival_curve": "heavy",
            "event_start_time": "22:00",
            "seed": 7,
        }
        base = api_client.post(
            f"{BASE_URL}/api/simulate",
            json={"venue_id": "stadium_egress", "params": params},
            timeout=30,
        )
        assert base.status_code == 200
        base_peak = base.json()["peak_utilization"]

        wi = api_client.post(
            f"{BASE_URL}/api/simulate-whatif",
            json={
                "venue_id": "stadium_egress",
                "params": params,
                "overrides": [{"element_id": "T1", "override_type": "close", "value": 0}],
            },
            timeout=30,
        )
        assert wi.status_code == 200
        wi_peak = wi.json()["peak_utilization"]
        # allow tiny numerical noise
        assert wi_peak >= base_peak - 1e-3, (
            f"Closing T1 should not lower peak: base={base_peak} whatif={wi_peak}"
        )

    def test_invalid_venue_returns_404(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/simulate-whatif",
            json={"venue_id": "does_not_exist", "overrides": []},
            timeout=15,
        )
        assert r.status_code == 404

    def test_out_of_range_params_returns_422(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/simulate-whatif",
            json={
                "venue_id": "stadium_egress",
                "params": {"total_people": 5},  # below ge=100
                "overrides": [],
            },
            timeout=15,
        )
        assert r.status_code == 422


# ---------------- 4C: Seed reproducibility ----------------

class TestSeed:
    def test_same_seed_gives_identical_headline_metrics(self, api_client):
        payload = {
            "venue_id": "stadium_egress",
            "params": {
                "total_people": 28000,
                "duration_steps": 40,
                "arrival_curve": "heavy",
                "seed": 7,
            },
        }
        r1 = api_client.post(f"{BASE_URL}/api/simulate", json=payload, timeout=30)
        r2 = api_client.post(f"{BASE_URL}/api/simulate", json=payload, timeout=30)
        assert r1.status_code == 200 and r2.status_code == 200
        a, b = r1.json(), r2.json()
        assert a["peak_utilization"] == b["peak_utilization"]
        assert a["total_bottleneck_events"] == b["total_bottleneck_events"]

    def test_omitting_seed_still_works(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/simulate",
            json={"venue_id": "stadium_egress"},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["total_steps"] > 0


# ---------------- 1A + 1B: Structured AI + risk classifier ----------------

def _first_bottleneck_step(sim):
    for s in sim["steps"]:
        if s["bottlenecks"]:
            return s["step"]
    return None


def _first_critical_step(sim):
    for s in sim["steps"]:
        if any(b["status"] == "critical" for b in s["bottlenecks"]):
            return s["step"]
    return None


class TestStructuredAI:
    def test_suggestions_have_ai_fields_and_risk(self, api_client, stadium_baseline):
        step_idx = _first_bottleneck_step(stadium_baseline)
        assert step_idx is not None, "no bottleneck step in baseline"
        r = api_client.post(
            f"{BASE_URL}/api/reroute-suggestions",
            json={"simulation_id": stadium_baseline["simulation_id"], "step": step_idx},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["suggestions"]) > 0
        for sg in data["suggestions"]:
            # These keys must always be present on the response shape
            for key in (
                "ai_action", "ai_priority", "ai_affected_zones", "ai_impact",
                "ai_risk", "ai_risk_source", "generated_text", "source",
            ):
                assert key in sg, f"missing key {key} in suggestion"
            # Risk fields must be valid
            assert sg["ai_risk"] in {
                "stampede_risk", "flow_disruption", "minor_delay", "safe"
            }, f"invalid ai_risk={sg['ai_risk']}"
            assert sg["ai_risk_source"] in {"ai", "rule"}

    def test_critical_bottleneck_never_labelled_safe(self, api_client, stadium_baseline):
        """The downgrade guard must prevent AI labelling a critical bottleneck 'safe'."""
        step_idx = _first_critical_step(stadium_baseline)
        if step_idx is None:
            pytest.skip("no critical bottleneck in this baseline run")
        r = api_client.post(
            f"{BASE_URL}/api/reroute-suggestions",
            json={"simulation_id": stadium_baseline["simulation_id"], "step": step_idx},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        for sg in data["suggestions"]:
            if sg["bottleneck"]["status"] == "critical":
                assert sg["ai_risk"] != "safe", (
                    f"CRITICAL bottleneck downgraded to 'safe' "
                    f"(source={sg['ai_risk_source']}, id={sg['bottleneck']['element_id']})"
                )

    def test_when_hf_reachable_ai_action_is_valid(self, api_client, stadium_baseline):
        """When at least one suggestion is source='ai', its ai_action must be
        one of the enum values from the system prompt."""
        step_idx = _first_bottleneck_step(stadium_baseline)
        started = time.perf_counter()
        r = api_client.post(
            f"{BASE_URL}/api/reroute-suggestions",
            json={"simulation_id": stadium_baseline["simulation_id"], "step": step_idx},
            timeout=30,
        )
        elapsed = time.perf_counter() - started
        data = r.json()
        ai_ones = [s for s in data["suggestions"] if s["source"] == "ai"]
        if not ai_ones:
            pytest.skip(
                f"HF returned no 'ai' source; fallback path was exercised only. "
                f"elapsed={elapsed:.2f}s"
            )
        valid_actions = {"divert", "hold", "deploy_staff", "open_alternate", "monitor"}
        for sg in ai_ones:
            if sg.get("ai_action"):
                assert sg["ai_action"] in valid_actions, (
                    f"unexpected ai_action={sg['ai_action']}"
                )
        # Print evidence for the test report
        first_ai = ai_ones[0]
        print(
            f"\n[Structured AI] source=ai action={first_ai.get('ai_action')} "
            f"priority={first_ai.get('ai_priority')} risk={first_ai.get('ai_risk')} "
            f"risk_source={first_ai.get('ai_risk_source')} "
            f"zones={first_ai.get('ai_affected_zones')} "
            f"impact={first_ai.get('ai_impact')} "
            f"text={first_ai['generated_text'][:180]!r}"
        )
