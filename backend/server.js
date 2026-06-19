require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const app = express();
app.use(cors());

// --- STRIPE WEBHOOK (Deve parsare il body raw) ---
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy');
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const users = await readUsers();
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email;
      const userIndex = users.findIndex(u => u.email.toLowerCase() === email?.toLowerCase());
      if (userIndex !== -1) {
        users[userIndex].stripeCustomerId = session.customer;
        users[userIndex].stripeSubscriptionId = session.subscription;
        users[userIndex].subscriptionStatus = 'active';
        await writeUsers(users);
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const userIndex = users.findIndex(u => u.stripeCustomerId === subscription.customer);
      if (userIndex !== -1) {
        users[userIndex].subscriptionStatus = subscription.status; // 'active', 'canceled', etc.
        await writeUsers(users);
      }
    }
    res.json({received: true});
  } catch (e) {
    console.error("Webhook logic error:", e);
    res.status(500).end();
  }
});

// Parsa JSON per tutte le altre rotte
app.use(express.json({ limit: '50mb' }));

const PORT = 5001;
const DATA_DIR     = path.join(__dirname, 'data');
const USERS_JSON   = path.join(DATA_DIR, 'users.json');
const PORTFOLIO_JSON  = path.join(DATA_DIR, 'portfolio.json');
const SCRIPTS_DIR  = path.join(__dirname, 'scripts');
const PARSE_SCRIPT = path.join(SCRIPTS_DIR, 'parse_numbers.py');
const EXPORT_SCRIPT = path.join(SCRIPTS_DIR, 'export_excel.py');

// ── Two completely separate deal stores ──────────────────────────────────────
const MT5_DEALS_JSON  = path.join(DATA_DIR, 'mt5_deals.json');   // EA live data (protected)
const REPORTS_DIR     = path.join(DATA_DIR, 'reports');           // Manual uploads
const REPORTS_INDEX   = path.join(DATA_DIR, 'reports_index.json');// Report metadata
const MAX_REPORTS     = 10;
const EQUITY_CHART_SCRIPT = path.join(SCRIPTS_DIR, 'equity_chart.py');
const TASSE_SCRIPT        = path.join(SCRIPTS_DIR, 'tasse_trading.py');

// ── Calculation Cache for Portfolio Management ──────────────────────────────
// Stores calculated risk management metrics per user to avoid heavy Python executions.
// Scrapes cache on data changes (upload report, delete report, portfolio edit, live sync).
let calculationCache = {};
let equityChartCache = {}; // { [userEmail]: { [cacheKey]: { data, timestamp } } }

function invalidateCache(email) {
  if (!email) {
    calculationCache = {};
    equityChartCache = {};
    console.log('[Cache] Invalidata la cache globale Gestione Risk.');
    return;
  }
  const cleanEmail = email.toLowerCase().trim();
  if (calculationCache[cleanEmail]) {
    delete calculationCache[cleanEmail];
    console.log(`[Cache] Invalidata cache Gestione Risk per l'utente: ${cleanEmail}`);
  }
  if (equityChartCache[cleanEmail]) {
    delete equityChartCache[cleanEmail];
    console.log(`[Cache] Invalidata cache Equity Charts per l'utente: ${cleanEmail}`);
  }
}

// ── Ensure directories exist ─────────────────────────────────────────────────
async function ensureDataDir() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch (e) {}
}
async function ensureReportsDir() {
  await ensureDataDir();
  try { await fs.mkdir(REPORTS_DIR, { recursive: true }); } catch (e) {}
}

// ── Password hashing ─────────────────────────────────────────────────────────
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ── Python runner ────────────────────────────────────────────────────────────
function runPython(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) { console.error(`Exec error: ${error}`); console.error(`Stderr: ${stderr}`); reject(error); }
      else resolve(stdout);
    });
  });
}

