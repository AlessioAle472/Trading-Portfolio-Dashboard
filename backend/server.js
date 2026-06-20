require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const mongoose = require('mongoose');

// Import Models
const { User, Portfolio, Report, Mt5Deal, Minusvalenze, Group } = require('./models');

// Configure Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trading-portfolio';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch(err => console.error('MongoDB connection error:', err));

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
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email;
      if (email) {
        await User.findOneAndUpdate(
          { email: email.toLowerCase().trim() },
          {
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            subscriptionStatus: 'active'
          }
        );
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      await User.findOneAndUpdate(
        { stripeCustomerId: subscription.customer },
        { subscriptionStatus: subscription.status }
      );
    }
    res.json({ received: true });
  } catch (e) {
    console.error("Webhook logic error:", e);
    res.status(500).end();
  }
});

// Parsa JSON per tutte le altre rotte
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 5001;
const DATA_DIR     = path.join(__dirname, 'data');
const PORTFOLIO_JSON  = path.join(DATA_DIR, 'portfolio.json');
const SCRIPTS_DIR  = path.join(__dirname, 'scripts');
const PARSE_SCRIPT = path.join(SCRIPTS_DIR, 'parse_numbers.py');
const EXPORT_SCRIPT = path.join(SCRIPTS_DIR, 'export_excel.py');

const EQUITY_CHART_SCRIPT = path.join(SCRIPTS_DIR, 'equity_chart.py');
const TASSE_SCRIPT        = path.join(SCRIPTS_DIR, 'tasse_trading.py');
const MAX_REPORTS     = 10;

// ── Calculation Cache for Portfolio Management ──────────────────────────────
let calculationCache = {};
let equityChartCache = {};

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

// Ensure data dir exists (for temp files)
async function ensureDataDir() {
  try { await fs.mkdir(DATA_DIR, { recursive: true }); } catch (e) {}
}

