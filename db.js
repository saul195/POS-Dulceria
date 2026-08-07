const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'dulceria.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode       TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  category_id   INTEGER,
  cost_price    REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  stock         REAL NOT NULL DEFAULT 0,
  min_stock     REAL NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT 'pza',
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  total_amount   REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'efectivo',
  created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  cash_session_id INTEGER
);

CREATE TABLE IF NOT EXISTS sale_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id      INTEGER NOT NULL,
  product_id   INTEGER,
  quantity     REAL NOT NULL DEFAULT 1,
  unit_price   REAL NOT NULL DEFAULT 0,
  subtotal     REAL NOT NULL DEFAULT 0,
  product_name TEXT DEFAULT '',
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  opening_date   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  opening_amount REAL NOT NULL DEFAULT 0,
  closing_date   TEXT,
  closing_amount REAL,
  expected_amount REAL,
  difference     REAL,
  status         TEXT NOT NULL DEFAULT 'abierta',
  notes          TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_barcode      ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name         ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category     ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at      ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale       ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product    ON sale_items(product_id);
`);

const productCols = db.prepare("PRAGMA table_info(products)").all().map((c) => c.name);
if (!productCols.includes('is_active')) {
  db.exec('ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
  console.log('[db] Columna is_active agregada a products');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active)');

module.exports = db;