// ── Users DB helpers ─────────────────────────────────────────────────────────
async function readUsers() {
  await ensureDataDir();
  try { return JSON.parse(await fs.readFile(USERS_JSON, 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return []; throw err; }
}
async function writeUsers(users) {
  await ensureDataDir();
  await fs.writeFile(USERS_JSON, JSON.stringify(users, null, 2), 'utf8');
}

// ── User-specific portfolio path ─────────────────────────────────────────────
function getUserPortfolioPath(email) {
  if (!email) return PORTFOLIO_JSON;
  if (email.toLowerCase() === 'alessio199754@gmail.com') return PORTFOLIO_JSON;
  const cleanEmail = email.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return path.join(DATA_DIR, `portfolio_${cleanEmail}.json`);
}

// ── Portfolio read (with seed fallback) ─────────────────────────────────────
async function getPortfolioData(email) {
  await ensureDataDir();
  const filePath = getUserPortfolioPath(email);
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch (err) {
    if (err.code !== 'ENOENT') throw err;
    try {
      const users = await readUsers();
      const user = users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
      const isAdmin = user && user.role === 'admin';

      const base = JSON.parse(await fs.readFile(PORTFOLIO_JSON, 'utf8'));
      let toSave = base;
      if (!isAdmin && filePath !== PORTFOLIO_JSON) {
        toSave = {};
        for (const section of Object.keys(base)) {
          toSave[section] = [];
        }
      }

      if (filePath !== PORTFOLIO_JSON) await fs.writeFile(filePath, JSON.stringify(toSave, null, 2), 'utf8');
      return toSave;
    } catch (baseErr) {
      if (baseErr.code !== 'ENOENT') throw baseErr;
      console.log('Base portfolio.json not found, running parse_numbers.py...');
      const stdout = await runPython(`python3 "${PARSE_SCRIPT}"`);
      const parsed = JSON.parse(stdout);
      await fs.writeFile(PORTFOLIO_JSON, JSON.stringify(parsed, null, 2), 'utf8');
      
      const users = await readUsers();
      const user = users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
      const isAdmin = user && user.role === 'admin';

      let toSave = parsed;
      if (!isAdmin && filePath !== PORTFOLIO_JSON) {
        toSave = {};
        for (const section of Object.keys(parsed)) {
          toSave[section] = [];
        }
      }

      if (filePath !== PORTFOLIO_JSON) await fs.writeFile(filePath, JSON.stringify(toSave, null, 2), 'utf8');
      return toSave;
    }
  }
}

// ── Reports index helpers ────────────────────────────────────────────────────
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
}

// ── Onboarding Deals Generator ──────────────────────────────────────────────
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
    const index = await readReportsIndex(email);
    for (const meta of index) {
      const filePath = path.join(REPORTS_DIR, `${meta.id}.json`);
      try {
        const reportData = JSON.parse(await fs.readFile(filePath, 'utf8'));
        const deals = reportData.deals || [];
        deals.forEach(d => allDeals.set(d.ticket, d));
      } catch (e) { /* skip missing file */ }
    }
  } catch (e) {}

  // 2. MT5 live data
  try {
    const cleanEmail = (email || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const mt5File = (!email || email.toLowerCase() === 'alessio199754@gmail.com') ? MT5_DEALS_JSON : path.join(DATA_DIR, `mt5_deals_${cleanEmail}.json`);
    let liveDeals = [];
    try { liveDeals = JSON.parse(await fs.readFile(mt5File, 'utf8')); } catch (e) {}
    liveDeals.forEach(d => allDeals.set(d.ticket, d));
  } catch (e) {}

  return Array.from(allDeals.values());
}

