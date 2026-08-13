"""Hugging Face powered crowd-management intelligence.

Two distinct HF models do real analytical work here:
  1. An instruction model (Qwen) returns STRUCTURED JSON reasoning about each
     bottleneck (action, priority, affected zones, expected impact).
  2. A zero-shot classifier (BART-MNLI) independently triages the operational
     risk category. Both degrade gracefully to deterministic logic offline.
"""
import asyncio
import json
import logging
import os
from typing import List, Optional, Tuple

from huggingface_hub import AsyncInferenceClient
from models import BottleneckInfo, CongestionStatus, RerouteSuggestion

logger = logging.getLogger(__name__)

HF_TOKEN = os.environ.get("HF_TOKEN")
HF_MODEL = os.environ.get("HF_MODEL", "Qwen/Qwen2.5-7B-Instruct")
HF_FALLBACK_MODEL = os.environ.get("HF_FALLBACK_MODEL", "google/gemma-2-2b-it")
HF_RISK_MODEL = os.environ.get("HF_RISK_MODEL", "facebook/bart-large-mnli")
HF_TIMEOUT = float(os.environ.get("HF_TIMEOUT_SECONDS", "9"))

SYSTEM_PROMPT = (
    "You are an expert crowd-safety controller in the control room of a large live venue. "
    "You read structured JSON describing ONE crowd bottleneck and reply with ONLY a compact "
    "JSON object (no markdown, no prose, no code fences) with exactly these keys: "
    '"action" (one of: divert, hold, deploy_staff, open_alternate, monitor), '
    '"priority" (one of: immediate, soon, watch), '
    '"affected_zones" (array of 1-3 short place names drawn from the input), '
    '"recommendation" (ONE calm, concrete sentence telling operators what to do), '
    '"estimated_impact" (a short phrase, e.g. "cuts peak load ~15% within 4 min"). '
    "Use the provided alternatives. Return valid JSON only."
)

TEMPLATES = {
    "critical": (
        "{location} is at critical density ({density}% of capacity) at {time}. "
        "Hold new arrivals and divert flow immediately via {alt}; expected clearance {wait} min."
    ),
    "warning": (
        "{location} is approaching capacity ({density}%) at {time}. "
        "Pre-emptively route new arrivals via {alt} and post stewards before it tips critical."
    ),
    "moderate": (
        "{location} is moderately busy ({density}%) at {time}. "
        "Monitor closely; {alt} is available as relief route."
    ),
}

# Zero-shot candidate labels (human phrasing) -> internal risk codes.
RISK_LABELS = ["stampede risk", "flow disruption", "minor delay", "safe"]
_RISK_MAP = {
    "stampede risk": "stampede_risk",
    "flow disruption": "flow_disruption",
    "minor delay": "minor_delay",
    "safe": "safe",
}


def rule_risk(b: BottleneckInfo) -> str:
    """Deterministic risk triage used as the classifier's offline fallback."""
    if b.status == CongestionStatus.CRITICAL and b.current_density >= 100:
        return "stampede_risk"
    if b.status == CongestionStatus.CRITICAL:
        return "flow_disruption"
    if b.status == CongestionStatus.WARNING:
        return "minor_delay"
    return "safe"


_RISK_RANK = {"safe": 0, "minor_delay": 1, "flow_disruption": 2, "stampede_risk": 3}


def fallback_text(b: BottleneckInfo, time_label: str) -> str:
    tmpl = TEMPLATES.get(b.status.value, TEMPLATES["moderate"])
    return tmpl.format(
        location=b.location_name,
        density=b.current_density,
        time=time_label,
        alt=", ".join(b.alternatives[:2]) or "nearby routes",
        wait=b.expected_clearance_mins,
    )


def _parse_json(text: str) -> Optional[dict]:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if "\n" in text:
            text = text.split("\n", 1)[1]
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            data = json.loads(text[start : end + 1])
            return data if isinstance(data, dict) else None
        except (json.JSONDecodeError, ValueError):
            return None
    return None


def _norm(value: object) -> Optional[str]:
    if value is None:
        return None
    return str(value).strip().lower().replace(" ", "_") or None


def _client_for(model: str) -> AsyncInferenceClient:
    return AsyncInferenceClient(model=model, token=HF_TOKEN, timeout=HF_TIMEOUT)


async def _call_model(model: str, payload: dict) -> str:
    client = _client_for(model)
    try:
        result = await asyncio.wait_for(
            client.chat_completion(
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload)},
                ],
                max_tokens=180,
                temperature=0.3,
                top_p=0.9,
            ),
            timeout=HF_TIMEOUT + 2,
        )
        text = (result.choices[0].message.content or "").strip()
        if not text:
            raise RuntimeError("empty completion")
        return text
    finally:
        try:
            await client.close()
        except Exception:
            pass


