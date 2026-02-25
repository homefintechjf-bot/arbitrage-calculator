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


def find_arbitrage_pairs(
    markets: List[Dict[str, Any]],
    min_similarity: float = 40.0,
    enabled_platforms: List[str] = None,
) -> List[Dict[str, Any]]:
    if enabled_platforms:
        platform_set = set(p.lower() for p in enabled_platforms)
        markets = [m for m in markets if m["platform"].lower() in platform_set]

    by_platform: Dict[str, List[Dict[str, Any]]] = {}
    for m in markets:
        platform = m["platform"]
        by_platform.setdefault(platform, []).append(m)

    platforms = list(by_platform.keys())
    pairs = []

    for i in range(len(platforms)):
        for j in range(i + 1, len(platforms)):
            pa, pb = platforms[i], platforms[j]
            for ma in by_platform[pa]:
                if not ma.get("isBinary", True):
                    continue
                for mb in by_platform[pb]:
                    if not mb.get("isBinary", True):
                        continue

                    sim_score, reason = compute_similarity(ma["title"], mb["title"])

                    if sim_score < min_similarity:
                        continue

                    yes_a = ma["yesPrice"]
                    yes_b = mb["yesPrice"]

                    cost1 = yes_a + (1.0 - yes_b)
                    roi1 = ((1.0 - cost1) / cost1) * 100 if cost1 < 1.0 else 0

                    cost2 = (1.0 - yes_a) + yes_b
                    roi2 = ((1.0 - cost2) / cost2) * 100 if cost2 < 1.0 else 0

                    best_roi = max(roi1, roi2)
                    best_cost = cost1 if roi1 >= roi2 else cost2
                    potential_profit = 1.0 - best_cost if best_cost < 1.0 else 0

                    pair = {
                        "marketA": ma,
                        "marketB": mb,
                        "combinedYesCost": round(best_cost, 4),
                        "potentialProfit": round(potential_profit, 4),
                        "roi": round(best_roi, 2),
                        "matchScore": round(sim_score, 1),
                        "matchReason": reason,
                    }
                    pairs.append(pair)

    pairs.sort(key=lambda p: (-p["matchScore"], -p["roi"]))

    return pairs
