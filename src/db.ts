import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'market.db');
const db = new Database(dbPath);

// Initialize tables
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stocks (
      ticker TEXT PRIMARY KEY,
      name TEXT,
      market TEXT,
      industry TEXT,
      is_active INTEGER,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_bars (
      ticker TEXT,
      trade_date TEXT,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      turnover REAL,
      source TEXT,
      created_at TEXT,
      PRIMARY KEY (ticker, trade_date)
    );

    CREATE TABLE IF NOT EXISTS sepa_scores (
      ticker TEXT PRIMARY KEY,
      trade_date TEXT,
      close REAL,
      ma50 REAL,
      ma150 REAL,
      ma200 REAL,
      high_52w REAL,
      low_52w REAL,
      rs_rank REAL,
      pivot REAL,
      pivot_distance REAL,
      sepa_score REAL,
      trend_template_pass INTEGER,
      pattern TEXT,
      status TEXT,
      data_freshness TEXT,
      price_source TEXT,
      indicator_source TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT,
      trade_date TEXT,
      category TEXT,
      sepa_score REAL,
      pivot_distance REAL,
      note TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS system_status (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
  `);

  // Initialize system status keys if they don't exist
  const keys = [
    'tw_last_data_date',
    'tw_last_sync_time',
    'tw_data_source',
    'tw_data_status',
    'yahoo_status',
    'twse_status',
    'cache_status',
    'stock_count'
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO system_status (key, value, updated_at) VALUES (?, ?, ?)');
  const now = new Date().toISOString();
  for (const key of keys) {
    stmt.run(key, '', now);
  }
}

export default db;
