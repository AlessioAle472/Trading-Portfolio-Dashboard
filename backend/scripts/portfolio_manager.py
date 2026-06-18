#!/usr/bin/env python3
"""
portfolio_manager.py
Match deals to strategies by BOTH Magic Number AND Symbol (cross).
The same Magic Number can run on multiple crosses — only deals whose
symbol matches the strategy's `mercato` field are counted.
"""
import sys
import os
import json
import re
import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# Symbol alias normalisation map
# ─────────────────────────────────────────────────────────────────────────────
SYMBOL_ALIASES = {
    # Indices
    "US100": ["USTECH", "NAS100", "USTEC", "NDX", "NQ", "US100CASH"],
    "USTECH": ["US100", "NAS100", "USTEC", "NDX", "NQ", "US100CASH"],
    "NAS100": ["US100", "USTECH", "USTEC", "NDX"],
    "DE40": ["GER40", "DAX40", "DAX", "GER30", "DE30", "GER40CASH"],
    "UK100": ["FTSE100", "UK100CASH"],
    "US30": ["DJ30", "DOW30", "US30CASH"],
    "SP500": ["US500", "SPX500", "SP500CASH"],
    "JP225": ["JPN225", "NIKK225"],
    # Commodities
    "XAUUSD": ["GOLD", "XAUUSD.cash", "GOLD.cash"],
    "GOLD":   ["XAUUSD", "XAUUSD.cash"],
    "XAGUSD": ["SILVER"],
    "XTIUSD": ["OIL", "WTI", "CRUDE"],
    "BRENT":  ["XBRUSD", "UKOIL", "OIL.UK"],
    "XBRUSD": ["BRENT", "UKOIL"],
    # Crypto
    "BTCUSD": ["BTC", "BITCOIN"],
    "ETHUSD": ["ETH", "ETHEREUM"],
}

def normalise_symbol(sym: str) -> str:
    """Strip broker suffixes (.r, .cash, c, #, etc.) and uppercase."""
    if not sym:
        return ""
    sym = sym.upper().strip()
    # Remove common broker suffixes
    sym = re.sub(r"[.#]?(CASH|PRO|ECN|STP|C|R|M|N|X)$", "", sym)
    sym = re.sub(r"[.#]", "", sym)
    return sym.strip()

def symbol_matches(deal_sym: str, strat_mercato: str) -> bool:
    """
    Return True if deal_sym and strat_mercato refer to the same instrument.
    Considers direct equality and known alias groups.
    """
    if not deal_sym or not strat_mercato:
        return False

    d = normalise_symbol(deal_sym)
    s = normalise_symbol(strat_mercato)

    if d == s:
        return True

    # Check alias map
    d_aliases = set(SYMBOL_ALIASES.get(d, []))
    s_aliases = set(SYMBOL_ALIASES.get(s, []))

    if s in d_aliases or d in s_aliases:
        return True

    # Cross-check: is d listed as an alias for s, or vice-versa?
    for key, aliases in SYMBOL_ALIASES.items():
        normed_aliases = [normalise_symbol(a) for a in aliases]
        normed_key = normalise_symbol(key)
        if d in normed_aliases and (s == normed_key or s in normed_aliases):
            return True
        if s in normed_aliases and (d == normed_key or d in normed_aliases):
            return True

    return False


