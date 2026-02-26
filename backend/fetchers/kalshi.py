import httpx
import asyncio
import logging
from typing import List, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)

KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2"
PAGE_SIZE = 1000
MAX_PAGES = 500


def _parse_market(m: dict) -> dict | None:
    if m.get("market_type") != "binary":
        return None

    yes_bid = m.get("yes_bid_dollars", "0")
    yes_ask = m.get("yes_ask_dollars", "0")
    try:
        yes_bid_f = float(yes_bid) if yes_bid else 0
        yes_ask_f = float(yes_ask) if yes_ask else 0
    except (ValueError, TypeError):
        yes_bid_f = 0
        yes_ask_f = 0

    if yes_bid_f > 0 and yes_ask_f > 0:
        yes_price = (yes_bid_f + yes_ask_f) / 2
    elif yes_ask_f > 0:
        yes_price = yes_ask_f
    elif yes_bid_f > 0:
        yes_price = yes_bid_f
    else:
        last_price = m.get("last_price_dollars", "0")
        try:
            yes_price = float(last_price) if last_price else 0
        except (ValueError, TypeError):
            yes_price = 0

    if yes_price <= 0 or yes_price >= 1:
        return None

    no_price = 1.0 - yes_price

    volume_str = m.get("volume", 0)
    try:
        volume = int(volume_str) if volume_str else 0
    except (ValueError, TypeError):
        volume = 0

    ticker = m.get("ticker", "")
    event_ticker = m.get("event_ticker", "")
    market_url = f"https://kalshi.com/markets/{ticker}" if ticker else None

    return {
        "id": f"kalshi_{ticker}",
        "platform": "Kalshi",
        "title": m.get("title", "Unknown"),
        "category": m.get("subtitle", event_ticker),
        "yesPrice": round(yes_price, 4),
        "noPrice": round(no_price, 4),
        "volume": volume,
        "lastUpdated": datetime.utcnow().isoformat(),
        "endDate": m.get("close_time") or m.get("expiration_time"),
        "marketUrl": market_url,
        "isBinary": True,
        "outcomeCount": 2,
        "contractLabel": m.get("yes_sub_title", "Yes"),
        "outcomes": None,
    }


async def fetch_kalshi_markets(limit: int = 10000) -> List[Dict[str, Any]]:
    markets = []
    cursor = None
    pages_fetched = 0
    consecutive_empty = 0

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            while len(markets) < limit and pages_fetched < MAX_PAGES:
                params = {
                    "status": "open",
                    "limit": PAGE_SIZE,
                }
                if cursor:
                    params["cursor"] = cursor

                for attempt in range(3):
                    resp = await client.get(f"{KALSHI_API}/markets", params=params)
                    if resp.status_code == 429:
                        wait = 2 ** (attempt + 1)
                        logger.warning(f"Kalshi rate limited, waiting {wait}s (attempt {attempt+1}/3)")
                        await asyncio.sleep(wait)
                        continue
                    resp.raise_for_status()
                    break
                else:
                    logger.error("Kalshi rate limit exceeded after 3 retries, stopping pagination")
                    break
                data = resp.json()

                raw_markets = data.get("markets", [])
                if not raw_markets:
                    break

                page_binary = 0
                for m in raw_markets:
                    try:
                        parsed = _parse_market(m)
                        if parsed:
                            markets.append(parsed)
                            page_binary += 1
                    except Exception as e:
                        logger.warning(f"Skipping Kalshi market: {e}")
                        continue

                pages_fetched += 1
                cursor = data.get("cursor")

                if pages_fetched % 50 == 0:
                    logger.info(f"Kalshi page {pages_fetched}: {len(raw_markets)} raw, +{page_binary} binary (total: {len(markets)})")

                if not cursor or len(raw_markets) < PAGE_SIZE:
                    break

                if page_binary == 0:
                    consecutive_empty += 1
                else:
                    consecutive_empty = 0
                if consecutive_empty >= 20:
                    logger.info(f"Kalshi: stopping early after {consecutive_empty} consecutive pages with 0 binary markets")
                    break

                if pages_fetched % 20 == 0:
                    await asyncio.sleep(0.5)
                else:
                    await asyncio.sleep(0.05)

    except Exception as e:
        logger.error(f"Kalshi fetch error: {e}")

    logger.info(f"Kalshi total: {len(markets)} binary markets from {pages_fetched} pages")
    return markets