/* ─────────────────────────────────────────────────────────────────────────────
   AUTHENTICATION ENDPOINTS
   ───────────────────────────────────────────────────────────────────────────── */

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, subscription } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e Password sono obbligatori' });
    const users = await readUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
      return res.status(400).json({ error: 'Questo indirizzo email è già registrato' });
    let finalSub = subscription || 'Standard (3.99€/mese)';
    let finalRole = 'user';
    let trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 giorni
    if (email.toLowerCase() === 'alessio199754@gmail.com') {
      finalSub = 'Admin (Gratuito)';
      finalRole = 'admin';
      trialEndsAt = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(); // 10 anni per admin
    }
    const newUser = { 
      id: crypto.randomUUID(), 
      email: email.toLowerCase(), 
      passwordHash: hashPassword(password), 
      subscription: finalSub, 
      role: finalRole,
      trialEndsAt,
      subscriptionStatus: 'trialing'
    };
    users.push(newUser);
    await writeUsers(users);
    
    // Assegna il portafoglio: admin copia quello globale, user ne ottiene uno pulito di onboarding
    if (finalRole !== 'admin') {
      const trialPortfolio = {
        "Strategie di Prova": [
          {
            "id": "trial_1",
            "mercato": "EURUSD",
            "nome": "Trend Follower Pro",
            "tf": "H1",
            "magic": "TRIAL_1",
            "note": "Strategia dimostrativa (Onboarding)",
            "lotti": 0.01,
            "mc_dd": 5,
            "real_dd": null
          },
          {
            "id": "trial_2",
            "mercato": "NAS100",
            "nome": "Breakout Scalper",
            "tf": "M15",
            "magic": "TRIAL_2",
            "note": "Strategia dimostrativa (Onboarding)",
            "lotti": 0.05,
            "mc_dd": 10,
            "real_dd": null
          }
        ]
      };
      await ensureDataDir();
      const cleanEmail = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const filePath = path.join(DATA_DIR, `portfolio_${cleanEmail}.json`);
      await fs.writeFile(filePath, JSON.stringify(trialPortfolio, null, 2));
      
      // Initialize isolated onboarding deals for this user
      await injectOnboardingDeals(email);
    } else {
      await getPortfolioData(email);
    }
    
    res.json({ success: true, user: { email: newUser.email, subscription: newUser.subscription, role: newUser.role, trialEndsAt: newUser.trialEndsAt, subscriptionStatus: newUser.subscriptionStatus } });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Errore durante la registrazione', details: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e Password sono obbligatori' });
    const users = await readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.passwordHash !== hashPassword(password))
      return res.status(400).json({ error: 'Credenziali non valide' });
    
    // Assegna il ruolo per retrocompatibilità con account esistenti
    const userRole = user.role || (user.email.toLowerCase() === 'alessio199754@gmail.com' ? 'admin' : 'user');
    const trialEndsAt = user.trialEndsAt || new Date(Date.now() - 1000).toISOString(); // Expired default for old
    const subStatus = user.subscriptionStatus || 'none';
    
    res.json({ success: true, user: { email: user.email, subscription: user.subscription, role: userRole, trialEndsAt, subscriptionStatus: subStatus } });
  } catch (err) {
    res.status(500).json({ error: 'Errore durante il login', details: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   AUTHENTICATION ENDPOINTS (ME) AND STRIPE
   ───────────────────────────────────────────────────────────────────────────── */

app.get('/api/auth/me', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const users = await readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    const userRole = user.role || (user.email.toLowerCase() === 'alessio199754@gmail.com' ? 'admin' : 'user');
    const trialEndsAt = user.trialEndsAt || new Date(Date.now() - 1000).toISOString();
    const subStatus = user.subscriptionStatus || 'none';
    res.json({ success: true, user: { email: user.email, subscription: user.subscription, role: userRole, trialEndsAt, subscriptionStatus: subStatus } });
  } catch (err) {
    res.status(500).json({ error: 'Errore durante il recupero dei dati utente' });
  }
});

app.put('/api/auth/password', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Vecchia e nuova password sono obbligatorie' });
    
    const users = await readUsers();
    const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (userIndex === -1) return res.status(404).json({ error: 'Utente non trovato' });
    
    if (users[userIndex].passwordHash !== hashPassword(oldPassword)) {
      return res.status(400).json({ error: 'La vecchia password non è corretta' });
    }
    
    users[userIndex].passwordHash = hashPassword(newPassword);
    await writeUsers(users);
    
    res.json({ success: true, message: 'Password aggiornata con successo' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Errore durante il cambio password', details: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   ADMIN ENDPOINTS
   ───────────────────────────────────────────────────────────────────────────── */
app.get('/api/admin/users', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const users = await readUsers();
    const reqUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!reqUser || reqUser.role !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato. Permessi di amministratore richiesti.' });
    }
    
    // Rimuoviamo gli hash delle password e le chiavi Stripe prima di inviarli al client
    const safeUsers = users.map(u => ({
      email: u.email,
      role: u.role || (u.email.toLowerCase() === 'alessio199754@gmail.com' ? 'admin' : 'user'),
      subscription: u.subscription || 'Free',
      subscriptionStatus: u.subscriptionStatus || 'none',
      trialEndsAt: u.trialEndsAt
    }));
    res.json(safeUsers);
  } catch (err) {
    res.status(500).json({ error: 'Errore nel recupero degli utenti', details: err.message });
  }
});

app.put('/api/admin/users/:userEmail', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const users = await readUsers();
    const reqUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!reqUser || reqUser.role !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato. Permessi di amministratore richiesti.' });
    }
    
    const targetEmail = req.params.userEmail.toLowerCase();
    const userIndex = users.findIndex(u => u.email.toLowerCase() === targetEmail);
    if (userIndex === -1) return res.status(404).json({ error: 'Utente non trovato' });
    
    const { role, subscription } = req.body;
    if (role) users[userIndex].role = role;
    if (subscription) {
      users[userIndex].subscription = subscription;
      if (subscription === 'Premium') {
        users[userIndex].subscriptionStatus = 'active';
      } else if (subscription === 'Free') {
        users[userIndex].subscriptionStatus = 'none';
      }
    }
    
    await writeUsers(users);
    res.json({ success: true, message: 'Utente aggiornato' });
  } catch (err) {
    res.status(500).json({ error: 'Errore nell\'aggiornamento utente', details: err.message });
  }
});

