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
`)

module.exports = db
