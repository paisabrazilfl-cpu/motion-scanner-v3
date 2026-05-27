#!/usr/bin/env python3
"""
52-Week Low-to-High Momentum Reversal Scanner

Input: daily OHLCV data for U.S.-listed equities.
Required CSV columns: symbol,date,open,high,low,close,volume
Optional universe CSV columns: symbol,exchange,asset_type

Example:
  python low_to_high_52w_scanner.py \
    --prices daily_prices.csv \
    --universe universe.csv \
    --out scan_results.csv

This script does NOT fetch market data by itself. Feed it clean daily bars from a vendor
such as Polygon, Nasdaq Data Link, Alpaca, IEX Cloud, Tiingo, EODHD, or your brokerage export.
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

import numpy as np
import pandas as pd

TRADING_DAYS_52W = 252

REQUIRED_PRICE_COLUMNS = {"symbol", "date", "open", "high", "low", "close", "volume"}


@dataclass(frozen=True)
class ScannerConfig:
    min_history_days: int = 220
    min_price: float = 5.0
    min_avg_dollar_volume_20d: float = 5_000_000.0
    breakout_buffer_pct: float = 0.005
    breakout_volume_multiple: float = 1.30
    near_low_pct: float = 0.15
    near_high_pct: float = 0.15
    accumulation_max_roc_63_abs: float = 0.12
    accumulation_max_atr_pct: float = 0.07
    reversal_min_roc_20: float = 0.04
    reversal_min_roc_63: float = 0.08
    momentum_min_roc_63: float = 0.10


def _require_columns(df: pd.DataFrame, required: set[str], source_name: str) -> None:
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"{source_name} is missing required columns: {missing}")


def load_prices(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    _require_columns(df, REQUIRED_PRICE_COLUMNS, str(path))
    df["symbol"] = df["symbol"].astype(str).str.upper().str.strip()
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    numeric_cols = ["open", "high", "low", "close", "volume"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["symbol", "date", "open", "high", "low", "close", "volume"])
    df = df[df["close"] > 0]
    df = df.sort_values(["symbol", "date"]).drop_duplicates(["symbol", "date"], keep="last")
    return df.reset_index(drop=True)


def load_universe(path: Optional[Path]) -> Optional[pd.DataFrame]:
    if path is None:
        return None
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    if "symbol" not in df.columns:
        raise ValueError("universe file must include a symbol column")
    df["symbol"] = df["symbol"].astype(str).str.upper().str.strip()
    return df.drop_duplicates("symbol")


def add_indicators(group: pd.DataFrame) -> pd.DataFrame:
    g = group.sort_values("date").copy()

    close = g["close"]
    high = g["high"]
    low = g["low"]
    volume = g["volume"]

    # 52-week markers.
    g["high_52w"] = high.rolling(TRADING_DAYS_52W, min_periods=120).max()
    g["low_52w"] = low.rolling(TRADING_DAYS_52W, min_periods=120).min()
    g["range_52w"] = g["high_52w"] - g["low_52w"]
    g["range_position"] = np.where(
        g["range_52w"] > 0,
        (close - g["low_52w"]) / g["range_52w"],
        np.nan,
    )
    g["pct_from_52w_low"] = np.where(g["low_52w"] > 0, close / g["low_52w"] - 1.0, np.nan)
    g["pct_to_52w_high"] = np.where(g["high_52w"] > 0, g["high_52w"] / close - 1.0, np.nan)

    # Moving averages and trend slopes.
    for n in [10, 20, 50, 100, 200]:
        g[f"sma_{n}"] = close.rolling(n, min_periods=max(5, n // 2)).mean()
    g["sma_50_slope_20d"] = g["sma_50"].pct_change(20)
    g["sma_200_slope_20d"] = g["sma_200"].pct_change(20)

    # Returns / momentum.
    for n in [10, 20, 63, 126]:
        g[f"roc_{n}"] = close.pct_change(n)

    # Resistance levels use prior highs to avoid look-ahead bias.
    g["resistance_60d"] = high.rolling(60, min_periods=30).max().shift(1)
    g["resistance_90d"] = high.rolling(90, min_periods=45).max().shift(1)

    # Volume / liquidity.
    g["avg_volume_20d"] = volume.rolling(20, min_periods=10).mean()
    g["avg_volume_50d"] = volume.rolling(50, min_periods=20).mean()
    g["relative_volume_20d"] = np.where(g["avg_volume_20d"] > 0, volume / g["avg_volume_20d"], np.nan)
    g["avg_dollar_volume_20d"] = g["avg_volume_20d"] * close

    # ATR percent.
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    g["atr_14"] = tr.rolling(14, min_periods=7).mean()
    g["atr_pct_14"] = np.where(close > 0, g["atr_14"] / close, np.nan)

    # RSI 14.
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14, min_periods=7).mean()
    loss = (-delta.clip(upper=0)).rolling(14, min_periods=7).mean()
    rs = np.where(loss > 0, gain / loss, np.nan)
    g["rsi_14"] = 100 - (100 / (1 + rs))

    # Recent structure proxies.
    g["highest_close_20d"] = close.rolling(20, min_periods=10).max().shift(1)
    g["lowest_close_20d"] = close.rolling(20, min_periods=10).min().shift(1)
    g["higher_high_20d"] = close > g["highest_close_20d"]
    g["above_sma_20"] = close > g["sma_20"]
    g["above_sma_50"] = close > g["sma_50"]
    g["above_sma_200"] = close > g["sma_200"]
    g["ma_bull_stack"] = (g["sma_20"] > g["sma_50"]) & (g["sma_50"] > g["sma_200"])
    g["ma_bear_stack"] = (g["sma_20"] < g["sma_50"]) & (g["sma_50"] < g["sma_200"])

    g["history_days"] = np.arange(1, len(g) + 1)
    return g


def _score_bool(condition: bool, points: float) -> float:
    return points if bool(condition) else 0.0


def classify_latest(row: pd.Series, cfg: ScannerConfig) -> Tuple[str, float, str]:
    """Return phase, score, reason string for the latest bar of one symbol."""
    if row.get("history_days", 0) < cfg.min_history_days:
        return "INSUFFICIENT_HISTORY", 0.0, "Not enough trading days for reliable 52-week context."
    if row.get("close", np.nan) < cfg.min_price:
        return "FILTERED_LOW_PRICE", 0.0, f"Close below ${cfg.min_price:.2f}."
    if row.get("avg_dollar_volume_20d", 0) < cfg.min_avg_dollar_volume_20d:
        return "FILTERED_LOW_LIQUIDITY", 0.0, "20-day average dollar volume below liquidity threshold."

    close = float(row["close"])
    range_pos = float(row.get("range_position", np.nan))
    pct_from_low = float(row.get("pct_from_52w_low", np.nan))
    pct_to_high = float(row.get("pct_to_52w_high", np.nan))
    roc_20 = float(row.get("roc_20", np.nan))
    roc_63 = float(row.get("roc_63", np.nan))
    roc_126 = float(row.get("roc_126", np.nan))
    atr_pct = float(row.get("atr_pct_14", np.nan))
    rsi = float(row.get("rsi_14", np.nan))
    rel_vol = float(row.get("relative_volume_20d", np.nan))
    res_60 = float(row.get("resistance_60d", np.nan))
    res_90 = float(row.get("resistance_90d", np.nan))
    sma_50_slope = float(row.get("sma_50_slope_20d", np.nan))
    sma_200_slope = float(row.get("sma_200_slope_20d", np.nan))

    above_20 = bool(row.get("above_sma_20", False))
    above_50 = bool(row.get("above_sma_50", False))
    above_200 = bool(row.get("above_sma_200", False))
    bull_stack = bool(row.get("ma_bull_stack", False))
    bear_stack = bool(row.get("ma_bear_stack", False))
    higher_high_20d = bool(row.get("higher_high_20d", False))

    # Guard against early NaNs.
    def finite(x: float) -> bool:
        return isinstance(x, (int, float)) and math.isfinite(x)

    if not finite(range_pos):
        return "NO_SETUP", 0.0, "52-week range could not be calculated."

    # Phase 5: Momentum trend — already close to 52w highs and trend is stacked.
    momentum_conditions = [
        pct_to_high <= cfg.near_high_pct if finite(pct_to_high) else False,
        range_pos >= 0.75,
        bull_stack,
        above_20 and above_50 and above_200,
        roc_63 >= cfg.momentum_min_roc_63 if finite(roc_63) else False,
        sma_50_slope > 0 if finite(sma_50_slope) else False,
    ]
    momentum_score = sum(_score_bool(c, 100 / len(momentum_conditions)) for c in momentum_conditions)

    # Phase 4: Breakout — price clears prior resistance with volume and positive structure.
    breakout_level = np.nanmax([res_60, res_90]) if finite(res_60) or finite(res_90) else np.nan
    broke_resistance = finite(breakout_level) and close > breakout_level * (1.0 + cfg.breakout_buffer_pct)
    breakout_conditions = [
        broke_resistance,
        rel_vol >= cfg.breakout_volume_multiple if finite(rel_vol) else False,
        above_50,
        roc_20 > 0 if finite(roc_20) else False,
        0.35 <= range_pos <= 0.90,
        rsi >= 50 if finite(rsi) else False,
    ]
    breakout_score = sum(_score_bool(c, 100 / len(breakout_conditions)) for c in breakout_conditions)

    # Phase 3: Reversal — no longer bearish, recovering from 52w low, showing higher highs.
    reversal_conditions = [
        0.20 <= range_pos <= 0.65,
        above_50,
        roc_20 >= cfg.reversal_min_roc_20 if finite(roc_20) else False,
        roc_63 >= cfg.reversal_min_roc_63 if finite(roc_63) else False,
        higher_high_20d,
        rsi >= 50 if finite(rsi) else False,
    ]
    reversal_score = sum(_score_bool(c, 100 / len(reversal_conditions)) for c in reversal_conditions)

    # Phase 2: Accumulation/base — near 52w low, sideways, compressed volatility.
    accumulation_conditions = [
        pct_from_low <= cfg.near_low_pct if finite(pct_from_low) else False,
        range_pos <= 0.30,
        abs(roc_63) <= cfg.accumulation_max_roc_63_abs if finite(roc_63) else False,
        atr_pct <= cfg.accumulation_max_atr_pct if finite(atr_pct) else False,
        not bear_stack or above_20,
    ]
    accumulation_score = sum(_score_bool(c, 100 / len(accumulation_conditions)) for c in accumulation_conditions)

    # Phase 1: Downtrend — sellers still control; not an entry, usually a watchlist state.
    downtrend_conditions = [
        range_pos <= 0.35,
        bear_stack or (not above_50 and not above_200),
        roc_63 < 0 if finite(roc_63) else False,
        roc_126 < 0 if finite(roc_126) else False,
        sma_50_slope < 0 if finite(sma_50_slope) else False,
        sma_200_slope <= 0 if finite(sma_200_slope) else False,
    ]
    downtrend_score = sum(_score_bool(c, 100 / len(downtrend_conditions)) for c in downtrend_conditions)

    # Assign strongest actionable phase first. Breakout outranks reversal if both are true.
    phase_scores = {
        "MOMENTUM_TREND": momentum_score,
        "BREAKOUT": breakout_score,
        "REVERSAL": reversal_score,
        "ACCUMULATION": accumulation_score,
        "DOWNTREND": downtrend_score,
    }
    phase = max(phase_scores, key=phase_scores.get)
    score = phase_scores[phase]

    # Conservative threshold: below 60 means no clean setup.
    if score < 60:
        return "NO_SETUP", round(score, 2), "No phase reached the minimum confidence threshold."

    reason_parts = []
    if finite(pct_from_low):
        reason_parts.append(f"{pct_from_low:.1%} above 52w low")
    if finite(pct_to_high):
        reason_parts.append(f"{pct_to_high:.1%} below 52w high")
    if finite(range_pos):
        reason_parts.append(f"52w range position {range_pos:.2f}")
    if finite(roc_63):
        reason_parts.append(f"63d ROC {roc_63:.1%}")
    if finite(rel_vol):
        reason_parts.append(f"relative volume {rel_vol:.2f}x")
    if phase == "BREAKOUT" and finite(breakout_level):
        reason_parts.append(f"close {close:.2f} > resistance {breakout_level:.2f}")
    return phase, round(score, 2), "; ".join(reason_parts)


def scan(prices: pd.DataFrame, universe: Optional[pd.DataFrame], cfg: ScannerConfig) -> pd.DataFrame:
    df = prices.copy()

    if universe is not None:
        # Keep only listed common symbols if metadata exists; otherwise just join metadata.
        if "asset_type" in universe.columns:
            allowed_asset = universe["asset_type"].astype(str).str.lower().isin(["stock", "common stock", "equity", "adr"])
            universe = universe[allowed_asset | universe["asset_type"].isna()]
        if "exchange" in universe.columns:
            ex = universe["exchange"].astype(str).str.upper()
            allowed_ex = ex.isin(["NYSE", "NASDAQ", "NYSE AMERICAN", "AMEX", "ARCA", "BATS", "CBOE"])
            universe = universe[allowed_ex | universe["exchange"].isna()]
        df = df.merge(universe, on="symbol", how="inner")

    enriched = df.groupby("symbol", group_keys=False).apply(add_indicators)
    latest = enriched.sort_values(["symbol", "date"]).groupby("symbol", as_index=False).tail(1).copy()

    latest = latest.reset_index(drop=True)
    classifications = latest.apply(lambda r: classify_latest(r, cfg), axis=1, result_type="expand")
    classifications.columns = ["phase", "score", "reason"]
    classifications = classifications.reset_index(drop=True)
    out = pd.concat([latest, classifications], axis=1)

    # Output a clean ranked report.
    report_cols = [
        "symbol", "date", "phase", "score", "close", "low_52w", "high_52w", "range_position",
        "pct_from_52w_low", "pct_to_52w_high", "roc_20", "roc_63", "rsi_14",
        "relative_volume_20d", "avg_dollar_volume_20d", "resistance_60d", "resistance_90d", "reason",
    ]
    for optional_col in ["exchange", "asset_type", "name"]:
        if optional_col in out.columns and optional_col not in report_cols:
            report_cols.insert(1, optional_col)
    report_cols = [c for c in report_cols if c in out.columns]

    phase_order = {
        "BREAKOUT": 1,
        "REVERSAL": 2,
        "ACCUMULATION": 3,
        "MOMENTUM_TREND": 4,
        "DOWNTREND": 5,
        "NO_SETUP": 9,
    }
    out["phase_rank"] = out["phase"].map(phase_order).fillna(99)
    out = out.sort_values(["phase_rank", "score", "avg_dollar_volume_20d"], ascending=[True, False, False])
    return out[report_cols]


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan stocks for 52-week low-to-high reversal phases.")
    parser.add_argument("--prices", required=True, type=Path, help="CSV with symbol,date,open,high,low,close,volume")
    parser.add_argument("--universe", type=Path, help="Optional CSV with symbol,exchange,asset_type metadata")
    parser.add_argument("--out", type=Path, default=Path("scan_results.csv"), help="Output CSV path")
    parser.add_argument("--min-price", type=float, default=5.0)
    parser.add_argument("--min-dollar-volume", type=float, default=5_000_000.0)
    parser.add_argument("--include-non-setups", action="store_true", help="Keep NO_SETUP/FILTERED rows in output")
    return parser.parse_args(argv)


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    cfg = ScannerConfig(min_price=args.min_price, min_avg_dollar_volume_20d=args.min_dollar_volume)

    prices = load_prices(args.prices)
    universe = load_universe(args.universe)
    result = scan(prices, universe, cfg)

    if not args.include_non_setups:
        result = result[result["phase"].isin(["DOWNTREND", "ACCUMULATION", "REVERSAL", "BREAKOUT", "MOMENTUM_TREND"])]

    result.to_csv(args.out, index=False)
    print(f"Wrote {len(result):,} rows to {args.out}")
    if len(result):
        print(result[["symbol", "date", "phase", "score", "close", "reason"]].head(25).to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