app.post('/api/stripe/create-checkout-session', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    if ((process.env.STRIPE_SECRET_KEY || 'sk_test_dummy') === 'sk_test_dummy') {
      return res.json({ url: '/api/stripe/dummy-checkout?email=' + encodeURIComponent(email) });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price: process.env.STRIPE_PRICE_ID || 'price_dummy',
        quantity: 1,
      }],
      customer_email: email,
      success_url: req.headers.origin + '/?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: req.headers.origin + '/',
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Errore Stripe Checkout', details: err.message });
  }
});

app.post('/api/stripe/create-portal-session', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    if ((process.env.STRIPE_SECRET_KEY || 'sk_test_dummy') === 'sk_test_dummy') {
      return res.json({ url: '/api/stripe/dummy-portal?email=' + encodeURIComponent(email) });
    }

    const users = await readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ error: 'Nessun cliente Stripe trovato per questo utente. Effettua prima l\'abbonamento.' });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: req.headers.origin + '/',
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Errore Stripe Portal', details: err.message });
  }
});

// FAKE STRIPE ROUTES FOR TESTING
app.get('/api/stripe/dummy-checkout', async (req, res) => {
  const email = req.query.email;
  try {
    const users = await readUsers();
    const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (userIndex !== -1) {
      users[userIndex].subscriptionStatus = 'active';
      users[userIndex].subscription = 'Premium';
      await writeUsers(users);
    }
    res.send('<html><body><h2>Pagamento (Simulato) Completato!</h2><p>Il tuo account è ora Premium.</p><script>setTimeout(() => window.location.href="/", 2000)</script></body></html>');
  } catch (e) {
    res.redirect('/');
  }
});

app.get('/api/stripe/dummy-portal', async (req, res) => {
  const email = req.query.email;
  try {
    const users = await readUsers();
    const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (userIndex !== -1) {
      users[userIndex].subscriptionStatus = 'none';
      users[userIndex].subscription = 'Free';
      await writeUsers(users);
    }
    res.send('<html><body><h2>Abbonamento (Simulato) Annullato!</h2><p>Sei tornato al piano Free.</p><script>setTimeout(() => window.location.href="/", 2000)</script></body></html>');
  } catch (e) {
    res.redirect('/');
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   PORTFOLIO ENDPOINTS
   ───────────────────────────────────────────────────────────────────────────── */

app.get('/api/portfolio', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try { res.json(await getPortfolioData(email)); }
  catch (err) { res.status(500).json({ error: 'Impossibile caricare il portafoglio', details: err.message }); }
});

app.post('/api/portfolio', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const filePath = getUserPortfolioPath(email);
    await fs.writeFile(filePath, JSON.stringify(req.body, null, 2), 'utf8');
    invalidateCache(email); // Invalidate cache on strategy edits
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Impossibile salvare il portafoglio', details: err.message }); }
});

app.post('/api/portfolio/reset', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const stdout = await runPython(`python3 "${PARSE_SCRIPT}"`);
    const parsedData = JSON.parse(stdout);
    const filePath = getUserPortfolioPath(email);
    await fs.writeFile(filePath, JSON.stringify(parsedData, null, 2), 'utf8');
    invalidateCache(email); // Invalidate cache on reset
    res.json({ success: true, data: parsedData });
  } catch (err) { res.status(500).json({ error: 'Impossibile ripristinare il portafoglio', details: err.message }); }
});

