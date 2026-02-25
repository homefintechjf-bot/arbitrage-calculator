import httpx
import logging
from typing import List, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)

PREDICTIT_API = "https://www.predictit.org/api/marketdata/all"

async def fetch_predictit_markets() -> List[Dict[str, Any]]:
    markets = []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(PREDICTIT_API)
            resp.raise_for_status()
            data = resp.json()

            for m in data.get("markets", []):
                try:
                    contracts = m.get("contracts", [])
                    if not contracts:
                        continue

                    for contract in contracts:
                        yes_price = contract.get("lastTradePrice", 0.5)
                        if yes_price is None:
                            yes_price = contract.get("bestBuyYesCost", 0.5)
                        if yes_price is None:
                            yes_price = 0.5
                        yes_price = float(yes_price)
                        no_price = 1.0 - yes_price

                        market_id = contract.get("id", "")
                        contract_url = contract.get("url") or m.get("url")

                        market = {
                            "id": f"pi_{market_id}",
                            "platform": "PredictIt",
                            "title": contract.get("name", m.get("name", "Unknown")),
                            "category": m.get("name", "") if len(contracts) > 1 else "",
                            "yesPrice": yes_price,
                            "noPrice": no_price,
                            "volume": 0,
                            "lastUpdated": datetime.utcnow().isoformat(),
                            "endDate": m.get("dateEnd", None),
                            "marketUrl": contract_url,
                            "isBinary": True,
                            "outcomeCount": 2,
                            "contractLabel": contract.get("shortName", contract.get("name", "Yes")),
                            "outcomes": None,
                        }
                        markets.append(market)

                except Exception as e:
                    logger.warning(f"Skipping PredictIt market: {e}")
                    continue

    except Exception as e:
        logger.error(f"PredictIt fetch error: {e}")

    return markets
