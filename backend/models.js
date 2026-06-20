const mongoose = require('mongoose');

// 1. USER SCHEMA
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  subscription: {
    type: String,
    default: 'Standard (3.99€/mese)'
  },
  role: {
    type: String,
    default: 'user'
  },
  trialEndsAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 giorni
  },
  subscriptionStatus: {
    type: String,
    default: 'trialing'
  },
  stripeCustomerId: {
    type: String,
    default: ''
  },
  stripeSubscriptionId: {
    type: String,
    default: ''
  }
}, { timestamps: true });

// 2. PORTFOLIO SCHEMA (Dynamic sheets containing arrays of strategies)
const PortfolioSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

// 3. REPORT SCHEMA (Manual uploads)
const ReportSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  tradeCount: {
    type: Number,
    default: 0
  },
  deals: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  }
}, { timestamps: true });

// Compound index to search reports quickly by user
ReportSchema.index({ email: 1 });

// 4. MT5 LIVE DEALS SCHEMA
const Mt5DealSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  ticket: {
    type: Number,
    required: true
  },
  time: Date,
  symbol: String,
  magic: String,
  profit: Number,
  volume: Number,
  type: Number,
  price: Number,
  swap: Number,
  commission: Number
}, { timestamps: true });

// Prevent duplicate deals for the same user
Mt5DealSchema.index({ email: 1, ticket: 1 }, { unique: true });

// 5. MINUSVALENZE SCHEMA (Dynamic years mapped to values)
const MinusvalenzeSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

// 6. GROUP SCHEMA (Strategy groups)
const GroupSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  strategy_ids: {
    type: [String],
    default: []
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

GroupSchema.index({ email: 1 });

const User = mongoose.model('User', UserSchema);
const Portfolio = mongoose.model('Portfolio', PortfolioSchema);
const Report = mongoose.model('Report', ReportSchema);
const Mt5Deal = mongoose.model('Mt5Deal', Mt5DealSchema);
const Minusvalenze = mongoose.model('Minusvalenze', MinusvalenzeSchema);
const Group = mongoose.model('Group', GroupSchema);

module.exports = {
  User,
  Portfolio,
  Report,
  Mt5Deal,
  Minusvalenze,
  Group
};
