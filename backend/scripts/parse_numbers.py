import sys
import os
import re
import json
from numbers_parser import Document

# Define the location of the numbers file
NUMBERS_FILE = "/Users/alessioerbeia/Documents/Elenco_strategie_automatiche_smart nuovo.numbers"

def clean_val(v):
    if v is None:
        return ""
    s = str(v).strip()
    if re.fullmatch(r'-?\d+\.0', s):
        s = s[:-2]
    return s

def extract_tf_from_name(name: str) -> str:
    m = re.search(r'\b(M1|M5|M15|M30|H1|H4|D1|W1)\b', name, re.IGNORECASE)
    return m.group(1).upper() if m else ""

def build_note(*parts):
    return " | ".join(p for p in parts if p)

def fmt_magic(raw: str) -> str:
    raw = raw.strip()
    if re.fullmatch(r'-?\d+\.0', raw):
        return raw[:-2]
    return raw

def parse_numbers():
    if not os.path.exists(NUMBERS_FILE):
        print(json.dumps({"error": f"Numbers file not found at {NUMBERS_FILE}"}))
        sys.exit(1)
        
    try:
        doc = Document(NUMBERS_FILE)
        sheet_data = {}
        
        for sheet in doc.sheets:
            name = sheet.name.strip()
            # Recognize only our specific sheets
            valid_sheets = ["PERSONALI", "EA studio", "StrategyQuant", "CriptoXAU", "StrategyQuant MT5", "Ea Studio MT5"]
            if name not in valid_sheets:
                continue
                
            rows_out = []
            
            for table in sheet.tables:
                all_rows = list(table.iter_rows())
                if len(all_rows) < 2:
                    continue
                
                # Rows 0 and 1 are title and headers in Numbers
                for raw_row in all_rows[2:]:
                    cells = [clean_val(c.value) for c in raw_row]
                    
                    if not any(cells):
                        continue
                        
                    mercato = cells[0] if len(cells) > 0 else ""
                    nome = cells[1] if len(cells) > 1 else ""
                    
                    if not mercato and not nome:
                        continue
                    
                    # ─── PERSONALI ───────────────────────────────────────────────
                    if name == "PERSONALI":
                        tf = cells[2] if len(cells) > 2 else ""
                        magic = fmt_magic(cells[3]) if len(cells) > 3 else ""
                        in_reale = cells[4] if len(cells) > 4 else ""
                        andamento = cells[5] if len(cells) > 5 else ""
                        magic_mt5 = cells[6] if len(cells) > 6 else ""
                        
                        note = build_note(
                            f"In Reale: {in_reale}" if in_reale else "",
                            f"Come sta andando: {andamento}" if andamento else "",
                            f"Magic MT5: {magic_mt5}" if magic_mt5 else "",
                        )
                    
                    # ─── EA STUDIO (MT4) ─────────────────────────────────────────
                    elif name == "EA studio":
                        magic_demo = fmt_magic(cells[2]) if len(cells) > 2 else ""
                        magic_reale = fmt_magic(cells[3]) if len(cells) > 3 else ""
                        in_reale = cells[4] if len(cells) > 4 else ""
                        andamento = cells[5] if len(cells) > 5 else ""
                        
                        tf = extract_tf_from_name(nome)
                        magic = magic_reale
                        
                        note = build_note(
                            f"In Reale: {in_reale}" if in_reale else "",
                            f"Come sta andando: {andamento}" if andamento else "",
                            f"Magic Demo/MT5: {magic_demo}" if magic_demo else "",
                        )
                    
                    # ─── STRATEGYQUANT (MT4) ─────────────────────────────────────
                    elif name == "StrategyQuant":
                        magic_demo = fmt_magic(cells[2]) if len(cells) > 2 else ""
                        magic_reale = fmt_magic(cells[3]) if len(cells) > 3 else ""
                        in_reale = cells[4] if len(cells) > 4 else ""
                        andamento = cells[5] if len(cells) > 5 else ""
                        note_orig = cells[6] if len(cells) > 6 else ""
                        
                        tf = extract_tf_from_name(nome)
                        magic = magic_reale
                        
                        note = build_note(
                            f"In Reale: {in_reale}" if in_reale else "",
                            f"Come sta andando: {andamento}" if andamento else "",
                            f"Magic Demo/MT5: {magic_demo}" if magic_demo else "",
                            f"Note: {note_orig}" if note_orig else "",
                        )
                    
                    # ─── CRIPTOXAU ───────────────────────────────────────────────
                    elif name == "CriptoXAU":
                        tf = cells[2] if len(cells) > 2 else ""
                        magic = fmt_magic(cells[3]) if len(cells) > 3 else ""
                        in_reale = cells[4] if len(cells) > 4 else ""
                        andamento = cells[5] if len(cells) > 5 else ""
                        note_orig = cells[6] if len(cells) > 6 else ""
                        
                        note = build_note(
                            f"In Reale: {in_reale}" if in_reale else "",
                            f"Come sta andando: {andamento}" if andamento else "",
                            f"Note: {note_orig}" if note_orig else "",
                        )
                    
                    # ─── STRATEGYQUANT MT5 ───────────────────────────────────────
                    elif name == "StrategyQuant MT5":
                        tf = cells[2] if len(cells) > 2 else ""
                        magic = fmt_magic(cells[3]) if len(cells) > 3 else ""
                        in_reale = cells[4] if len(cells) > 4 else ""
                        andamento = cells[5] if len(cells) > 5 else ""
                        note_orig = cells[6] if len(cells) > 6 else ""
                        magic_mt4 = fmt_magic(cells[7]) if len(cells) > 7 else ""
                        
                        note = build_note(
                            f"In Reale (Audacity): {in_reale}" if in_reale else "",
                            f"Come sta andando: {andamento}" if andamento else "",
                            f"Note: {note_orig}" if note_orig else "",
                            f"Magic MT4 corrispondente: {magic_mt4}" if magic_mt4 else "",
                        )
                    
                    # ─── EA STUDIO MT5 ───────────────────────────────────────────
                    elif name == "Ea Studio MT5":
                        tf = cells[2] if len(cells) > 2 else ""
                        magic = fmt_magic(cells[3]) if len(cells) > 3 else ""
                        in_reale = cells[4] if len(cells) > 4 else ""
                        andamento = cells[5] if len(cells) > 5 else ""
                        note_orig = cells[6] if len(cells) > 6 else ""
                        
                        note = build_note(
                            f"In Reale (Audacity): {in_reale}" if in_reale else "",
                            f"Come sta andando: {andamento}" if andamento else "",
                            f"Note: {note_orig}" if note_orig else "",
                        )
                    else:
                        continue
                    
                    # Generate a unique strategy ID (useful for frontend tracking)
                    raw_id = f"{name}_{mercato}_{magic}_{nome}".lower().replace(' ', '_')
                    strat_id = re.sub(r'[^a-z0-9_-]', '', raw_id)[:80]
                    
                    rows_out.append({
                        "id": strat_id,
                        "mercato": mercato.strip(),
                        "nome": nome.strip(),
                        "tf": tf.strip(),
                        "magic": magic.strip(),
                        "note": note.strip(),
                        "lotti": 0.01,
                        "mc_dd": None,
                        "real_dd": None
                    })
            
            sheet_data[name] = rows_out
            
        print(json.dumps(sheet_data, indent=2))
        
    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}))
        sys.exit(1)

if __name__ == "__main__":
    parse_numbers()
