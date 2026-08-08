const db = require('./db');

const CATEGORIES = [
  { name: 'Chocolates', description: 'Barras, bombones y dulces de chocolate' },
  { name: 'Gomitas', description: 'Gomitas de frutas y acido' },
  { name: 'Paletas', description: 'Paletas de caramelo, heladas y chicloso' },
  { name: 'Dulces Enchilados', description: 'Dulces con chile y tamarindo' },
  { name: 'Galletas', description: 'Galletas y panaderia' },
  { name: 'A Granel', description: 'Dulces vendidos por kilo o gramo' },
];

const PRODUCTS = [
  // Chocolates
  { barcode: '7501001222215', name: 'Chocolate Carlos V', category: 'Chocolates', price: 22.0, stock: 48, min: 10 },
  { barcode: '7501000143555', name: 'Chocolate Snickers 60g', category: 'Chocolates', price: 17.0, stock: 32, min: 8 },
  { barcode: '7501000171060', name: 'Chocolate M&M cacahuate 45g', category: 'Chocolates', price: 19.0, stock: 6, min: 8, unit: 'pza' },
  { barcode: '7501064081234', name: 'Bombon Ferrero Rocher 3 pz', category: 'Chocolates', price: 42.0, stock: 15, min: 5 },
  // Gomitas
  { barcode: '7501054448901', name: 'Gomitas Trululu sandia', category: 'Gomitas', price: 15.0, stock: 60, min: 15 },
  { barcode: '7501054448208', name: 'Gomitas Oso Negro', category: 'Gomitas', price: 16.0, stock: 4, min: 12 },
  { barcode: '7501054590075', name: 'Gomitas Trolli lombriz', category: 'Gomitas', price: 20.0, stock: 40, min: 10 },
  // Paletas
  { barcode: '7501032700134', name: 'Paleta De La Rosa 77g', category: 'Paletas', price: 22.0, stock: 25, min: 6 },
  { barcode: '7501018329032', name: 'Paleta Chupa Chups fresa', category: 'Paletas', price: 8.0, stock: 100, min: 20 },
  { barcode: '7501032700198', name: 'Paleta Vero mango', category: 'Paletas', price: 12.0, stock: 55, min: 15 },
  // Enchilados
  { barcode: '7501020422169', name: 'Pulparindo tamarindo', category: 'Dulces Enchilados', price: 10.0, stock: 80, min: 20 },
  { barcode: '7501020550035', name: 'Rellerindos chamoy', category: 'Dulces Enchilados', price: 16.0, stock: 35, min: 10 },
  { barcode: '7501020765012', name: 'Skwinkles chamoy', category: 'Dulces Enchilados', price: 21.0, stock: 28, min: 8 },
  // Galletas
  { barcode: '7501011102395', name: 'Galletas Emperador vainilla', category: 'Galletas', price: 20.0, stock: 40, min: 10 },
  { barcode: '7501011102266', name: 'Galletas Chokis', category: 'Galletas', price: 18.0, stock: 3, min: 10 },
  { barcode: '7501011102226', name: 'Galletas Marias Gamesa', category: 'Galletas', price: 22.0, stock: 20, min: 6 },
  // A granel (por kg)
  { barcode: 'GOM01', name: 'Gomita arcoiris por kg', category: 'A Granel', price: 120.0, stock: 8.5, min: 2, unit: 'kg' },
  { barcode: 'PEL01', name: 'Pelon Pelo Rico mini por kg', category: 'A Granel', price: 140.0, stock: 5.25, min: 1.5, unit: 'kg' },
  { barcode: 'BOM01', name: 'Bombon chicle frutas por kg', category: 'A Granel', price: 99.0, stock: 12.0, min: 3, unit: 'kg' },
  { barcode: 'BOL01', name: 'Bolita chile y limon por kg', category: 'A Granel', price: 110.0, stock: 0.8, min: 2, unit: 'kg' },
];

const reset = process.argv.includes('--reset');

db.transaction(() => {
  if (reset) {
    db.exec('DELETE FROM sale_items; DELETE FROM sales; DELETE FROM products; DELETE FROM categories; DELETE FROM cash_sessions;');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('products','categories','sales','sale_items','cash_sessions');");
    console.log('Base de datos reiniciada.');
  }

  const count = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (count > 0) {
    console.log(`Ya hay ${count} categorías. Usa "npm run seed -- --reset" para vaciar la base primero.`);
    return;
  }

  const insCat = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)');
  const insProd = db.prepare(
    `INSERT INTO products (barcode, name, category_id, selling_price, stock, min_stock, unit)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const getCat = db.prepare('SELECT id FROM categories WHERE name = ?');

  for (const c of CATEGORIES) insCat.run(c.name, c.description);
  for (const p of PRODUCTS) {
    insProd.run(p.barcode, p.name, getCat.get(p.category).id, p.price, p.stock, p.min, p.unit || 'pza');
  }
  console.log(`Sembrados ${CATEGORIES.length} categorías y ${PRODUCTS.length} productos.`);
})();
