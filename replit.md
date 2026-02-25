# Arb Finder - Prediction Market Arbitrage Scanner

## Overview
Full-stack prediction market arbitrage finder that fetches live data from Kalshi, Polymarket, and PredictIt, semantically matches binary markets across platforms, and computes guaranteed 2-leg arbitrage opportunities with fee-aware ROI.

## Architecture
- **Frontend:** React/TypeScript on port 5000 (Express proxy)
- **Backend:** Python FastAPI on port 8000
- **Proxy:** Express proxies `/api/*` to FastAPI
- **Start:** `bash start.sh` launches both

## Data Sources
- **Kalshi:** ~5,000 binary markets via public API (221 pages, rate-limit aware with retry)
- **Polymarket:** ~3,000 markets via Gamma API (30 pages)
- **PredictIt:** ~845 contracts via public API

## Fee Model (as of Feb 2026)
- **Kalshi:** Taker `0.07 × p × (1-p)` per contract; Maker free; Deposit free (ACH); 2% debit card
- **Polymarket:** Taker 0.10% (10 bps) for US; Maker free; 0% for most global event markets
- **PredictIt:** 10% of gross profit + 5% withdrawal fee; Deposit free

## Key Files
- `backend/fetchers/kalshi.py` - Paginated Kalshi fetcher with 429 retry
- `backend/fetchers/polymarket.py` - Paginated Polymarket fetcher
- `backend/fetchers/predictit.py` - PredictIt fetcher (all contracts as binary)
- `backend/matcher.py` - Keyword-indexed 2-market pair matcher with fee-aware ROI
- `backend/scanner.py` - Auto-scan loop with SSE progress streaming
- `backend/main.py` - FastAPI endpoints
- `client/src/components/market-browser.tsx` - Main UI with progress bar
- `client/src/pages/sentinel.tsx` - Platform comparison tool
- `client/src/pages/arbitrage-calculator.tsx` - Manual arbitrage calculator
- `shared/schema.ts` - TypeScript interfaces

## Matching Algorithm
Uses inverted keyword index to reduce cross-platform comparisons from millions to hundreds of thousands. Combines SequenceMatcher (40%) + Jaccard similarity (60%) for scoring. Min threshold: 35%.

## Database
SQLite via aiosqlite. Tables: markets, matched_pairs, scan_state, watchlist.