async def classify_risk(b: BottleneckInfo) -> Tuple[str, str]:
    """Return (risk_code, source). Uses an HF zero-shot classifier when it is
    available and its verdict is plausible, otherwise a deterministic rule.
    Implausible AI downgrades (e.g. 'safe' for a critical crush) are rejected so
    the badge is never misleading."""
    rule = rule_risk(b)
    if HF_TOKEN:
        text = (
            f"{b.location_name} is at {b.current_density}% of its safe capacity "
            f"with an estimated {b.expected_clearance_mins} minute clearance time "
            f"during a crowd egress; describe the crowd-safety risk."
        )
        client = _client_for(HF_RISK_MODEL)
        try:
            res = await asyncio.wait_for(
                client.zero_shot_classification(
                    text,
                    candidate_labels=RISK_LABELS,
                    hypothesis_template="The crowd-safety risk is {}.",
                ),
                timeout=HF_TIMEOUT + 2,
            )
            if res:
                top = max(res, key=lambda r: r.score)
                ai_code = _RISK_MAP.get(top.label, rule)
                # Trust the model unless it drastically under-rates the danger.
                if _RISK_RANK.get(ai_code, 0) >= _RISK_RANK.get(rule, 0) - 1:
                    return ai_code, "ai"
        except Exception as exc:
            logger.info("HF risk classifier unavailable: %s", exc.__class__.__name__)
        finally:
            try:
                await client.close()
            except Exception:
                pass
    return rule, "rule"


async def _generate_text_suggestion(
    b: BottleneckInfo, time_label: str, venue_name: str
) -> RerouteSuggestion:
    payload = {
        "venue": venue_name,
        "location": b.location_name,
        "element_type": b.element_type,
        "time": time_label,
        "density_percent_of_capacity": b.current_density,
        "severity": b.status.value,
        "expected_clearance_mins": b.expected_clearance_mins,
        "alternatives": b.alternatives,
    }
    if HF_TOKEN:
        for model in (HF_MODEL, HF_FALLBACK_MODEL):
            try:
                raw = await _call_model(model, payload)
                data = _parse_json(raw)
                if data and data.get("recommendation"):
                    zones = data.get("affected_zones") or []
                    return RerouteSuggestion(
                        bottleneck=b,
                        generated_text=str(data["recommendation"]).strip().strip('"'),
                        source="ai",
                        model=model,
                        ai_action=_norm(data.get("action")),
                        ai_priority=_norm(data.get("priority")),
                        ai_affected_zones=[str(z) for z in zones][:3],
                        ai_impact=(str(data.get("estimated_impact")).strip() or None)
                        if data.get("estimated_impact")
                        else None,
                    )
                # Model replied but not as JSON: use the raw first line.
                return RerouteSuggestion(
                    bottleneck=b,
                    generated_text=raw.split("\n\n")[0].strip().strip('"'),
                    source="ai",
                    model=model,
                )
            except Exception as exc:
                logger.warning("HF model %s failed: %s", model, exc.__class__.__name__)
    return RerouteSuggestion(
        bottleneck=b,
        generated_text=fallback_text(b, time_label),
        source="fallback",
        model=None,
    )


async def generate_recommendation(
    b: BottleneckInfo, time_label: str, venue_name: str
) -> RerouteSuggestion:
    # Text reasoning and risk classification run concurrently (two HF models).
    risk_task = asyncio.create_task(classify_risk(b))
    suggestion = await _generate_text_suggestion(b, time_label, venue_name)
    risk_code, risk_source = await risk_task
    suggestion.ai_risk = risk_code
    suggestion.ai_risk_source = risk_source
    return suggestion


async def batch_generate(
    bottlenecks: List[BottleneckInfo], time_label: str, venue_name: str, limit: int = 5
) -> List[RerouteSuggestion]:
    subset = bottlenecks[:limit]
    tasks = [generate_recommendation(b, time_label, venue_name) for b in subset]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out: List[RerouteSuggestion] = []
    for b, r in zip(subset, results):
        if isinstance(r, RerouteSuggestion):
            out.append(r)
        else:
            out.append(
                RerouteSuggestion(
                    bottleneck=b,
                    generated_text=fallback_text(b, time_label),
                    source="fallback",
                    ai_risk=rule_risk(b),
                    ai_risk_source="rule",
                )
            )
    rest = [
        RerouteSuggestion(
            bottleneck=b,
            generated_text=fallback_text(b, time_label),
            source="fallback",
            ai_risk=rule_risk(b),
            ai_risk_source="rule",
        )
        for b in bottlenecks[limit:]
    ]
    return out + rest


async def warmup() -> bool:
    if not HF_TOKEN:
        return False
    try:
        await _call_model(
            HF_MODEL, {"warmup": True, "location": "Gate A", "severity": "warning"}
        )
        return True
    except Exception as exc:
        logger.warning("HF warmup failed: %s", exc)
        return False
