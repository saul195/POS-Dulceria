const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');
const compression = require('compression');
const db = require('./db');
const wa = require('./whatsapp');

const IS_WINDOWS = process.platform === 'win32';

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.json({ limit: '10mb' }));

const staticOpts = {
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}vendor${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
};
app.use(express.static(path.join(__dirname, 'public'), staticOpts));

app.get('/logo.svg', (req, res) => {
  res.sendFile(path.join(__dirname, 'scripts', 'icono-villa-alegre.svg'));
});

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

const todayStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 00:00:00`;
};
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    where.push('p.stock <= p.min_stock AND p.is_active = 1');
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
  const body = req.body;
  const rows = Array.isArray(body) ? body : body?.products;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'El cuerpo debe ser un array de productos' });

  const getCat = db.prepare('SELECT id FROM categories WHERE name = ?');
  const insCat = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)');
  const getProd = db.prepare('SELECT id FROM products WHERE barcode = ?');
  const insert = db.prepare(
    `INSERT INTO products (barcode, name, category_id, selling_price, stock, min_stock, unit, price_per_100g, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const update = db.prepare(
    `UPDATE products SET name = ?, category_id = ?, selling_price = ?, stock = ?, min_stock = ?, unit = ?, price_per_100g = ?, is_active = ?
     WHERE id = ?`
  );

  const imported = db.transaction((data) => {
    const catIdMap = new Map();
    for (const c of data.categories || []) {
      if (!String(c.name || '').trim()) continue;
      let cat = getCat.get(String(c.name).trim());
      if (!cat) {
        const info = insCat.run(String(c.name).trim(), String(c.description || '').trim());
        cat = { id: info.lastInsertRowid };
      }
      if (c.id != null) catIdMap.set(Number(c.id), cat.id);
    }

    let inserted = 0, updated = 0, skipped = 0;
    for (const r of data.products || data) {
      const barcode = String(r.barcode ?? '').trim();
      if (!barcode || !String(r.name ?? '').trim()) { skipped++; continue; }
      let catId = null;
      if (r.category_id != null) {
        const oldId = Number(r.category_id);
        catId = catIdMap.has(oldId) ? catIdMap.get(oldId) : (oldId || null);
      }
      if (catId == null && r.category) { const c = getCat.get(String(r.category).trim()); catId = c ? c.id : null; }
      const existing = getProd.get(barcode);
      const params = [
        String(r.name).trim(),
        catId,
        round2(Number(r.selling_price) || 0),
        round3(Number(r.stock) || 0),
        round3(Number(r.min_stock) || 0),
        String(r.unit || 'pza'),
        r.price_per_100g != null && r.price_per_100g !== '' ? round2(Number(r.price_per_100g)) : null,
      ];
      if (existing) { update.run(...params, r.is_active === undefined ? 1 : (r.is_active ? 1 : 0), existing.id); updated++; }
      else { insert.run(barcode, ...params, r.is_active === undefined ? 1 : (r.is_active ? 1 : 0)); inserted++; }
    }
    return { inserted, updated, skipped, categories: (data.categories || []).length };
  })({ products: rows, categories: body?.categories || [] });

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
      `INSERT INTO products (barcode, name, category_id, selling_price, stock, min_stock, unit, price_per_100g, is_active, is_bote, recipe_grams, recipe_bote_id, recipe_grams2, recipe_bote_id2)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      String(b.barcode || '').trim() || `GEN-${Date.now()}`,
      String(b.name).trim(),
      b.category_id ? Number(b.category_id) : null,
      round2(Number(b.selling_price) || 0),
      round3(Number(b.stock) || 0),
      round3(Number(b.min_stock) || 0),
      String(b.unit || 'pza'),
      b.price_per_100g != null && b.price_per_100g !== '' ? round2(Number(b.price_per_100g)) : null,
      b.is_active === undefined ? 1 : (b.is_active ? 1 : 0),
      b.is_bote ? 1 : 0,
      Number(b.recipe_grams) || 0,
      b.recipe_bote_id ? Number(b.recipe_bote_id) : null,
      Number(b.recipe_grams2) || 0,
      b.recipe_bote_id2 ? Number(b.recipe_bote_id2) : null
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
      `UPDATE products SET barcode = ?, name = ?, category_id = ?, selling_price = ?, stock = ?, min_stock = ?, unit = ?, price_per_100g = ?, is_active = ?, is_bote = ?, recipe_grams = ?, recipe_bote_id = ?, recipe_grams2 = ?, recipe_bote_id2 = ?
       WHERE id = ?`
    ).run(
      String(b.barcode ?? p.barcode).trim(),
      String(b.name ?? p.name).trim(),
      b.category_id != null ? Number(b.category_id) : p.category_id,
      round2(Number(b.selling_price ?? p.selling_price)),
      round3(Number(b.stock ?? p.stock)),
      round3(Number(b.min_stock ?? p.min_stock)),
      String(b.unit ?? p.unit),
      b.price_per_100g != null && b.price_per_100g !== '' ? round2(Number(b.price_per_100g)) : null,
      b.is_active === undefined ? p.is_active : (b.is_active ? 1 : 0),
      b.is_bote === undefined ? p.is_bote : (b.is_bote ? 1 : 0),
      b.recipe_grams !== undefined ? (Number(b.recipe_grams) || 0) : (p.recipe_grams || 0),
      b.recipe_bote_id !== undefined ? (b.recipe_bote_id ? Number(b.recipe_bote_id) : null) : (p.recipe_bote_id || null),
      b.recipe_grams2 !== undefined ? (Number(b.recipe_grams2) || 0) : (p.recipe_grams2 || 0),
      b.recipe_bote_id2 !== undefined ? (b.recipe_bote_id2 ? Number(b.recipe_bote_id2) : null) : (p.recipe_bote_id2 || null),
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

/* ============================ MOVIMIENTOS DE STOCK ============================ */

app.post('/api/stock/entry', (req, res) => {
  const { product_id, quantity, reason = '' } = req.body || {};
  const qty = round3(Number(quantity));
  if (!Number(product_id)) return res.status(400).json({ error: 'Falta el producto' });
  if (!(qty > 0)) return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(product_id));
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  const addStock = db.transaction(() => {
    db.prepare('UPDATE products SET stock = round(stock + ?, 3) WHERE id = ?').run(qty, p.id);
    const info = db.prepare('INSERT INTO stock_movements (product_id, type, quantity, reason) VALUES (?, ?, ?, ?)')
      .run(p.id, 'entrada', qty, String(reason || 'Entrada de mercancía'));
    return info.lastInsertRowid;
  })();
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(p.id);
  res.status(201).json({ ok: true, stock: updated.stock, movement_id: addStock });
});

app.get('/api/stock/movements', (req, res) => {
  const { date, product_id, category_id, search = '', page = 1, pageSize = 50 } = req.query;
  const where = [];
  const params = [];
  if (date) {
    where.push('date(m.created_at) = ?');
    params.push(String(date).slice(0, 10));
  }
  if (product_id) {
    where.push('m.product_id = ?');
    params.push(Number(product_id));
  }
  if (category_id) {
    where.push('p.category_id = ?');
    params.push(Number(category_id));
  }
  if (search) {
    where.push('(p.name LIKE ? OR p.barcode LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM stock_movements m JOIN products p ON p.id = m.product_id ${whereSql}`).get(...params).c;
  const pageNum = Math.max(1, Number(page) || 1);
  const size = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const rows = db.prepare(
    `SELECT m.*, p.name AS product_name, p.barcode, p.unit
     FROM stock_movements m JOIN products p ON p.id = m.product_id
     ${whereSql} ORDER BY m.id DESC LIMIT ? OFFSET ?`
  ).all(...params, size, (pageNum - 1) * size);
  const summary = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN type = 'entrada' THEN quantity ELSE 0 END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN type = 'salida' THEN quantity ELSE 0 END), 0) AS salidas
     FROM stock_movements m JOIN products p ON p.id = m.product_id ${whereSql}`
  ).get(...params);
  res.json({ movements: rows, total, page: pageNum, pageSize: size, summary });
});

app.get('/api/reports/product-sales', (req, res) => {
  const { product_id, start_date, end_date, all } = req.query;
  const pid = product_id ? Number(product_id) : null;
  const p = pid ? db.prepare('SELECT * FROM products WHERE id = ?').get(pid) : null;
  if (pid && !p) return res.status(404).json({ error: 'Producto no encontrado' });
  const isAll = all === '1' || all === 'true';
  const sd = !isAll ? (start_date ? String(start_date).slice(0, 10) : todayStr()) : null;
  const ed = !isAll ? (end_date ? String(end_date).slice(0, 10) : todayStr()) : null;
  const prodCond = pid ? ' AND si.product_id = ? ' : '';
  const dateCond = isAll ? '' : ' AND date(s.created_at) BETWEEN ? AND ? ';
  const args = [];
  if (pid) args.push(pid);
  if (!isAll) args.push(sd, ed);
  const rows = db.prepare(
    `SELECT date(s.created_at) AS day, SUM(si.quantity) AS qty, SUM(si.subtotal) AS total, COUNT(DISTINCT s.id) AS tickets
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE 1 = 1 ${prodCond}${dateCond}
     GROUP BY date(s.created_at) ORDER BY day`
  ).all(...args);
  const summary = db.prepare(
    `SELECT COALESCE(SUM(si.quantity), 0) AS total_qty, COALESCE(SUM(si.subtotal), 0) AS total_revenue, COUNT(DISTINCT s.id) AS total_tickets
     FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE 1 = 1 ${prodCond}${dateCond}`
  ).get(...args);
  res.json({
    product: p ? { id: p.id, name: p.name, barcode: p.barcode, unit: p.unit, selling_price: p.selling_price, stock: p.stock } : null,
    start_date: sd, end_date: ed, all: !!isAll,
    days: rows,
    summary: { qty: round3(summary.total_qty), revenue: round2(summary.total_revenue), tickets: summary.total_tickets },
  });
});

app.get('/api/reports/product/:id', (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  const { date, start_date, end_date } = req.query;
  const conds = [];
  const params = [];
  if (date) {
    conds.push('date(m.created_at) = ?');
    params.push(String(date).slice(0, 10));
  } else if (start_date && end_date) {
    conds.push('date(m.created_at) BETWEEN ? AND ?');
    params.push(String(start_date).slice(0, 10), String(end_date).slice(0, 10));
  }
  const where = conds.length ? `AND ${conds.join(' AND ')}` : '';
  const rows = db.prepare(
    `SELECT m.* FROM stock_movements m
     WHERE m.product_id = ? ${where} ORDER BY m.id DESC LIMIT 500`
  ).all(id, ...params);
  const summary = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN type = 'entrada' THEN quantity ELSE 0 END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN type = 'salida' THEN quantity ELSE 0 END), 0) AS salidas
     FROM stock_movements m WHERE m.product_id = ? ${where}`
  ).get(id, ...params);
  res.json({
    product: { id: p.id, name: p.name, barcode: p.barcode, unit: p.unit, stock: p.stock },
    date: date ? String(date).slice(0, 10) : null,
    movements: rows,
    entradas: round3(summary.entradas),
    salidas: round3(summary.salidas),
  });
});

