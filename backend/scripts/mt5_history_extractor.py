"""
mt5_history_extractor.py
-------------------------------------------------------------------------
Modulo Python per l'estrazione e la formattazione dei dati storici da MetaTrader 5 (MT5).

NOTA PER MAC OS:
La libreria ufficiale 'MetaTrader5' è compatibile solo con sistemi operativi Windows,
poiché comunica direttamente con il terminale tramite chiamate di sistema native di Windows.
Se utilizzi macOS, per eseguire questo script devi:
  1. Utilizzare una macchina virtuale Windows (es. Parallels, VMware) o un VPS Windows.
  2. Eseguire Python all'interno dello stesso ambiente Wine in cui gira MT5.
  3. In alternativa, utilizzare una connessione di tipo Socket/REST API tramite un Expert Advisor (EA)
     installato su MT5 che faccia da ponte verso macOS.
-------------------------------------------------------------------------
"""

import sys
import os
import pandas as pd
from datetime import datetime, timezone

# Tentativo di importazione della libreria MetaTrader5
try:
    import MetaTrader5 as mt5
except ImportError:
    print("❌ Errore: La libreria 'MetaTrader5' non è installata.")
    print("   Installala tramite: pip install MetaTrader5 (funziona solo su Windows)")
    # Non blocchiamo del tutto l'importazione per permettere l'ispezione statica del codice su Mac
    mt5 = None


