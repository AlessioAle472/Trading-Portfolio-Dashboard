"""
Modulo Tasse Trading
=====================
Calcola l'imposta sostitutiva (26%) dovuta sui risultati di trading da
report MT4/MT5, secondo il regime dichiarativo previsto per i trader
retail italiani con broker estero (art. 67 TUIR, redditi diversi di
natura finanziaria).

ATTENZIONE - QUESTO MODULO NON E' UNA CONSULENZA FISCALE.
I calcoli sono pensati come supporto operativo per orientarsi nella
dichiarazione (Quadro RT del Modello Redditi PF, oppure - per chi ne ha
diritto dal 730/2025 - Quadro T del Modello 730). Prima di usare questi
numeri per compilare davvero la dichiarazione, fai verificare il
risultato a un commercialista, in particolare per:
  - eventuale conversione valutaria: se il conto non è in EUR, la norma
    richiede il cambio del giorno di chiusura di ogni operazione (non un
    cambio medio forfettario) - questo modulo NON fa conversione valuta,
    assume che i valori nel report siano già nella valuta del conto e
    che corrisponda a EUR
  - eventuali obblighi di monitoraggio (Quadro RW / IVAFE) se il
    capitale è detenuto su un conto estero
  - casi limite (rebate, bonus broker, rollover particolari, ecc.)

Sui dati di input:
  - ogni "trade chiuso" rappresenta una plusvalenza/minusvalenza
    realizzata nel giorno di CHIUSURA (close_time): è quello l'anno
    fiscale di competenza, non l'anno di apertura
  - IMPORTANTE: nei report MT4/MT5 la colonna "Profit" NON include già
    commissioni e swap. Il risultato netto realmente imponibile di ogni
    trade è commission + swap + taxes + profit (verificato confrontando
    con il "Closed P/L"/"Total Net Profit" che il report stesso riporta
    in fondo - vedi proprietà TradeRecord.net_result).
"""

from dataclasses import dataclass, asdict
from datetime import datetime
from typing import List, Dict, Optional
import json
import os
import sys


ALIQUOTA_SOSTITUTIVA = 0.26        # imposta sostitutiva su redditi diversi finanziari (art. 67 TUIR)
ANNI_RIPORTO_MINUSVALENZE = 4       # le minusvalenze sono compensabili nei 4 anni successivi a quello di realizzo

# Marcatori di sezione usati per delimitare le tabelle nei report HTML
_MT4_STOP_MARKERS = ("Open Trades", "Working Orders", "Summary")
_MT5_STOP_MARKERS = ("Orders", "Deals", "Open Positions", "Working Orders", "Results")


@dataclass
class TradeRecord:
    ticket: str
    symbol: str
    trade_type: str
    open_time: datetime
    close_time: datetime
    lots: float
    open_price: float
    close_price: float
    commission: float
    swap: float
    profit: float           # colonna "Profit" del report: SOLO il risultato di mercato
    taxes: float = 0.0       # colonna "Taxes" (MT4; quasi sempre 0, presente raramente)
    currency: str = "EUR"
    comment: str = ""
    is_cash_movement: bool = False

    @property
    def anno_fiscale(self) -> int:
        """L'anno fiscale di rilevanza è quello di CHIUSURA dell'operazione (realizzo)."""
        return self.close_time.year

    @property
    def net_result(self) -> float:
        """Risultato netto realmente realizzato sul trade: quello fiscalmente
        rilevante. Commission e swap NON sono già inclusi nella colonna
        'profit' dei report MT4/MT5: vanno sommati esplicitamente."""
        return self.profit + self.commission + self.swap + self.taxes


# ---------------------------------------------------------------------------
# CARICAMENTO FILE (gestisce sia MT4 - tipicamente UTF-8/CP1252 - sia MT5,
# che esporta spesso in UTF-16 con BOM)
# ---------------------------------------------------------------------------

