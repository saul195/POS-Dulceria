const api = {
  async request(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* respuesta vacía */ }
    if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
    return data;
  },
  get: (url) => api.request('GET', url),
  post: (url, body) => api.request('POST', url, body),
  put: (url, body) => api.request('PUT', url, body),
  del: (url) => api.request('DELETE', url),

  categories: {
    list: () => api.get('/api/categories'),
    create: (b) => api.post('/api/categories', b),
    update: (id, b) => api.put(`/api/categories/${id}`, b),
    remove: (id) => api.del(`/api/categories/${id}`),
  },
  products: {
    list: (params) => {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => { if (v !== '' && v != null) qs.set(k, v); });
      return api.get(`/api/products?${qs}`);
    },
    get: (id) => api.get(`/api/products/${id}`),
    byBarcode: (code) => api.get(`/api/products/barcode/${encodeURIComponent(code)}`),
    checkBarcode: (code, excludeId) => api.get(`/api/products/check-barcode?${new URLSearchParams({ code, excludeId: excludeId || '' })}`),
    create: (b) => api.post('/api/products', b),
    update: (id, b) => api.put(`/api/products/${id}`, b),
    remove: (id) => api.del(`/api/products/${id}`),
    deleteAll: () => api.post('/api/products/delete-all'),
    import: (products) => api.post('/api/products/import', { products }),
    exportAll: () => api.get('/api/products/export'),
  },
  sales: {
    create: (b) => api.post('/api/sales', b),
    list: (params) => {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => { if (v !== '' && v != null) qs.set(k, v); });
      return api.get(`/api/sales?${qs}`);
    },
    get: (id) => api.get(`/api/sales/${id}`),
  },
  reports: {
    today: () => api.get('/api/reports/today'),
    range: (mode, opts = {}) => {
      const qs = new URLSearchParams({ mode });
      if (opts.year) qs.set('year', opts.year);
      if (opts.month) qs.set('month', opts.month);
      return api.get(`/api/reports/range?${qs}`);
    },
    product: (id, opts = {}) => {
      const qs = new URLSearchParams();
      if (opts.date) qs.set('date', opts.date);
      if (opts.start_date) qs.set('start_date', opts.start_date);
      if (opts.end_date) qs.set('end_date', opts.end_date);
      return api.get(`/api/reports/product/${id}${qs.toString() ? `?${qs}` : ''}`);
    },
  },
  stock: {
    entry: (b) => api.post('/api/stock/entry', b),
    movements: (params) => {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => { if (v !== '' && v != null) qs.set(k, v); });
      return api.get(`/api/stock/movements?${qs}`);
    },
  },
  cash: {
    status: () => api.get('/api/cash/status'),
    open: (b) => api.post('/api/cash/open', b),
    close: (b) => api.post('/api/cash/close', b),
  },
  whatsapp: {
    login: (password) => api.post('/api/whatsapp/login', { password }),
    status: () => api.get('/api/whatsapp/status'),
    config: (b) => api.put('/api/whatsapp/config', b),
    test: () => api.post('/api/whatsapp/test'),
    lowstock: () => api.post('/api/whatsapp/lowstock'),
    resetSession: () => api.post('/api/whatsapp/reset-session'),
  },
};

const money = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
};
const moneyMX = (n) => `${money(n)} MXN`;
const num = (n, d = 2) => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

function toast(message, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2800);
}

function fillSelect(select, cats, emptyOption = true) {
  select.innerHTML = '';
  if (emptyOption) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = '— Sin categoría —';
    select.appendChild(o);
  }
  for (const c of cats) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.name;
    select.appendChild(o);
  }
}
