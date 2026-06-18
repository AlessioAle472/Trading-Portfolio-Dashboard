#!/usr/bin/env python3
"""
equity_chart.py
Generates equity curve data for a single strategy or an aggregated group.
Output: JSON array of { date, profit, cumulative, trade_count }
sorted chronologically, ready for Recharts AreaChart.

Usage:
  python3 equity_chart.py <portfolio_path> <deals_path> <mode> <strategy_ids_json>
  mode: 'single' | 'group'
  strategy_ids_json: JSON array of strategy IDs, e.g. '["id1", "id2"]'
"""
import sys
import os
import json
import re
import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# Re-use the same symbol/magic matching logic from portfolio_manager.py
# ─────────────────────────────────────────────────────────────────────────────
SYMBOL_ALIASES = {
    "US100": ["USTECH", "NAS100", "USTEC", "NDX", "NQ", "US100CASH"],
    "USTECH": ["US100", "NAS100", "USTEC", "NDX", "NQ", "US100CASH"],
    "NAS100": ["US100", "USTECH", "USTEC", "NDX"],
    "DE40": ["GER40", "DAX40", "DAX", "GER30", "DE30", "GER40CASH"],
    "UK100": ["FTSE100", "UK100CASH"],
    "US30": ["DJ30", "DOW30", "US30CASH"],
    "SP500": ["US500", "SPX500", "SP500CASH"],
    "JP225": ["JPN225", "NIKK225"],
    "XAUUSD": ["GOLD", "XAUUSD.cash", "GOLD.cash"],
    "GOLD":   ["XAUUSD", "XAUUSD.cash"],
    "XAGUSD": ["SILVER"],
    "XTIUSD": ["OIL", "WTI", "CRUDE"],
    "BRENT":  ["XBRUSD", "UKOIL", "OIL.UK"],
    "XBRUSD": ["BRENT", "UKOIL"],
    "BTCUSD": ["BTC", "BITCOIN"],
    "ETHUSD": ["ETH", "ETHEREUM"],
}


def normalise_symbol(sym: str) -> str:
    if not sym:
        return ""
    sym = sym.upper().strip()
    sym = re.sub(r"[.#]?(CASH|PRO|ECN|STP|C|R|M|N|X)$", "", sym)
    sym = re.sub(r"[.#]", "", sym)
    return sym.strip()


def symbol_matches(deal_sym: str, strat_mercato: str) -> bool:
    if not deal_sym or not strat_mercato:
        return False
    d = normalise_symbol(deal_sym)
    s = normalise_symbol(strat_mercato)
    if d == s:
        return True
    d_aliases = set(SYMBOL_ALIASES.get(d, []))
    s_aliases = set(SYMBOL_ALIASES.get(s, []))
    if s in d_aliases or d in s_aliases:
        return True
    for key, aliases in SYMBOL_ALIASES.items():
        normed_aliases = [normalise_symbol(a) for a in aliases]
        normed_key = normalise_symbol(key)
        if d in normed_aliases and (s == normed_key or s in normed_aliases):
            return True
        if s in normed_aliases and (d == normed_key or d in normed_aliases):
            return True
    return False


def matches_magic(deal_magic, strat_magic_str) -> bool:
    if not strat_magic_str:
        return False
    deal_magic_str = str(deal_magic).strip()
    strat_magic_str = str(strat_magic_str).strip()
    if not deal_magic_str or deal_magic_str in ("0", "", "N/A", "n/a"):
        return False
    if deal_magic_str == strat_magic_str:
        return True
    range_match = re.match(r"^(\d+)\s*-{1,2}\s*(\d+)$", strat_magic_str)
    if range_match:
        try:
            start = int(range_match.group(1))
            end = int(range_match.group(2))
            val = int(float(deal_magic_str))
            if start <= val <= end:
                return True
        except ValueError:
            pass
    if "," in strat_magic_str:
        try:
            parts = [p.strip() for p in strat_magic_str.split(",")]
            val_int_str = str(int(float(deal_magic_str)))
            if deal_magic_str in parts or val_int_str in parts:
                return True
        except ValueError:
            pass
    return False


