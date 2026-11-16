
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

    const respond = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    try {
      // HEALTH CHECK
      if (url.pathname === "/api/health") {
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

      // DAFTAR PRODUK
      if (url.pathname === "/api/products") {
        return respond({
          success: true,
          products: PRODUCTS
        });
      }

      // TAMBAH STOK AKUN
      if (
        url.pathname === "/api/admin/stock" &&
        request.method === "POST"
      ) {
        const token = request.headers.get("Authorization") || "";

        if (!env.ADMIN_TOKEN) {
          return respond({
            success: false,
            message: "ADMIN_TOKEN belum tersedia"
          }, 500);
        }

        if (token.trim() !== `Bearer ${env.ADMIN_TOKEN.trim()}`) {
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

        const product_id = body.product_id;
        const account_email = body.account_email;
        const password = body.password;

        if (
          !PRODUCTS[product_id] ||
          typeof account_email !== "string" ||
          !account_email.trim() ||
          typeof password !== "string" ||
          !password
        ) {
          return respond({
            success: false,
            message: "Data stok tidak lengkap atau tidak valid"
          }, 400);
        }

        const keyBytes = hexToBytes(env.ACCOUNT_ENCRYPTION_KEY);

        if (keyBytes.length !== 32) {
          return respond({
            success: false,
            message: "ACCOUNT_ENCRYPTION_KEY harus 64 karakter hex"
          }, 500);
        }

        const iv = crypto.getRandomValues(new Uint8Array(12));

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
          (product_id, account_email, password_cipher, password_iv, status)
          VALUES (?, ?, ?, ?, 'available')`
        ).bind(
          product_id,
          account_email.trim(),
          bytesToHex(new Uint8Array(encrypted)),
          bytesToHex(iv)
        ).run();

        return respond({
          success: true,
          message: "Stok berhasil ditambahkan"
        });
      }

      // MEMBUAT PESANAN DAN PEMBAYARAN
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

        const product_id = body.product_id;
        const buyer = body.buyer;
        const whatsapp = body.whatsapp;
        const streamer_code = body.streamer_code || null;

        const product = PRODUCTS[product_id];

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

        // Cari stok tersedia
        const stock = await env.DB.prepare(
          `SELECT * FROM inventory
          WHERE product_id = ? AND status = 'available'
          LIMIT 1`
        ).bind(product_id).first();

        if (!stock) {
          return respond({
            success: false,
            message: "Stok akun sedang habis"
          }, 409);
        }

        // Kunci stok agar tidak dibeli dua orang sekaligus
        const reserve = await env.DB.prepare(
          `UPDATE inventory
          SET status = 'reserved', order_id = ?
          WHERE id = ? AND status = 'available'`
        ).bind(
          "TEMP-" + crypto.randomUUID(),
          stock.id
        ).run();

        if (!reserve.meta || reserve.meta.changes !== 1) {
          return respond({
            success: false,
            message: "Stok baru saja dipesan orang lain. Silakan coba lagi."
          }, 409);
        }

        const orderId = "HS-" + crypto.randomUUID();

        const accessToken = bytesToHex(
          crypto.getRandomValues(new Uint8Array(32))
        );

        const tokenHash = await sha256(accessToken);

        try {
          // Simpan pesanan
          await env.DB.prepare(
            `INSERT INTO orders
            (id, product_id, buyer, whatsapp, streamer_code,
             amount, status, access_token_hash, inventory_id)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
          ).bind(
            orderId,
            product_id,
            buyer.trim(),
            whatsapp.trim(),
            streamer_code,
            product.price,
            tokenHash,
            stock.id
          ).run();

          // Perbarui ID pesanan pada stok
          await env.DB.prepare(
            `UPDATE inventory
            SET order_id = ?
            WHERE id = ? AND status = 'reserved'`
          ).bind(orderId, stock.id).run();

          // Hubungkan ke Midtrans Sandbox
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
                customer_details: {
                  first_name: buyer.trim(),
                  phone: whatsapp.trim()
                }
              })
            }
          );

          const paymentText = await payment.text();

          let paymentData;

          try {
            paymentData = JSON.parse(paymentText);
          } catch {
            paymentData = {
              raw_response: paymentText
            };
          }

          if (!payment.ok || !paymentData.redirect_url) {
            await env.DB.prepare(
              `UPDATE inventory
              SET status = 'available', order_id = NULL
              WHERE id = ? AND order_id = ?`
            ).bind(stock.id, orderId).run();

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

        } catch (error) {
          // Kembalikan stok jika proses pesanan gagal
          await env.DB.prepare(
            `UPDATE inventory
            SET status = 'available', order_id = NULL
            WHERE id = ? AND order_id IN (?, ?)`
          ).bind(stock.id, orderId, "TEMP-" + orderId).run();

          await env.DB.prepare(
            "DELETE FROM orders WHERE id = ?"
          ).bind(orderId).run();

          throw error;
        }
      }

      // NOTIFIKASI PEMBAYARAN MIDTRANS
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
        const orderId = notification.order_id;

        if (!orderId || typeof orderId !== "string") {
          return respond({
            success: false,
            message: "Order ID tidak valid"
          }, 400);
        }

        const order = await env.DB.prepare(
          "SELECT * FROM orders WHERE id = ?"
        ).bind(orderId).first();

        if (!order) {
          return respond({
            success: false,
            message: "Pesanan tidak ditemukan"
          }, 404);
        }

        // Periksa status langsung ke Midtrans
        const statusResponse = await fetch(
          `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(orderId)}/status`,
          {
            headers: {
              "Authorization": "Basic " +
                btoa(env.MIDTRANS_SERVER_KEY + ":"),
              "Accept": "application/json"
            }
          }
        );

        const statusData = await statusResponse.json();

        if (!statusResponse.ok) {
          return respond({
            success: false,
            message: "Gagal memeriksa status Midtrans"
          }, 502);
        }

        if (Number(statusData.gross_amount) !== Number(order.amount)) {
          return respond({
            success: false,
            message: "Jumlah pembayaran tidak sesuai"
          }, 400);
        }

        const paid =
          statusData.transaction_status === "settlement" ||
          (
            statusData.transaction_status === "capture" &&
            statusData.fraud_status === "accept"
          );

        if (paid) {
          await env.DB.prepare(
            `UPDATE orders
            SET status = 'paid', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`
          ).bind(orderId).run();

          await env.DB.prepare(
            `UPDATE inventory
            SET status = 'sold'
            WHERE order_id = ?`
          ).bind(orderId).run();

        } else if (
          ["expire", "cancel", "deny"].includes(
            statusData.transaction_status
          )
        ) {
          await env.DB.prepare(
            `UPDATE orders
            SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`
          ).bind(orderId).run();

          await env.DB.prepare(
            `UPDATE inventory
            SET status = 'available', order_id = NULL
            WHERE order_id = ?`
          ).bind(orderId).run();
        }

        return respond({
          success: true,
          message: "Notifikasi berhasil diproses"
        });
      }

      // DETAIL PESANAN DAN PENGIRIMAN AKUN
      const orderMatch = url.pathname.match(
        /^\/api\/orders\/([^/]+)$/
      );

      if (orderMatch && request.method === "GET") {
        const orderId = orderMatch[1];

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
          `SELECT * FROM orders
          WHERE id = ? AND access_token_hash = ?`
        ).bind(orderId, tokenHash).first();

        if (!order) {
          return respond({
            success: false,
            message: "Pesanan tidak ditemukan"
          }, 404);
        }

        if (
          !["paid", "processing", "completed"].includes(order.status)
        ) {
          return respond({
            success: true,
            status: order.status,
            message: "Akun tersedia setelah pembayaran terverifikasi"
          });
        }

        if (!env.ACCOUNT_ENCRYPTION_KEY) {
          return respond({
            success: false,
            message: "Kunci enkripsi tidak tersedia"
          }, 500);
        }

        const stock = await env.DB.prepare(
          "SELECT * FROM inventory WHERE id = ?"
        ).bind(order.inventory_id).first();

        if (!stock) {
          return respond({
            success: false,
            message: "Data akun tidak ditemukan"
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
          success: true,
          status: order.status,
          account_email: stock.account_email,
          password: new TextDecoder().decode(decrypted)
        });
      }

      // TAMPILKAN WEBSITE
      return env.ASSETS.fetch(request);

    } catch (error) {
      return respond({
        success: false,
        message: "Terjadi kesalahan server",
        detail: error.message
      }, 500);
    }
  }
};

// UBAH HEX MENJADI BYTE
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

// UBAH BYTE MENJADI HEX
function bytesToHex(bytes) {
  return Array.from(
    bytes,
    b => b.toString(16).padStart(2, "0")
  ).join("");
}

// HASH TOKEN PESANAN
async function sha256(value) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return bytesToHex(new Uint8Array(hash));
}