// Password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Python runner
function runPython(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Exec error: ${error}`);
        console.error(`Stderr: ${stderr}`);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

// Portfolio read (with DB fallback & parse numbers seed)
async function getPortfolioData(email) {
  const userEmail = (email || '').toLowerCase().trim();
  let portfolioObj = await Portfolio.findOne({ email: userEmail });
  
  if (!portfolioObj) {
    let baseData = {};
    try {
      baseData = JSON.parse(await fs.readFile(PORTFOLIO_JSON, 'utf8'));
    } catch (baseErr) {
      console.log('Base portfolio.json not found, running parse_numbers.py...');
      const stdout = await runPython(`python3 "${PARSE_SCRIPT}"`);
      baseData = JSON.parse(stdout);
      await ensureDataDir();
      await fs.writeFile(PORTFOLIO_JSON, JSON.stringify(baseData, null, 2), 'utf8');
    }

    const user = await User.findOne({ email: userEmail });
    const isAdmin = user && user.role === 'admin';

    let toSaveData = baseData;
    if (!isAdmin && userEmail !== 'alessio199754@gmail.com') {
      toSaveData = {};
      for (const section of Object.keys(baseData)) {
        toSaveData[section] = [];
      }
    }

    portfolioObj = new Portfolio({ email: userEmail, data: toSaveData });
    await portfolioObj.save();
  }
  return portfolioObj.data;
}

// Onboarding Deals Generator
async function injectOnboardingDeals(email) {
  const id = crypto.randomUUID();
  const deals = [];
  let ticket = 900000;
  const now = new Date();

  // TRIAL_1 deals
  for (let i = 0; i < 15; i++) {
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

  // TRIAL_2 deals
  for (let i = 0; i < 10; i++) {
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

  const onboardingReport = new Report({
    id,
    email: email.toLowerCase().trim(),
    name: 'Dati di Prova (Onboarding)',
    uploadedAt: now,
    tradeCount: deals.length,
    deals
  });
  await onboardingReport.save();
}

// Merge all deals: manual reports + MT5 live
async function getAllDeals(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const allDeals = new Map();

  // 1. Manual reports
  try {
    const reports = await Report.find({ email: cleanEmail });
    for (const report of reports) {
      (report.deals || []).forEach(d => allDeals.set(d.ticket, d));
    }
  } catch (e) {
    console.error('Error fetching manual reports for deals:', e);
  }

  // 2. MT5 live data
  try {
    const liveDeals = await Mt5Deal.find({ email: cleanEmail });
    liveDeals.forEach(d => {
      const plain = d.toObject();
      allDeals.set(plain.ticket, plain);
    });
  } catch (e) {
    console.error('Error fetching MT5 deals:', e);
  }

  return Array.from(allDeals.values());
}

/* ─────────────────────────────────────────────────────────────────────────────
   AUTHENTICATION ENDPOINTS
   ───────────────────────────────────────────────────────────────────────────── */

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, subscription } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e Password sono obbligatori' });
    
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: 'Questo indirizzo email è già registrato' });

    let finalSub = subscription || 'Standard (3.99€/mese)';
    let finalRole = 'user';
    let trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 giorni
    if (email.toLowerCase().trim() === 'alessio199754@gmail.com') {
      finalSub = 'Admin (Gratuito)';
      finalRole = 'admin';
      trialEndsAt = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString(); // 10 anni
    }

    const newUser = new User({
      email: email.toLowerCase().trim(),
      passwordHash: hashPassword(password),
      subscription: finalSub,
      role: finalRole,
      trialEndsAt,
      subscriptionStatus: 'trialing'
    });
    await newUser.save();

    // Init portfolio and onboarding deals
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
      await Portfolio.findOneAndUpdate(
        { email: newUser.email },
        { data: trialPortfolio },
        { upsert: true }
      );
      await injectOnboardingDeals(newUser.email);
    } else {
      await getPortfolioData(newUser.email);
    }

    res.json({
      success: true,
      user: {
        email: newUser.email,
        subscription: newUser.subscription,
        role: newUser.role,
        trialEndsAt: newUser.trialEndsAt,
        subscriptionStatus: newUser.subscriptionStatus
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Errore durante la registrazione', details: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e Password sono obbligatori' });
    
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || user.passwordHash !== hashPassword(password))
      return res.status(400).json({ error: 'Credenziali non valide' });

    const userRole = user.role || (user.email.toLowerCase().trim() === 'alessio199754@gmail.com' ? 'admin' : 'user');
    const trialEndsAt = user.trialEndsAt || new Date(Date.now() - 1000).toISOString();
    const subStatus = user.subscriptionStatus || 'none';

    res.json({
      success: true,
      user: {
        email: user.email,
        subscription: user.subscription,
        role: userRole,
        trialEndsAt,
        subscriptionStatus: subStatus
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Errore durante il login', details: err.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    const userRole = user.role || (user.email.toLowerCase().trim() === 'alessio199754@gmail.com' ? 'admin' : 'user');
    const trialEndsAt = user.trialEndsAt || new Date(Date.now() - 1000).toISOString();
    const subStatus = user.subscriptionStatus || 'none';
    res.json({
      success: true,
      user: {
        email: user.email,
        subscription: user.subscription,
        role: userRole,
        trialEndsAt,
        subscriptionStatus: subStatus
      }
    });
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

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });

    if (user.passwordHash !== hashPassword(oldPassword)) {
      return res.status(400).json({ error: 'La vecchia password non è corretta' });
    }

    user.passwordHash = hashPassword(newPassword);
    await user.save();

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
    const reqUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (!reqUser || reqUser.role !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato. Permessi di amministratore richiesti.' });
    }

    const allUsers = await User.find();
    const safeUsers = allUsers.map(u => ({
      email: u.email,
      role: u.role || (u.email.toLowerCase().trim() === 'alessio199754@gmail.com' ? 'admin' : 'user'),
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
    const reqUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (!reqUser || reqUser.role !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato. Permessi di amministratore richiesti.' });
    }

    const targetEmail = req.params.userEmail.toLowerCase().trim();
    const user = await User.findOne({ email: targetEmail });
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });

    const { role, subscription } = req.body;
    if (role) user.role = role;
    if (subscription) {
      user.subscription = subscription;
      if (subscription === 'Premium') {
        user.subscriptionStatus = 'active';
      } else if (subscription === 'Free') {
        user.subscriptionStatus = 'none';
      }
    }

    await user.save();
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

    const user = await User.findOne({ email: email.toLowerCase().trim() });
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
    await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { subscriptionStatus: 'active', subscription: 'Premium' }
    );
    res.send('<html><body><h2>Pagamento (Simulato) Completato!</h2><p>Il tuo account è ora Premium.</p><script>setTimeout(() => window.location.href="/", 2000)</script></body></html>');
  } catch (e) {
    res.redirect('/');
  }
});

app.get('/api/stripe/dummy-portal', async (req, res) => {
  const email = req.query.email;
  try {
    await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { subscriptionStatus: 'none', subscription: 'Free' }
    );
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
  try {
    res.json(await getPortfolioData(email));
  } catch (err) {
    res.status(500).json({ error: 'Impossibile caricare il portafoglio', details: err.message });
  }
});

app.post('/api/portfolio', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    await Portfolio.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { data: req.body },
      { upsert: true }
    );
    invalidateCache(email);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile salvare il portafoglio', details: err.message });
  }
});

app.post('/api/portfolio/reset', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const stdout = await runPython(`python3 "${PARSE_SCRIPT}"`);
    const parsedData = JSON.parse(stdout);
    await Portfolio.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { data: parsedData },
      { upsert: true }
    );
    invalidateCache(email);
    res.json({ success: true, data: parsedData });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile ripristinare il portafoglio', details: err.message });
  }
});

app.post('/api/export', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  
  await ensureDataDir();
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
   MANUAL REPORT STORAGE
   ───────────────────────────────────────────────────────────────────────────── */

app.get('/api/reports', async (req, res) => {
  try {
    const email = req.headers['x-user-email'];
    if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
    const list = await Report.find({ email: email.toLowerCase().trim() }).select('-deals').sort({ uploadedAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Impossibile leggere i report salvati', details: err.message });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const email = req.headers['x-user-email'];
    if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
    const { name, deals } = req.body;
    if (!name || !Array.isArray(deals))
      return res.status(400).json({ error: 'Payload non valido: name e deals[] sono obbligatori' });

    const userEmail = email.toLowerCase().trim();
    const count = await Report.countDocuments({ email: userEmail });
    if (count >= MAX_REPORTS) {
      return res.status(429).json({
        error: 'Limite massimo di 10 report raggiunto.',
        limitReached: true,
        count
      });
    }

    const id = crypto.randomUUID();
    const newReport = new Report({
      id,
      email: userEmail,
      name,
      deals,
      tradeCount: deals.length
    });
    await newReport.save();

    invalidateCache(email);
    res.json({ success: true, report: { id, name, uploadedAt: newReport.uploadedAt, tradeCount: deals.length }, count: count + 1, max: MAX_REPORTS });
  } catch (err) {
    console.error('Error saving report:', err);
    res.status(500).json({ error: 'Impossibile salvare il report', details: err.message });
  }
});

app.delete('/api/reports/:id', async (req, res) => {
  try {
    const email = req.headers['x-user-email'];
    if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
    
    const userEmail = email.toLowerCase().trim();
    const result = await Report.deleteOne({ id: req.params.id, email: userEmail });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Report non trovato' });

    const count = await Report.countDocuments({ email: userEmail });
    invalidateCache(email);
    res.json({ success: true, count, max: MAX_REPORTS });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile eliminare il report', details: err.message });
  }
});

app.post('/api/reports/clear-all', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });

  try {
    await Report.deleteMany({ email: email.toLowerCase().trim() });
    invalidateCache(email);
    res.json({ success: true, message: 'Tutti i report manuali sono stati rimossi.' });
  } catch (err) {
    console.error('Error clearing all reports:', err);
    res.status(500).json({ error: 'Impossibile svuotare i report manuali', details: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   MT5 LIVE SYNC
   ───────────────────────────────────────────────────────────────────────────── */

app.get('/api/mt5-deals', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const deals = await Mt5Deal.find({ email: email.toLowerCase().trim() });
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

app.post('/api/mt5-deals', async (req, res) => {
  try {
    const deals = req.body;
    const email = (req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email mancante nella query string' });
    if (!Array.isArray(deals)) return res.status(400).json({ error: 'Il payload deve essere un array di deals' });

    let hasNewDeals = false;
    for (const d of deals) {
      const existing = await Mt5Deal.findOne({ email, ticket: d.ticket });
      if (!existing) {
        const newDeal = new Mt5Deal({ ...d, email });
        await newDeal.save();
        hasNewDeals = true;
      }
    }

    if (hasNewDeals) {
      invalidateCache(email);
    }
    const totalCount = await Mt5Deal.countDocuments({ email });
    res.json({ success: true, count: totalCount });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile salvare i dati MT5', details: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   PORTFOLIO MANAGEMENT CALCULATION
   ───────────────────────────────────────────────────────────────────────────── */

app.post('/api/portfolio-management/calculate', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  const cleanEmail = email.toLowerCase().trim();
  const forceRefresh = req.body && req.body.forceRefresh === true;

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const cached = calculationCache[cleanEmail];
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < ONE_DAY_MS)) {
    console.log(`[Cache] Restituisco dati calcolati in cache per ${cleanEmail}`);
    return res.json(cached.data);
  }

  await ensureDataDir();
  const tempDealsPath = path.join(DATA_DIR, `temp_deals_${Date.now()}.json`);
  const tempPortfolioPath = path.join(DATA_DIR, `temp_port_${Date.now()}.json`);

  try {
    const portData = await getPortfolioData(email);
    await fs.writeFile(tempPortfolioPath, JSON.stringify(portData, null, 2), 'utf8');

    const allDeals = await getAllDeals(email);
    await fs.writeFile(tempDealsPath, JSON.stringify(allDeals, null, 2), 'utf8');

    const mgrScript = path.join(SCRIPTS_DIR, 'portfolio_manager.py');
    const command = `python3 "${mgrScript}" "${tempPortfolioPath}" "${tempDealsPath}"`;
    console.log(`[Portfolio Manager] Calcolo fresco su ${allDeals.length} deal totali...`);
    const stdout = await runPython(command);
    const results = JSON.parse(stdout);

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
    try { await fs.unlink(tempPortfolioPath); } catch (e) {}
  }
});

app.post('/api/portfolio-management/reset-deals', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    await Mt5Deal.deleteMany({ email: email.toLowerCase().trim() });
    invalidateCache(email);
    res.json({ success: true, message: 'Dati live MT5 EA azzerati.' });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile azzerare i dati live', details: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   STRATEGY GROUPS — CRUD
   ───────────────────────────────────────────────────────────────────────────── */

app.get('/api/groups', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const groups = await Group.find({ email: email.toLowerCase().trim() });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Impossibile leggere i gruppi', details: err.message });
  }
});

app.post('/api/groups', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { name, strategy_ids, description } = req.body;
    if (!name || !Array.isArray(strategy_ids) || strategy_ids.length === 0) {
      return res.status(400).json({ error: 'name e strategy_ids[] non vuoto sono obbligatori' });
    }
    const newGroup = new Group({
      id: crypto.randomUUID(),
      email: email.toLowerCase().trim(),
      name: name.trim(),
      description: description || '',
      strategy_ids
    });
    await newGroup.save();
    res.json({ success: true, group: newGroup });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile creare il gruppo', details: err.message });
  }
});

app.put('/api/groups/:id', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { id } = req.params;
    const { name, strategy_ids, description } = req.body;
    const group = await Group.findOne({ id, email: email.toLowerCase().trim() });
    if (!group) return res.status(404).json({ error: 'Gruppo non trovato' });

    if (name) group.name = name.trim();
    if (Array.isArray(strategy_ids)) group.strategy_ids = strategy_ids;
    if (description !== undefined) group.description = description;
    group.updated_at = new Date();
    await group.save();

    if (equityChartCache[email.toLowerCase().trim()]) {
      delete equityChartCache[email.toLowerCase().trim()][`group_${id}`];
    }
    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile aggiornare il gruppo', details: err.message });
  }
});

app.delete('/api/groups/:id', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { id } = req.params;
    const result = await Group.deleteOne({ id, email: email.toLowerCase().trim() });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Gruppo non trovato' });

    if (equityChartCache[email.toLowerCase().trim()]) {
      delete equityChartCache[email.toLowerCase().trim()][`group_${id}`];
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile eliminare il gruppo', details: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   EQUITY CHART CALCULATION
   ───────────────────────────────────────────────────────────────────────────── */

app.post('/api/equity-chart', async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });

  const { mode, strategy_ids, group_id, forceRefresh } = req.body;
  if (!mode || !Array.isArray(strategy_ids) || strategy_ids.length === 0) {
    return res.status(400).json({ error: 'mode e strategy_ids[] obbligatori' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const cacheKey = `${mode}_${group_id || strategy_ids.sort().join('_')}`;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  if (!equityChartCache[cleanEmail]) equityChartCache[cleanEmail] = {};
  const cached = equityChartCache[cleanEmail][cacheKey];
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < ONE_DAY_MS)) {
    return res.json(cached.data);
  }

  await ensureDataDir();
  const tempDealsPath = path.join(DATA_DIR, `temp_eq_deals_${Date.now()}.json`);
  const tempPortfolioPath = path.join(DATA_DIR, `temp_eq_port_${Date.now()}.json`);

  try {
    const portfolioData = await getPortfolioData(email);
    await fs.writeFile(tempPortfolioPath, JSON.stringify(portfolioData, null, 2), 'utf8');

    const allDeals = await getAllDeals(email);
    await fs.writeFile(tempDealsPath, JSON.stringify(allDeals, null, 2), 'utf8');

    const stratIdsJson = JSON.stringify(strategy_ids);
    const command = `python3 "${EQUITY_CHART_SCRIPT}" "${tempPortfolioPath}" "${tempDealsPath}" "${mode}" '${stratIdsJson}'`;
    console.log(`[Equity Chart] Calcolo ${mode} per ${strategy_ids.length} strategie...`);
    const stdout = await runPython(command);
    const result = JSON.parse(stdout);

    equityChartCache[cleanEmail][cacheKey] = { data: result, timestamp: Date.now() };
    res.json(result);
  } catch (err) {
    console.error('Error calculating equity chart:', err);
    res.status(500).json({ error: 'Impossibile calcolare la curva equity', details: err.message });
  } finally {
    try { await fs.unlink(tempDealsPath); } catch (e) {}
    try { await fs.unlink(tempPortfolioPath); } catch (e) {}
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   TASSE TRADING
   ───────────────────────────────────────────────────────────────────────────── */

async function requireAdmin(req, res, next) {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    const role = user?.role || (email.toLowerCase().trim() === 'alessio199754@gmail.com' ? 'admin' : 'user');
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Accesso negato. Permessi di amministratore richiesti.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Errore durante la verifica dei permessi' });
  }
}

app.get('/api/tasse/minusvalenze', requireAdmin, async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const minObj = await Minusvalenze.findOne({ email: email.toLowerCase().trim() });
    res.json(minObj ? minObj.data : {});
  } catch (err) {
    res.status(500).json({ error: 'Impossibile leggere le minusvalenze', details: err.message });
  }
});

app.post('/api/tasse/minusvalenze', requireAdmin, async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { anno, importo } = req.body;
    if (!anno || importo === undefined) return res.status(400).json({ error: 'anno e importo sono obbligatori' });
    const userEmail = email.toLowerCase().trim();

    let minObj = await Minusvalenze.findOne({ email: userEmail });
    if (!minObj) {
      minObj = new Minusvalenze({ email: userEmail, data: {} });
    }
    minObj.data[String(anno)] = Math.max(0, (minObj.data[String(anno)] || 0) + parseFloat(importo));
    minObj.markModified('data');
    await minObj.save();

    res.json({ success: true, minusvalenze: minObj.data });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile salvare la minusvalenza', details: err.message });
  }
});

app.delete('/api/tasse/minusvalenze/:anno', requireAdmin, async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  try {
    const { anno } = req.params;
    const userEmail = email.toLowerCase().trim();

    const minObj = await Minusvalenze.findOne({ email: userEmail });
    if (minObj) {
      delete minObj.data[anno];
      minObj.markModified('data');
      await minObj.save();
    }
    res.json({ success: true, minusvalenze: minObj ? minObj.data : {} });
  } catch (err) {
    res.status(500).json({ error: 'Impossibile eliminare la minusvalenza', details: err.message });
  }
});

app.post('/api/tasse/calcola', requireAdmin, async (req, res) => {
  const email = req.headers['x-user-email'];
  if (!email) return res.status(401).json({ error: 'Utente non autorizzato' });
  const userEmail = email.toLowerCase().trim();

  await ensureDataDir();
  const tempDealsPath = path.join(DATA_DIR, `temp_tasse_deals_${Date.now()}.json`);
  const tempMinusPath = path.join(DATA_DIR, `temp_minus_${Date.now()}.json`);

  try {
    let allDeals;
    const indexCount = await Report.countDocuments({ email: userEmail });
    if (indexCount > 0) {
      const reports = await Report.find({ email: userEmail });
      const dealsMap = new Map();
      for (const report of reports) {
        (report.deals || []).forEach(d => dealsMap.set(d.ticket, d));
      }
      allDeals = Array.from(dealsMap.values());
    } else {
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

    const minObj = await Minusvalenze.findOne({ email: userEmail });
    const minusData = minObj ? minObj.data : {};
    await fs.writeFile(tempMinusPath, JSON.stringify(minusData, null, 2), 'utf8');

    const command = `python3 "${TASSE_SCRIPT}" "${tempDealsPath}" "${tempMinusPath}"`;
    console.log(`[Tasse] Calcolo fiscale su ${allDeals.length} deal per ${email}...`);
    const stdout = await runPython(command);
    const result = JSON.parse(stdout);

    try {
      const updatedMinusData = JSON.parse(await fs.readFile(tempMinusPath, 'utf8'));
      await Minusvalenze.findOneAndUpdate(
        { email: userEmail },
        { data: updatedMinusData },
        { upsert: true }
      );
      result.minusvalenze_residue = updatedMinusData;
    } catch (e) {
      console.error("Non è stato possibile sincronizzare le minusvalenze modificate da Python:", e);
    }

    res.json(result);
  } catch (err) {
    console.error('Errore calcolo tasse:', err);
    res.status(500).json({ error: 'Impossibile calcolare le tasse', details: err.message });
  } finally {
    try { await fs.unlink(tempDealsPath); } catch (e) {}
    try { await fs.unlink(tempMinusPath); } catch (e) {}
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
