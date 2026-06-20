//+------------------------------------------------------------------+
//|                                           MT5HistorySender.mq5   |
//|                                                    Antigravity   |
//|                                  https://github.com/deepmind     |
//+------------------------------------------------------------------+
#property copyright "Antigravity"
#property link      "https://github.com/deepmind"
#property version   "1.00"
#property description "Expert Advisor per sincronizzare i deal storici di MT5 con il Dashboard in tempo reale."

//--- input parameters
input string   InpServerURL         = "https://trading-portfolio-dashboard.onrender.com/api/mt5-deals"; // URL del server Express
input int      InpDaysBack          = 180;                                   // Giorni di storico da estrarre
input int      InpCheckIntervalSec  = 10;                                    // Intervallo di controllo modifiche (secondi)

//--- global variables
int            g_last_deals_count   = 0;
datetime       g_last_check_time    = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("🚀 MT5HistorySender EA avviato. Configurato server: ", InpServerURL);
   Print("📂 Giorni storici da esportare: ", InpDaysBack);
   
   // Avvia un timer periodico per controllare lo storico delle operazioni
   EventSetTimer(InpCheckIntervalSec);
   
   // Esegui una prima sincronizzazione all'avvio
   SincronizzaStorico();
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("🔌 MT5HistorySender EA arrestato.");
}

//+------------------------------------------------------------------+
//| Expert timer function                                            |
//+------------------------------------------------------------------+
void OnTimer()
{
   // Controlla se sono avvenute nuove operazioni
   SincronizzaStorico();
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // Opzionale: controlla anche ad ogni tick per maggiore reattività
   // ma limitando la frequenza per non sovraccaricare il server
   datetime now = TimeCurrent();
   if(now - g_last_check_time > 5)
   {
      SincronizzaStorico();
   }
}