app.post('/api/sales', (req, res) => {
  const { items = [], payment_method = 'efectivo', cash_received = 0, change = 0 } = req.body || {};
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
      const decStock = db.prepare('UPDATE products SET stock = round(stock - ?, 3) WHERE id = ?');
      const session = db.prepare(`SELECT id FROM cash_sessions WHERE status = 'abierta' ORDER BY id DESC LIMIT 1`).get();
      const nextTicket = db.prepare(
        `SELECT COALESCE(MAX(ticket_no), 0) + 1 AS n FROM sales WHERE date(created_at) = date('now', 'localtime')`
      ).get().n;
      const saleInfo = db.prepare('INSERT INTO sales (total_amount, payment_method, cash_session_id, ticket_no, cash_received, change) VALUES (?, ?, ?, ?, ?, ?)');
      const insItem = db.prepare(
        'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal, product_name, sale_mode, sale_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      const insMove = db.prepare('INSERT INTO stock_movements (product_id, type, quantity, reason) VALUES (?, ?, ?, ?)');

      let total = 0;
      const savedItems = [];
      for (const it of items) {
        const p = getProd.get(it.product_id);
        if (!p) throw new Error(`El producto con id ${it.product_id} ya no existe`);
        const qty = round3(Number(it.quantity));
        if (!(qty > 0)) throw new Error(`Cantidad inválida para "${p.name}"`);

        if (p.is_bote) {
          throw new Error(`El bote de helado "${p.name}" no se vende directamente`);
        }

        const ingredients = [];
        if (p.recipe_bote_id && p.recipe_grams > 0) {
          ingredients.push({ boteId: p.recipe_bote_id, grams: p.recipe_grams });
        }
        if (p.recipe_bote_id2 && p.recipe_grams2 > 0) {
          ingredients.push({ boteId: p.recipe_bote_id2, grams: p.recipe_grams2 });
        }

        if (ingredients.length > 0) {
          for (const ing of ingredients) {
            const bote = getProd.get(ing.boteId);
            if (!bote) throw new Error(`El bote de helado de "${p.name}" ya no existe`);
            const neededKg = round3((qty * ing.grams) / 1000);
            if (neededKg > bote.stock) {
              throw new Error(`El bote de "${bote.name}" no alcanza: necesita ${neededKg} kg y solo hay ${bote.stock} kg`);
            }
          }
        } else if (qty > p.stock) {
          throw new Error(`Stock insuficiente de "${p.name}". Disponible: ${p.stock} ${p.unit}`);
        }

        const unitPrice = round2(Number(it.unit_price) || p.selling_price);
        const saleMode = it.sale_mode === '100g' ? '100g' : 'kg';
        const salePrice = saleMode === '100g' ? round2(Number(it.sale_price) || p.selling_price) : unitPrice;
        const linePrice = it.line_price != null && Number(it.line_price) > 0 ? round2(Number(it.line_price)) : null;
        const subtotal = linePrice != null ? linePrice : round2(unitPrice * qty);

        if (ingredients.length > 0) {
          for (const ing of ingredients) {
            const neededKg = round3((qty * ing.grams) / 1000);
            decStock.run(neededKg, ing.boteId);
            insMove.run(ing.boteId, 'salida', neededKg, `Venta de "${p.name}" (ticket #${nextTicket})`);
          }
        } else {
          decStock.run(qty, p.id);
          insMove.run(p.id, 'salida', qty, `Venta (ticket #${nextTicket})`);
        }

        total += subtotal;
        savedItems.push({ product_id: p.id, quantity: qty, unit_price: unitPrice, subtotal, product_name: p.name, unit: p.unit, barcode: p.barcode, sale_mode: saleMode, sale_price: salePrice });
      }
      total = round2(total);
      const saleRes = saleInfo.run(total, payment_method, session ? session.id : null, nextTicket, round2(Number(cash_received) || 0), round2(Number(change) || 0));
      const saleId = saleRes.lastInsertRowid;
      for (const it of savedItems) {
        insItem.run(saleId, it.product_id, it.quantity, it.unit_price, it.subtotal, it.product_name, it.sale_mode, it.sale_price);
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

const salesByDay = (since) => db.prepare(
  `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
   FROM sales WHERE created_at >= ? GROUP BY day ORDER BY day`
).all(since);

const salesByDayRange = (since, until) => db.prepare(
  `SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
   FROM sales WHERE created_at >= ? AND created_at <= ? GROUP BY day ORDER BY day`
).all(since, until);

const salesByMonth = (since) => db.prepare(
  `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
   FROM sales WHERE created_at >= ? GROUP BY month ORDER BY month`
).all(since);

const salesByMonthRange = (since, until) => db.prepare(
  `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
   FROM sales WHERE created_at >= ? AND created_at <= ? GROUP BY month ORDER BY month`
).all(since, until);

app.get('/api/reports/range', (req, res) => {
  const mode = String(req.query.mode || 'week');
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || (now.getMonth() + 1);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = fmt(now);

  let data = [];
  let title = '';

  if (mode === 'month') {
    const first = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const since = `${fmt(first)} 00:00:00`;
    const until = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')} 23:59:59`;
    data = salesByDayRange(since, until);
    const buckets = {};
    for (let d = 1; d <= daysInMonth; d++) {
      buckets[`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`] = { day: String(d), count: 0, total: 0 };
    }
    for (const r of data) {
      if (buckets[r.day]) {
        buckets[r.day].count = r.count;
        buckets[r.day].total = Math.round(r.total * 100) / 100;
      }
    }
    data = Object.values(buckets).map((b) => ({ ...b, total: Math.round(b.total * 100) / 100 }));
    const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    title = `Mes ${MONTHS_ES[month - 1]} ${year}`;
  } else if (mode === 'year') {
    const since = `${year}-01-01 00:00:00`;
    const until = `${year}-12-31 23:59:59`;
    data = salesByMonthRange(since, until);
    const buckets = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      buckets[key] = { month: m, count: 0, total: 0 };
    }
    for (const r of data) {
      if (buckets[r.month]) {
        buckets[r.month].count = r.count;
        buckets[r.month].total = Math.round(r.total * 100) / 100;
      }
    }
    data = Object.values(buckets).map((b) => ({ ...b, total: Math.round(b.total * 100) / 100 }));
    title = `Año ${year}`;
  } else {
    const dow = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow - 1));
    const since = `${fmt(monday)} 00:00:00`;
    data = salesByDay(since);
    const buckets = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      buckets[fmt(d)] = { day: fmt(d), weekday: d.toLocaleDateString('es-MX', { weekday: 'short' }), count: 0, total: 0 };
    }
    for (const r of data) {
      if (buckets[r.day]) {
        buckets[r.day].count = r.count;
        buckets[r.day].total = Math.round(r.total * 100) / 100;
      }
    }
    data = Object.values(buckets);
    title = `Semana del ${fmt(monday)}`;
  }

  const totals = data.reduce((acc, b) => ({ count: acc.count + b.count, total: acc.total + b.total }), { count: 0, total: 0 });
  res.json({ mode, title, today, data, totals: { count: totals.count, total: round2(totals.total) } });
});

