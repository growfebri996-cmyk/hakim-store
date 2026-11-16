
require("dotenv").config();

const express = require("express");
const Database = require("better-sqlite3");
const midtransClient = require("midtrans-client");
const crypto = require("crypto");
const path = require("path");

const app = express();
const db = new Database("hakim-store.db");

app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY;
const ENC_KEY = process.env.ACCOUNT_ENCRYPTION_KEY;

if (!SERVER_KEY || !CLIENT_KEY || !ENC_KEY ||
    !/^[0-9a-fA-F]{64}$/.test(ENC_KEY)) {
  throw new Error("Periksa konfigurasi MIDTRANS dan kunci enkripsi di .env");
}

const encryptionKey = Buffer.from(ENC_KEY, "hex");

const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: SERVER_KEY,
  clientKey: CLIENT_KEY
});

const products = {
  safeban: { name: "Akun SAFEBAN", price: 30000 },
  starter: { name: "Paket 1 - Starter", price: 70000 },
  pro: { name: "Paket 2 - Pro", price: 150000 },
  elite: { name: "Paket 3 - Elite", price: 300000 }
};

// Database
db.exec(`
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  email TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  order_id TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  buyer TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  streamer_code TEXT,
  status TEXT NOT NULL,
  inventory_id INTEGER,
  access_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final()
  ]);

  return {
    encrypted_password: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    auth_tag: cipher.getAuthTag().toString("hex")
  };
}

function decryptPassword(row) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(row.iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(row.auth_tag, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_password, "hex")),
    decipher.final()
  ]).toString("utf8");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Melihat katalog dari server
app.get("/api/products", (req, res) => {
  res.json(products);
});

// Admin memasukkan stok.
// Lindungi endpoint ini sebelum digunakan di internet!
app.post("/api/admin/stock", (req, res) => {
  const { product_id, email, password } = req.body;

  if (!products[product_id] || !email || !password) {
    return res.status(400).json({ error: "Data stok tidak lengkap." });
  }

  const encrypted = encryptPassword(password);

  const result = db.prepare(`
    INSERT INTO inventory
    (product_id, email, encrypted_password, iv, auth_tag)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    product_id,
    email,
    encrypted.encrypted_password,
    encrypted.iv,
    encrypted.auth_tag
  );

  res.json({
    success: true,
    inventory_id: result.lastInsertRowid
  });
});

// Membuat pesanan dan mengunci stok
app.post("/api/orders", async (req, res) => {
  const { product_id, buyer, whatsapp, streamer_code } = req.body;
  const product = products[product_id];

  if (!product || !buyer || !whatsapp) {
    return res.status(400).json({
      error: "Produk, nama, atau WhatsApp tidak valid."
    });
  }

  const orderId = "HKM-" + Date.now() + "-" +
    crypto.randomBytes(3).toString("hex").toUpperCase();

  const accessToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(accessToken);

  // Transaksi SQLite mencegah stok yang sama dipesan dua kali.
  const reserveStock = db.transaction(() => {
    const stock = db.prepare(`
      SELECT * FROM inventory
      WHERE product_id = ? AND status = 'available'
      LIMIT 1
    `).get(product_id);

    if (!stock) return null;

    db.prepare(`
      UPDATE inventory SET status = 'reserved', order_id = ?
      WHERE id = ? AND status = 'available'
    `).run(orderId, stock.id);

    db.prepare(`
      INSERT INTO orders
      (id, product_id, product_name, amount, buyer, whatsapp,
       streamer_code, status, inventory_id, access_token_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      orderId, product_id, product.name, product.price,
      buyer, whatsapp, streamer_code || null,
      stock.id, tokenHash
    );

    return stock.id;
  });

  const inventoryId = reserveStock();

  if (!inventoryId) {
    return res.status(409).json({
      error: "Stok paket sedang habis."
    });
  }

  try {
    const transaction = await snap.createTransaction({
      transaction_details: {
        order_id: orderId,
        gross_amount: product.price
      },
      customer_details: {
        first_name: buyer,
        phone: whatsapp
      },
      item_details: [{
        id: product_id,
        price: product.price,
        quantity: 1,
        name: product.name
      }]
    });

    res.json({
      success: true,
      order_id: orderId,
      payment_url: transaction.redirect_url,
      access_token: accessToken
    });
  } catch (error) {
    db.prepare(`
      UPDATE inventory SET status = 'available', order_id = NULL
      WHERE id = ? AND status = 'reserved' AND order_id = ?
    `).run(inventoryId, orderId);

    db.prepare(`
      UPDATE orders SET status = 'payment_error' WHERE id = ?
    `).run(orderId);

    console.error("Midtrans error:", error.message);
    res.status(502).json({
      error: "Pembayaran belum dapat dibuat. Silakan coba lagi."
    });
  }
});

// Webhook Midtrans
app.post("/api/midtrans/webhook", (req, res) => {
  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
    fraud_status
  } = req.body;

  const expected = crypto.createHash("sha512")
    .update(order_id + status_code + gross_amount + SERVER_KEY)
    .digest("hex");

  const received = Buffer.from(signature_key || "", "hex");
  const calculated = Buffer.from(expected, "hex");

  if (received.length !== calculated.length ||
      !crypto.timingSafeEqual(received, calculated)) {
    return res.status(403).send("Invalid signature");
  }

  const order = db.prepare(
    "SELECT * FROM orders WHERE id = ?"
  ).get(order_id);

  if (!order || Number(gross_amount) !== order.amount) {
    return res.status(400).send("Invalid order");
  }

  if (
    transaction_status === "settlement" ||
    (transaction_status === "capture" && fraud_status === "accept")
  ) {
    db.prepare(`
      UPDATE orders SET status = 'paid'
      WHERE id = ? AND status = 'pending'
    `).run(order_id);

    db.prepare(`
      UPDATE inventory SET status = 'sold'
      WHERE id = ? AND order_id = ? AND status = 'reserved'
    `).run(order.inventory_id, order_id);
  } else if (
    ["expire", "cancel", "deny"].includes(transaction_status)
  ) {
    const release = db.transaction(() => {
      db.prepare(`
        UPDATE orders SET status = ?
        WHERE id = ? AND status = 'pending'
      `).run(transaction_status, order_id);

      db.prepare(`
        UPDATE inventory SET status = 'available', order_id = NULL
        WHERE id = ? AND order_id = ? AND status = 'reserved'
      `).run(order.inventory_id, order_id);
    });

    release();
  }

  res.status(200).send("OK");
});

// Melihat detail pesanan.
// Email dan password hanya diberikan setelah status paid.
app.get("/api/orders/:id", (req, res) => {
  const order = db.prepare(`
    SELECT * FROM orders WHERE id = ?
  `).get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  }

  const token = req.get("Authorization") || "";
  const suppliedToken = token.startsWith("Bearer ")
    ? token.slice(7)
    : "";

  const suppliedHash = hashToken(suppliedToken);
  const a = Buffer.from(suppliedHash, "hex");
  const b = Buffer.from(order.access_token_hash, "hex");

  if (!suppliedToken || a.length !== b.length ||
      !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Akses tidak diizinkan." });
  }

  const result = {
    order_id: order.id,
    product: order.product_name,
    amount: order.amount,
    status: order.status
  };

  if (order.status === "paid") {
    const account = db.prepare(`
      SELECT * FROM inventory WHERE id = ?
    `).get(order.inventory_id);

    if (account) {
      result.account = {
        email: account.email,
        password: decryptPassword(account)
      };
    }
  }

  res.json(result);
});

app.listen(PORT, () => {
  console.log("HAKIM STORE berjalan di port " + PORT);
});
