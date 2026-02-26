import asyncio
import json
import uuid
import logging
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from backend.database import init_db, get_db
from backend.scanner import run_scan, get_scan_state, get_cached_markets, get_cached_opportunities, auto_scan_loop

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Arbitrage Scanner API")


@app.on_event("startup")
async def startup():
    await init_db()
    asyncio.create_task(auto_scan_loop())
    logger.info("Backend started, auto-scan loop initiated")


@app.post("/api/scan")
async def trigger_scan(request: Request = None):
    try:
        body = await request.json() if request else {}
    except Exception:
        body = {}
    platforms = body.get("platforms", None)
    state = get_scan_state()
    if state["is_scanning"]:
        return {"status": "already_scanning", "message": "A scan is already in progress"}
    asyncio.create_task(run_scan(platforms))
    return {"status": "started", "message": "Scan started in background"}


@app.get("/api/scan-status")
async def scan_status():
    state = get_scan_state()
    return state


@app.get("/api/scan-progress")
async def scan_progress():
    async def event_stream():
        last_state = None
        idle_count = 0
        while True:
            state = get_scan_state()
            state_str = json.dumps({
                "percent": state["progress"],
                "phase": state["phase"],
                "message": state["message"],
                "status": state["status"],
                "totalComparisons": state.get("total_comparisons", 0),
                "completedComparisons": state.get("completed_comparisons", 0),
                "pairsFound": state.get("pairs_found", 0),
                "totalMarkets": state.get("total_markets", 0),
            })
            if state_str != last_state:
                yield f"data: {state_str}\n\n"
                last_state = state_str
                idle_count = 0
            else:
                idle_count += 1

            if state["status"] in ("complete", "error") or idle_count > 60:
                yield f"data: {state_str}\n\n"
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/markets")
async def get_markets(q: Optional[str] = None):
    markets = get_cached_markets()
    if q:
        q_lower = q.lower()
        markets = [m for m in markets if q_lower in m["title"].lower()]
    return markets


@app.get("/api/market-stats")
async def market_stats():
    markets = get_cached_markets()
    kalshi_count = sum(1 for m in markets if m["platform"] == "Kalshi")
    poly_count = sum(1 for m in markets if m["platform"] == "Polymarket")
    pi_count = sum(1 for m in markets if m["platform"] == "PredictIt")
    state = get_scan_state()
    return {
        "kalshi": kalshi_count,
        "polymarket": poly_count,
        "predictit": pi_count,
        "total": len(markets),
        "lastUpdated": state.get("last_scan_time", datetime.utcnow().isoformat()),
    }


@app.get("/api/arbitrage-opportunities")
async def get_opportunities(
    q: Optional[str] = None,
    minRoi: float = 0,
    platforms: Optional[str] = None,
    page: int = Query(1, ge=1, le=3),
    limit: int = Query(50, ge=1, le=100),
):
    opps = get_cached_opportunities()

    if q:
        q_lower = q.lower()
        opps = [o for o in opps if
                q_lower in o["marketA"]["title"].lower() or
                q_lower in o["marketB"]["title"].lower()]

    if minRoi > 0:
        opps = [o for o in opps if o["roi"] >= minRoi]

    if platforms:
        platform_set = set(p.strip().lower() for p in platforms.split(","))
        def matches_platform(o):
            platforms_in_opp = {o["marketA"]["platform"].lower(), o["marketB"]["platform"].lower()}
            return bool(platforms_in_opp & platform_set)
        opps = [o for o in opps if matches_platform(o)]

    start = (page - 1) * limit
    end = start + limit
    paginated = opps[start:end]

    return paginated


class WatchlistCreate(BaseModel):
    marketName: str
    siteAName: str
    siteBName: str
    siteAYesPrice: float
    siteBYesPrice: float
    investment: float = 500
    alertThreshold: float = 3.0
    isActive: bool = True

class WatchlistUpdate(BaseModel):
    isActive: Optional[bool] = None
    siteAYesPrice: Optional[float] = None
    siteBYesPrice: Optional[float] = None
    investment: Optional[float] = None
    alertThreshold: Optional[float] = None
    lastChecked: Optional[str] = None
    lastMakerRoi: Optional[float] = None
    lastTakerRoi: Optional[float] = None