app.get('/api/reports/today', (req, res) => {
  const start = todayStart();
  const summary = db.prepare(
    `SELECT COUNT(*) AS transactions,
            COALESCE(SUM(total_amount), 0) AS total_sales
     FROM sales
     WHERE created_at >= ?`
  ).get(start);

  const top = db.prepare(
    `SELECT si.product_id, MAX(si.product_name) AS name, MAX(p.unit) AS unit, SUM(si.quantity) AS qty,
            SUM(si.subtotal) AS revenue
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
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
     WHERE p.stock <= p.min_stock AND p.is_active = 1 ORDER BY (p.stock - p.min_stock) ASC`
  ).all();

  const session = db.prepare(`SELECT * FROM cash_sessions WHERE status = 'abierta' ORDER BY id DESC LIMIT 1`).get();
  const openSession = session
    ? { ...session, today_sales: round2(summary.total_sales), expected: round2((session.opening_amount || 0) + round2(summary.total_sales)) }
    : null;

  res.json({
    date: String(start).slice(0, 10),
    summary: {
      transactions: summary.transactions,
      total_sales: round2(summary.total_sales),
    },
    top_products: top.map((t) => ({ ...t, qty: round3(t.qty) })),
    by_payment_method: byMethod,
    low_stock: lowStock,
    open_session: openSession,
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

app.get('/api/whatsapp/status', async (req, res) => {
  if (wa.getSettings().enabled) {
    try { await wa.init(); } catch (e) { /* se reporta en el estado */ }
  }
  res.json({ ...wa.getStatus(), ...wa.getSettings() });
});

app.put('/api/whatsapp/config', async (req, res) => {
  const b = req.body || {};
  if (b.number !== undefined) wa.setNumber(b.number);
  if (b.enabled !== undefined) wa.setEnabled(!!b.enabled);
  if (wa.getSettings().enabled) {
    wa.init()
      .then(() => wa.startLowStockScheduler())
      .catch((e) => console.error('[WhatsApp] Error al iniciar:', e.message));
  }
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

/* ============================ IMPRESORA ============================ */

const { execFile } = require('child_process');

function settingsGet(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function settingsSet(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

app.get('/api/printer/config', (req, res) => {
  res.json({
    printer_name: settingsGet('printer_name'),
    width_mm: Number(settingsGet('printer_width_mm', '80')) || 80,
  });
});

app.post('/api/printer/config', (req, res) => {
  const { printer_name = '', width_mm = 80 } = req.body || {};
  if (!String(printer_name).trim()) return res.status(400).json({ error: 'Escribe el nombre de la impresora' });
  const name = String(printer_name).trim();
  const mm = Number(width_mm) || 80;
  settingsSet('printer_name', name);
  settingsSet('printer_width_mm', mm);
  res.json({ printer_name: name, width_mm: mm });
});

app.get('/api/printer/list', (req, res) => {
  if (IS_WINDOWS) {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
      { timeout: 15000 },
      (err, stdout) => {
        if (err) return res.json({ printers: [] });
        const printers = String(stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        res.json({ printers });
      }
    );
  } else {
    execFile('lpstat', ['-p'], { timeout: 15000 }, (err, stdout) => {
      if (err) return res.json({ printers: [] });
      const printers = String(stdout).split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith('printer '))
        .map((l) => l.replace(/^printer\s+/, '').split(/\s/)[0])
        .filter(Boolean);
      res.json({ printers });
    });
  }
});

function printRaw(printerName, base64, cb) {
  if (IS_WINDOWS) {
    const ps = path.join(__dirname, 'scripts', 'print-raw.ps1');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps, '-Printer', printerName, '-B64', base64],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = String(stderr || stdout || err.message).trim();
          return cb(new Error(msg || 'No se pudo imprimir'));
        }
        cb(null, stdout);
      }
    );
    return;
  }

  const tmp = path.join(os.tmpdir(), `pos-ticket-${Date.now()}.bin`);
  fs.writeFile(tmp, Buffer.from(base64, 'base64'), (werr) => {
    if (werr) return cb(new Error('No se pudo crear el archivo temporal del ticket'));
    execFile(
      'lp',
      ['-d', printerName, '-o', 'raw', tmp],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        fs.unlink(tmp, () => {});
        if (err) {
          const msg = String(stderr || stdout || err.message).trim();
          return cb(new Error(msg || 'No se pudo imprimir'));
        }
        cb(null, stdout);
      }
    );
  });
}

app.post('/api/printer/print', (req, res) => {
  const b = req.body || {};
  const printerName = String(b.printer_name || settingsGet('printer_name') || '').trim();
  const base64 = String(b.bytes || '');
  if (!printerName) return res.status(400).json({ error: 'No hay impresora configurada' });
  if (!base64) return res.status(400).json({ error: 'Faltan los datos del ticket' });
  printRaw(printerName, base64, (err) => {
    if (err) return res.status(502).json({ error: err.message });
    res.json({ ok: true });
  });
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
  console.log('Villa Alegre — POS corriendo en:');
  urls.forEach((u) => console.log(`  ${u}`));
  if (wa.getSettings().enabled) {
    wa.init().then(() => {
      wa.startLowStockScheduler();
      console.log('[WhatsApp] Alertas de stock bajo activadas (cada 12 horas).');
    });
  } else {
    console.log('[WhatsApp] Deshabilitado (actívalo en la sección WhatsApp).');
  }
});
