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

if (productCols.includes('price_per_100g')) {
  db.exec('ALTER TABLE products DROP COLUMN price_per_100g');
  console.log('[db] Columna price_per_100g eliminada de products');
}
if (!productCols.includes('price_500g')) {
  db.exec('ALTER TABLE products ADD COLUMN price_500g REAL');
  console.log('[db] Columna price_500g agregada a products');
}
if (!productCols.includes('container_product_id')) {
  db.exec('ALTER TABLE products ADD COLUMN container_product_id INTEGER');
  console.log('[db] Columna container_product_id agregada a products');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_products_container ON products(container_product_id)');

if (productCols.includes('cost_price')) {
  db.exec('ALTER TABLE products DROP COLUMN cost_price');
  console.log('[db] Columna cost_price eliminada de products');
}

if (!productCols.includes('is_bote')) {
  db.exec('ALTER TABLE products ADD COLUMN is_bote INTEGER NOT NULL DEFAULT 0');
  console.log('[db] Columna is_bote agregada a products');
}
if (!productCols.includes('recipe_grams')) {
  db.exec('ALTER TABLE products ADD COLUMN recipe_grams REAL NOT NULL DEFAULT 0');
  console.log('[db] Columna recipe_grams agregada a products');
}
if (!productCols.includes('recipe_bote_id')) {
  db.exec('ALTER TABLE products ADD COLUMN recipe_bote_id INTEGER');
  console.log('[db] Columna recipe_bote_id agregada a products');
}
if (!productCols.includes('recipe_grams2')) {
  db.exec('ALTER TABLE products ADD COLUMN recipe_grams2 REAL NOT NULL DEFAULT 0');
  console.log('[db] Columna recipe_grams2 agregada a products');
}
if (!productCols.includes('recipe_bote_id2')) {
  db.exec('ALTER TABLE products ADD COLUMN recipe_bote_id2 INTEGER');
  console.log('[db] Columna recipe_bote_id2 agregada a products');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_products_recipe_bote ON products(recipe_bote_id)');

const saleItemCols = db.prepare("PRAGMA table_info(sale_items)").all().map((c) => c.name);
if (!saleItemCols.includes('sale_mode')) {
  db.exec("ALTER TABLE sale_items ADD COLUMN sale_mode TEXT NOT NULL DEFAULT 'kg'");
  console.log('[db] Columna sale_mode agregada a sale_items');
}
if (!saleItemCols.includes('sale_price')) {
  db.exec('ALTER TABLE sale_items ADD COLUMN sale_price REAL');
  console.log('[db] Columna sale_price agregada a sale_items');
}

const saleCols = db.prepare('PRAGMA table_info(sales)').all().map((c) => c.name);
if (!saleCols.includes('ticket_no')) {
  db.exec('ALTER TABLE sales ADD COLUMN ticket_no INTEGER');
  console.log('[db] Columna ticket_no agregada a sales');
}
if (!saleCols.includes('cash_received')) {
  db.exec('ALTER TABLE sales ADD COLUMN cash_received REAL');
  console.log('[db] Columna cash_received agregada a sales');
}
if (!saleCols.includes('change')) {
  db.exec('ALTER TABLE sales ADD COLUMN change REAL');
  console.log('[db] Columna change agregada a sales');
}
db.exec(`
  UPDATE sales SET ticket_no = (
    SELECT COUNT(*) FROM sales s2
    WHERE date(s2.created_at) = date(sales.created_at) AND s2.id <= sales.id
  )
  WHERE ticket_no IS NULL;
`);

db.exec(`
CREATE TABLE IF NOT EXISTS stock_movements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('entrada', 'salida')),
  quantity   REAL NOT NULL,
  reason     TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mov_product   ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_mov_created   ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_ticket  ON sales(ticket_no);
`);

db.exec(`
  UPDATE products SET stock = round(stock, 3), min_stock = round(min_stock, 3);
  UPDATE stock_movements SET quantity = round(quantity, 3);
  UPDATE sale_items SET quantity = round(quantity, 3), subtotal = round(subtotal, 2);
`);

module.exports = db;