app.post('/api/export', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  const tempJsonPath = path.join(DATA_DIR, `temp_export_${Date.now()}.json`);
  const tempXlsxPath = path.join(DATA_DIR, `temp_output_${Date.now()}.xlsx`);
  try {
    await fs.writeFile(tempJsonPath, JSON.stringify(req.body), 'utf8');
    await runPython(`python3 "${EXPORT_SCRIPT}" "${tempJsonPath}" "${tempXlsxPath}"`);
    res.download(tempXlsxPath, 'Portafoglio_Trading_Punto0.xlsx', async () => {
      try { await fs.unlink(tempJsonPath); } catch (e) {}
      try { await fs.unlink(tempXlsxPath); } catch (e) {}
    });
  } catch (err) {
    try { await fs.unlink(tempJsonPath); } catch (e) {}
    try { await fs.unlink(tempXlsxPath); } catch (e) {}
    res.status(500).json({ error: 'Impossibile esportare il file Excel', details: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   MANUAL REPORT STORAGE — separated from MT5 live
   MAX 10 reports. Each stored individually with metadata.
   ───────────────────────────────────────────────────────────────────────────── */

// GET /api/reports — list all saved reports (metadata only, no deals array)
app.get('/api/reports', async (req, res) => {
  try {
    const email = req.headers['x-user-email'];
    const index = await readReportsIndex(email);
    res.json(index);
  } catch (err) {
    res.status(500).json({ error: 'Impossibile leggere i report salvati', details: err.message });
  }
});

// POST /api/reports — save a new manual report
app.post('/api/reports', async (req, res) => {
  try {
    const email = req.headers['x-user-email'];
    const { name, deals } = req.body;
    if (!name || !Array.isArray(deals))
      return res.status(400).json({ error: 'Payload non valido: name e deals[] sono obbligatori' });

    const index = await readReportsIndex(email);

    // Enforce 10-report limit
    if (index.length >= MAX_REPORTS) {
      return res.status(429).json({
        error: 'Limite massimo di 10 report raggiunto.',
        limitReached: true,
        count: index.length
      });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Save report data file
    const reportFilePath = path.join(REPORTS_DIR, `${id}.json`);
    await ensureReportsDir();
    await fs.writeFile(reportFilePath, JSON.stringify({ id, name, uploadedAt: now, deals }, null, 2), 'utf8');

    // Update index with metadata (no deals array, to keep index light)
    const meta = { id, name, uploadedAt: now, tradeCount: deals.length };
    index.push(meta);
    await writeReportsIndex(email, index);

    console.log(`[Reports] Salvato report "${name}" (${deals.length} trade). Slot: ${index.length}/${MAX_REPORTS}`);
    invalidateCache(email); // Invalidate cache on new report upload
    res.json({ success: true, report: meta, count: index.length, max: MAX_REPORTS });
  } catch (err) {
    console.error('Error saving report:', err);
    res.status(500).json({ error: 'Impossibile salvare il report', details: err.message });
  }
});

// DELETE /api/reports/:id — delete a specific report
app.delete('/api/reports/:id', async (req, res) => {
  try {
    const email = req.headers['x-user-email'];
    const { id } = req.params;
    let index = await readReportsIndex(email);
    const exists = index.find(r => r.id === id);
    if (!exists) return res.status(404).json({ error: 'Report non trovato' });

    // Remove file
    const reportFilePath = path.join(REPORTS_DIR, `${id}.json`);
    try { await fs.unlink(reportFilePath); } catch (e) {}

    // Update index
    index = index.filter(r => r.id !== id);
    await writeReportsIndex(email, index);

    console.log(`[Reports] Eliminato report "${exists.name}". Slot rimanenti: ${MAX_REPORTS - index.length}/${MAX_REPORTS}`);
    invalidateCache(email); // Invalidate cache on report deletion
    res.json({ success: true, count: index.length, max: MAX_REPORTS });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile eliminare il report', details: err.message });
  }
});

// POST /api/reports/clear-all — delete all manual reports at once (without affecting MT5 live data)
app.post('/api/reports/clear-all', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });

  try {
    const index = await readReportsIndex(email);
    
    // Delete each manual report file listed in index
    for (const report of index) {
      const reportFilePath = path.join(REPORTS_DIR, `${report.id}.json`);
      try {
        await fs.unlink(reportFilePath);
      } catch (e) {
        // file might not exist, skip
      }
    }
    
    // Clear index
    await writeReportsIndex(email, []);
    
    console.log(`[Reports] Svuotati tutti i report manuali per ${email}. Dati MT5 intatti.`);
    invalidateCache(email); // Invalidate cache on clearing all reports
    res.json({ success: true, message: 'Tutti i report manuali sono stati rimossi.' });
  } catch (err) {
    console.error('Error clearing all reports:', err);
    res.status(500).json({ error: 'Impossibile svuotare i report manuali', details: err.message });
  }
});


/* ─────────────────────────────────────────────────────────────────────────────
   MT5 LIVE SYNC — completely separate from manual reports
   Data in mt5_deals.json has its own lifecycle.
   ───────────────────────────────────────────────────────────────────────────── */

app.get('/api/mt5-deals', async (req, res) => {
  try {
    await ensureDataDir();
    let deals = [];
    try { deals = JSON.parse(await fs.readFile(MT5_DEALS_JSON, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    res.json(deals);
  } catch (err) {
    res.status(500).json({ error: 'Impossibile leggere i dati MT5', details: err.message });
  }
});

app.get('/api/mt5-ea/download', (req, res) => {
  const eaPath = path.join(SCRIPTS_DIR, 'MT5HistorySender.mq5');
  res.download(eaPath, 'MT5HistorySender.mq5', (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'Impossibile scaricare il file Expert Advisor' });
  });
});

// POST /api/mt5-deals — receives deals from MT5 EA (ONLY EA writes here, not manual uploads)
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
});

/* ─────────────────────────────────────────────────────────────────────────────
   PORTFOLIO MANAGEMENT CALCULATION
   Merges manual reports + MT5 live data before calling portfolio_manager.py
   ───────────────────────────────────────────────────────────────────────────── */

app.post('/api/portfolio-management/calculate', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  const cleanEmail = email.toLowerCase().trim();

  // Support force refresh from client
  const forceRefresh = req.body && req.body.forceRefresh === true;

  // Check if cache exists and is younger than 24 hours
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const cached = calculationCache[cleanEmail];
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < ONE_DAY_MS)) {
    console.log(`[Cache] Restituisco dati calcolati in cache per ${cleanEmail} (età: ${Math.round((Date.now() - cached.timestamp)/1000)}s)`);
    return res.json(cached.data);
  }

  const tempDealsPath = path.join(DATA_DIR, `temp_deals_${Date.now()}.json`);
  try {
    const portfolioPath = getUserPortfolioPath(email);
    await getPortfolioData(email); // seed if missing

    // Merge both data sources
    const allDeals = await getAllDeals(email);
    await fs.writeFile(tempDealsPath, JSON.stringify(allDeals, null, 2), 'utf8');

    const mgrScript = path.join(SCRIPTS_DIR, 'portfolio_manager.py');
    const command = `python3 "${mgrScript}" "${portfolioPath}" "${tempDealsPath}"`;
    console.log(`[Portfolio Manager] Calcolo fresco su ${allDeals.length} deal totali (report + MT5 live)...`);
    const stdout = await runPython(command);
    const results = JSON.parse(stdout);

    // Save calculation to cache
    calculationCache[cleanEmail] = {
      data: results,
      timestamp: Date.now()
    };

    res.json(results);
  } catch (err) {
    console.error('Error calculating portfolio management stats:', err);
    res.status(500).json({ error: 'Impossibile calcolare le statistiche di gestione', details: err.message });
  } finally {
    try { await fs.unlink(tempDealsPath); } catch (e) {}
  }
});

