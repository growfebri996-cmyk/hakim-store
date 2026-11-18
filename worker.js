const ADMIN_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HAKIM STORE ADMIN</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b0b12;color:#eee;font-family:Arial,sans-serif}
main{max-width:1000px;margin:auto;padding:20px}
h1{color:#b88cff}
.card{background:#171722;border:1px solid #30303e;border-radius:14px;padding:16px;margin-bottom:14px}
input,select,button{width:100%;padding:12px;margin:6px 0;border-radius:9px;border:1px solid #383848;background:#11111a;color:white}
button{background:#8247e5;border:0;font-weight:bold;cursor:pointer}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.stat{background:#20202c;padding:14px;border-radius:10px}
.stat b{font-size:23px;color:#c39aff;display:block;margin-top:8px}
table{width:100%;border-collapse:collapse;min-width:650px}
th,td{padding:10px;border-bottom:1px solid #333;text-align:left;font-size:13px}
.wrap{overflow:auto}
small{color:#aaa}
.hidden{display:none}
#msg{white-space:pre-wrap;color:#ffb5b5}
</style>
</head>
<body>
<main>
<h1>HAKIM STORE</h1>
<small>ADMIN DASHBOARD</small>

<div class="card" id="login">
<h3>Login Admin</h3>
<input id="token" type="password" placeholder="Masukkan ADMIN_TOKEN">
<button onclick="loginAdmin()">LOGIN</button>
<div id="msg"></div>
</div>

<div id="app" class="hidden">

<div class="card">
<button onclick="refreshAll()">REFRESH DATA</button>
<button onclick="logout()" style="background:#383843">LOGOUT</button>
</div>

<h3>Ringkasan</h3>
<div class="grid" id="stats"></div>

<h3>Tambah Stok Akun</h3>
<div class="card">
<select id="product"></select>
<input id="email" placeholder="Email / username akun">
<input id="password" type="password" placeholder="Password akun">
<button onclick="addStock()">TAMBAH STOK</button>
<div id="stockmsg"></div>
</div>

<h3>Inventaris</h3>
<div class="card">
<select id="stockfilter" onchange="loadStock()">
<option value="">Semua stok</option>
<option value="available">Available</option>
<option value="reserved">Reserved</option>
<option value="sold">Sold</option>
</select>
<div class="wrap"><table>
<thead><tr><th>ID</th><th>Produk</th><th>Akun</th><th>Status</th><th>Order</th></tr></thead>
<tbody id="stocks"></tbody>
</table></div>
</div>

<h3>Pesanan</h3>
<div class="card">
<input id="search" placeholder="Cari ID / nama / WhatsApp">
<select id="orderfilter">
<option value="">Semua status</option>
<option value="pending">Pending</option>
<option value="paid">Paid</option>
<option value="cancelled">Cancelled</option>
<option value="processing">Processing</option>
<option value="completed">Completed</option>
</select>
<button onclick="loadOrders()">CARI PESANAN</button>
<div class="wrap"><table>
<thead><tr><th>ID</th><th>Pembeli</th><th>WhatsApp</th><th>Produk</th><th>Harga</th><th>Status</th><th>Tanggal</th></tr></thead>
<tbody id="orders"></tbody>
</table></div>
</div>
</div>
</main>

<script>
var adminToken = "";
var products = {};

function esc(s){
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function rupiah(n){
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

async function api(path, options){
  options = options || {};
  options.headers = options.headers || {};
  options.headers.Authorization = "Bearer " + adminToken;

  var r = await fetch(path, options);
  var d = await r.json();

  if(!r.ok || d.success === false){
    throw new Error(d.message || "Request gagal");
  }
  return d;
}

async function loginAdmin(){
  adminToken = document.getElementById("token").value.trim();
  document.getElementById("msg").textContent = "Memeriksa token...";

  try{
    var d = await api("/api/admin/dashboard");

    document.getElementById("login").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    var p = await fetch("/api/products");
    products = await p.json();

    var select = document.getElementById("product");
    select.innerHTML = "";

    Object.keys(products).forEach(function(id){
      var opt = document.createElement("option");
      opt.value = id;
      opt.textContent = products[id].name + " - " + rupiah(products[id].price);
      select.appendChild(opt);
    });

    renderStats(d);
    await refreshAll();
  }catch(e){
    adminToken = "";
    document.getElementById("msg").textContent = e.message;
  }
}

function renderStats(d){
  var s = d.stock || {};
  var o = d.orders || {};

  document.getElementById("stats").innerHTML =
    '<div class="stat">Total Stok<b>' + (s.total || 0) + '</b></div>' +
    '<div class="stat">Stok Tersedia<b>' + (s.available || 0) + '</b></div>' +
    '<div class="stat">Terjual<b>' + (s.sold || 0) + '</b></div>' +
    '<div class="stat">Reserved<b>' + (s.reserved || 0) + '</b></div>' +
    '<div class="stat">Total Pesanan<b>' + (o.total || 0) + '</b></div>' +
    '<div class="stat">Pending<b>' + (o.pending || 0) + '</b></div>' +
    '<div class="stat">Paid<b>' + (o.paid || 0) + '</b></div>' +
    '<div class="stat">Pendapatan<b>' + rupiah(o.revenue) + '</b></div>';
}

async function refreshAll(){
  try{
    var d = await api("/api/admin/dashboard");
    renderStats(d);
    await loadStock();
    await loadOrders();
  }catch(e){
    alert(e.message);
  }
}

async function addStock(){
  var product_id = document.getElementById("product").value;
  var account_email = document.getElementById("email").value.trim();
  var password = document.getElementById("password").value;

  if(!account_email || !password){
    alert("Email/username dan password wajib diisi");
    return;
  }

  if(!confirm("Tambahkan akun ini ke stok?")) return;

  try{
    var d = await api("/api/admin/stock",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        product_id:product_id,
        account_email:account_email,
        password:password
      })
    });

    document.getElementById("stockmsg").textContent = d.message || "Stok berhasil ditambahkan";
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";

    await refreshAll();
  }catch(e){
    document.getElementById("stockmsg").textContent = e.message;
  }
}

async function loadStock(){
  try{
    var status = document.getElementById("stockfilter").value;
    var d = await api("/api/admin/inventory?status=" + encodeURIComponent(status));

    document.getElementById("stocks").innerHTML =
      (d.inventory || []).map(function(x){
        return "<tr><td>" + esc(x.id) +
          "</td><td>" + esc(products[x.product_id] ? products[x.product_id].name : x.product_id) +
          "</td><td>" + esc(x.account_email) +
          "</td><td>" + esc(x.status) +
          "</td><td>" + esc(x.order_id || "-") +
          "</td></tr>";
      }).join("");
  }catch(e){
    document.getElementById("stocks").innerHTML =
      "<tr><td colspan='5'>" + esc(e.message) + "</td></tr>";
  }
}

async function loadOrders(){
  try{
    var status = document.getElementById("orderfilter").value;
    var search = document.getElementById("search").value.trim();

    var d = await api(
      "/api/admin/orders?status=" + encodeURIComponent(status) +
      "&search=" + encodeURIComponent(search)
    );

    document.getElementById("orders").innerHTML =
      (d.orders || []).map(function(x){
        return "<tr><td>" + esc(x.id) +
          "</td><td>" + esc(x.buyer) +
          "</td><td>" + esc(x.whatsapp) +
          "</td><td>" + esc(products[x.product_id] ? products[x.product_id].name : x.product_id) +
          "</td><td>" + rupiah(x.amount) +
          "</td><td>" + esc(x.status) +
          "</td><td>" + esc(x.created_at) +
          "</td></tr>";
      }).join("");
  }catch(e){
    document.getElementById("orders").innerHTML =
      "<tr><td colspan='7'>" + esc(e.message) + "</td></tr>";
  }
}

function logout(){
  adminToken = "";
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login").classList.remove("hidden");
  document.getElementById("token").value = "";
  document.getElementById("msg").textContent = "";
}
</script>
</body>
</html>`;

const PRODUCTS = {
  safeban: { name: "Akun SAFEBAN", price: 1000 },
  paket1: { name: "Paket 1 - Starter", price: 70000 },
  paket2: { name: "Paket 2 - Pro", price: 150000 },
  paket3: { name: "Paket 3 - Elite", price: 300000 }
};

const SITE_ORIGIN =
  "https://hakim-store.growfebri996.workers.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    const respond = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    try {
      // =========================
      // HEALTH CHECK
      // =========================
      if (
        url.pathname === "/api/health" &&
        request.method === "GET"
      ) {
        const result = await env.DB
          .prepare("SELECT 1 AS ok")
          .first();

        return respond({
          success: true,
          database: result?.ok === 1,
          midtrans_key_loaded: !!env.MIDTRANS_SERVER_KEY,
          encryption_key_loaded: !!env.ACCOUNT_ENCRYPTION_KEY,
          admin_token_loaded: !!env.ADMIN_TOKEN
        });
      }

      // =========================
      // DAFTAR PRODUK
      // =========================
      if (
        url.pathname === "/api/products" &&
        request.method === "GET"
      ) {
        return respond({
          success: true,
          products: PRODUCTS
        });
      }

      // =========================
// ADMIN DASHBOARD API
// =========================

// DASHBOARD SUMMARY
if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
  if (!isAdmin(request, env)) {
    return respond({
      success: false,
      message: "Unauthorized"
    }, 401);
  }

  const stock = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) AS reserved,
      SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) AS sold
    FROM inventory
  `).first();

  const orders = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS revenue
    FROM orders
  `).first();

  return respond({
    success: true,
    stock,
    orders
  });
}


// LIST INVENTORY
if (url.pathname === "/api/admin/inventory" && request.method === "GET") {
  if (!isAdmin(request, env)) {
    return respond({
      success: false,
      message: "Unauthorized"
    }, 401);
  }

  const status = url.searchParams.get("status") || "";
  const productId = url.searchParams.get("product_id") || "";

  let query = `
    SELECT
      id,
      product_id,
      account_email,
      status,
      order_id
    FROM inventory
    WHERE 1 = 1
  `;

  const bindings = [];

  if (["available", "reserved", "sold"].includes(status)) {
    query += ` AND status = ?`;
    bindings.push(status);
  }

  if (productId) {
    query += ` AND product_id = ?`;
    bindings.push(productId);
  }

  query += ` ORDER BY rowid DESC LIMIT 100`;

  let statement = env.DB.prepare(query);

  if (bindings.length > 0) {
    statement = statement.bind(...bindings);
  }

  const result = await statement.all();

  return respond({
    success: true,
    inventory: result.results || []
  });
}


// LIST ORDERS
if (url.pathname === "/api/admin/orders" && request.method === "GET") {
  if (!isAdmin(request, env)) {
    return respond({
      success: false,
      message: "Unauthorized"
    }, 401);
  }

  const status = url.searchParams.get("status") || "";
  const search = url.searchParams.get("search") || "";

  let query = `
    SELECT
      id,
      product_id,
      buyer,
      whatsapp,
      streamer_code,
      amount,
      status,
      inventory_id,
      created_at,
      updated_at
    FROM orders
    WHERE 1 = 1
  `;

  const bindings = [];

  if (["pending", "paid", "cancelled", "processing", "completed"].includes(status)) {
    query += ` AND status = ?`;
    bindings.push(status);
  }

  if (search) {
    query += ` AND (
      id LIKE ?
      OR buyer LIKE ?
      OR whatsapp LIKE ?
    )`;

    const keyword = `%${search}%`;

    bindings.push(keyword, keyword, keyword);
  }

  query += ` ORDER BY rowid DESC LIMIT 100`;

  let statement = env.DB.prepare(query);

  if (bindings.length > 0) {
    statement = statement.bind(...bindings);
  }

  const result = await statement.all();

  return respond({
    success: true,
    orders: result.results || []
  });
}

      // =========================
      // ADMIN: CEK PESANAN
      // =========================
      if (
        url.pathname === "/api/admin/check-order" &&
        request.method === "GET"
      ) {
        if (!isAdmin(request, env)) {
          return respond({
            success: false,
            message: "Akses ditolak"
          }, 401);
        }

        const orderId = url.searchParams.get("id");

        if (!orderId) {
          return respond({
            success: false,
            message: "ID pesanan diperlukan"
          }, 400);
        }

        const order = await env.DB.prepare(
          `SELECT id, product_id, buyer, whatsapp,
                  streamer_code, amount, status,
                  inventory_id, created_at, updated_at
           FROM orders
           WHERE id = ?`
        ).bind(orderId).first();

        if (!order) {
          return respond({
            success: false,
            message: "Pesanan tidak ditemukan"
          }, 404);
        }

        const stock = await env.DB.prepare(
          `SELECT id, product_id, status, order_id
           FROM inventory
           WHERE id = ?`
        ).bind(order.inventory_id).first();

        return respond({
          success: true,
          order,
          product_name:
            PRODUCTS[order.product_id]?.name || order.product_id,
          stock: stock || null
        });
      }

      // =========================
      // ADMIN: TAMBAH STOK
      // =========================
      if (
        url.pathname === "/api/admin/stock" &&
        request.method === "POST"
      ) {
        if (!isAdmin(request, env)) {
          return respond({
            success: false,
            message: "Akses admin ditolak"
          }, 401);
        }

        if (!env.ACCOUNT_ENCRYPTION_KEY) {
          return respond({
            success: false,
            message: "ACCOUNT_ENCRYPTION_KEY belum tersedia"
          }, 500);
        }

        const body = await request.json();

        const productId = body.product_id;
        const email = body.account_email;
        const password = body.password;

        if (
          !PRODUCTS[productId] ||
          typeof email !== "string" ||
          !email.trim() ||
          typeof password !== "string" ||
          !password
        ) {
          return respond({
            success: false,
            message: "Data stok tidak lengkap atau tidak valid"
          }, 400);
        }

        const keyBytes = hexToBytes(
          env.ACCOUNT_ENCRYPTION_KEY
        );

        if (keyBytes.length !== 32) {
          return respond({
            success: false,
            message: "ACCOUNT_ENCRYPTION_KEY harus 64 karakter hex"
          }, 500);
        }

        const iv = crypto.getRandomValues(
          new Uint8Array(12)
        );

        const key = await crypto.subtle.importKey(
          "raw",
          keyBytes,
          "AES-GCM",
          false,
          ["encrypt"]
        );

        const encrypted = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          new TextEncoder().encode(password)
        );

        await env.DB.prepare(
          `INSERT INTO inventory
           (product_id, account_email, password_cipher,
            password_iv, status)
           VALUES (?, ?, ?, ?, 'available')`
        ).bind(
          productId,
          email.trim(),
          bytesToHex(new Uint8Array(encrypted)),
          bytesToHex(iv)
        ).run();

        return respond({
          success: true,
          message: "Stok berhasil ditambahkan"
        });
      }

      // =========================
      // BUAT PESANAN DAN PEMBAYARAN
      // =========================
      if (
        url.pathname === "/api/orders" &&
        request.method === "POST"
      ) {
        if (!env.MIDTRANS_SERVER_KEY) {
          return respond({
            success: false,
            message: "MIDTRANS_SERVER_KEY belum tersedia"
          }, 500);
        }

        const body = await request.json();

        const productId = body.product_id;
        const buyer = body.buyer;
        const whatsapp = body.whatsapp;

        const streamerCode =
          typeof body.streamer_code === "string"
            ? body.streamer_code.trim() || null
            : null;

        const product = PRODUCTS[productId];

        if (
          !product ||
          typeof buyer !== "string" ||
          !buyer.trim() ||
          typeof whatsapp !== "string" ||
          !whatsapp.trim()
        ) {
          return respond({
            success: false,
            message: "Data pesanan tidak lengkap"
          }, 400);
        }

        // Cari stok yang tersedia
        const stock = await env.DB.prepare(
          `SELECT id
           FROM inventory
           WHERE product_id = ?
             AND status = 'available'
           LIMIT 1`
        ).bind(productId).first();

        if (!stock) {
          return respond({
            success: false,
            message: "Stok akun sedang habis"
          }, 409);
        }

        const orderId = "HS-" + crypto.randomUUID();

        // Kunci stok agar tidak dibeli dua orang
        const reserve = await env.DB.prepare(
          `UPDATE inventory
           SET status = 'reserved',
               order_id = ?
           WHERE id = ?
             AND status = 'available'`
        ).bind(orderId, stock.id).run();

        if (
          !reserve.meta ||
          reserve.meta.changes !== 1
        ) {
          return respond({
            success: false,
            message: "Stok baru saja dipesan orang lain. Coba lagi."
          }, 409);
        }

        let midtransRequestStarted = false;
let accessToken = null;

try {
  accessToken = bytesToHex(
    crypto.getRandomValues(new Uint8Array(32))
  );

          const tokenHash = await sha256(accessToken);

          await env.DB.prepare(
            `INSERT INTO orders
             (id, product_id, buyer, whatsapp, streamer_code,
              amount, status, access_token_hash, inventory_id)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
          ).bind(
            orderId,
            productId,
            buyer.trim(),
            whatsapp.trim(),
            streamerCode,
            product.price,
            tokenHash,
            stock.id
          ).run();

          const checkoutKeyFingerprint = await sha256(
  env.MIDTRANS_SERVER_KEY
);

console.log("CHECKOUT SERVER KEY FINGERPRINT", {
  fingerprint: checkoutKeyFingerprint.slice(0, 16),
  keyLength: env.MIDTRANS_SERVER_KEY.length
});

          const auth = btoa(
            env.MIDTRANS_SERVER_KEY + ":"
          );
  
           midtransRequestStarted = true;
          const payment = await fetch(
            "https://app.midtrans.com/snap/v1/transactions",
            {
              method: "POST",
              headers: {
                "Authorization": "Basic " + auth,
                "Content-Type": "application/json",
                "Accept": "application/json"
              },
              body: JSON.stringify({
                transaction_details: {
                  order_id: orderId,
                  gross_amount: product.price
                },
                customer_details: {
                  first_name: buyer.trim(),
                  phone: whatsapp.trim()
                },
                callbacks: {
                  finish:
                    SITE_ORIGIN +
                    "/?pesanan=" +
                    encodeURIComponent(orderId),
                  error:
                    SITE_ORIGIN +
                    "/?pesanan=" +
                    encodeURIComponent(orderId),
                  pending:
                    SITE_ORIGIN +
                    "/?pesanan=" +
                    encodeURIComponent(orderId)
                }
              })
            }
          );

          const paymentText = await payment.text();

          let paymentData = {};

          try {
            paymentData = JSON.parse(paymentText);
          } catch {
            paymentData = {};
          }

          if (
  !payment.ok ||
  !paymentData.redirect_url
) {
  // Hanya bersihkan jika Midtrans memberikan
  // penolakan HTTP 4xx yang jelas.
  const definitiveRejection =
    payment.status >= 400 &&
    payment.status < 500 &&
    payment.status !== 408 &&
    payment.status !== 429;

  if (definitiveRejection) {
    await releaseStock(
      env,
      stock.id,
      orderId
    );

    await env.DB.prepare(
      `DELETE FROM orders
       WHERE id = ?
         AND status = 'pending'`
    ).bind(orderId).run();
  }

  return respond({
    success: false,
    message: definitiveRejection
      ? "Midtrans menolak pembuatan pembayaran"
      : "Status pembuatan pembayaran belum dapat dipastikan. Jangan melakukan pembayaran ulang. Hubungi admin.",
    order_id: orderId,
    midtrans_status: payment.status,
    midtrans_error: paymentData
  }, 502);
          }
          return respond({
  success: true,
  order_id: orderId,
  payment_url: paymentData.redirect_url,
  access_token: accessToken,

});

        } catch (error) {
  console.error("CHECKOUT ERROR:", error);

  // Jika permintaan Midtrans belum dikirim,
  // aman untuk membatalkan order dan melepas stok.
  if (!midtransRequestStarted) {
    await releaseStock(
      env,
      stock.id,
      orderId
    );

    await env.DB.prepare(
      `DELETE FROM orders
       WHERE id = ?
         AND status = 'pending'`
    ).bind(orderId).run();

    return respond({
      success: false,
      message: "Gagal menyiapkan pesanan"
    }, 500);
  }

  // Jika permintaan sudah dikirim, status transaksi
  // mungkin belum diketahui. Jangan lepaskan stok.
  return respond({
    success: false,
    message: "Permintaan pembayaran sedang mengalami gangguan. Pesanan perlu diperiksa admin sebelum mencoba kembali.",
    order_id: orderId
  }, 502);
}
      }
      // =========================
      // WEBHOOK MIDTRANS
      // =========================
      if (
        url.pathname === "/api/midtrans/webhook" &&
        request.method === "POST"
      ) {
        if (!env.MIDTRANS_SERVER_KEY) {
          return respond({
            success: false,
            message: "MIDTRANS_SERVER_KEY belum tersedia"
          }, 500);
        }

        const notification = await request.json();
        
        console.log("MIDTRANS MERCHANT CHECK", {
  merchantId: notification.merchant_id,
  orderId: notification.order_id,
  transactionId: notification.transaction_id,
  transactionStatus: notification.transaction_status
});

        const orderId = notification.order_id;
        const statusCode = String(
          notification.status_code ?? ""
        );
        const grossAmount = String(
          notification.gross_amount ?? ""
        );
        const signature = notification.signature_key;
        console.log("WEBHOOK CREDENTIAL DIAGNOSTIC", {
  notificationOrderId: orderId,
  notificationStatusCode: statusCode,
  notificationGrossAmount: grossAmount,
  notificationSignatureLength: signature?.length || 0,
  serverKeyExists: Boolean(env.MIDTRANS_SERVER_KEY),
  serverKeyPrefixValid:
    env.MIDTRANS_SERVER_KEY?.startsWith("SB-Mid-server-"),
  serverKeyLength: env.MIDTRANS_SERVER_KEY?.length || 0
});

        const transactionId = notification.transaction_id;

        if (
          typeof orderId !== "string" ||
          !orderId ||
          !/^\d{3}$/.test(statusCode) ||
          !/^\d+(\.\d{1,2})?$/.test(grossAmount) ||
          typeof signature !== "string" ||
          !transactionId ||
          typeof transactionId !== "string"
        ) {
          return respond({
            success: false,
            message: "Data notifikasi tidak lengkap atau tidak valid"
          }, 400);
        }

        // Verifikasi signature menggunakan SERVER KEY
        const signatureInput =
          orderId +
          statusCode +
          grossAmount +
          env.MIDTRANS_SERVER_KEY;

        const expectedSignature = await sha512(
          signatureInput
        );
        const key = env.MIDTRANS_SERVER_KEY;

const testOriginal = await sha512(
  orderId + statusCode + grossAmount + key
);

const testAmountInteger = await sha512(
  orderId + statusCode + String(Number(grossAmount)) + key
);

const testTrimmed = await sha512(
  orderId.trim() + statusCode.trim() + grossAmount.trim() + key
);

const testAmountFixed = await sha512(
  orderId + statusCode + Number(grossAmount).toFixed(2) + key
);

console.log("SIGNATURE FORMAT TEST", {
  original:
    signature?.toLowerCase() === testOriginal.toLowerCase(),

  amountInteger:
    signature?.toLowerCase() === testAmountInteger.toLowerCase(),

  trimmed:
    signature?.toLowerCase() === testTrimmed.toLowerCase(),

  amountFixed2:
    signature?.toLowerCase() === testAmountFixed.toLowerCase()
});
        const serverKeyFingerprint = await sha256(
  env.MIDTRANS_SERVER_KEY
);

console.log("SERVER KEY FINGERPRINT", {
  fingerprint: serverKeyFingerprint.slice(0, 16),
  keyLength: env.MIDTRANS_SERVER_KEY.length
});
        const hashSelfTest = await sha512(
  "1111200100000.00askvnoibnosifnboseofinbofinfgbiufglnbfg"
);

console.log("SHA512 SELF TEST", {
  passed: hashSelfTest ===
    "edc076b21793ebe3e17926350f5b8ae67d902fe657b3d0aa31b932d5c127e2375d308a2bc94f3265ac2d80a1f181a79b997ac178a236fcff35af263fc4d4c231"
});
        console.log("SIGNATURE DIAGNOSTIC", {
  orderId,
  inputLength: signatureInput.length,
  orderIdLength: orderId.length,
  statusCodeLength: statusCode.length,
  grossAmountLength: grossAmount.length,
  paymentType: notification.payment_type || null,
          merchantId: notification.merchant_id || null,
transactionStatus: notification.transaction_status || null,
fraudStatus: notification.fraud_status || null,
  statusCode,
  grossAmount,
  transactionId,
  signatureLength: signature.length,
  expectedLength: expectedSignature.length,
  keyLength: env.MIDTRANS_SERVER_KEY?.length,
  signatureMatches: constantTimeEqual(
    signature.toLowerCase(),
    expectedSignature.toLowerCase()
  )
});

        const signatureValid = constantTimeEqual(
  signature.toLowerCase(),
  expectedSignature.toLowerCase()
);

console.log("SIGNATURE CHECK RESULT", {
  signatureValid,
  orderId
});
        if (!signatureValid) {
  return respond({
    success: false,
    message: "Signature not valid"
  }, 403);
        }

        // Cari pesanan di database
        const order = await env.DB.prepare(
          `SELECT *
           FROM orders
           WHERE id = ?`
        ).bind(orderId).first();

        if (!order) {
          return respond({
            success: false,
            message: "Pesanan tidak ditemukan"
          }, 404);
        }

        // Pastikan nominal dari notifikasi cocok
        if (
          Number(grossAmount) !== Number(order.amount)
        ) {
          return respond({
            success: false,
            message: "Nominal notifikasi tidak sesuai"
          }, 400);
        }

        // Cek langsung status transaksi ke Midtrans
        const statusHeaders = {
          "Authorization":
            "Basic " + btoa(env.MIDTRANS_SERVER_KEY + ":"),
          "Accept": "application/json"
        };

        // DANA menggunakan transaction-source SNAP_API
        if (
          String(notification.payment_type || "").toLowerCase() === "dana"
        ) {
          statusHeaders["transaction-source"] = "SNAP_API";
        }

        

  const statusLookupId =
  String(notification.payment_type || "").toLowerCase() === "dana"
    ? transactionId
    : orderId;

const statusResponse = await fetch(
  `https://api.midtrans.com/v2/${encodeURIComponent(statusLookupId)}/status`,
  {
    method: "GET",
    headers: statusHeaders
  }
);

const statusText = await statusResponse.text();

let statusData = {};

try {
  statusData = JSON.parse(statusText);
} catch {
  statusData = {};
}

console.log("MIDTRANS STATUS DIAGNOSTIC", {
  httpStatus: statusResponse.status,
  statusCode: statusData.status_code || null,
  orderId: statusData.order_id || null,
  transactionId: statusData.transaction_id || null,
  transactionStatus: statusData.transaction_status || null,
  grossAmount: statusData.gross_amount || null,
  currency: statusData.currency || null,
  paymentType: statusData.payment_type || null,
  merchantId: statusData.merchant_id || null,
  signatureLength: statusData.signature_key?.length || 0
});
        const statusSignatureInput =
  String(statusData.order_id || "") +
  String(statusData.status_code || "") +
  String(statusData.gross_amount || "") +
  env.MIDTRANS_SERVER_KEY;

const expectedStatusSignature = await sha512(
  statusSignatureInput
);

const statusSignatureValid =
  typeof statusData.signature_key === "string" &&
  constantTimeEqual(
    statusData.signature_key.toLowerCase(),
    expectedStatusSignature.toLowerCase()
  );

console.log("STATUS SIGNATURE VERIFICATION", {
  statusSignatureValid,
  orderIdMatches: statusData.order_id === orderId,
  transactionIdMatches:
    statusData.transaction_id === transactionId,
  amountMatches:
    Number(statusData.gross_amount) === Number(order.amount),
  currencyMatches: statusData.currency === "IDR",

  keyPrefixValid:
    env.MIDTRANS_SERVER_KEY?.startsWith("SB-Mid-server-"),

  keyLength:
    env.MIDTRANS_SERVER_KEY?.length || 0,

  signatureLength:
    statusData.signature_key?.length || 0
});

if (
  !statusResponse.ok ||
  String(statusData.status_code || "") !== "200"
) {
  return respond({
    success: false,
    message: "Gagal memeriksa status transaksi Midtrans",
    midtrans_http_status: statusResponse.status,
    midtrans_status_code: statusData.status_code || null,
    midtrans_message: statusData.status_message || null
  }, 502);
}

if (
  statusData.order_id !== orderId ||
  statusData.transaction_id !== transactionId ||
  Number(statusData.gross_amount) !== Number(order.amount) ||
  statusData.currency !== "IDR"
) {
  return respond({
    success: false,
    message: "Verifikasi transaksi Midtrans tidak cocok"
  }, 403);
}
        // Cocokkan data status dengan notifikasi dan pesanan
        if (
          statusData.transaction_id !== transactionId ||
          Number(statusData.gross_amount) !== Number(order.amount) ||
          statusData.currency !== "IDR"
        ) {
          return respond({
            success: false,
            message: "Data pembayaran tidak sesuai"
          }, 400);
        }

        const transactionStatus =
          statusData.transaction_status;

        const paid =
          transactionStatus === "settlement" ||
          (
            transactionStatus === "capture" &&
            statusData.fraud_status === "accept"
          );
// =========================
// PEMBAYARAN BERHASIL
// =========================
if (paid) {
  // Jika sudah dibayar, jangan proses ulang
  if (
    order.status === "paid" ||
    order.status === "processing" ||
    order.status === "completed"
  ) {
    return respond({
      success: true,
      message: "Pesanan sudah tercatat lunas"
    });
  }

  if (order.status !== "pending") {
    return respond({
      success: true,
      message: "Pesanan sudah tidak dalam status pending",
      order_status: order.status
    });
  }

  const stock = await env.DB.prepare(
    `SELECT id, status, order_id
     FROM inventory
     WHERE id = ?`
  ).bind(order.inventory_id).first();

  if (
    !stock ||
    stock.status !== "reserved" ||
    stock.order_id !== orderId
  ) {
    return respond({
      success: false,
      message: "Stok pesanan tidak cocok. Perlu pemeriksaan admin."
    }, 409);
  }

  // Jalankan kedua perubahan dalam satu batch database
  const batchResults = await env.DB.batch([
    env.DB.prepare(
      `UPDATE orders
       SET status = 'paid',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND status = 'pending'`
    ).bind(orderId),

    env.DB.prepare(
      `UPDATE inventory
       SET status = 'sold'
       WHERE id = ?
         AND order_id = ?
         AND status = 'reserved'`
    ).bind(order.inventory_id, orderId)
  ]);

  const orderChanges = batchResults[0]?.meta?.changes ?? 0;
  const inventoryChanges = batchResults[1]?.meta?.changes ?? 0;

  if (orderChanges !== 1 || inventoryChanges !== 1) {
    const currentOrder = await env.DB.prepare(
      `SELECT status FROM orders WHERE id = ?`
    ).bind(orderId).first();

    const currentStock = await env.DB.prepare(
      `SELECT status, order_id FROM inventory WHERE id = ?`
    ).bind(order.inventory_id).first();

    if (
      currentOrder?.status === "paid" &&
      currentStock?.status === "sold" &&
      currentStock?.order_id === orderId
    ) {
      return respond({
        success: true,
        message: "Pesanan sudah tercatat lunas",
        order_id: orderId
      });
    }

    return respond({
      success: false,
      message: "Update pesanan dan stok tidak sesuai. Perlu pemeriksaan admin."
    }, 409);
  }

  return respond({
    success: true,
    message: "Pembayaran berhasil diverifikasi",
    order_id: orderId,
    order_status: "paid"
  });
}
        // =========================
        // PEMBAYARAN GAGAL / KEDALUWARSA
        // =========================
        if (
          ["expire", "cancel", "deny"].includes(
            transactionStatus
          )
        ) {
          if (order.status === "pending") {
            await env.DB.batch([
              env.DB.prepare(
                `UPDATE orders
                 SET status = 'cancelled',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?
                   AND status = 'pending'`
              ).bind(orderId),

              env.DB.prepare(
                `UPDATE inventory
                 SET status = 'available',
                     order_id = NULL
                 WHERE id = ?
                   AND order_id = ?
                   AND status = 'reserved'`
              ).bind(order.inventory_id, orderId)
            ]);
          }

          return respond({
            success: true,
            message: "Status pembatalan transaksi telah diproses",
            order_id: orderId,
            transaction_status: transactionStatus
          });
        }

        // Status pending atau status lain yang belum final
        return respond({
          success: true,
          message: "Notifikasi diterima",
          order_id: orderId,
          transaction_status: transactionStatus
        });
      }

      // =========================
      // DETAIL PESANAN DAN PENGIRIMAN AKUN
      // =========================
      const orderMatch = url.pathname.match(
        /^\/api\/orders\/([^/]+)$/
      );

      if (
        orderMatch &&
        request.method === "GET"
      ) {
        const orderId = decodeURIComponent(
          orderMatch[1]
        );

        const authHeader =
          request.headers.get("Authorization") || "";

        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : "";

        if (!token) {
          return respond({
            success: false,
            message: "Token pesanan diperlukan"
          }, 401);
        }

        const tokenHash = await sha256(token);

        const order = await env.DB.prepare(
          `SELECT *
           FROM orders
           WHERE id = ?
             AND access_token_hash = ?`
        ).bind(orderId, tokenHash).first();

        if (!order) {
          return respond({
            success: false,
            message: "Pesanan tidak ditemukan"
          }, 404);
        }

        const base = {
          success: true,
          order_id: order.id,
          product:
            PRODUCTS[order.product_id]?.name ||
            order.product_id,
          buyer: order.buyer,
          amount: order.amount,
          status: order.status
        };

        if (
          !["paid", "processing", "completed"].includes(
            order.status
          )
        ) {
          return respond({
            ...base,
            message:
              order.status === "cancelled"
                ? "Pesanan dibatalkan atau kedaluwarsa"
                : "Akun tersedia setelah pembayaran terverifikasi"
          });
        }

        if (!env.ACCOUNT_ENCRYPTION_KEY) {
          return respond({
            success: false,
            message: "Kunci enkripsi tidak tersedia"
          }, 500);
        }

        const stock = await env.DB.prepare(
          `SELECT *
           FROM inventory
           WHERE id = ?
             AND order_id = ?
             AND status = 'sold'`
        ).bind(
          order.inventory_id,
          orderId
        ).first();

        if (!stock) {
          return respond({
            success: false,
            message: "Data akun tidak ditemukan atau stok belum terkonfirmasi"
          }, 404);
        }

        const keyBytes = hexToBytes(
          env.ACCOUNT_ENCRYPTION_KEY
        );

        if (keyBytes.length !== 32) {
          return respond({
            success: false,
            message: "Kunci enkripsi tidak valid"
          }, 500);
        }

        const key = await crypto.subtle.importKey(
          "raw",
          keyBytes,
          "AES-GCM",
          false,
          ["decrypt"]
        );

        const decrypted = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: hexToBytes(stock.password_iv)
          },
          key,
          hexToBytes(stock.password_cipher)
        );

        return respond({
          ...base,
          account_email: stock.account_email,
          password: new TextDecoder().decode(decrypted)
        });
      }

            // =========================
      // WEBSITE STATIS
      // =========================
      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error("WORKER ERROR:", error);

      return respond({
        success: false,
        message: "Terjadi kesalahan server"
      }, 500);
    }
  }
};