def matches_magic_in_notes(deal_magic, strat_notes_str) -> bool:
    if not strat_notes_str or not deal_magic:
        return False
    deal_magic_str = str(deal_magic).strip()
    if not deal_magic_str or deal_magic_str in ("0", "", "N/A", "n/a"):
        return False
    numbers_in_notes = re.findall(r"\d{3,10}", strat_notes_str)
    try:
        deal_val_str = str(int(float(deal_magic_str)))
    except ValueError:
        deal_val_str = deal_magic_str
    return (deal_magic_str in numbers_in_notes) or (deal_val_str in numbers_in_notes)


def clean_string(s: str) -> str:
    if not s:
        return ""
    s_cleaned = re.sub(r"\b(H1|H4|M15|M30|M5|M1|D1|W1)\b", "", s, flags=re.IGNORECASE)
    return re.sub(r"[^A-Z0-9]", "", s_cleaned.upper())


def text_matches(deal_comment: str, strat_nome: str) -> bool:
    if not deal_comment or not strat_nome:
        return False
    c = clean_string(deal_comment)
    n = clean_string(strat_nome)
    if not c or not n:
        return False
    return (n in c) or (c in n)


def matches_magic_and_symbol(row, strat_magic_str: str, strat_mercato: str, strat_nome: str, strat_notes: str) -> bool:
    if matches_magic(row.get("magic", "0"), strat_magic_str):
        if not strat_mercato:
            return True
        return symbol_matches(str(row.get("symbol", "")), strat_mercato)
    if matches_magic_in_notes(row.get("magic", "0"), strat_notes):
        if not strat_mercato:
            return True
        return symbol_matches(str(row.get("symbol", "")), strat_mercato)
    if text_matches(row.get("comment", ""), strat_nome):
        if not strat_mercato:
            return True
        return symbol_matches(str(row.get("symbol", "")), strat_mercato)
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Equity curve generation
# ─────────────────────────────────────────────────────────────────────────────
def get_strategy_deals(strat: dict, df_deals: pd.DataFrame) -> pd.DataFrame:
    """Return the subset of df_deals that belongs to this strategy."""
    if df_deals.empty:
        return pd.DataFrame()
    magic = strat.get("magic", "")
    nome = strat.get("nome", "")
    mercato = strat.get("mercato", "")
    notes = strat.get("note", "")
    mask = df_deals.apply(
        lambda row: matches_magic_and_symbol(row, magic, mercato, nome, notes), axis=1
    )
    return df_deals[mask].copy()