@app.get("/api/watchlist")
async def get_watchlist():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM watchlist ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [
            {
                "id": r["id"],
                "marketName": r["market_name"],
                "siteAName": r["site_a_name"],
                "siteBName": r["site_b_name"],
                "siteAYesPrice": r["site_a_yes_price"],
                "siteBYesPrice": r["site_b_yes_price"],
                "investment": r["investment"],
                "alertThreshold": r["alert_threshold"],
                "isActive": bool(r["is_active"]),
                "lastChecked": r["last_checked"],
                "lastMakerRoi": r["last_maker_roi"],
                "lastTakerRoi": r["last_taker_roi"],
                "createdAt": r["created_at"],
            }
            for r in rows
        ]
    finally:
        await db.close()


@app.post("/api/watchlist")
async def create_watchlist(item: WatchlistCreate):
    item_id = str(uuid.uuid4())
    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO watchlist (id, market_name, site_a_name, site_b_name,
               site_a_yes_price, site_b_yes_price, investment, alert_threshold, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (item_id, item.marketName, item.siteAName, item.siteBName,
             item.siteAYesPrice, item.siteBYesPrice, item.investment,
             item.alertThreshold, 1 if item.isActive else 0),
        )
        await db.commit()
    finally:
        await db.close()
    return {"id": item_id, **item.model_dump()}


@app.patch("/api/watchlist/{item_id}")
async def update_watchlist(item_id: str, updates: WatchlistUpdate):
    db = await get_db()
    try:
        fields = []
        values = []
        if updates.isActive is not None:
            fields.append("is_active = ?")
            values.append(1 if updates.isActive else 0)
        if updates.siteAYesPrice is not None:
            fields.append("site_a_yes_price = ?")
            values.append(updates.siteAYesPrice)
        if updates.siteBYesPrice is not None:
            fields.append("site_b_yes_price = ?")
            values.append(updates.siteBYesPrice)
        if updates.investment is not None:
            fields.append("investment = ?")
            values.append(updates.investment)
        if updates.alertThreshold is not None:
            fields.append("alert_threshold = ?")
            values.append(updates.alertThreshold)
        if updates.lastChecked is not None:
            fields.append("last_checked = ?")
            values.append(updates.lastChecked)
        if updates.lastMakerRoi is not None:
            fields.append("last_maker_roi = ?")
            values.append(updates.lastMakerRoi)
        if updates.lastTakerRoi is not None:
            fields.append("last_taker_roi = ?")
            values.append(updates.lastTakerRoi)

        if fields:
            values.append(item_id)
            await db.execute(f"UPDATE watchlist SET {', '.join(fields)} WHERE id = ?", values)
            await db.commit()
    finally:
        await db.close()
    return {"id": item_id, "updated": True}


@app.delete("/api/watchlist/{item_id}")
async def delete_watchlist(item_id: str):
    db = await get_db()
    try:
        await db.execute("DELETE FROM watchlist WHERE id = ?", (item_id,))
        await db.commit()
    finally:
        await db.close()
    return {"deleted": True}


class AlertCreate(BaseModel):
    watchlistId: Optional[str] = None
    marketName: str
    makerRoi: float = 0
    takerRoi: float = 0
    siteAYesPrice: Optional[float] = None
    siteBYesPrice: Optional[float] = None
    isRead: bool = False


@app.get("/api/alerts")
async def get_alerts():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM alert_history ORDER BY created_at DESC LIMIT 50")
        rows = await cursor.fetchall()
        return [
            {
                "id": r["id"],
                "watchlistId": r["watchlist_id"],
                "marketName": r["market_name"],
                "makerRoi": r["maker_roi"],
                "takerRoi": r["taker_roi"],
                "siteAYesPrice": r["site_a_yes_price"],
                "siteBYesPrice": r["site_b_yes_price"],
                "isRead": bool(r["is_read"]),
                "createdAt": r["created_at"],
            }
            for r in rows
        ]
    finally:
        await db.close()


@app.post("/api/alerts")
async def create_alert(alert: AlertCreate):
    alert_id = str(uuid.uuid4())
    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO alert_history (id, watchlist_id, market_name, maker_roi, taker_roi,
               site_a_yes_price, site_b_yes_price, is_read)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (alert_id, alert.watchlistId, alert.marketName, alert.makerRoi,
             alert.takerRoi, alert.siteAYesPrice, alert.siteBYesPrice,
             0 if not alert.isRead else 1),
        )
        await db.commit()
    finally:
        await db.close()
    return {"id": alert_id, **alert.model_dump()}


