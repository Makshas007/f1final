"""Unit tests for the AI service (offline paths, no network required)."""
import asyncio

import ai_service
from models import BottleneckInfo, CongestionStatus


def _bottleneck(status=CongestionStatus.CRITICAL, density=105):
    return BottleneckInfo(
        element_id="G1",
        element_type="gate",
        location_name="Turnstile Bank North",
        current_density=density,
        status=status,
        expected_clearance_mins=6,
        alternatives=["Concourse B", "Exit Plaza 2"],
    )


class TestFallbackText:
    def test_critical_template(self):
        text = ai_service.fallback_text(_bottleneck(), "22:20")
        assert "Turnstile Bank North" in text
        assert "critical" in text.lower()
        assert "22:20" in text

    def test_warning_template(self):
        text = ai_service.fallback_text(
            _bottleneck(status=CongestionStatus.WARNING, density=82), "22:20"
        )
        assert "approaching capacity" in text.lower()


class TestRuleRisk:
    def test_stampede_when_over_capacity(self):
        assert ai_service.rule_risk(_bottleneck(density=110)) == "stampede_risk"

    def test_flow_disruption_when_critical_under_100(self):
        assert ai_service.rule_risk(_bottleneck(density=95)) == "flow_disruption"

    def test_minor_delay_when_warning(self):
        assert (
            ai_service.rule_risk(_bottleneck(status=CongestionStatus.WARNING, density=80))
            == "minor_delay"
        )


class TestParseJson:
    def test_parses_plain_json(self):
        data = ai_service._parse_json('{"action": "divert", "priority": "immediate"}')
        assert data["action"] == "divert"

    def test_strips_code_fences(self):
        raw = '```json\n{"action": "hold"}\n```'
        assert ai_service._parse_json(raw)["action"] == "hold"

    def test_extracts_embedded_object(self):
        raw = 'Here you go: {"action": "monitor"} thanks'
        assert ai_service._parse_json(raw)["action"] == "monitor"

    def test_returns_none_on_garbage(self):
        assert ai_service._parse_json("not json at all") is None


class TestOfflineGeneration:
    def test_generate_recommendation_falls_back_without_token(self, monkeypatch):
        monkeypatch.setattr(ai_service, "HF_TOKEN", None)
        s = asyncio.run(
            ai_service.generate_recommendation(_bottleneck(), "22:20", "Stadium")
        )
        assert s.source == "fallback"
        assert s.generated_text.strip() != ""
        assert s.ai_risk == "stampede_risk"
        assert s.ai_risk_source == "rule"

    def test_batch_generate_respects_limit_and_fills_rest(self, monkeypatch):
        monkeypatch.setattr(ai_service, "HF_TOKEN", None)
        bottlenecks = [_bottleneck() for _ in range(8)]
        out = asyncio.run(
            ai_service.batch_generate(bottlenecks, "22:20", "Stadium", limit=5)
        )
        assert len(out) == 8
        assert all(o.source == "fallback" for o in out)
        assert all(o.ai_risk is not None for o in out)