//+------------------------------------------------------------------+
//| Funzione principale per sincronizzare lo storico con il server  |
//+------------------------------------------------------------------+
void SincronizzaStorico()
{
   g_last_check_time = TimeCurrent();
   
   // Seleziona la cronologia dell'account
   datetime from_date = TimeCurrent() - (InpDaysBack * 86400);
   datetime to_date = TimeCurrent();
   
   if(!HistorySelect(from_date, to_date))
   {
      Print("⚠️ Impossibile selezionare la cronologia. Errore MT5: ", GetLastError());
      return;
   }
   
   int total_deals = HistoryDealsTotal();
   
   // Controlla se il numero di transazioni è cambiato
   if(total_deals == g_last_deals_count)
   {
      // Nessuna nuova operazione, salta la trasmissione per efficienza
      return;
   }
   
   Print("🔄 Nuove operazioni rilevate (Totale: ", total_deals, ", Precedente: ", g_last_deals_count, "). Inizio serializzazione JSON...");
   
   // Costruisci il payload JSON manualmente
   string json = "[";
   int added_count = 0;
   
   for(int i = 0; i < total_deals; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket <= 0) continue;
      
      // Estrai le informazioni del deal
      string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
      
      // Escludi transazioni di balance/deposito (non hanno simbolo associato)
      if(symbol == "") continue;
      
      long type = HistoryDealGetInteger(ticket, DEAL_TYPE);
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      datetime deal_time = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      double volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double price = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double commission = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      double swap = HistoryDealGetDouble(ticket, DEAL_SWAP);
      double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      ulong magic = (ulong)HistoryDealGetInteger(ticket, DEAL_MAGIC);
      string comment = HistoryDealGetString(ticket, DEAL_COMMENT);
      ulong position_id = (ulong)HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      ulong order = (ulong)HistoryDealGetInteger(ticket, DEAL_ORDER);
      
      // Converti enum in stringa per allinearsi al parser
      string type_str = (type == DEAL_TYPE_BUY) ? "buy" : ((type == DEAL_TYPE_SELL) ? "sell" : IntegerToString(type));
      string entry_str = (entry == DEAL_ENTRY_IN) ? "in" : ((entry == DEAL_ENTRY_OUT) ? "out" : ((entry == DEAL_ENTRY_INOUT) ? "in/out" : IntegerToString(entry)));
      
      // Salva solo i deal OUT o IN/OUT (le chiusure) per abbinarsi all'equity
      // Se vuoi mappare tutto (incluso l'in), rimuovi questa condizione, ma il server Express gestisce il filtraggio
      if(entry_str != "out" && entry_str != "in/out") continue;

      // Formatta in formato JSON
      if(added_count > 0) json += ",";
      
      json += "{";
      json += "\"ticket\":\"" + IntegerToString(ticket) + "\",";
      json += "\"position_id\":\"" + IntegerToString(position_id) + "\",";
      json += "\"order\":\"" + IntegerToString(order) + "\",";
      json += "\"time\":\"" + TimeToString(deal_time, TIME_DATE|TIME_MINUTES|TIME_SECONDS) + "\",";
      json += "\"symbol\":\"" + EscapeJsonString(symbol) + "\",";
      json += "\"type\":\"" + type_str + "\",";
      json += "\"direction\":\"" + entry_str + "\",";
      json += "\"volume\":" + DoubleToString(volume, 2) + ",";
      json += "\"price\":" + DoubleToString(price, 5) + ",";
      json += "\"commission\":" + DoubleToString(commission, 2) + ",";
      json += "\"swap\":" + DoubleToString(swap, 2) + ",";
      json += "\"profit\":" + DoubleToString(profit, 2) + ",";
      json += "\"magic\":\"" + IntegerToString(magic) + "\",";
      json += "\"comment\":\"" + EscapeJsonString(comment) + "\",";
      json += "\"source\":\"mt5_deal\"";
      json += "}";
      
      added_count++;
   }
   
   json += "]";
   
   // Se abbiamo operazioni di trading chiuse, inviamo il payload
   if(added_count > 0)
   {
      SendPayload(json);
   }
   
   // Aggiorna lo stato locale
   g_last_deals_count = total_deals;
}

//+------------------------------------------------------------------+
//| Invia il payload JSON al server Express via WebRequest           |
//+------------------------------------------------------------------+
void SendPayload(string json_str)
{
   char post[], result[];
   string result_headers;
   int timeout = 5000;
   
   // Prepara l'array di byte (UTF-8) dal testo JSON
   StringToCharArray(json_str, post, 0, StringLen(json_str), CP_UTF8);
   
   // Definisce l'header della richiesta
   string headers = "Content-Type: application/json\r\n";
   
   ResetLastError();
   
   // Esegue la richiesta HTTP POST
   int response_code = WebRequest("POST", InpServerURL, NULL, NULL, timeout, post, ArraySize(post)-1, result, result_headers);
   
   if(response_code == 200)
   {
      string response_body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      Print("✅ Sincronizzazione riuscita! Risposta server: ", response_body);
   }
   else
   {
      int last_err = GetLastError();
      Print("❌ Errore durante l'invio HTTP POST. Codice di risposta HTTP: ", response_code);
      Print("   Codice errore di sistema MT5: ", last_err);
      Print("   Assicurati di aver aggiunto l'URL 'https://trading-portfolio-dashboard.onrender.com' in Tools -> Options -> Expert Advisors -> Allow WebRequest.");
   }
}

//+------------------------------------------------------------------+
//| Esegue l'escape dei caratteri speciali per stringhe JSON         |
//+------------------------------------------------------------------+
string EscapeJsonString(string txt)
{
   StringReplace(txt, "\\", "\\\\");
   StringReplace(txt, "\"", "\\\"");
   StringReplace(txt, "\n", "\\n");
   StringReplace(txt, "\r", "\\r");
   StringReplace(txt, "\t", "\\t");
   return txt;
}