// POST /api/portfolio-management/reset-deals
// Svuota SOLO mt5_deals.json (dati live EA). I report manuali e i parametri MC sono intatti.
app.post('/api/portfolio-management/reset-deals', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    await ensureDataDir();
    const cleanEmail = email.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const mt5File = email.toLowerCase() === 'alessio199754@gmail.com' ? MT5_DEALS_JSON : path.join(DATA_DIR, `mt5_deals_${cleanEmail}.json`);
    await fs.writeFile(mt5File, JSON.stringify([], null, 2), 'utf8');
    invalidateCache(email); // Invalidate cache on reset deals
    console.log(`[Reset MT5] Dati live EA azzerati da ${email}. Report manuali e parametri MC invariati.`);
    res.json({ success: true, message: 'Dati live MT5 EA azzerati. Report manuali e parametri Monte Carlo preservati.' });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile azzerare i dati live', details: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   STRATEGY GROUPS — CRUD endpoints
   Groups are saved in data/groups_{email}.json
   ───────────────────────────────────────────────────────────────────────────── */

function getUserGroupsPath(email) {
  const cleanEmail = email.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return path.join(DATA_DIR, `groups_${cleanEmail}.json`);
}

async function readGroups(email) {
  await ensureDataDir();
  const filePath = getUserGroupsPath(email);
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return []; throw err; }
}

async function writeGroups(email, groups) {
  await ensureDataDir();
  const filePath = getUserGroupsPath(email);
  await fs.writeFile(filePath, JSON.stringify(groups, null, 2), 'utf8');
}

// GET /api/groups — list all groups for the user
app.get('/api/groups', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const groups = await readGroups(email);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Impossibile leggere i gruppi', details: err.message });
  }
});

// POST /api/groups — create a new group
app.post('/api/groups', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { name, strategy_ids, description } = req.body;
    if (!name || !Array.isArray(strategy_ids) || strategy_ids.length === 0) {
      return res.status(400).json({ error: 'name e strategy_ids[] non vuoto sono obbligatori' });
    }
    const groups = await readGroups(email);
    const newGroup = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description || '',
      strategy_ids,
      created_at: new Date().toISOString()
    };
    groups.push(newGroup);
    await writeGroups(email, groups);
    console.log(`[Groups] Creato gruppo "${name}" con ${strategy_ids.length} strategie per ${email}`);
    res.json({ success: true, group: newGroup });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile creare il gruppo', details: err.message });
  }
});

