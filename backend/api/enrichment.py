"""Public enrichment pipeline for AI company profiles."""
from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional

from fastapi import APIRouter
from openai import OpenAI
from pydantic import BaseModel, Field

from .dependencies import get_supabase_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/enrichment", tags=["enrichment"])


class EnrichmentStartRequest(BaseModel):
    org_numbers: List[str] = Field(..., description="Organization numbers to enrich")


class EnrichmentResult(BaseModel):
    org_number: str
    status: str
    website: Optional[str] = None
    ai_profile_id: Optional[str] = None
    notes: Optional[str] = None


class EnrichmentStartResponse(BaseModel):
    queued: int
    results: List[EnrichmentResult]


def _fetch_homepage(org_number: str, supabase) -> Optional[str]:
    try:
        resp = (
            supabase.table("companies")
            .select("homepage")
            .eq("orgnr", org_number)
            .maybe_single()
            .execute()
        )
        if resp.data:
            return resp.data.get("homepage")
    except Exception as exc:  # pragma: no cover - best effort helper
        logger.warning("Failed to fetch homepage for %s: %s", org_number, exc)
    return None


def _scrape_company_profile(homepage: Optional[str]) -> str:
    """Placeholder for Puppeteer scrape; returns minimal context when offline."""
    if not homepage:
        return "No homepage available; using CRM export and registry metadata."
    return f"Homepage discovered: {homepage}. Further scraping is handled by Railway worker."


def _summarize_company(org_number: str, website: Optional[str], content: str, client: Optional[OpenAI]) -> Dict[str, Optional[str]]:
    fallback_summary = {
        "product_description": "Pending scrape",
        "end_market": None,
        "customer_types": None,
        "value_chain_position": None,
        "strategic_fit_score": 5,
        "defensibility_score": 5,
        "ai_notes": content[:500],
    }

    if not client:
        return fallback_summary

    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an AI analyst summarizing company websites into structured fields. "
                        "Return concise bullet points without marketing fluff."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Org number: {org_number}. Website: {website or 'unknown'}.\n"
                        f"Extracted content:\n{content[:2000]}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
        )
        message = response.choices[0].message.content
        if not message:
            return fallback_summary
    except Exception as exc:
        logger.warning("OpenAI summarization failed for %s: %s", org_number, exc)
        return fallback_summary

    import json

    try:
        parsed = json.loads(message)
    except Exception:
        return fallback_summary

    return {
        "product_description": parsed.get("product_description") or fallback_summary["product_description"],
        "end_market": parsed.get("end_market") or fallback_summary["end_market"],
        "customer_types": parsed.get("customer_types") or fallback_summary["customer_types"],
        "value_chain_position": parsed.get("value_chain_position") or fallback_summary["value_chain_position"],
        "strategic_fit_score": parsed.get("strategic_fit_score") or fallback_summary["strategic_fit_score"],
        "defensibility_score": parsed.get("defensibility_score") or fallback_summary.get("defensibility_score"),
        "ai_notes": parsed.get("ai_notes") or fallback_summary["ai_notes"],
    }


@router.post("/start", response_model=EnrichmentStartResponse)
async def start_enrichment(request: EnrichmentStartRequest) -> EnrichmentStartResponse:
    supabase = get_supabase_client()
    api_key = os.getenv("OPENAI_API_KEY")
    client = OpenAI(api_key=api_key) if api_key else None

    results: List[EnrichmentResult] = []

    for org_number in request.org_numbers:
        homepage = _fetch_homepage(org_number, supabase)
        scraped_content = _scrape_company_profile(homepage)
        summary = _summarize_company(org_number, homepage, scraped_content, client)

        payload = {
            "org_number": org_number,
            "website": homepage,
            **summary,
        }

        try:
            response = supabase.table("ai_profiles").upsert(payload, on_conflict="org_number").execute()
            profile_id = None
            if response.data:
                profile_id = response.data[0].get("id")
            results.append(
                EnrichmentResult(
                    org_number=org_number,
                    status="completed",
                    website=homepage,
                    ai_profile_id=profile_id,
                    notes="Profile stored in Supabase",
                )
            )
        except Exception as exc:
            logger.error("Failed to persist AI profile for %s: %s", org_number, exc)
            results.append(
                EnrichmentResult(
                    org_number=org_number,
                    status="failed",
                    website=homepage,
                    notes=str(exc),
                )
            )

    return EnrichmentStartResponse(queued=len(results), results=results)
