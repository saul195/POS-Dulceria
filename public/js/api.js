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
    create: (b) => api.post('/api/products', b),
    update: (id, b) => api.put(`/api/products/${id}`, b),
    remove: (id) => api.del(`/api/products/${id}`),
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
  },
  cash: {
    status: () => api.get('/api/cash/status'),
    open: (b) => api.post('/api/cash/open', b),
    close: (b) => api.post('/api/cash/close', b),
  },
};

const money = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
};
const num = (n, d = 2) => Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

const fmtDate = (s) => {
  const d = new Date(String(s).replace(' ', 'T'));
  return d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

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

async function loadCategories() {
  try { return await api.categories.list(); }
  catch (e) { toast(e.message, 'error'); return []; }
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