def build_equity_series(deals_subset: pd.DataFrame, label: str = "") -> list:
    """
    Given a dataframe of matching deals, sort by time and compute:
    - cumulative equity (cumsum)
    - high water mark (cummax of cumulative equity)
    - drawdown in currency (equity - high_water_mark, always ≤ 0)
    Returns a list of dicts ready for Recharts: { date, profit, cumulative, drawdown, high_water_mark, symbol }.
    """
    if deals_subset.empty:
        return []

    df = deals_subset.copy()

    # Parse and sort by time
    df["parsed_time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.sort_values("parsed_time").reset_index(drop=True)

    # Ensure profit is numeric
    df["profit"] = pd.to_numeric(df["profit"], errors="coerce").fillna(0.0)

    # Cumulative equity
    df["cumulative"] = df["profit"].cumsum()

    # High Water Mark: running maximum of cumulative equity
    df["high_water_mark"] = df["cumulative"].cummax()

    # Drawdown in currency: distance below the peak (always ≤ 0)
    df["drawdown"] = df["cumulative"] - df["high_water_mark"]

    # Build output list
    result = []
    for _, row in df.iterrows():
        ts = row["parsed_time"]
        date_str = ts.strftime("%Y-%m-%d %H:%M") if not pd.isna(ts) else "N/A"
        result.append({
            "date": date_str,
            "profit": round(float(row["profit"]), 2),
            "cumulative": round(float(row["cumulative"]), 2),
            "high_water_mark": round(float(row["high_water_mark"]), 2),
            "drawdown": round(float(row["drawdown"]), 2),
            "symbol": str(row.get("symbol", "")),
            "magic": str(row.get("magic", "")),
            "ticket": str(row.get("ticket", "")),
        })
    return result



# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 5:
        print(json.dumps({"error": "Usage: equity_chart.py <portfolio_path> <deals_path> <mode> <strategy_ids_json>"}))
        sys.exit(1)

    portfolio_path = sys.argv[1]
    deals_path = sys.argv[2]
    mode = sys.argv[3]           # 'single' or 'group'
    strategy_ids_raw = sys.argv[4]  # JSON array of strategy IDs

    try:
        strategy_ids = json.loads(strategy_ids_raw)
    except Exception:
        print(json.dumps({"error": f"Invalid strategy_ids JSON: {strategy_ids_raw}"}))
        sys.exit(1)

    if not os.path.exists(portfolio_path):
        print(json.dumps({"error": f"Portfolio file not found: {portfolio_path}"}))
        sys.exit(1)

    try:
        with open(portfolio_path, "r", encoding="utf-8") as f:
            portfolio = json.load(f)
    except Exception as e:
        print(json.dumps({"error": f"Failed to parse portfolio JSON: {e}"}))
        sys.exit(1)

    deals = []
    if os.path.exists(deals_path):
        try:
            with open(deals_path, "r", encoding="utf-8") as f:
                deals = json.load(f)
        except Exception:
            deals = []

    df_deals = pd.DataFrame(deals)

    # Flatten all strategies from all tabs
    all_strategies = {}
    for tab_name, strats in portfolio.items():
        for strat in strats:
            strat_id = strat.get("id")
            if strat_id:
                all_strategies[strat_id] = {**strat, "_tab": tab_name}

    if mode == "single":
        # Generate equity for a single strategy
        if not strategy_ids:
            print(json.dumps({"error": "strategy_ids must have at least one ID for mode=single"}))
            sys.exit(1)

        strat_id = strategy_ids[0]
        strat = all_strategies.get(strat_id)
        if not strat:
            print(json.dumps({"error": f"Strategy ID '{strat_id}' not found in portfolio"}))
            sys.exit(1)

        subset = get_strategy_deals(strat, df_deals)
        series = build_equity_series(subset, label=strat.get("nome", strat_id))

        print(json.dumps({
            "mode": "single",
            "strategy_id": strat_id,
            "strategy_name": strat.get("nome", ""),
            "mercato": strat.get("mercato", ""),
            "magic": strat.get("magic", ""),
            "total_deals": len(subset),
            "series": series
        }, indent=2, ensure_ascii=False))

    elif mode == "group":
        # Aggregate all deals from all strategies in the group, then build unified equity
        if not strategy_ids:
            print(json.dumps({"error": "strategy_ids must be non-empty for mode=group"}))
            sys.exit(1)

        all_group_deals = pd.DataFrame()
        strategies_found = []
        for strat_id in strategy_ids:
            strat = all_strategies.get(strat_id)
            if not strat:
                continue
            subset = get_strategy_deals(strat, df_deals)
            if not subset.empty:
                strategies_found.append({
                    "id": strat_id,
                    "nome": strat.get("nome", ""),
                    "magic": strat.get("magic", ""),
                    "mercato": strat.get("mercato", ""),
                    "deal_count": len(subset)
                })
                all_group_deals = pd.concat([all_group_deals, subset], ignore_index=True)

        # Deduplicate by ticket (in case same deal matched multiple strategies)
        if not all_group_deals.empty and "ticket" in all_group_deals.columns:
            all_group_deals = all_group_deals.drop_duplicates(subset=["ticket"])

        series = build_equity_series(all_group_deals, label="group")

        print(json.dumps({
            "mode": "group",
            "total_deals": len(all_group_deals),
            "strategies": strategies_found,
            "series": series
        }, indent=2, ensure_ascii=False))

    else:
        print(json.dumps({"error": f"Unknown mode: {mode}. Use 'single' or 'group'."}))
        sys.exit(1)


if __name__ == "__main__":
    main()
