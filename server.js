const path = require('path');
const os = require('os');
const express = require('express');
const db = require('./db');
const wa = require('./whatsapp');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const round2 = (n) => Math.round(n * 100) / 100;

const todayStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 00:00:00`;
};

/* ============================ CATEGORÍAS ============================ */

app.get('/api/categories', (req, res) => {
  const rows = db.prepare(
    `SELECT c.*, COUNT(p.id) AS product_count
     FROM categories c
     LEFT JOIN products p ON p.category_id = c.id
     GROUP BY c.id ORDER BY c.name`
  ).all();
  res.json(rows);
});

app.post('/api/categories', (req, res) => {
  const { name, description = '' } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    const info = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(name.trim(), description);
    res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
  }
});

app.put('/api/categories/:id', (req, res) => {
  const { name, description } = req.body || {};
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
  try {
    db.prepare('UPDATE categories SET name = ?, description = ? WHERE id = ?')
      .run((name || cat.name).trim(), description !== undefined ? description : cat.description, cat.id);
    res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id));
  } catch (e) {
    res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
  }
});

app.delete('/api/categories/:id', (req, res) => {
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Categoría no encontrada' });
  res.json({ ok: true });
});

/* ============================ PRODUCTOS ============================ */

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id`;

app.get('/api/products', (req, res) => {
  const { search = '', category_id, lowStock, page = 1, pageSize = 10 } = req.query;
  const where = [];
  const params = [];
  if (search) {
    where.push('(p.name LIKE ? OR p.barcode LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category_id) {
    where.push('p.category_id = ?');
    params.push(Number(category_id));
  }
  if (lowStock === '1' || lowStock === 'true') {
    where.push('p.stock <= p.min_stock');
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = db.prepare(`SELECT COUNT(*) AS total FROM products p ${whereSql}`).get(...params).total;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 10));
  const rows = db.prepare(
    `${PRODUCT_SELECT} ${whereSql} ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?`
  ).all(...params, size, (pageNum - 1) * size);
  res.json({ products: rows, total: count, page: pageNum, pageSize: size });
});

app.get('/api/products/export', (req, res) => {
  const products = db.prepare(PRODUCT_SELECT).all();
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  res.json({ exported_at: new Date().toISOString(), categories, products });
});

