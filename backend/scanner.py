import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from backend.database import get_db
from backend.fetchers.polymarket import fetch_polymarket_markets
from backend.fetchers.predictit import fetch_predictit_markets
from backend.fetchers.kalshi import fetch_kalshi_markets
from backend.matcher import find_arbitrage_pairs

logger = logging.getLogger(__name__)

scan_state = {
    "is_scanning": False,
    "progress": 0,
    "phase": "idle",
    "message": "",
    "status": "idle",
    "last_scan_time": None,
    "next_scan_time": None,
    "total_markets": 0,
    "total_opportunities": 0,
    "total_comparisons": 0,
    "completed_comparisons": 0,
    "pairs_found": 0,
}

_all_markets: List[Dict[str, Any]] = []
_all_opportunities: List[Dict[str, Any]] = []

SCAN_INTERVAL_SECONDS = 300


def get_scan_state() -> dict:
    return {**scan_state}


def get_cached_markets() -> List[Dict[str, Any]]:
    return _all_markets


def get_cached_opportunities() -> List[Dict[str, Any]]:
    return _all_opportunities


async def run_scan(platforms: Optional[List[str]] = None) -> Dict[str, Any]:
    global _all_markets, _all_opportunities, scan_state

    if scan_state["is_scanning"]:
        return {"status": "already_scanning", "message": "A scan is already in progress"}

    scan_state["is_scanning"] = True
    scan_state["progress"] = 0
    scan_state["phase"] = "Fetching markets"
    scan_state["message"] = "Starting scan..."
    scan_state["status"] = "scanning"
    scan_state["total_comparisons"] = 0
    scan_state["completed_comparisons"] = 0
    scan_state["pairs_found"] = 0

    try:
        scan_state["progress"] = 3
        scan_state["phase"] = "Fetching Kalshi"
        scan_state["message"] = "Fetching Kalshi markets (paginating)..."
        kalshi_markets = await fetch_kalshi_markets(limit=10000)

        scan_state["progress"] = 15
        scan_state["phase"] = "Fetching Polymarket"
        scan_state["message"] = f"Got {len(kalshi_markets)} Kalshi markets. Fetching Polymarket..."
        poly_markets = await fetch_polymarket_markets(limit=50000)

        scan_state["progress"] = 40
        scan_state["message"] = f"Got {len(poly_markets)} Polymarket markets. Fetching PredictIt..."
        scan_state["phase"] = "Fetching PredictIt"
        pi_markets = await fetch_predictit_markets()

        scan_state["progress"] = 45
        scan_state["message"] = f"Got {len(kalshi_markets)} Kalshi + {len(poly_markets)} Polymarket + {len(pi_markets)} PredictIt. Saving to DB..."
        scan_state["phase"] = "Saving markets"

        all_markets = kalshi_markets + poly_markets + pi_markets
        _all_markets = all_markets
        scan_state["total_markets"] = len(all_markets)

        db = await get_db()
        try:
            for m in all_markets:
                outcomes_json = json.dumps(m.get("outcomes")) if m.get("outcomes") else None
                await db.execute(
                    """INSERT OR REPLACE INTO markets 
                       (id, platform, title, category, yes_price, no_price, volume, 
                        last_updated, end_date, market_url, is_binary, outcome_count,
                        contract_label, outcomes_json, fetched_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        m["id"], m["platform"], m["title"], m.get("category", ""),
                        m["yesPrice"], m["noPrice"], m.get("volume", 0),
                        m.get("lastUpdated"), m.get("endDate"), m.get("marketUrl"),
                        1 if m.get("isBinary", True) else 0,
                        m.get("outcomeCount", 2), m.get("contractLabel", ""),
                        outcomes_json, datetime.utcnow().isoformat(),
                    ),
                )
            await db.commit()
        finally:
            await db.close()

        scan_state["progress"] = 55
        scan_state["phase"] = "Comparing markets"
        scan_state["message"] = "Computing 2-leg arbitrage pairs across all platforms..."

        def on_match_progress(completed: int, total: int, pairs_found: int):
            if total > 0:
                match_pct = completed / total
                scan_state["progress"] = 55 + int(match_pct * 40)
            scan_state["total_comparisons"] = total
            scan_state["completed_comparisons"] = completed
            scan_state["pairs_found"] = pairs_found
            scan_state["message"] = f"Compared {completed:,}/{total:,} pairs — {pairs_found} matches found"

        effective_platforms = platforms or ["Kalshi", "Polymarket", "PredictIt"]
        opportunities = find_arbitrage_pairs(all_markets, min_similarity=35.0, enabled_platforms=effective_platforms, on_progress=on_match_progress)
        _all_opportunities = opportunities

        scan_state["progress"] = 95
        scan_state["phase"] = "Saving results"
        scan_state["message"] = f"Found {len(opportunities)} pairs. Saving..."

        db = await get_db()
        try:
            for opp in opportunities[:200]:
                legs_json = json.dumps(opp.get("legs", []))
                await db.execute(
                    """INSERT OR REPLACE INTO matched_pairs
                       (market_a_id, market_b_id, match_score, match_reason,
                        combined_yes_cost, potential_profit, roi, combo_type, leg_count,
                        legs_json, fees, earliest_resolution, scenario)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        opp["marketA"]["id"], opp["marketB"]["id"],
                        opp["matchScore"], opp["matchReason"],
                        opp["combinedYesCost"], opp["potentialProfit"], opp["roi"],
                        opp.get("comboType", "pair"), opp.get("legCount", 2), legs_json,
                        opp.get("fees", 0), opp.get("earliestResolution"),
                        str(opp.get("scenario", "")),
                    ),
                )
            now = datetime.utcnow()
            next_scan = now + timedelta(seconds=SCAN_INTERVAL_SECONDS)
            await db.execute(
                """UPDATE scan_state SET 
                   last_scan_time = ?, next_scan_time = ?, is_scanning = 0,
                   scan_progress = 100, scan_phase = 'complete',
                   total_markets = ?, total_opportunities = ?
                   WHERE id = 1""",
                (now.isoformat(), next_scan.isoformat(), len(all_markets), len(opportunities)),
            )
            await db.commit()
        finally:
            await db.close()

        scan_state["progress"] = 100
        scan_state["phase"] = "Complete"
        scan_state["message"] = f"Found {len(opportunities)} pairs from {len(all_markets)} markets"
        scan_state["status"] = "complete"
        scan_state["is_scanning"] = False
        scan_state["last_scan_time"] = datetime.utcnow().isoformat()
        scan_state["next_scan_time"] = (datetime.utcnow() + timedelta(seconds=SCAN_INTERVAL_SECONDS)).isoformat()
        scan_state["total_markets"] = len(all_markets)
        scan_state["total_opportunities"] = len(opportunities)

        return {
            "status": "complete",
            "totalMarkets": len(all_markets),
            "totalOpportunities": len(opportunities),
            "kalshi": len(kalshi_markets),
            "polymarket": len(poly_markets),
            "predictit": len(pi_markets),
        }

    except Exception as e:
        logger.error(f"Scan error: {e}", exc_info=True)
        scan_state["is_scanning"] = False
        scan_state["status"] = "error"
        scan_state["message"] = str(e)
        return {"status": "error", "message": str(e)}


async def auto_scan_loop():
    while True:
        try:
            logger.info("Auto-scan starting...")
            await run_scan()
            logger.info(f"Auto-scan complete. Next scan in {SCAN_INTERVAL_SECONDS}s")
        except Exception as e:
            logger.error(f"Auto-scan error: {e}")
        await asyncio.sleep(SCAN_INTERVAL_SECONDS)
