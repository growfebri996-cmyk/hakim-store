
const PRODUCTS = {
  safeban: { name: "Akun SAFEBAN", price: 30000 },
  paket1: { name: "Paket 1 - Starter", price: 70000 },
  paket2: { name: "Paket 2 - Pro", price: 150000 },
  paket3: { name: "Paket 3 - Elite", price: 300000 }
};

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
        headers: { ...cors, "Content-Type": "application/json" }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

  
      
if (url.pathname === "/api/health") {
  const result = await env.DB.prepare("SELECT 1 AS ok").first();

  return respond({
    success: true,
    database: result?.ok === 1,
    midtrans_key_loaded: !!env.MIDTRANS_SERVER_KEY,
    encryption_key_loaded: !!env.ACCOUNT_ENCRYPTION_KEY,
    admin_token_loaded: !!env.ADMIN_TOKEN
  });
}

if (url.pathname === "/api/products") {
  return respond({ success: true, products: PRODUCTS });
}

        const result = await env.DB.prepare("SELECT 1 AS ok").first();
        return respond({ success: true, database: result?.ok === 1 });
      }

      if (url.pathname === "/api/products") {
        return respond({ success: true, products: PRODUCTS });
      }

      if (url.pathname === "/api/admin/stock" && request.method === "POST") {
        const token = request.headers.get("Authorization") || "";
const adminToken = env.ADMIN_TOKEN;

if (!adminToken) {
  return respond({
    success: false,
    message: "ADMIN_TOKEN tidak terbaca oleh Worker"
  }, 500);
}

if (token.trim() !== `Bearer ${adminToken.trim()}`) {
  return respond({
    success: false,
    message: "Token tidak cocok"
  }, 401);
}

        const body = await request.json();
        const { product_id, account_email, password } = body;

        if (!PRODUCTS[product_id] || !account_email || !password) {
          return respond({ success: false, message: "Data stok tidak lengkap" }, 400);
        }

        const keyBytes = hexToBytes(env.ACCOUNT_ENCRYPTION_KEY);
        if (keyBytes.length !== 32) {
          return respond({ success: false, message: "ACCOUNT_ENCRYPTION_KEY harus 64 karakter hex" }, 500);
        }

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
        const encrypted = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          new TextEncoder().encode(password)
        );

        await env.DB.prepare(
          `INSERT INTO inventory (product_id, account_email, password_cipher, password_iv, status)
           VALUES (?, ?, ?, ?, 'available')`
        ).bind(product_id, account_email, bytesToHex(new Uint8Array(encrypted)), bytesToHex(iv)).run();

        return respond({ success: true, message: "Stok berhasil ditambahkan" });
      }

      if (url.pathname === "/api/orders" && request.method === "POST") {
        const body = await request.json();
        const { product_id, buyer, whatsapp, streamer_code } = body;
        const product = PRODUCTS[product_id];

        if (!product || !buyer || !whatsapp) {
          return respond({ success: false, message: "Data pesanan tidak lengkap" }, 400);
        }

        const stock = await env.DB.prepare(
          "SELECT * FROM inventory WHERE product_id = ? AND status = 'available' LIMIT 1"
        ).bind(product_id).first();

        if (!stock) return respond({ success: false, message: "Stok akun sedang habis" }, 409);

        const orderId = "HS-" + crypto.randomUUID();
        const accessToken = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
        const tokenHash = await sha256(accessToken);

        await env.DB.prepare(
          `INSERT INTO orders (id, product_id, buyer, whatsapp, streamer_code, amount, status, access_token_hash, inventory_id)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        ).bind(orderId, product_id, buyer, whatsapp, streamer_code || null, product.price, tokenHash, stock.id).run();

        await env.DB.prepare(
          "UPDATE inventory SET status = 'reserved', order_id = ? WHERE id = ? AND status = 'available'"
        ).bind(orderId, stock.id).run();

        const auth = btoa(env.MIDTRANS_SERVER_KEY + ":");
        const payment = await fetch("https://app.sandbox.midtrans.com/snap/v1/transactions", {
          method: "POST",
          headers: {
            "Authorization": "Basic " + auth,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            transaction_details: { order_id: orderId, gross_amount: product.price },
            customer_details: { first_name: buyer, phone: whatsapp }
          })
        });

        
const paymentText = await payment.text();

let paymentData;
try {
  paymentData = JSON.parse(paymentText);
} catch {
  paymentData = { raw_response: paymentText };
}

if (!payment.ok || !paymentData.redirect_url) {
  await env.DB.prepare(
    "UPDATE inventory SET status = 'available', order_id = NULL WHERE id = ?"
  ).bind(stock.id).run();

  await env.DB.prepare(
    "DELETE FROM orders WHERE id = ?"
  ).bind(orderId).run();

  return respond({
    success: false,
    message: "Gagal membuat pembayaran Midtrans",
    midtrans_status: payment.status,
    midtrans_error: paymentData
  }, 502);
}

        return respond({
          success: true,
          order_id: orderId,
          payment_url: paymentData.redirect_url,
          access_token: accessToken
        });
      }

      if (url.pathname === "/api/midtrans/webhook" && request.method === "POST") {
        const notification = await request.json();
        const orderId = notification.order_id;

        const statusResponse = await fetch(
          `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(orderId)}/status`,
          { headers: { "Authorization": "Basic " + btoa(env.MIDTRANS_SERVER_KEY + ":") } }
        );
        const statusData = await statusResponse.json();

        const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
        if (!order || String(statusData.gross_amount) !== String(order.amount)) {
          return respond({ success: false, message: "Pesanan tidak valid" }, 400);
        }

        if (statusData.transaction_status === "settlement" || statusData.transaction_status === "capture") {
          await env.DB.prepare("UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(orderId).run();
          await env.DB.prepare("UPDATE inventory SET status = 'sold' WHERE order_id = ?").bind(orderId).run();
        } else if (["expire", "cancel", "deny"].includes(statusData.transaction_status)) {
          await env.DB.prepare("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(orderId).run();
          await env.DB.prepare("UPDATE inventory SET status = 'available', order_id = NULL WHERE order_id = ?").bind(orderId).run();
        }

        return respond({ success: true });
      }

      const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
      if (orderMatch && request.method === "GET") {
        const orderId = orderMatch[1];
        const token = (request.headers.get("Authorization") || "").replace("Bearer ", "");
        const tokenHash = await sha256(token);

        const order = await env.DB.prepare(
          "SELECT * FROM orders WHERE id = ? AND access_token_hash = ?"
        ).bind(orderId, tokenHash).first();

        if (!order) return respond({ success: false, message: "Pesanan tidak ditemukan" }, 404);
        if (!["paid", "processing", "completed"].includes(order.status)) {
          return respond({ success: true, status: order.status, message: "Akun tersedia setelah pembayaran terverifikasi" });
        }

        const stock = await env.DB.prepare("SELECT * FROM inventory WHERE id = ?").bind(order.inventory_id).first();
        if (!stock) return respond({ success: false, message: "Data akun tidak ditemukan" }, 404);

        const key = await crypto.subtle.importKey("raw", hexToBytes(env.ACCOUNT_ENCRYPTION_KEY), "AES-GCM", false, ["decrypt"]);
        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: hexToBytes(stock.password_iv) },
          key,
          hexToBytes(stock.password_cipher)
        );

        return respond({
          success: true,
          status: order.status,
          account_email: stock.account_email,
          password: new TextDecoder().decode(decrypted)
        });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return respond({ success: false, message: "Terjadi kesalahan server", detail: error.message }, 500);
    }
  }
};

function hexToBytes(hex) {
  if (!/^[0-9a-f]+$/i.test(hex || "") || hex.length % 2) return new Uint8Array();
  return new Uint8Array(hex.match(/.{2}/g).map(x => parseInt(x, 16)));
}

function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(hash));
}