class MT5HistoryExtractor:
    """Classe dedicata all'estrazione dello storico delle operazioni da MetaTrader 5."""

    def __init__(self, path=None, login=None, password=None, server=None):
        """
        Inizializza l'estrattore con i parametri del terminale e del conto MT5.

        :param path: Percorso assoluto dell'eseguibile terminal64.exe (es. "C:\\Program Files\\...\\terminal64.exe")
                     Utile se si hanno più terminali o se non è installato nel percorso standard.
        :param login: Numero di conto trading (opzionale se già connesso nel terminale).
        :param password: Password del conto trading (opzionale).
        :param server: Nome del server broker (opzionale).
        """
        self.path = path
        self.login = login
        self.password = password
        self.server = server
        self.connected = False

    def connect(self):
        """
        Stabilisce la connessione con il terminale MetaTrader 5.
        Gestisce le eccezioni in caso di mancata inizializzazione o terminale chiuso.
        """
        if mt5 is None:
            raise ImportError("La libreria 'MetaTrader5' non è disponibile in questo sistema.")

        print("🔄 Inizializzazione della connessione a MetaTrader 5...")
        
        # Configura i parametri di inizializzazione
        init_params = {}
        if self.path:
            init_params["path"] = os.path.abspath(self.path)
        if self.login:
            init_params["login"] = int(self.login)
        if self.password:
            init_params["password"] = self.password
        if self.server:
            init_params["server"] = self.server

        try:
            # Tenta di inizializzare la connessione al terminale
            initialized = mt5.initialize(**init_params)
            
            if not initialized:
                error_code = mt5.last_error()
                raise ConnectionError(
                    f"Impossibile connettersi a MT5. Codice errore: {error_code}.\n"
                    f"Verifica che il terminale sia installato e che il percorso sia corretto."
                )
            
            self.connected = True
            print("✅ Connessione a MetaTrader 5 stabilita con successo.")
            
            # Recupera le informazioni del conto per verificare il login
            account_info = mt5.account_info()
            if account_info is not None:
                print(f"   Conto Collegato: {account_info.login}")
                print(f"   Broker: {account_info.server}")
                print(f"   Valuta Conto: {account_info.currency}")
                print(f"   Nome Utente: {account_info.name}")
            else:
                print("⚠️ Connesso al terminale, ma nessun conto risulta loggato al momento.")

        except Exception as e:
            print(f"❌ Errore critico durante la connessione a MT5: {e}", file=sys.stderr)
            self.disconnect()
            raise

    def get_history_deals(self, from_date, to_date=None):
        """
        Estrae lo storico delle transazioni (deals) all'interno di un intervallo temporale dinamico.

        :param from_date: Data inizio estrazione (oggetto datetime).
        :param to_date: Data fine estrazione (oggetto datetime, default: ora attuale).
        :return: Pandas DataFrame contenente lo storico strutturato e pulito.
        """
        if not self.connected:
            self.connect()

        if to_date is None:
            to_date = datetime.now()

        # Validazione date
        if not isinstance(from_date, datetime) or not isinstance(to_date, datetime):
            raise ValueError("I parametri 'from_date' e 'to_date' devono essere oggetti datetime validi.")

        print(f"📥 Estrazione storico operazioni dal {from_date.strftime('%Y.%m.%d %H:%M:%S')} al {to_date.strftime('%Y.%m.%d %H:%M:%S')}...")

        try:
            # Richiede lo storico a MT5
            deals = mt5.history_deals_get(from_date, to_date)
            
            if deals is None:
                error_code = mt5.last_error()
                print(f"⚠️ Estrazione fallita. Codice errore MT5: {error_code}", file=sys.stderr)
                return pd.DataFrame()

            if len(deals) == 0:
                print("ℹ️ Nessuna transazione (deal) trovata nel periodo selezionato.")
                return pd.DataFrame()

            print(f"🔍 Trovate {len(deals)} transazioni grezze. Elaborazione e filtraggio...")

            processed_trades = []

            for deal in deals:
                # MT5 registra nel log storico sia le operazioni di trading che i movimenti di bilancio (depositi/prelievi).
                # Escludiamo le transazioni che non hanno un simbolo di mercato associato (es. 'balance', 'credit' ecc.)
                if not deal.symbol:
                    continue
                
                # Escludiamo le transazioni di entrata pura ('in') se vogliamo solo calcolare i profitti finali realizzati.
                # In MT5:
                # - deal.entry = 0 (DEAL_ENTRY_IN): Apertura della posizione
                # - deal.entry = 1 (DEAL_ENTRY_OUT): Chiusura della posizione (qui viene registrato il profitto/loss finale)
                # - deal.entry = 2 (DEAL_ENTRY_INOUT): Parziale chiusura o inversione di posizione
                # Se vogliamo l'equity e i profitti reali ad ogni chiusura, consideriamo solo OUT e INOUT.
                # Se invece vogliamo mappare anche l'apertura lotti, teniamo traccia di tutto.
                # Manteniamo il comportamento analogo al report HTML: salviamo solo i deal con profitto (OUT o IN/OUT) o tutti,
                # ma calcoliamo i profitti netti per ciascuna operazione.
                
                # Mappatura tipo di operazione (0: Buy, 1: Sell)
                type_str = "buy" if deal.type == mt5.DEAL_TYPE_BUY else "sell" if deal.type == mt5.DEAL_TYPE_SELL else str(deal.type)
                
                # Mappatura tipo di ingresso/uscita
                entry_str = "in"
                if deal.entry == mt5.DEAL_ENTRY_OUT:
                    entry_str = "out"
                elif deal.entry == mt5.DEAL_ENTRY_INOUT:
                    entry_str = "in/out"

                # Converti il timestamp UNIX (deal.time) in un oggetto datetime leggibile locale
                dt_readable = datetime.fromtimestamp(deal.time, tz=timezone.utc).astimezone(None)
                
                # Calcola il Profitto Netto reale dell'operazione
                # profitto netto = profitto lordo + commissioni + swap
                net_profit = round(deal.profit + deal.commission + deal.swap, 2)

                trade_data = {
                    "Ticket": deal.ticket,                     # ID transazione
                    "PositionID": deal.position_id,             # ID posizione (collega IN e OUT)
                    "Order": deal.order,                       # ID ordine originario
                    "Time": dt_readable.strftime("%Y.%m.%d %H:%M:%S"),
                    "Symbol": deal.symbol,                     # Simbolo traded (es. EURUSD)
                    "Type": type_str,                           # Tipo: buy / sell
                    "Direction": entry_str,                    # in / out / in/out
                    "Volume": deal.volume,                     # Lotti / Volume operato
                    "Price": deal.price,                       # Prezzo di esecuzione
                    "Commission": deal.commission,             # Commissioni applicate
                    "Swap": deal.swap,                         # Swap/Mantenimento maturato
                    "Profit": deal.profit,                     # Profitto lordo
                    "NetProfit": net_profit,                   # Profitto netto
                    "MagicNumber": deal.magic,                 # Magic Number dell'Expert Advisor
                    "Comment": deal.comment.strip() if deal.comment else "",  # Commento dell'operazione
                }
                
                processed_trades.append(trade_data)

            # Conversione in DataFrame Pandas
            df = pd.DataFrame(processed_trades)
            
            if not df.empty:
                # Ordina cronologicamente per data/ora
                df = df.sort_values(by="Time").reset_index(drop=True)
                print(f"✅ Storico estratto ed elaborato correttamente! Totale operazioni di trading: {len(df)}")
            else:
                print("ℹ️ Nessuna transazione di trading trovata nel periodo selezionato.")

            return df

        except Exception as e:
            print(f"❌ Errore durante l'estrazione dello storico da MT5: {e}", file=sys.stderr)
            raise

    def disconnect(self):
        """Disconnette in sicurezza l'applicazione dal terminale MT5 liberando le risorse."""
        if self.connected:
            if mt5 is not None:
                mt5.shutdown()
            self.connected = False
            print("🔌 Connessione a MetaTrader 5 chiusa correttamente.")

    def __enter__(self):
        """Supporto per il protocollo 'with' context manager."""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Assicura la disconnessione automatica uscendo dal blocco 'with'."""
        self.disconnect()


# =========================================================================
# ESEMPIO DI UTILIZZO E CALCOLO STATISTICHE
# =========================================================================
if __name__ == "__main__":
    # Questo blocco viene eseguito solo se esegui direttamente questo file python.
    # Utile per testare la connessione a MT5 in locale.
    
    # Range di date per l'analisi (es. ultimi 6 mesi)
    data_inizio = datetime(2026, 1, 1)
    data_fine = datetime.now()

    print("--- TEST ESTRATTORE STORICO MT5 ---")
    
    # Istanziamo ed eseguiamo l'estrattore con un context manager (consigliato per mt5.shutdown automatico)
    try:
        # Nota: Puoi passare il percorso del tuo terminale, es:
        # extractor = MT5HistoryExtractor(path="C:\\Program Files\\MetaTrader 5\\terminal64.exe")
        with MT5HistoryExtractor() as extractor:
            # Estrae lo storico operazioni
            df_storico = extractor.get_history_deals(data_inizio, data_fine)
            
            if not df_storico.empty:
                # Mostra le prime 5 righe del DataFrame
                print("\n👀 Anteprima delle prime 5 operazioni estratte:")
                print(df_storico[["Time", "Symbol", "Type", "Direction", "Volume", "MagicNumber", "Comment", "NetProfit"]].head())
                
                # --- ESEMPIO ANALISI DATI E STATISTICHE STRATEGIA ---
                print("\n📈 Esempio Analisi Strategie (Raggruppate per Magic Number e Commento):")
                
                # Consideriamo solo le operazioni di uscita per calcolare le performance reali (chiuse)
                df_closed = df_storico[df_storico["Direction"].isin(["out", "in/out"])]
                
                if not df_closed.empty:
                    # Raggruppa i dati per MagicNumber e Commento
                    summary = df_closed.groupby(["MagicNumber", "Comment"]).agg(
                        Operazioni=("Ticket", "count"),
                        Volume_Totale=("Volume", "sum"),
                        Profitto_Netto=("NetProfit", "sum"),
                        Win_Rate=("NetProfit", lambda x: round((x > 0).sum() / len(x) * 100, 2))
                    ).reset_index()
                    
                    print(summary.to_string(index=False))
                else:
                    print("⚠️ Nessuna operazione chiusa (di tipo OUT o IN/OUT) trovata per il calcolo delle statistiche.")
            
    except ImportError:
        print("\n💡 Per testare lo script in locale, assicurati di essere su Windows e di aver installato la libreria con 'pip install MetaTrader5'.")
    except Exception as e:
        print(f"\n❌ Errore durante l'esecuzione del test: {e}")