app.post('/api/products/import', (req, res) => {
  const data = Array.isArray(req.body) ? req.body : req.body?.products;
  if (!Array.isArray(data)) return res.status(400).json({ error: 'El cuerpo debe ser un array de productos' });

  const getCat = db.prepare('SELECT id FROM categories WHERE name = ?');
  const getProd = db.prepare('SELECT id FROM products WHERE barcode = ?');
  const insert = db.prepare(
    `INSERT INTO products (barcode, name, category_id, cost_price, selling_price, stock, min_stock, unit, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const update = db.prepare(
    `UPDATE products SET name = ?, category_id = ?, cost_price = ?, selling_price = ?, stock = ?, min_stock = ?, unit = ?, is_active = ?
     WHERE id = ?`
  );

  const imported = db.transaction((rows) => {
    let inserted = 0, updated = 0, skipped = 0;
    for (const r of rows) {
      const barcode = String(r.barcode ?? '').trim();
      if (!barcode || !String(r.name ?? '').trim()) { skipped++; continue; }
      let catId = null;
      if (r.category_id != null) catId = Number(r.category_id) || null;
      else if (r.category) { const c = getCat.get(String(r.category).trim()); catId = c ? c.id : null; }
      const existing = getProd.get(barcode);
      const params = [
        String(r.name).trim(),
        catId,
        round2(Number(r.cost_price) || 0),
        round2(Number(r.selling_price) || 0),
        Number(r.stock) || 0,
        Number(r.min_stock) || 0,
        String(r.unit || 'pza'),
      ];
      if (existing) { update.run(...params, r.is_active === undefined ? 1 : (r.is_active ? 1 : 0), existing.id); updated++; }
      else { insert.run(barcode, ...params, r.is_active === undefined ? 1 : (r.is_active ? 1 : 0)); inserted++; }
    }
    return { inserted, updated, skipped };
  })(data);

  res.status(201).json({ ok: true, message: `Importados: ${imported.inserted} nuevos, ${imported.updated} actualizados, ${imported.skipped} omitidos.`, ...imported });
});

app.get('/api/products/barcode/:barcode', (req, res) => {
  const p = db.prepare(`${PRODUCT_SELECT} WHERE p.barcode = ?`).get(req.params.barcode);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(p);
});

app.get('/api/products/check-barcode', (req, res) => {
  const code = String(req.query.code || '').trim();
  const excludeId = Number(req.query.excludeId) || 0;
  if (!code) return res.status(400).json({ error: 'Falta el código' });
  const exists = !!db.prepare('SELECT id FROM products WHERE barcode = ? AND id != ?').get(code, excludeId);
  res.json({ code, available: !exists });
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(p);
});

app.post('/api/products', (req, res) => {
  const b = req.body || {};
  if (!String(b.name || '').trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    const info = db.prepare(
      `INSERT INTO products (barcode, name, category_id, cost_price, selling_price, stock, min_stock, unit, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      String(b.barcode || '').trim() || `GEN-${Date.now()}`,
      String(b.name).trim(),
      b.category_id ? Number(b.category_id) : null,
      round2(Number(b.cost_price) || 0),
      round2(Number(b.selling_price) || 0),
      Number(b.stock) || 0,
      Number(b.min_stock) || 0,
      String(b.unit || 'pza'),
      b.is_active === undefined ? 1 : (b.is_active ? 1 : 0)
    );
    res.status(201).json(db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un producto con ese código de barras' });
    throw e;
  }
});

app.put('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  const b = req.body || {};
  try {
    db.prepare(
      `UPDATE products SET barcode = ?, name = ?, category_id = ?, cost_price = ?, selling_price = ?, stock = ?, min_stock = ?, unit = ?, is_active = ?
       WHERE id = ?`
    ).run(
      String(b.barcode ?? p.barcode).trim(),
      String(b.name ?? p.name).trim(),
      b.category_id != null ? Number(b.category_id) : p.category_id,
      round2(Number(b.cost_price ?? p.cost_price)),
      round2(Number(b.selling_price ?? p.selling_price)),
      Number(b.stock ?? p.stock),
      Number(b.min_stock ?? p.min_stock),
      String(b.unit ?? p.unit),
      b.is_active === undefined ? p.is_active : (b.is_active ? 1 : 0),
      p.id
    );
    res.json(db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(p.id));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe un producto con ese código de barras' });
    throw e;
  }
});

app.delete('/api/products/:id', (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ ok: true });
});

app.post('/api/products/delete-all', (req, res) => {
  const deleted = db.prepare('DELETE FROM products').run().changes;
  res.json({ ok: true, deleted });
});

/* ============================ VENTAS ============================ */

app.get('/api/sales', (req, res) => {
  const { date, page = 1, pageSize = 20 } = req.query;
  const where = [];
  const params = [];
  if (date) {
    where.push("date(s.created_at) = ?");
    params.push(String(date).slice(0, 10));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = db.prepare(`SELECT COUNT(*) AS total FROM sales s ${whereSql}`).get(...params).total;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 20));
  const rows = db.prepare(
    `SELECT s.*,
            (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS items_count
     FROM sales s ${whereSql} ORDER BY s.id DESC LIMIT ? OFFSET ?`
  ).all(...params, size, (pageNum - 1) * size);
  res.json({ sales: rows, total: count, page: pageNum, pageSize: size });
});

app.get('/api/sales/:id', (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
  const items = db.prepare(
    `SELECT si.*, p.barcode, p.unit
     FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
     WHERE si.sale_id = ? ORDER BY si.id`
  ).all(sale.id);
  res.json({ ...sale, items });
});

