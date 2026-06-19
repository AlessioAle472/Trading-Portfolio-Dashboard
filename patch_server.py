import sys

with open('backend/server.js', 'r') as f:
    content = f.read()

replacements = [
    (
"""// ── Reports index helpers ────────────────────────────────────────────────────
async function readReportsIndex() {
  await ensureReportsDir();
  try { return JSON.parse(await fs.readFile(REPORTS_INDEX, 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return []; throw err; }
}
async function writeReportsIndex(index) {
  await ensureReportsDir();
  await fs.writeFile(REPORTS_INDEX, JSON.stringify(index, null, 2), 'utf8');
}""",
"""// ── Reports index helpers ────────────────────────────────────────────────────
function getUserReportsIndexPath(email) {
  if (!email || email.toLowerCase() === 'alessio199754@gmail.com') return REPORTS_INDEX;
  const cleanEmail = email.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return path.join(DATA_DIR, `reports_index_${cleanEmail}.json`);
}

async function readReportsIndex(email) {
  await ensureReportsDir();
  const filePath = getUserReportsIndexPath(email);
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return []; throw err; }
}
async function writeReportsIndex(email, index) {
  await ensureReportsDir();
  const filePath = getUserReportsIndexPath(email);
  await fs.writeFile(filePath, JSON.stringify(index, null, 2), 'utf8');
}"""
    ),
    (
"""// ── Onboarding Deals Generator ──────────────────────────────────────────────
async function ensureOnboardingDeals() {
  await ensureReportsDir();
  const index = await readReportsIndex();
  const exists = index.find(r => r.id === 'onboarding_deals');
  if (!exists) {
    const deals = [];
    let ticket = 900000;
    const now = new Date();
    // Genera finti deal per TRIAL_1
    for(let i=0; i<15; i++) {
       const isWin = Math.random() > 0.4;
       deals.push({
         ticket: ticket++,
         time: new Date(now.getTime() - Math.random() * 7 * 24 * 3600 * 1000).toISOString(),
         symbol: 'EURUSD',
         magic: 'TRIAL_1',
         profit: isWin ? Math.random() * 50 : -Math.random() * 30,
         volume: 0.01,
         type: 0,
         price: 1.1000,
         swap: 0,
         commission: 0
       });
    }
    // Genera finti deal per TRIAL_2
    for(let i=0; i<10; i++) {
       const isWin = Math.random() > 0.5;
       deals.push({
         ticket: ticket++,
         time: new Date(now.getTime() - Math.random() * 7 * 24 * 3600 * 1000).toISOString(),
         symbol: 'NAS100',
         magic: 'TRIAL_2',
         profit: isWin ? Math.random() * 150 : -Math.random() * 100,
         volume: 0.05,
         type: 0,
         price: 15000,
         swap: 0,
         commission: -1
       });
    }
    
    await fs.writeFile(path.join(REPORTS_DIR, 'onboarding_deals.json'), JSON.stringify({ deals }, null, 2));
    index.push({ id: 'onboarding_deals', filename: 'Onboarding Data', date: new Date().toISOString() });
    await writeReportsIndex(index);
  }
}
// Chiamata all'avvio
ensureOnboardingDeals().catch(console.error);

// ── Merge all deals: manual reports + MT5 live (for portfolio_manager.py) ───
async function getAllDeals() {
  const allDeals = new Map(); // ticket → deal (deduplicated)

  // 1. All manual reports
  try {
    const index = await readReportsIndex();""",
"""// ── Onboarding Deals Generator ──────────────────────────────────────────────
async function injectOnboardingDeals(email) {
  await ensureReportsDir();
  const index = await readReportsIndex(email);
  const id = crypto.randomUUID();
  const deals = [];
  let ticket = 900000;
  const now = new Date();
  // Genera finti deal per TRIAL_1
  for(let i=0; i<15; i++) {
     const isWin = Math.random() > 0.4;
     deals.push({
       ticket: ticket++,
       time: new Date(now.getTime() - Math.random() * 7 * 24 * 3600 * 1000).toISOString(),
       symbol: 'EURUSD',
       magic: 'TRIAL_1',
       profit: isWin ? Math.random() * 50 : -Math.random() * 30,
       volume: 0.01,
       type: 0,
       price: 1.1000,
       swap: 0,
       commission: 0
     });
  }
  // Genera finti deal per TRIAL_2
  for(let i=0; i<10; i++) {
     const isWin = Math.random() > 0.5;
     deals.push({
       ticket: ticket++,
       time: new Date(now.getTime() - Math.random() * 7 * 24 * 3600 * 1000).toISOString(),
       symbol: 'NAS100',
       magic: 'TRIAL_2',
       profit: isWin ? Math.random() * 150 : -Math.random() * 100,
       volume: 0.05,
       type: 0,
       price: 15000,
       swap: 0,
       commission: -1
     });
  }
  
  await fs.writeFile(path.join(REPORTS_DIR, `${id}.json`), JSON.stringify({ id, name: 'Dati di Prova (Onboarding)', uploadedAt: now.toISOString(), deals }, null, 2));
  index.push({ id, name: 'Dati di Prova (Onboarding)', uploadedAt: now.toISOString(), tradeCount: deals.length });
  await writeReportsIndex(email, index);
}

// ── Merge all deals: manual reports + MT5 live (for portfolio_manager.py) ───
async function getAllDeals(email) {
  const allDeals = new Map(); // ticket → deal (deduplicated)

  // 1. All manual reports
  try {
    const index = await readReportsIndex(email);"""
    ),
    (
"""  // 2. MT5 live data
  try {
    const liveDeals = JSON.parse(await fs.readFile(MT5_DEALS_JSON, 'utf8'));
    liveDeals.forEach(d => allDeals.set(d.ticket, d));
  } catch (e) {}

  return Array.from(allDeals.values());
}""",
"""  // 2. MT5 live data
  try {
    const cleanEmail = (email || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const mt5File = (!email || email.toLowerCase() === 'alessio199754@gmail.com') ? MT5_DEALS_JSON : path.join(DATA_DIR, `mt5_deals_${cleanEmail}.json`);
    let liveDeals = [];
    try { liveDeals = JSON.parse(await fs.readFile(mt5File, 'utf8')); } catch (e) {}
    liveDeals.forEach(d => allDeals.set(d.ticket, d));
  } catch (e) {}

  return Array.from(allDeals.values());
}"""
    ),
    (
"""      await ensureDataDir();
      const cleanEmail = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const filePath = path.join(DATA_DIR, `portfolio_${cleanEmail}.json`);
      await fs.writeFile(filePath, JSON.stringify(trialPortfolio, null, 2));
    } else {""",
"""      await ensureDataDir();
      const cleanEmail = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const filePath = path.join(DATA_DIR, `portfolio_${cleanEmail}.json`);
      await fs.writeFile(filePath, JSON.stringify(trialPortfolio, null, 2));
      
      // Initialize isolated onboarding deals for this user
      await injectOnboardingDeals(email);
    } else {"""
    ),
    (
"""// GET /api/reports — list all saved reports (metadata only, no deals array)
app.get('/api/reports', async (req, res) => {
  try {
    const index = await readReportsIndex();
    res.json(index);""",
"""// GET /api/reports — list all saved reports (metadata only, no deals array)
app.get('/api/reports', async (req, res) => {
  try {
    const email = req.headers['x-user-email'];
    const index = await readReportsIndex(email);
    res.json(index);"""
    ),
    (
"""    const email = req.headers['x-user-email'];
    const { name, deals } = req.body;
    if (!name || !Array.isArray(deals))
      return res.status(400).json({ error: 'Payload non valido: name e deals[] sono obbligatori' });

    const index = await readReportsIndex();""",
"""    const email = req.headers['x-user-email'];
    const { name, deals } = req.body;
    if (!name || !Array.isArray(deals))
      return res.status(400).json({ error: 'Payload non valido: name e deals[] sono obbligatori' });

    const index = await readReportsIndex(email);"""
    ),
    (
"""    // Update index with metadata (no deals array, to keep index light)
    const meta = { id, name, uploadedAt: now, tradeCount: deals.length };
    index.push(meta);
    await writeReportsIndex(index);""",
"""    // Update index with metadata (no deals array, to keep index light)
    const meta = { id, name, uploadedAt: now, tradeCount: deals.length };
    index.push(meta);
    await writeReportsIndex(email, index);"""
    ),
    (
"""    const email = req.headers['x-user-email'];
    const { id } = req.params;
    let index = await readReportsIndex();""",
"""    const email = req.headers['x-user-email'];
    const { id } = req.params;
    let index = await readReportsIndex(email);"""
    ),
    (
"""    // Update index
    index = index.filter(r => r.id !== id);
    await writeReportsIndex(index);""",
"""    // Update index
    index = index.filter(r => r.id !== id);
    await writeReportsIndex(email, index);"""
    ),
    (
"""  try {
    const index = await readReportsIndex();""",
"""  try {
    const index = await readReportsIndex(email);"""
    ),
    (
"""    // Clear index
    await writeReportsIndex([]);""",
"""    // Clear index
    await writeReportsIndex(email, []);"""
    ),
    (
"""    const portfolioPath = getUserPortfolioPath(email);
    await getPortfolioData(email); // seed if missing

    // Merge both data sources
    const allDeals = await getAllDeals();
    await fs.writeFile(tempDealsPath, JSON.stringify(allDeals, null, 2), 'utf8');""",
"""    const portfolioPath = getUserPortfolioPath(email);
    await getPortfolioData(email); // seed if missing

    // Merge both data sources
    const allDeals = await getAllDeals(email);
    await fs.writeFile(tempDealsPath, JSON.stringify(allDeals, null, 2), 'utf8');"""
    ),
    (
"""// POST /api/mt5-deals — receives deals from MT5 EA (ONLY EA writes here, not manual uploads)
app.post('/api/mt5-deals', async (req, res) => {
  try {
    const deals = req.body;
    if (!Array.isArray(deals)) return res.status(400).json({ error: 'Il payload deve essere un array di deals' });
    await ensureDataDir();
    let existing = [];
    try { existing = JSON.parse(await fs.readFile(MT5_DEALS_JSON, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const dealMap = new Map();
    existing.forEach(d => dealMap.set(d.ticket, d));
    deals.forEach(d => dealMap.set(d.ticket, d));
    const merged = Array.from(dealMap.values());
    const hasNewDeals = merged.length !== existing.length;
    await fs.writeFile(MT5_DEALS_JSON, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`[MT5 Bridge] Ricevute ${deals.length} op. Totale: ${merged.length}`);
    if (hasNewDeals) {
      invalidateCache(); // Invalidate global cache since we don't have user email on direct EA sync
    } else {
      console.log('[MT5 Bridge] Nessun nuovo deal rilevato. Caches conservate.');
    }
    res.json({ success: true, count: merged.length });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile salvare i dati MT5', details: err.message });
  }
});""",
"""// POST /api/mt5-deals — receives deals from MT5 EA (ONLY EA writes here, not manual uploads)
app.post('/api/mt5-deals', async (req, res) => {
  try {
    const deals = req.body;
    const email = req.query.email || ''; // Passato tramite query string o payload? Facciamo fallback.
    const cleanEmail = email.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const mt5File = (!email || email.toLowerCase() === 'alessio199754@gmail.com') ? MT5_DEALS_JSON : path.join(DATA_DIR, `mt5_deals_${cleanEmail}.json`);
    
    if (!Array.isArray(deals)) return res.status(400).json({ error: 'Il payload deve essere un array di deals' });
    await ensureDataDir();
    let existing = [];
    try { existing = JSON.parse(await fs.readFile(mt5File, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const dealMap = new Map();
    existing.forEach(d => dealMap.set(d.ticket, d));
    deals.forEach(d => dealMap.set(d.ticket, d));
    const merged = Array.from(dealMap.values());
    const hasNewDeals = merged.length !== existing.length;
    await fs.writeFile(mt5File, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`[MT5 Bridge] Ricevute ${deals.length} op. Totale: ${merged.length}`);
    if (hasNewDeals) {
      invalidateCache(email);
    } else {
      console.log('[MT5 Bridge] Nessun nuovo deal rilevato. Caches conservate.');
    }
    res.json({ success: true, count: merged.length });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile salvare i dati MT5', details: err.message });
  }
});"""
    )
]

for t, r in replacements:
    if t not in content:
        print(f"ERROR: Could not find target:\n{t[:100]}...\n")
        sys.exit(1)
    content = content.replace(t, r)

with open('backend/server.js', 'w') as f:
    f.write(content)
print("SUCCESS: server.js patched successfully.")
