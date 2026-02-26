# Arb Finder - Prediction Market Arbitrage Scanner

## Overview
Full-stack prediction market arbitrage finder that fetches live data from Kalshi, Polymarket, and PredictIt, semantically matches binary markets across platforms, and computes guaranteed 2-leg arbitrage opportunities with fee-aware ROI.

## Architecture
- **Frontend:** React/TypeScript on port 5000 (Express proxy)
- **Backend:** Python FastAPI on port 8000
- **Proxy:** Express proxies `/api/*` to FastAPI
- **Start:** `bash start.sh` launches both

## Data Sources
- **Kalshi:** ~5,900 binary markets via public API (500 pages, rate-limit aware with retry)
- **Polymarket:** ~31,300 markets via Gamma API (63 pages at 500/page)
- **PredictIt:** ~845 contracts via public API
- **Total:** ~38,000 markets across 3 platforms

## Fee Model (as of Feb 2026)
- **Kalshi:** Taker `0.07 × p × (1-p)` per contract; Maker free; Deposit free (ACH); 2% debit card
- **Polymarket:** Taker 0.10% (10 bps) for US; Maker free; 0% for most global event markets
- **PredictIt:** 10% of gross profit + 5% withdrawal fee; Deposit free

## Key Files
- `backend/fetchers/kalshi.py` - Paginated Kalshi fetcher with 429 retry
- `backend/fetchers/polymarket.py` - Paginated Polymarket fetcher (500/page, up to 200 pages)
- `backend/fetchers/predictit.py` - PredictIt fetcher (all contracts as binary)
- `backend/matcher.py` - Keyword-indexed 2-market pair matcher with fee-aware ROI
- `backend/scanner.py` - Auto-scan loop with SSE progress streaming
- `backend/main.py` - FastAPI endpoints
- `client/src/components/market-browser.tsx` - Main UI with progress bar, scan-on-mount detection
- `client/src/pages/sentinel.tsx` - Watchlist/alerts with custom sound upload
- `client/src/pages/arbitrage-calculator.tsx` - Manual arbitrage calculator
- `client/src/lib/notifications.ts` - Sound system with custom audio upload/persistence
- `shared/schema.ts` - TypeScript interfaces

## Matching Algorithm
Uses inverted keyword index with significance keyword filtering to reduce ~200M brute-force pairs to ~13M candidates. Jaccard pre-filter (≥0.15) skips weak pairs before expensive SequenceMatcher. Combines SequenceMatcher (40%) + Jaccard (60%) for scoring. Min threshold: 35%. Matcher runs in ThreadPoolExecutor to avoid blocking async event loop; progress updates use call_soon_threadsafe for thread safety.

## Performance
- All 3 platforms fetch in parallel via asyncio.gather() — Kalshi (~2min) overlaps with Polymarket (~1min) and PredictIt (instant)
- Keyword index: 200M → 13M candidates (93% reduction)
- Jaccard pre-filter: 13M → ~900K full comparisons (12.4M skipped)
- Reduced per-page delays: 0.05s between pages, 0.5s every 20 pages

## Database
SQLite via aiosqlite. Tables: markets, matched_pairs, scan_state, watchlist.