# ─────────────────────────────────────────────────────────────────────────────
# Magic number matching helpers (unchanged from v1, kept for clarity)
# ─────────────────────────────────────────────────────────────────────────────
def matches_magic(deal_magic, strat_magic_str) -> bool:
    """Check if deal_magic matches the strategy's magic spec (exact / range / list)."""
    if not strat_magic_str:
        return False

    deal_magic_str = str(deal_magic).strip()
    strat_magic_str = str(strat_magic_str).strip()

    if not deal_magic_str or deal_magic_str in ("0", "", "N/A", "n/a"):
        return False

    # Direct equality
    if deal_magic_str == strat_magic_str:
        return True

    # Range: "25000 - 25001" or "25000 -- 25001"
    # Support single or double dashes, with or without spaces
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

    # Comma-separated list: "25000, 25001, 25002"
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
    """Check if the deal's magic is mentioned anywhere inside the strategy notes."""
    if not strat_notes_str or not deal_magic:
        return False
    deal_magic_str = str(deal_magic).strip()
    if not deal_magic_str or deal_magic_str in ("0", "", "N/A", "n/a"):
        return False
    
    # Extract all digit sequences of at least 3 digits from notes
    numbers_in_notes = re.findall(r"\d{3,10}", strat_notes_str)
    
    # Clean deal magic to simple integer string if possible
    try:
        deal_val_str = str(int(float(deal_magic_str)))
    except ValueError:
        deal_val_str = deal_magic_str

    return (deal_magic_str in numbers_in_notes) or (deal_val_str in numbers_in_notes)


def clean_string(s: str) -> str:
    """Convert to uppercase and remove all non-alphanumeric characters."""
    if not s:
        return ""
    # Remove H1, M15, M30, H4 common timeframes from text comparisons to avoid mismatch
    s_cleaned = re.sub(r"\b(H1|H4|M15|M30|M5|M1|D1|W1)\b", "", s, flags=re.IGNORECASE)
    return re.sub(r"[^A-Z0-9]", "", s_cleaned.upper())


def text_matches(deal_comment: str, strat_nome: str) -> bool:
    """
    Check if the normalised strategy name is contained within the normalised deal comment,
    or vice versa. This acts as a robust text fallback when magic numbers don't match.
    """
    if not deal_comment or not strat_nome:
        return False
    c = clean_string(deal_comment)
    n = clean_string(strat_nome)
    if not c or not n:
        return False
    # Rileva se uno contiene l'altro (es. "CRIPTOXAU311113" in "CRIPTOXAU311113H1")
    return (n in c) or (c in n)


def matches_magic_and_symbol(row, strat_magic_str: str, strat_mercato: str, strat_nome: str, strat_notes: str) -> bool:
    """
    A deal matches a strategy when:
    1. Direct Magic Number matches (range, list, equality) AND symbol matches.
    2. A magic number found inside the strategy notes matches the deal's magic AND symbol matches.
    3. The strategy name matches the deal comment textually AND symbol matches.
    """
    # 1. Regola principale: Magic Number diretto
    if matches_magic(row.get("magic", "0"), strat_magic_str):
        if not strat_mercato:
            return True
        return symbol_matches(str(row.get("symbol", "")), strat_mercato)

    # 2. Fallback: Magic alternativo trovato nelle note (es. "Magic MT4: 2000531")
    if matches_magic_in_notes(row.get("magic", "0"), strat_notes):
        if not strat_mercato:
            return True
        return symbol_matches(str(row.get("symbol", "")), strat_mercato)

    # 3. Fallback: Match testuale tra nome strategia e commento deal
    if text_matches(row.get("comment", ""), strat_nome):
        if not strat_mercato:
            return True
        return symbol_matches(str(row.get("symbol", "")), strat_mercato)

    return False


