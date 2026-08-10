"""Hugging Face powered natural-language rerouting recommendations."""
import asyncio
import json
import logging
import os
from typing import List, Optional

from huggingface_hub import AsyncInferenceClient
from models import BottleneckInfo, RerouteSuggestion

logger = logging.getLogger(__name__)

HF_TOKEN = os.environ.get("HF_TOKEN")
HF_MODEL = os.environ.get("HF_MODEL", "Qwen/Qwen2.5-7B-Instruct")
HF_FALLBACK_MODEL = os.environ.get("HF_FALLBACK_MODEL", "google/gemma-2-2b-it")
HF_TIMEOUT = float(os.environ.get("HF_TIMEOUT_SECONDS", "9"))

SYSTEM_PROMPT = (
    "You are an expert crowd-management assistant in the control room of a large live venue. "
    "You read structured JSON about one crowd bottleneck and reply with a single calm, "
    "actionable recommendation of 1-2 sentences for venue safety operators. "
    "Name the congested location, state the severity, and give one concrete rerouting or "
    "staffing action using the provided alternatives. No greetings, no preamble, no markdown. "
    "Output only the recommendation sentence(s)."
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

_client: Optional[AsyncInferenceClient] = None
_active_model = HF_MODEL


def _client_for(model: str) -> AsyncInferenceClient:
    return AsyncInferenceClient(model=model, token=HF_TOKEN, timeout=HF_TIMEOUT)


def fallback_text(b: BottleneckInfo, time_label: str) -> str:
    tmpl = TEMPLATES.get(b.status.value, TEMPLATES["moderate"])
    return tmpl.format(
        location=b.location_name,
        density=b.current_density,
        time=time_label,
        alt=", ".join(b.alternatives[:2]) or "nearby routes",
        wait=b.expected_clearance_mins,
    )


async def _call_model(model: str, payload: dict) -> str:
    client = _client_for(model)
    try:
        result = await asyncio.wait_for(
            client.chat_completion(
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(payload)},
                ],
                max_tokens=90,
                temperature=0.3,
                top_p=0.9,
            ),
            timeout=HF_TIMEOUT + 2,
        )
        text = (result.choices[0].message.content or "").strip()
        if not text:
            raise RuntimeError("empty completion")
        return text.split("\n\n")[0].strip().strip('"')
    finally:
        try:
            await client.close()
        except Exception:
            pass


async def generate_recommendation(
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
        "alternative_route": b.alternatives,
    }
    if HF_TOKEN:
        for model in (HF_MODEL, HF_FALLBACK_MODEL):
            try:
                text = await _call_model(model, payload)
                return RerouteSuggestion(
                    bottleneck=b, generated_text=text, source="ai", model=model
                )
            except Exception as exc:
                logger.warning("HF model %s failed: %s", model, exc.__class__.__name__)
    return RerouteSuggestion(
        bottleneck=b,
        generated_text=fallback_text(b, time_label),
        source="fallback",
        model=None,
    )


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
                )
            )
    rest = [
        RerouteSuggestion(
            bottleneck=b, generated_text=fallback_text(b, time_label), source="fallback"
        )
        for b in bottlenecks[limit:]
    ]
    return out + rest


async def warmup() -> bool:
    if not HF_TOKEN:
        return False
    try:
        await _call_model(HF_MODEL, {"warmup": True, "location": "Gate A", "severity": "warning"})
        return True
    except Exception as exc:
        logger.warning("HF warmup failed: %s", exc)
        return False