// =========================
// CEK ADMIN
// =========================
function isAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return false;

  const token =
    request.headers.get("Authorization") || "";

  return token.trim() ===
    `Bearer ${env.ADMIN_TOKEN.trim()}`;
}

// =========================
// LEPASKAN STOK
// =========================
async function releaseStock(env, stockId, orderId) {
  await env.DB.prepare(
    `UPDATE inventory
     SET status = 'available',
         order_id = NULL
     WHERE id = ?
       AND order_id = ?
       AND status = 'reserved'`
  ).bind(stockId, orderId).run();
}

// =========================
// HEX KE BYTE
// =========================
function hexToBytes(hex) {
  if (
    typeof hex !== "string" ||
    !/^[0-9a-f]+$/i.test(hex) ||
    hex.length % 2 !== 0
  ) {
    return new Uint8Array();
  }

  return new Uint8Array(
    hex.match(/.{2}/g).map(x => parseInt(x, 16))
  );
}

// =========================
// BYTE KE HEX
// =========================
function bytesToHex(bytes) {
  return Array.from(
    bytes,
    b => b.toString(16).padStart(2, "0")
  ).join("");
}

// =========================
// SHA-256 UNTUK TOKEN PESANAN
// =========================
async function sha256(value) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return bytesToHex(new Uint8Array(hash));
}

// =========================
// SHA-512 UNTUK SIGNATURE MIDTRANS
// =========================
async function sha512(value) {
  const hash = await crypto.subtle.digest(
    "SHA-512",
    new TextEncoder().encode(value)
  );

  return bytesToHex(new Uint8Array(hash));
}

// =========================
// PERBANDINGAN SIGNATURE
// =========================
function constantTimeEqual(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    a.length !== b.length
  ) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