app.post('/api/sales', (req, res) => {
  const { items = [], payment_method = 'efectivo' } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El carrito está vacío' });
  }
  for (const it of items) {
    if (!Number(it.product_id) || !(Number(it.quantity) > 0)) {
      return res.status(400).json({ error: 'Ítems inválidos en la venta' });
    }
  }

  const createSale = db.transaction(() => {
    const getProd = db.prepare('SELECT * FROM products WHERE id = ?');
    const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    const session = db.prepare(`SELECT id FROM cash_sessions WHERE status = 'abierta' ORDER BY id DESC LIMIT 1`).get();
    const saleInfo = db.prepare('INSERT INTO sales (total_amount, payment_method, cash_session_id) VALUES (?, ?, ?)');
    const insItem = db.prepare(
      'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal, product_name) VALUES (?, ?, ?, ?, ?, ?)'
    );

    let total = 0;
    const savedItems = [];
    for (const it of items) {
      const p = getProd.get(it.product_id);
      if (!p) throw new Error(`El producto con id ${it.product_id} ya no existe`);
      const qty = Number(it.quantity);
      if (qty > p.stock) throw new Error(`Stock insuficiente de "${p.name}". Disponible: ${p.stock} ${p.unit}`);
      const subtotal = round2(p.selling_price * qty);
      decStock.run(qty, p.id);
      total += subtotal;
      savedItems.push({ product_id: p.id, quantity: qty, unit_price: p.selling_price, subtotal, product_name: p.name, unit: p.unit, barcode: p.barcode });
    }
    total = round2(total);
    const saleRes = saleInfo.run(total, payment_method, session ? session.id : null);
    const saleId = saleRes.lastInsertRowid;
    for (const it of savedItems) {
      insItem.run(saleId, it.product_id, it.quantity, it.unit_price, it.subtotal, it.product_name);
    }
    return { saleId, total, items: savedItems };
  });

  let result;
  try {
    result = createSale();
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(result.saleId);
  res.status(201).json({ ...sale, items: result.items });
});

/* ============================ REPORTES ============================ */

app.get('/api/reports/today', (req, res) => {
  const start = todayStart();
  const summary = db.prepare(
    `SELECT COUNT(*) AS transactions,
            COALESCE(SUM(total_amount), 0) AS total_sales,
            COALESCE(SUM(cost), 0) AS total_cost,
            COALESCE(SUM(total_amount), 0) - COALESCE(SUM(cost), 0) AS net_profit
     FROM (
       SELECT s.total_amount,
              (SELECT COALESCE(SUM(si.subtotal * (p.cost_price / NULLIF(p.selling_price, 0))), 0)
               FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
               WHERE si.sale_id = s.id AND p.selling_price > 0) AS cost
       FROM sales s
       WHERE s.created_at >= ?
     )`
  ).get(start);

  const top = db.prepare(
    `SELECT si.product_id, MAX(si.product_name) AS name, SUM(si.quantity) AS qty,
            SUM(si.subtotal) AS revenue
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.created_at >= ?
     GROUP BY si.product_id
     ORDER BY qty DESC LIMIT 5`
  ).all(start);

  const byMethod = db.prepare(
    `SELECT payment_method AS method, COUNT(*) AS count, SUM(total_amount) AS total
     FROM sales WHERE created_at >= ? GROUP BY payment_method`
  ).all(start);

  const lowStock = db.prepare(
    `SELECT p.*, c.name AS category_name FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.stock <= p.min_stock ORDER BY (p.stock - p.min_stock) ASC`
  ).all();

  const session = db.prepare(`SELECT * FROM cash_sessions WHERE status = 'abierta' ORDER BY id DESC LIMIT 1`).get();

  res.json({
    date: String(start).slice(0, 10),
    summary: {
      transactions: summary.transactions,
      total_sales: round2(summary.total_sales),
      total_cost: round2(summary.total_cost),
      net_profit: round2(summary.net_profit),
    },
    top_products: top.map((t) => ({ ...t, qty: round2(t.qty) })),
    by_payment_method: byMethod,
    low_stock: lowStock,
    open_session: session,
  });
});

