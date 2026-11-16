
const PRODUCTS = {
  safeban: { name: "Akun SAFEBAN", price: 30000 },
  starter: { name: "Paket 1 - Starter", price: 70000 },
  pro: { name: "Paket 2 - Pro", price: 150000 },
  elite: { name: "Paket 3 - Elite", price: 300000 }
};

const json = (data, status = 200) =>
  Response.json(data, { status });

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("ACCOUNT_ENCRYPTION_KEY harus 64 karakter hex");
  }
  return new Uint8Array(
    hex.match(/.{2}/g).map(x => parseInt(x, 16))
  );
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

async function encryptPassword(password, env) {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(env.ACCOUNT_ENCRYPTION_KEY),
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(password)
  );

  return {
    cipher: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv)
  };
}

async function decryptPassword(cipher, iv, env) {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(env.ACCOUNT_ENCRYPTION_KEY),
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(cipher)
  );

  return new TextDecoder().decode(decrypted);
}

async function createOrder(request, env) {
  const body = await request.json();

  const product = PRODUCTS[body.product_id];
  const buyer = String(body.buyer || "").trim();
  const whatsapp = String(body.whatsapp || "").trim();
  const streamer = String(body.streamer_code || "").trim();

  if (!product || !buyer || !whatsapp) {
    return json({ success: false, message: "Data pesanan tidak lengkap" }, 400);
  }

  if (buyer.length > 100 || whatsapp.length > 25 || streamer.length > 40) {
    return json({ success: false, message: "Data terlalu panjang" }, 400);
  }

  const orderId = "HS-" + crypto.randomUUID();
  const accessToken = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256(accessToken);

  // Cari stok yang tersedia
  const stock = await env.DB.prepare(
    "SELECT id FROM inventory WHERE product_id = ? AND status = 'available' LIMIT 1"
  ).bind(body.product_id).first();

  if (!stock) {
    return json({
      success: false,
      message: "Stok akun sedang kosong. Silakan hubungi admin."
    }, 409);
  }

  // Kunci stok agar tidak dibeli dua orang
  const reserved = await env.DB.prepare(
    "UPDATE inventory SET status = 'reserved', order_id = ? WHERE id = ? AND status = 'available'"
  ).bind(orderId, stock.id).run();

  if (!reserved.meta.changes) {
    return json({
      success: false,
      message: "Stok baru saja dipesan orang lain. Silakan coba lagi."
    }, 409);
  }

  try {
    await env.DB.prepare(`
      INSERT INTO orders
      (id, product_id, buyer, whatsapp, streamer_code,
       amount, status, access_token_hash, inventory_id)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).bind(
      orderId,
      body.product_id,
      buyer,
      whatsapp,
      streamer || null,
      product.price,
      tokenHash,
      stock.id
    ).run();

    const auth = btoa(env.MIDTRANS_SERVER_KEY + ":");

    const payment = await fetch(
      "https://app.sandbox.midtrans.com/snap/v1/transactions",
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
          item_details: [{
            id: body.product_id,
            price: product.price,
            quantity: 1,
            name: product.name
          }],
          customer_details: {
            first_name: buyer,
            phone: whatsapp
          }
        })
      }
    );

    const result = await payment.json();

    if (!payment.ok || !result.redirect_url) {
      throw new Error("Midtrans: " + (result.error_messages || ["Gagal membuat pembayaran"]).join(", "));
    }

    return json({
      success: true,
      order_id: orderId,
      payment_url: result.redirect_url,
      access_token: accessToken
    });

  } catch (error) {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE inventory SET status = 'available', order_id = NULL WHERE id = ? AND order_id = ?"
      ).bind(stock.id, orderId),
      env.DB.prepare(
        "DELETE FROM orders WHERE id = ?"
      ).bind(orderId)
    ]);

    return json({
      success: false,
      message: "Gagal membuat pembayaran. Silakan coba lagi."
    }, 502);
  }
}

async function paymentWebhook(request, env) {
  const notification = await request.json();
  const orderId = notification.order_id;

  if (!orderId) {
    return json({ success: false }, 400);
  }

  const order = await env.DB.prepare(
    "SELECT * FROM orders WHERE id = ?"
  ).bind(orderId).first();

  if (!order) {
    return json({ success: false }, 404);
  }

  // Verifikasi langsung ke server Midtrans
  const auth = btoa(env.MIDTRANS_SERVER_KEY + ":");

  const response = await fetch(
    "https://api.sandbox.midtrans.com/v2/" +
    encodeURIComponent(orderId) + "/status",
    {
      headers: { "Authorization": "Basic " + auth }
    }
  );

  if (!response.ok) {
    return json({ success: false, message: "Status Midtrans belum tersedia" }, 502);
  }

  const status = await response.json();

  if (
    status.order_id !== orderId ||
    Number(status.gross_amount) !== order.amount
  ) {
    return json({ success: false, message: "Verifikasi pembayaran gagal" }, 400);
  }

  const paid =
    status.transaction_status === "settlement" ||
    (
      status.transaction_status === "capture" &&
      status.fraud_status === "accept"
    );

  if (paid) {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(orderId),
      env.DB.prepare(
        "UPDATE inventory SET status = 'sold' WHERE id = ? AND order_id = ?"
      ).bind(order.inventory_id, orderId)
    ]);
  } else if (
    ["expire", "cancel", "deny"].includes(status.transaction_status)
  ) {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(status.transaction_status, orderId),
      env.DB.prepare(
        "UPDATE inventory SET status = 'available', order_id = NULL WHERE id = ? AND order_id = ?"
      ).bind(order.inventory_id, orderId)
    ]);
  }

  return json({ success: true });
}

async function getOrder(request, env, orderId) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");

  if (!token) {
    return json({ success: false, message: "Akses ditolak" }, 401);
  }

  const order = await env.DB.prepare(
    "SELECT * FROM orders WHERE id = ?"
  ).bind(orderId).first();

  if (!order || await sha256(token) !== order.access_token_hash) {
    return json({ success: false, message: "Pesanan tidak ditemukan" }, 404);
  }

  const result = {
    success: true,
    order_id: order.id,
    status: order.status,
    buyer: order.buyer,
    amount: order.amount
  };

  if (order.status === "paid" || order.status === "processing" || order.status === "completed") {
    const account = await env.DB.prepare(
      "SELECT account_email, password_cipher, password_iv FROM inventory WHERE id = ?"
    ).bind(order.inventory_id).first();

    if (account) {
      result.account = {
        email: account.account_email,
        password: await decryptPassword(
          account.password_cipher,
          account.password_iv,
          env
        )
      };
    }
  }

  return json(result);
}

async function addStock(request, env) {
  const auth = request.headers.get("Authorization") || "";

  if (
    !env.ADMIN_TOKEN ||
    auth !== "Bearer " + env.ADMIN_TOKEN
  ) {
    return json({ success: false, message: "Akses admin ditolak" }, 401);
  }

  const body = await request.json();

  if (
    !PRODUCTS[body.product_id] ||
    !body.account_email ||
    !body.password
  ) {
    return json({ success: false, message: "Data stok tidak lengkap" }, 400);
  }

  const encrypted = await encryptPassword(body.password, env);

  await env.DB.prepare(`
    INSERT INTO inventory
    (product_id, account_email, password_cipher, password_iv, status)
    VALUES (?, ?, ?, ?, 'available')
  `).bind(
    body.product_id,
    body.account_email,
    encrypted.cipher,
    encrypted.iv
  ).run();

  return json({ success: true, message: "Stok berhasil ditambahkan" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/health") {
        return json({
          success: true,
          message: "HAKIM STORE backend aktif",
          database: Boolean(env.DB)
        });
      }

      if (path === "/api/products" && request.method === "GET") {
        return json({ success: true, products: PRODUCTS });
      }

      if (path === "/api/orders" && request.method === "POST") {
        return await createOrder(request, env);
      }

      if (path === "/api/midtrans/webhook" && request.method === "POST") {
        return await paymentWebhook(request, env);
      }

      if (path.startsWith("/api/orders/") && request.method === "GET") {
        const id = decodeURIComponent(path.slice("/api/orders/".length));
        return await getOrder(request, env, id);
      }

      if (path === "/api/admin/stock" && request.method === "POST") {
        return await addStock(request, env);
      }

      if (path.startsWith("/api/")) {
        return json({ success: false, message: "API tidak ditemukan" }, 404);
      }

      return env.ASSETS.fetch(request);

    } catch (error) {
      return json({
        success: false,
        message: "Terjadi kesalahan pada server"
      }, 500);
    }
  }
};
    