// PUT /api/groups/:id — update an existing group
app.put('/api/groups/:id', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { id } = req.params;
    const { name, strategy_ids, description } = req.body;
    let groups = await readGroups(email);
    const idx = groups.findIndex(g => g.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Gruppo non trovato' });
    if (name) groups[idx].name = name.trim();
    if (Array.isArray(strategy_ids)) groups[idx].strategy_ids = strategy_ids;
    if (description !== undefined) groups[idx].description = description;
    groups[idx].updated_at = new Date().toISOString();
    await writeGroups(email, groups);
    // Invalidate chart cache since group composition changed
    if (equityChartCache[email.toLowerCase()]) {
      delete equityChartCache[email.toLowerCase()][`group_${id}`];
    }
    res.json({ success: true, group: groups[idx] });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile aggiornare il gruppo', details: err.message });
  }
});

// DELETE /api/groups/:id — delete a group
app.delete('/api/groups/:id', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { id } = req.params;
    let groups = await readGroups(email);
    const exists = groups.find(g => g.id === id);
    if (!exists) return res.status(404).json({ error: 'Gruppo non trovato' });
    groups = groups.filter(g => g.id !== id);
    await writeGroups(email, groups);
    // Remove from cache
    if (equityChartCache[email.toLowerCase()]) {
      delete equityChartCache[email.toLowerCase()][`group_${id}`];
    }
    console.log(`[Groups] Eliminato gruppo "${exists.name}" per ${email}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile eliminare il gruppo', details: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   EQUITY CHART CALCULATION
   Calls equity_chart.py to compute cumulative equity series.
   Supports mode: 'single' (one strategy) or 'group' (aggregate).
   ───────────────────────────────────────────────────────────────────────────── */

app.post('/api/equity-chart', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });

  const { mode, strategy_ids, group_id, forceRefresh } = req.body;
  if (!mode || !Array.isArray(strategy_ids) || strategy_ids.length === 0) {
    return res.status(400).json({ error: 'mode e strategy_ids[] obbligatori' });
  }

  const cleanEmail = email.toLowerCase().trim();
  // Cache key: mode + sorted strategy_ids
  const cacheKey = `${mode}_${group_id || strategy_ids.sort().join('_')}`;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  if (!equityChartCache[cleanEmail]) equityChartCache[cleanEmail] = {};
  const cached = equityChartCache[cleanEmail][cacheKey];
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < ONE_DAY_MS)) {
    console.log(`[Equity Cache] Restituisco curva in cache per ${cacheKey} (età: ${Math.round((Date.now() - cached.timestamp)/1000)}s)`);
    return res.json(cached.data);
  }

  const tempDealsPath = path.join(DATA_DIR, `temp_eq_deals_${Date.now()}.json`);
  try {
    const portfolioPath = getUserPortfolioPath(email);
    await getPortfolioData(email); // seed if missing

    const allDeals = await getAllDeals(email);
    await fs.writeFile(tempDealsPath, JSON.stringify(allDeals, null, 2), 'utf8');

    const stratIdsJson = JSON.stringify(strategy_ids);
    const command = `python3 "${EQUITY_CHART_SCRIPT}" "${portfolioPath}" "${tempDealsPath}" "${mode}" '${stratIdsJson}'`;
    console.log(`[Equity Chart] Calcolo ${mode} per ${strategy_ids.length} strategie su ${allDeals.length} deal...`);
    const stdout = await runPython(command);
    const result = JSON.parse(stdout);

    // Cache the result
    equityChartCache[cleanEmail][cacheKey] = { data: result, timestamp: Date.now() };

    res.json(result);
  } catch (err) {
    console.error('Error calculating equity chart:', err);
    res.status(500).json({ error: 'Impossibile calcolare la curva equity', details: err.message });
  } finally {
    try { await fs.unlink(tempDealsPath); } catch (e) {}
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   TASSE TRADING — Calcolo imposta sostitutiva 26% (art. 67 TUIR)
   Usa tasse_trading.py sullo stesso pool di deal: report manuali + MT5 live
   ───────────────────────────────────────────────────────────────────────────── */

// Middleware di autorizzazione per amministratore
async function requireAdmin(req, res, next) {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const users = await readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    const role = user?.role || (email.toLowerCase() === 'alessio199754@gmail.com' ? 'admin' : 'user');
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato. Permessi di amministratore richiesti.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Errore durante la verifica dei permessi' });
  }
}

// Helper: path del file di storage minusvalenze per utente
function getUserMinusvalenzePath(email) {
  const cleanEmail = email.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return path.join(DATA_DIR, `minusvalenze_${cleanEmail}.json`);
}

// GET /api/tasse/minusvalenze — legge le minusvalenze pregresse salvate
app.get('/api/tasse/minusvalenze', requireAdmin, async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const filePath = getUserMinusvalenzePath(email);
    try {
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      res.json(data);
    } catch (e) {
      if (e.code === 'ENOENT') return res.json({});
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: 'Impossibile leggere le minusvalenze', details: err.message });
  }
});

// POST /api/tasse/minusvalenze — aggiunge/aggiorna una minusvalenza pregressa manuale
app.post('/api/tasse/minusvalenze', requireAdmin, async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { anno, importo } = req.body;
    if (!anno || importo === undefined) return res.status(400).json({ error: 'anno e importo sono obbligatori' });
    const filePath = getUserMinusvalenzePath(email);
    let data = {};
    try { data = JSON.parse(await fs.readFile(filePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    data[String(anno)] = Math.max(0, (data[String(anno)] || 0) + parseFloat(importo));
    await ensureDataDir();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[Tasse] Minusvalenza pregressa ${anno}: +€${importo} per ${email}`);
    res.json({ success: true, minusvalenze: data });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile salvare la minusvalenza', details: err.message });
  }
});