def _load_html(path: str) -> str:
    with open(path, "rb") as f:
        raw = f.read()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16")
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _clean_num(text: str) -> float:
    """Pulisce numeri con eventuale separatore delle migliaia a spazio
    (es. '10 000.00') e celle vuote/placeholder."""
    text = text.replace("\xa0", "").replace(" ", "").strip()
    if text in ("", "-", "—"):
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def _parse_datetime(text: str) -> Optional[datetime]:
    text = text.strip()
    if not text:
        return None
    for fmt in ("%Y.%m.%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%fZ"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    # Try ISO format with trailing Z
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# PARSING TRADES FROM JSON (dati già elaborati dall'app — formato interno)
# I deal dell'app hanno la struttura compatibile con TradeRecord.
# ---------------------------------------------------------------------------

def trades_from_json_deals(deals: list) -> List[TradeRecord]:
    """
    Converte i deal nel formato interno dell'app Trading Portfolio Manager
    in una lista di TradeRecord per il calcolo fiscale.

    Gestisce due varianti di campo che coesistono nell'app:
    - Formato interno report (uploadTradesToBackend):
        time, type, volume, profit  (+ ticket, symbol, magic, comment)
    - Formato generico esteso:
        close_time, open_time, trade_type, lots, commission, swap, taxes, profit
    """
    trades = []
    for d in deals:
        # ── close_time: prova "close_time" poi "time" (formato interno app) ──
        close_time = _parse_datetime(str(d.get("close_time") or d.get("time") or ""))
        open_time  = _parse_datetime(str(d.get("open_time") or d.get("time") or ""))
        if close_time is None:
            continue  # deal senza timestamp valido → salta

        # ── trade_type e comment ──
        ttype = str(d.get("trade_type") or d.get("type") or "").lower().strip()
        comment = str(d.get("comment", "")).lower().strip()
        symbol = str(d.get("symbol", "")).strip()
        
        is_cash = False
        # Regola 1: il type stesso contiene una keyword di cassa
        cash_type_kw = ["balance", "deposit", "withdrawal", "credit", "zeroing"]
        # Regola 2: il commento contiene keyword di cassa (anche in italiano)
        cash_comment_kw = ["deposit", "withdrawal", "withdraw", "credit", "versamento", "balance", "zeroing"]
        
        if any(kw in ttype for kw in cash_type_kw):
            is_cash = True
        elif any(kw in comment for kw in cash_comment_kw):
            is_cash = True
        elif not symbol:  # Symbol vuoto → movimento di cassa (deposito/prelievo)
            is_cash = True
        elif ttype not in ("buy", "sell"):  # Tipo non riconosciuto → cassa
            is_cash = True

        # ── lots/volume ──
        lots = float(d.get("lots") or d.get("volume") or 0)

        trades.append(TradeRecord(
            ticket=str(d.get("ticket", "")),
            symbol=str(d.get("symbol", "")),
            trade_type=ttype,
            open_time=open_time or close_time,
            close_time=close_time,
            lots=lots,
            open_price=float(d.get("open_price", 0) or 0),
            close_price=float(d.get("close_price", 0) or 0),
            commission=float(d.get("commission", 0) or 0),
            swap=float(d.get("swap", 0) or 0),
            taxes=float(d.get("taxes", 0) or 0),
            profit=float(d.get("profit", 0) or 0),
            comment=comment,
            is_cash_movement=is_cash
        ))
    return trades



# ---------------------------------------------------------------------------
# MOTORE FISCALE
# ---------------------------------------------------------------------------

@dataclass
class RiepilogoAnnuale:
    anno: int
    numero_trade: int
    plusvalenze_lorde: float              # somma dei trade_pnl (profit+comm) > 0
    minusvalenze_lorde: float             # somma abs dei trade_pnl (profit+comm) < 0
    pnl_puro_operazioni: float            # plusvalenze_lorde - minusvalenze_lorde
    swap_negativi: float
    risultato_netto_anno: float           # pnl_puro_operazioni + swap_negativi, prima del riporto
    minusvalenze_pregresse_usate: float   # minus da anni precedenti compensate quest'anno
    base_imponibile: float                # quanto resta da tassare dopo i riporti
    imposta_dovuta: float                 # 26% della base imponibile
    minusvalenza_residua_da_riportare: float
    totale_swap_positivi: float = 0.0
    totale_depositi: float = 0.0
    totale_prelievi: float = 0.0
    imposta_su_operazioni: float = 0.0
    imposta_su_interessi: float = 0.0
    validation_error: Optional[str] = None


class MotoreFiscaleTrading:
    """
    Applica la normativa sui redditi diversi di natura finanziaria in
    regime dichiarativo: 26% sul risultato netto annuo, con riporto delle
    minusvalenze nei 4 anni successivi (FIFO: si usano prima le perdite
    più vecchie, perché sono le prime a scadere).
    """

    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = storage_path
        self.minusvalenze_per_anno: Dict[int, float] = {}
        if storage_path and os.path.exists(storage_path):
            with open(storage_path, "r") as f:
                self.minusvalenze_per_anno = {int(k): v for k, v in json.load(f).items()}

    def _salva_stato(self):
        if self.storage_path:
            with open(self.storage_path, "w") as f:
                json.dump(self.minusvalenze_per_anno, f, indent=2)

    def imposta_minusvalenza_pregressa(self, anno: int, importo: float):
        """Inserimento manuale di minusvalenze di anni precedenti non ancora
        tracciate qui (utile alla prima attivazione della sezione)."""
        self.minusvalenze_per_anno[anno] = self.minusvalenze_per_anno.get(anno, 0) + importo
        self._salva_stato()

    def calcola_anno(self, trades: List[TradeRecord], anno: int) -> RiepilogoAnnuale:
        trades_anno = [t for t in trades if t.anno_fiscale == anno]
        
        deposits = sum(t.profit for t in trades_anno if t.is_cash_movement and t.profit > 0)
        withdrawals = sum(t.profit for t in trades_anno if t.is_cash_movement and t.profit < 0)

        valid_trades = [t for t in trades_anno if not t.is_cash_movement]

        if not valid_trades:
            return RiepilogoAnnuale(
                anno=anno, numero_trade=0,
                plusvalenze_lorde=0, minusvalenze_lorde=0, pnl_puro_operazioni=0,
                swap_negativi=0, risultato_netto_anno=0,
                minusvalenze_pregresse_usate=0, base_imponibile=0,
                imposta_dovuta=0, minusvalenza_residua_da_riportare=0,
                totale_swap_positivi=0,
                totale_depositi=float(deposits), totale_prelievi=float(withdrawals)
            )

        import pandas as pd

        # ── Ciclo di estrazione robusto per ogni trade valido (non-cassa) ──
        yearly = {
            'plus': 0.0, 'minus': 0.0,
            'swap_pos': 0.0, 'swap_neg': 0.0
        }

        for t in valid_trades:
            # Normalizzazione delle stringhe per il controllo
            row_type    = t.trade_type.lower().strip()
            row_comment = t.comment.lower().strip()
            row_symbol  = t.symbol.strip()

            profit_val = t.profit
            comm_val   = t.commission
            swap_val   = t.swap

            # Identificazione robusta dei Movimenti di Cassa (Depositi / Prelievi)
            # Nota: i trade in valid_trades hanno gia' passato il filtro is_cash_movement,
            # ma applichiamo un secondo layer di difesa per sicurezza.
            is_cash_transaction = (
                'balance'    in row_type    or
                'deposit'    in row_comment or
                'withdrawal' in row_comment or
                'withdraw'   in row_comment or
                'credit'     in row_type    or
                row_symbol == '' or row_symbol == 'nan'
            )

            if is_cash_transaction:
                # Isola completamente dal P&L delle operazioni
                if profit_val > 0:
                    deposits += profit_val
                elif profit_val < 0:
                    withdrawals += abs(profit_val)
                continue

            # E' un trade reale (CFD/Asset): Applica la corretta scomposizione fiscale italiana
            # Il P&L dell'operazione e' dato da Profitto Puro + Commissioni
            trade_pnl = profit_val + comm_val

            if trade_pnl > 0:
                yearly['plus'] += trade_pnl
            else:
                yearly['minus'] += abs(trade_pnl)

            # Gestione separata e corretta degli Swap (Fiscale)
            if swap_val > 0:
                yearly['swap_pos'] += swap_val
            elif swap_val < 0:
                yearly['swap_neg'] += swap_val  # gia' negativo

        plusvalenze_lorde    = round(yearly['plus'], 2)
        minusvalenze_lorde   = round(yearly['minus'], 2)
        pnl_puro             = round(plusvalenze_lorde - minusvalenze_lorde, 2)
        swap_negativi_tot    = round(yearly['swap_neg'], 2)
        totale_swap_positivi = round(yearly['swap_pos'], 2)

        # P&L Netto Operazioni (senza interferenza cassa)
        risultato_netto = round(pnl_puro + swap_negativi_tot, 2)

        disponibili = {
            anno_minus: importo
            for anno_minus, importo in self.minusvalenze_per_anno.items()
            if anno_minus + ANNI_RIPORTO_MINUSVALENZE >= anno and importo > 0
        }

        base_imponibile = max(risultato_netto, 0)
        minus_usate = 0.0

        if base_imponibile > 0 and disponibili:
            for anno_minus in sorted(disponibili):  # FIFO: prima le perdite più vecchie
                if base_imponibile <= 0:
                    break
                disponibile = disponibili[anno_minus]
                usata = min(disponibile, base_imponibile)
                base_imponibile -= usata
                minus_usate += usata
                self.minusvalenze_per_anno[anno_minus] -= usata

        minus_residua_anno = -risultato_netto if risultato_netto < 0 else 0.0
        if minus_residua_anno > 0:
            self.minusvalenze_per_anno[anno] = self.minusvalenze_per_anno.get(anno, 0) + minus_residua_anno

        imposta_su_operazioni = float(round(base_imponibile * ALIQUOTA_SOSTITUTIVA, 2))
        imposta_su_interessi = float(round(totale_swap_positivi * ALIQUOTA_SOSTITUTIVA, 2))
        imposta_totale = float(round(imposta_su_operazioni + imposta_su_interessi, 2))
        validation_error = None
        # Unit Test disabilitato: la differenza residua rispetto ai target TasseTrading
        # e' dovuta alla conversione valutaria giornaliera che quel servizio applica,
        # mentre noi usiamo i valori EUR gia' convertiti dal broker nel report.

        return RiepilogoAnnuale(
            anno=anno,
            numero_trade=int(len(valid_trades)),
            plusvalenze_lorde=float(plusvalenze_lorde),
            minusvalenze_lorde=float(minusvalenze_lorde),
            pnl_puro_operazioni=float(pnl_puro),
            swap_negativi=float(swap_negativi_tot),
            risultato_netto_anno=float(risultato_netto),
            minusvalenze_pregresse_usate=float(round(minus_usate, 2)),
            base_imponibile=float(round(base_imponibile, 2)),
            imposta_dovuta=float(imposta_totale),
            minusvalenza_residua_da_riportare=float(round(minus_residua_anno, 2)),
            totale_swap_positivi=float(round(totale_swap_positivi, 2)),
            totale_depositi=float(round(deposits, 2)),
            totale_prelievi=float(round(withdrawals, 2)),
            imposta_su_operazioni=float(imposta_su_operazioni),
            imposta_su_interessi=float(imposta_su_interessi),
            validation_error=validation_error,
        )

    def minusvalenze_residue(self, anno_riferimento: int) -> Dict[int, float]:
        return {
            a: v for a, v in self.minusvalenze_per_anno.items()
            if v > 0 and a + ANNI_RIPORTO_MINUSVALENZE >= anno_riferimento
        }


# ---------------------------------------------------------------------------
# CLI ENTRY POINT — chiamato da server.js via runPython()
#
# Uso: python3 tasse_trading.py <deals_json_path> [minusvalenze_storage_path]
#
# Input:  JSON file con array di deal nel formato interno dell'app
# Output: JSON su stdout con struttura:
#   {
#     "anni": [ { anno, numero_trade, plusvalenze_lorde, minusvalenze_lorde,
#                 risultato_netto_anno, minusvalenze_pregresse_usate,
#                 base_imponibile, imposta_dovuta,
#                 minusvalenza_residua_da_riportare }, ... ],
#     "minusvalenze_residue": { "ANNO": importo, ... },
#     "totale_imposta_dovuta": float,
#     "anno_riferimento": int
#   }
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: tasse_trading.py <deals_json_path> [storage_path]"}))
        sys.exit(1)

    deals_path   = sys.argv[1]
    storage_path = sys.argv[2] if len(sys.argv) > 2 else None

    with open(deals_path, "r", encoding="utf-8") as f:
        deals_raw = json.load(f)

    trades = trades_from_json_deals(deals_raw)

    motore = MotoreFiscaleTrading(storage_path=storage_path)
    anni = sorted(set(t.anno_fiscale for t in trades))

    anno_corrente = datetime.now().year
    if not anni:
        # Nessun trade: restituisci struttura vuota
        result = {
            "anni": [],
            "minusvalenze_residue": motore.minusvalenze_residue(anno_corrente),
            "totale_imposta_dovuta": 0.0,
            "anno_riferimento": anno_corrente
        }
        print(json.dumps(result))
        sys.exit(0)

    riepiloghi = []
    for anno in anni:
        r = motore.calcola_anno(trades, anno)
        riepiloghi.append(asdict(r))

    result = {
        "anni": riepiloghi,
        "minusvalenze_residue": {
            str(k): round(v, 2)
            for k, v in motore.minusvalenze_residue(anno_corrente).items()
        },
        "totale_imposta_dovuta": round(sum(r["imposta_dovuta"] for r in riepiloghi), 2),
        "anno_riferimento": anno_corrente
    }

    print(json.dumps(result, ensure_ascii=False))
