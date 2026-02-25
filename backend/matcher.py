import re
import logging
from typing import List, Dict, Any, Tuple
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

STOP_WORDS = {
    "the", "a", "an", "in", "on", "at", "to", "for", "of", "by", "with",
    "is", "are", "will", "be", "this", "that", "it", "and", "or", "not",
    "do", "does", "did", "has", "have", "had", "was", "were", "been",
    "can", "could", "would", "should", "may", "might", "shall",
    "before", "after", "during", "between", "from", "into", "about",
}


def normalize_text(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s]', ' ', text)
    words = [w for w in text.split() if w not in STOP_WORDS and len(w) > 1]
    return ' '.join(words)


def extract_keywords(text: str) -> set:
    normalized = normalize_text(text)
    return set(normalized.split())


def compute_similarity(title_a: str, title_b: str) -> Tuple[float, str]:
    norm_a = normalize_text(title_a)
    norm_b = normalize_text(title_b)
    seq_score = SequenceMatcher(None, norm_a, norm_b).ratio()
    keywords_a = extract_keywords(title_a)
    keywords_b = extract_keywords(title_b)

    if not keywords_a or not keywords_b:
        return seq_score * 100, "sequence"

    intersection = keywords_a & keywords_b
    union = keywords_a | keywords_b
    jaccard = len(intersection) / len(union) if union else 0
    combined = (seq_score * 0.4 + jaccard * 0.6) * 100

    if combined >= 50:
        reason_parts = []
        if intersection:
            reason_parts.append(f"shared: {', '.join(sorted(list(intersection)[:5]))}")
        return combined, "; ".join(reason_parts) if reason_parts else "semantic"

    return combined, "low"


def estimate_fee(platform: str, price: float) -> float:
    p = platform.lower()
    if p == "kalshi":
        return 0.07 * price * (1 - price)
    elif p == "predictit":
        return max(0, (1.0 - price)) * 0.10
    return 0.0


def compute_pair_arb(market_a: Dict, market_b: Dict) -> Dict[str, Any]:
    yes_a, yes_b = market_a["yesPrice"], market_b["yesPrice"]

    cost1 = yes_a + (1.0 - yes_b)
    fee1_a = estimate_fee(market_a["platform"], yes_a)
    fee1_b = estimate_fee(market_b["platform"], 1.0 - yes_b)
    total1 = cost1 + fee1_a + fee1_b
    roi1 = ((1.0 - total1) / total1) * 100 if total1 < 1.0 else 0

    cost2 = (1.0 - yes_a) + yes_b
    fee2_a = estimate_fee(market_a["platform"], 1.0 - yes_a)
    fee2_b = estimate_fee(market_b["platform"], yes_b)
    total2 = cost2 + fee2_a + fee2_b
    roi2 = ((1.0 - total2) / total2) * 100 if total2 < 1.0 else 0

    if roi1 >= roi2:
        legs = [
            {"platform": market_a["platform"], "marketId": market_a["id"], "title": market_a["title"],
             "side": "YES", "price": round(yes_a, 4), "fee": round(fee1_a, 4),
             "volume": market_a.get("volume", 0), "marketUrl": market_a.get("marketUrl"), "allocation": 1.0},
            {"platform": market_b["platform"], "marketId": market_b["id"], "title": market_b["title"],
             "side": "NO", "price": round(1.0 - yes_b, 4), "fee": round(fee1_b, 4),
             "volume": market_b.get("volume", 0), "marketUrl": market_b.get("marketUrl"), "allocation": 1.0},
        ]
        return {"roi": roi1, "cost": total1, "grossCost": cost1, "fees": fee1_a + fee1_b, "legs": legs, "scenario": 1}
    else:
        legs = [
            {"platform": market_a["platform"], "marketId": market_a["id"], "title": market_a["title"],
             "side": "NO", "price": round(1.0 - yes_a, 4), "fee": round(fee2_a, 4),
             "volume": market_a.get("volume", 0), "marketUrl": market_a.get("marketUrl"), "allocation": 1.0},
            {"platform": market_b["platform"], "marketId": market_b["id"], "title": market_b["title"],
             "side": "YES", "price": round(yes_b, 4), "fee": round(fee2_b, 4),
             "volume": market_b.get("volume", 0), "marketUrl": market_b.get("marketUrl"), "allocation": 1.0},
        ]
        return {"roi": roi2, "cost": total2, "grossCost": cost2, "fees": fee2_a + fee2_b, "legs": legs, "scenario": 2}


def find_arbitrage_pairs(
    markets: List[Dict[str, Any]],
    min_similarity: float = 40.0,
    enabled_platforms: List[str] = None,
    on_progress: Any = None,
) -> List[Dict[str, Any]]:
    if enabled_platforms:
        platform_set = set(p.lower() for p in enabled_platforms)
        markets = [m for m in markets if m["platform"].lower() in platform_set]

    by_platform: Dict[str, List[Dict[str, Any]]] = {}
    for m in markets:
        if not m.get("isBinary", True):
            continue
        by_platform.setdefault(m["platform"], []).append(m)

    platforms = list(by_platform.keys())
    pairs = []

    total_comparisons = 0
    for i in range(len(platforms)):
        for j in range(i + 1, len(platforms)):
            total_comparisons += len(by_platform[platforms[i]]) * len(by_platform[platforms[j]])

    if on_progress:
        on_progress(0, total_comparisons, 0)

    completed = 0

    for i in range(len(platforms)):
        for j in range(i + 1, len(platforms)):
            pa, pb = platforms[i], platforms[j]
            for ma in by_platform[pa]:
                for mb in by_platform[pb]:
                    completed += 1
                    sim_score, reason = compute_similarity(ma["title"], mb["title"])
                    if sim_score < min_similarity:
                        if on_progress and completed % 50 == 0:
                            on_progress(completed, total_comparisons, len(pairs))
                        continue

                    arb = compute_pair_arb(ma, mb)

                    end_dates = [d for d in [ma.get("endDate"), mb.get("endDate")] if d]
                    earliest_resolution = min(end_dates) if end_dates else None

                    pair = {
                        "comboType": "pair",
                        "legCount": 2,
                        "legs": arb["legs"],
                        "marketA": ma,
                        "marketB": mb,
                        "combinedYesCost": round(arb["grossCost"], 4),
                        "totalCost": round(arb["cost"], 4),
                        "fees": round(arb["fees"], 4),
                        "potentialProfit": round(max(0, 1.0 - arb["cost"]), 4),
                        "roi": round(arb["roi"], 2),
                        "matchScore": round(sim_score, 1),
                        "matchReason": reason,
                        "earliestResolution": earliest_resolution,
                        "scenario": arb["scenario"],
                    }
                    pairs.append(pair)

                    if on_progress and completed % 50 == 0:
                        on_progress(completed, total_comparisons, len(pairs))

    if on_progress:
        on_progress(total_comparisons, total_comparisons, len(pairs))

    pairs.sort(key=lambda p: (
        -p["matchScore"],
        -p["roi"],
        p["earliestResolution"] or "9999",
    ))

    return pairs