/* ============================ CAJA ============================ */

app.get('/api/cash/status', (req, res) => {
  const session = db.prepare(`SELECT * FROM cash_sessions WHERE status = 'abierta' ORDER BY id DESC LIMIT 1`).get();
  const todaySales = db.prepare('SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE created_at >= ?').get(todayStart()).total;
  res.json({
    open: !!session,
    session: session ? { ...session, today_sales: round2(todaySales), expected: round2((session.opening_amount || 0) + todaySales) } : null,
  });
});

app.post('/api/cash/open', (req, res) => {
  const open = db.prepare(`SELECT id FROM cash_sessions WHERE status = 'abierta' LIMIT 1`).get();
  if (open) return res.status(409).json({ error: 'Ya existe una caja abierta' });
  const { opening_amount = 0, notes = '' } = req.body || {};
  const info = db.prepare('INSERT INTO cash_sessions (opening_amount, notes) VALUES (?, ?)').run(Number(opening_amount) || 0, String(notes));
  res.status(201).json(db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(info.lastInsertRowid));
});

app.post('/api/cash/close', (req, res) => {
  const session = db.prepare(`SELECT * FROM cash_sessions WHERE status = 'abierta' ORDER BY id DESC LIMIT 1`).get();
  if (!session) return res.status(409).json({ error: 'No hay caja abierta' });
  const { closing_amount = 0, notes = '' } = req.body || {};
  const todaySales = db.prepare('SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE created_at >= ?').get(todayStart()).total;
  const expected = round2((session.opening_amount || 0) + todaySales);
  const closing = round2(Number(closing_amount) || 0);
  const difference = round2(closing - expected);
  db.prepare(
    `UPDATE cash_sessions SET closing_date = datetime('now','localtime'), closing_amount = ?, expected_amount = ?, difference = ?, status = 'cerrada', notes = ? WHERE id = ?`
  ).run(closing, expected, difference, notes || session.notes, session.id);
  res.json(db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(session.id));
});

/* ============================ WHATSAPP ============================ */

const WA_PASSWORD = 'gress19505';

app.post('/api/whatsapp/login', (req, res) => {
  const { password } = req.body || {};
  if (String(password) === WA_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: 'Contraseña incorrecta' });
});

app.get('/api/whatsapp/status', (req, res) => {
  const s = wa.getSettings();
  res.json({ ...wa.getStatus(), ...s });
});

app.put('/api/whatsapp/config', (req, res) => {
  const b = req.body || {};
  if (b.number !== undefined) wa.setNumber(b.number);
  if (b.enabled !== undefined) wa.setEnabled(!!b.enabled);
  res.json(wa.getSettings());
});

app.post('/api/whatsapp/test', async (req, res) => {
  try {
    const r = await wa.sendTestNow();
    res.json({ ok: true, message: r.message });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/whatsapp/lowstock', async (req, res) => {
  try {
    const r = await wa.sendLowStockNow();
    res.json({ ok: true, message: r.message });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/whatsapp/reset-session', async (req, res) => {
  try {
    const s = await wa.resetSession();
    res.json({ ok: true, status: s.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ============================ ERRORES ============================ */

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

app.listen(PORT, HOST, () => {
  const urls = [`http://localhost:${PORT}`];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) urls.push(`http://${net.address}:${PORT}`);
    }
  }
  console.log('POS Dulcería corriendo en:');
  urls.forEach((u) => console.log(`  ${u}`));
  wa.init().then(() => {
    wa.startLowStockScheduler();
    console.log('[WhatsApp] Alertas de stock bajo activadas (cada 12 horas).');
  });
});