// DELETE /api/tasse/minusvalenze/:anno — rimuove una minusvalenza pregressa per anno
app.delete('/api/tasse/minusvalenze/:anno', requireAdmin, async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { anno } = req.params;
    const filePath = getUserMinusvalenzePath(email);
    let data = {};
    try { data = JSON.parse(await fs.readFile(filePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    delete data[anno];
    await ensureDataDir();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, minusvalenze: data });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile eliminare la minusvalenza', details: err.message });
  }
});

// POST /api/tasse/calcola — esegue il motore fiscale sui deal dell'utente
app.post('/api/tasse/calcola', requireAdmin, async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });

  const tempDealsPath    = path.join(DATA_DIR, `temp_tasse_deals_${Date.now()}.json`);
  const storagePath      = getUserMinusvalenzePath(email);

  try {
    await ensureDataDir();

    // Per il calcolo fiscale usiamo SOLO i report manuali caricati dall'utente
    // (che rappresentano il report ufficiale del broker), escludendo i deal live
    // dell'EA MT5 che appartengono a un conto separato e potrebbero inflazionare
    // i totali fiscali con double-counting.
    let allDeals;
    try {
      const index = await readReportsIndex(email);
      if (index.length > 0) {
        // Ha report manuali → usa solo quelli per il fiscale
        const dealsMap = new Map();
        for (const meta of index) {
          const filePath = path.join(REPORTS_DIR, `${meta.id}.json`);
          try {
            const reportData = JSON.parse(await fs.readFile(filePath, 'utf8'));
            (reportData.deals || []).forEach(d => dealsMap.set(d.ticket, d));
          } catch (e) { /* skip */ }
        }
        allDeals = Array.from(dealsMap.values());
      } else {
        // Nessun report manuale → fallback sui deal live
        allDeals = await getAllDeals(email);
      }
    } catch (e) {
      allDeals = await getAllDeals(email);
    }

    if (allDeals.length === 0) {
      return res.json({
        anni: [],
        minusvalenze_residue: {},
        totale_imposta_dovuta: 0,
        anno_riferimento: new Date().getFullYear(),
        nessun_dato: true
      });
    }

    await fs.writeFile(tempDealsPath, JSON.stringify(allDeals, null, 2), 'utf8');

    const command = `python3 "${TASSE_SCRIPT}" "${tempDealsPath}" "${storagePath}"`;
    console.log(`[Tasse] Calcolo fiscale su ${allDeals.length} deal per ${email}...`);
    const stdout = await runPython(command);
    const result = JSON.parse(stdout);

    console.log(`[Tasse] Completato. Anni: ${result.anni?.length ?? 0}. Totale imposta: €${result.totale_imposta_dovuta}`);
    res.json(result);
  } catch (err) {
    console.error('Errore calcolo tasse:', err);
    res.status(500).json({ error: 'Impossibile calcolare le tasse', details: err.message });
  } finally {
    try { await fs.unlink(tempDealsPath); } catch (e) {}
  }
});

// Start server

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