# ─────────────────────────────────────────────────────────────────────────────
# Core calculation
# ─────────────────────────────────────────────────────────────────────────────
def calculate_strategy_stats(strat: dict, df_deals: pd.DataFrame) -> dict:
    magic         = strat.get("magic", "")
    nome          = strat.get("nome", "")
    mercato       = strat.get("mercato", "")
    notes         = strat.get("note", "")
    lotti         = float(strat.get("lotti", 0.01) or 0.01)

    mc_dd_val     = strat.get("mc_dd")
    max_dd_percent_teorico = float(mc_dd_val) if mc_dd_val not in (None, "") else 0.0

    mc_dd_curr_val = strat.get("mc_dd_currency")
    max_dd_currency_teorico = float(mc_dd_curr_val) if mc_dd_curr_val not in (None, "") else 0.0

    # ── Filter deals by magic + symbol ──────────────────────────────────────
    strat_deals = pd.DataFrame()
    if not df_deals.empty:
        mask = df_deals.apply(
            lambda row: matches_magic_and_symbol(row, magic, mercato, nome, notes), axis=1
        )
        strat_deals = df_deals[mask]

    total_live_trades = len(strat_deals)

    # Unique symbols found (for debug / display)
    symbols_found = sorted(strat_deals["symbol"].dropna().unique().tolist()) if total_live_trades > 0 else []

    base = {
        "id":                     strat.get("id"),
        "magic_number":           magic,
        "nome_strategia":         nome,
        "mercato":                mercato,
        "current_lots":           lotti,
        "total_live_trades":      total_live_trades,
        "max_dd_percent_teorico": max_dd_percent_teorico,
        "max_dd_currency_teorico":max_dd_currency_teorico,
        "symbols_found":          symbols_found,
    }

    if total_live_trades == 0:
        return {
            **base,
            "live_dd_percent":         0.0,
            "live_net_profit_currency":0.0,
            "status_code":             "VERDE",
            "status_text":             "OK",
            "action_text":             "👍 Mantenere Size",
        }

    # ── Sort deals by time ───────────────────────────────────────────────────
    if "time" in strat_deals.columns:
        strat_deals = strat_deals.copy()
        strat_deals["parsed_time"] = pd.to_datetime(strat_deals["time"], errors="coerce")
        strat_deals = strat_deals.sort_values("parsed_time")

    # ── Net profit ───────────────────────────────────────────────────────────
    net_profit = float(strat_deals["profit"].sum())

    # ── Max drawdown (relative to a synthetic equity curve starting at 10 000)
    starting_balance = 10_000.0
    equity = starting_balance
    peak   = starting_balance
    max_dd_curr = 0.0
    max_dd_pct  = 0.0

    for _, row in strat_deals.iterrows():
        p = float(row.get("profit", 0.0))
        equity += p
        if equity > peak:
            peak = equity
        dd_curr = peak - equity
        dd_pct  = (dd_curr / peak * 100.0) if peak > 0 else 0.0
        if dd_curr > max_dd_curr:
            max_dd_curr = dd_curr
        if dd_pct > max_dd_pct:
            max_dd_pct = dd_pct

    live_dd_percent          = round(max_dd_pct, 2)
    live_net_profit_currency = round(net_profit, 2)

    # ── Semafori ─────────────────────────────────────────────────────────────
    if max_dd_percent_teorico <= 0:
        status_code = "VERDE"
        status_text = "OK"
    elif live_dd_percent >= max_dd_percent_teorico:
        status_code = "ROSSO"
        status_text = "DA SPEGNERE"
    elif live_dd_percent >= (max_dd_percent_teorico * 0.8):
        status_code = "GIALLO"
        status_text = "MONITORARE"
    else:
        status_code = "VERDE"
        status_text = "OK"

    # ── Pollici ───────────────────────────────────────────────────────────────
    if status_code == "ROSSO":
        action_text = "❌ Spegnere Strategia (Kill Switch)"
    elif status_code == "GIALLO":
        action_text = "👎 Dimezzare Size (Half-Risk)" if lotti > 0.01 else "⚠️ Mantenere a 0.01 (Rischio Minimo)"
    else:
        if total_live_trades >= 100 and live_net_profit_currency >= max_dd_currency_teorico:
            action_text = "👍 Incrementare Size (+0.01)"
        else:
            action_text = "👍 Mantenere Size"

    return {
        **base,
        "live_dd_percent":          live_dd_percent,
        "live_net_profit_currency": live_net_profit_currency,
        "status_code":              status_code,
        "status_text":              status_text,
        "action_text":              action_text,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing portfolio and deals paths arguments."}))
        sys.exit(1)

    portfolio_path = sys.argv[1]
    deals_path     = sys.argv[2]

    if not os.path.exists(portfolio_path):
        print(json.dumps({"error": f"Portfolio file not found at {portfolio_path}"}))
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

    results = {}
    for tab_name, strats in portfolio.items():
        results[tab_name] = []
        for strat in strats:
            results[tab_name].append(calculate_strategy_stats(strat, df_deals))

    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
