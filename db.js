const Database = require("better-sqlite3")
const path = require("path")

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "momentum.db")
const db = new Database(DB_PATH)

db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS scan_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    universe TEXT NOT NULL,
    scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
    scan_limit INTEGER NOT NULL,
    symbols_scanned INTEGER NOT NULL,
    config_json TEXT
  );

  CREATE TABLE IF NOT EXISTS scan_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scan_results(id),
    rank INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    score REAL NOT NULL,
    momentum REAL NOT NULL,
    volatility REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scan_scores_scan_id ON scan_scores(scan_id);
  CREATE INDEX IF NOT EXISTS idx_scan_results_universe ON scan_results(universe);

  CREATE TABLE IF NOT EXISTS backtest_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    universe TEXT NOT NULL,
    config_json TEXT NOT NULL,
    ran_at TEXT NOT NULL DEFAULT (datetime('now')),
    cagr REAL,
    sharpe REAL,
    max_drawdown REAL,
    total_return REAL,
    result_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER REFERENCES scan_results(id),
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL,
    order_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    placed_at TEXT NOT NULL DEFAULT (datetime('now')),
    filled_at TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    formula TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    universe TEXT NOT NULL DEFAULT 'nifty500',
    strategy_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    config_json TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    entry_price REAL NOT NULL DEFAULT 0,
    entry_date TEXT NOT NULL DEFAULT (date('now')),
    current_price REAL DEFAULT 0,
    current_value REAL DEFAULT 0,
    pnl REAL DEFAULT 0,
    pnl_pct REAL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_portfolio_id ON portfolio_holdings(portfolio_id);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
`)

// Migration: add user_id to portfolios for per-user scoping
try {
  db.exec("ALTER TABLE portfolios ADD COLUMN user_id INTEGER REFERENCES users(id)")
} catch (e) {
  if (!String(e.message).includes("duplicate column name")) throw e
}

// Migration: password reset tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token);
`)

module.exports = db