@app.patch("/api/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str):
    db = await get_db()
    try:
        await db.execute("UPDATE alert_history SET is_read = 1 WHERE id = ?", (alert_id,))
        await db.commit()
    finally:
        await db.close()
    return {"id": alert_id, "isRead": True}


@app.delete("/api/alerts")
async def clear_alerts():
    db = await get_db()
    try:
        await db.execute("DELETE FROM alert_history")
        await db.commit()
    finally:
        await db.close()
    return {"cleared": True}


class FeedbackCreate(BaseModel):
    marketAId: str
    marketATitle: Optional[str] = None
    marketAPlatform: Optional[str] = None
    marketBId: str
    marketBTitle: Optional[str] = None
    marketBPlatform: Optional[str] = None
    matchScore: Optional[float] = None
    matchReason: Optional[str] = None
    verdict: str


@app.post("/api/match-feedback")
async def submit_feedback(fb: FeedbackCreate):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM feedback WHERE market_a_id = ? AND market_b_id = ?",
            (fb.marketAId, fb.marketBId),
        )
        existing = await cursor.fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Feedback already submitted for this pair")

        await db.execute(
            """INSERT INTO feedback (market_a_id, market_a_title, market_a_platform,
               market_b_id, market_b_title, market_b_platform,
               match_score, match_reason, verdict)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (fb.marketAId, fb.marketATitle, fb.marketAPlatform,
             fb.marketBId, fb.marketBTitle, fb.marketBPlatform,
             fb.matchScore, fb.matchReason, fb.verdict),
        )
        await db.commit()
    finally:
        await db.close()
    return {"success": True}


class ArbitrageHistoryCreate(BaseModel):
    marketName: str
    siteAName: str
    siteBName: str
    siteAYesPrice: float
    siteBYesPrice: float
    investment: float
    orderMode: str = "Maker"
    grossRoi: Optional[float] = None
    netRoi: Optional[float] = None
    netProfit: Optional[float] = None
    shares: Optional[int] = None
    isProfitable: Optional[bool] = None
    scenario: Optional[str] = None
    legCount: Optional[int] = 2
    legsJson: Optional[str] = None


@app.get("/api/arbitrage-history")
async def get_history():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM arbitrage_history ORDER BY created_at DESC LIMIT 100")
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            entry = {
                "id": r["id"],
                "marketName": r["market_name"],
                "siteAName": r["site_a_name"],
                "siteBName": r["site_b_name"],
                "siteAYesPrice": r["site_a_yes_price"],
                "siteBYesPrice": r["site_b_yes_price"],
                "investment": r["investment"],
                "orderMode": r["order_mode"],
                "grossRoi": r["gross_roi"],
                "netRoi": r["net_roi"],
                "netProfit": r["net_profit"],
                "shares": r["shares"],
                "createdAt": r["created_at"],
            }
            try:
                entry["isProfitable"] = bool(r["is_profitable"])
            except (IndexError, KeyError):
                entry["isProfitable"] = (r["net_profit"] or 0) > 0
            try:
                entry["scenario"] = r["scenario"]
            except (IndexError, KeyError):
                entry["scenario"] = None
            try:
                entry["legCount"] = r["leg_count"] or 2
            except (IndexError, KeyError):
                entry["legCount"] = 2
            try:
                entry["legsJson"] = r["legs_json"]
            except (IndexError, KeyError):
                entry["legsJson"] = None
            result.append(entry)
        return result
    finally:
        await db.close()


@app.post("/api/arbitrage-history")
async def save_history(entry: ArbitrageHistoryCreate):
    entry_id = str(uuid.uuid4())
    db = await get_db()
    try:
        await db.execute(
            """INSERT INTO arbitrage_history (id, market_name, site_a_name, site_b_name,
               site_a_yes_price, site_b_yes_price, investment, order_mode,
               gross_roi, net_roi, net_profit, shares, is_profitable, scenario,
               leg_count, legs_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (entry_id, entry.marketName, entry.siteAName, entry.siteBName,
             entry.siteAYesPrice, entry.siteBYesPrice, entry.investment,
             entry.orderMode, entry.grossRoi, entry.netRoi, entry.netProfit,
             entry.shares, 1 if entry.isProfitable else 0,
             entry.scenario, entry.legCount or 2, entry.legsJson),
        )
        await db.commit()
    finally:
        await db.close()
    return {"id": entry_id, **entry.model_dump()}


@app.delete("/api/arbitrage-history")
async def clear_history():
    db = await get_db()
    try:
        await db.execute("DELETE FROM arbitrage_history")
        await db.commit()
    finally:
        await db.close()
    return {"cleared": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
