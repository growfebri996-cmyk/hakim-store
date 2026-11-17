
const PRODUCTS = {
  safeban: { name: "Akun SAFEBAN", price: 30000 },
  paket1: { name: "Paket 1 - Starter", price: 70000 },
  paket2: { name: "Paket 2 - Pro", price: 150000 },
  paket3: { name: "Paket 3 - Elite", price: 300000 }
};

const SITE_ORIGIN = "https://hakim-store.growfebri996.workers.dev";

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
      // CEK STATUS PESANAN
if (
  url.pathname === "/api/admin/check-order" &&
  request.method === "GET"
) {
  const token = request.headers.get("Authorization") || "";

  if (
    !env.ADMIN_TOKEN ||
    token.trim() !== `Bearer ${env.ADMIN_TOKEN.trim()}`
  ) {
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
    `SELECT id, product_id, amount, status, inventory_id
     FROM orders WHERE id = ?`
  ).bind(orderId).first();

  if (!order) {
    return respond({
      success: false,
      message: "Pesanan tidak ditemukan"
    }, 404);
  }

  const stock = await env.DB.prepare(
    `SELECT status FROM inventory WHERE id = ?`
  ).bind(order.inventory_id).first();

  const midtransResponse = await fetch(
  `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(notification.transaction_id)}/status`,
  {
    headers: {
      "Authorization": "Basic " +
        btoa(env.MIDTRANS_SERVER_KEY + ":"),
      "Accept": "application/json"
    }
  }
);

const midtransText = await midtransResponse.text();

return respond({
  success: true,
  order_id: order.id,
  order_status: order.status,
  stock_status: stock?.status || "not_found",
  midtrans_http_status: midtransResponse.status,
  midtrans_response: midtransText
});
}
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

      // TAMBAH STOK
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

      // BUAT PESANAN DAN PEMBAYARAN
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

        // Cari stok tersedia
        const stock = await env.DB.prepare(
          `SELECT * FROM inventory
          WHERE product_id = ? AND status = 'available'
          LIMIT 1`
        ).bind(productId).first();

        if (!stock) {
          return respond({
            success: false,
            message: "Stok akun sedang habis"
          }, 409);
        }

        // Buat ID lebih dulu agar stok terkunci dengan ID pesanan yang benar
        const orderId = "HS-" + crypto.randomUUID();

        const reserve = await env.DB.prepare(
          `UPDATE inventory
          SET status = 'reserved', order_id = ?
          WHERE id = ? AND status = 'available'`
        ).bind(orderId, stock.id).run();

        if (!reserve.meta || reserve.meta.changes !== 1) {
          return respond({
            success: false,
            message: "Stok baru saja dipesan orang lain. Coba lagi."
          }, 409);
        }

        try {
          const accessToken = bytesToHex(
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
                },
                callbacks: {
                  finish: SITE_ORIGIN + "/?pesanan=" + encodeURIComponent(orderId),
                  error: SITE_ORIGIN + "/?pesanan=" + encodeURIComponent(orderId),
                  pending: SITE_ORIGIN + "/?pesanan=" + encodeURIComponent(orderId)
                }
              })
            }
          );

          const paymentText = await payment.text();

          let paymentData;
          try {
            paymentData = JSON.parse(paymentText);
          } catch {
            paymentData = {};
          }

          if (!payment.ok || !paymentData.redirect_url) {
            await env.DB.prepare(
              `UPDATE inventory
              SET status = 'available', order_id = NULL
              WHERE id = ? AND order_id = ? AND status = 'reserved'`
            ).bind(stock.id, orderId).run();

            await env.DB.prepare(
              "DELETE FROM orders WHERE id = ? AND status = 'pending'"
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
          // Lepaskan stok jika proses pembuatan pesanan gagal
          await env.DB.prepare(
            `UPDATE inventory
            SET status = 'available', order_id = NULL
            WHERE id = ? AND order_id = ? AND status = 'reserved'`
          ).bind(stock.id, orderId).run();

          await env.DB.prepare(
            "DELETE FROM orders WHERE id = ? AND status = 'pending'"
          ).bind(orderId).run();

          throw error;
        }
      }

      // WEBHOOK MIDTRANS
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
        const statusCode = notification.status_code;
        const grossAmount = notification.gross_amount;
        const signature = notification.signature_key;

        if (
          typeof orderId !== "string" ||
          typeof statusCode !== "string" ||
          typeof grossAmount !== "string" ||
          typeof signature !== "string"
        ) {
          return respond({
            success: false,
            message: "Data notifikasi tidak lengkap"
          }, 400);
        }

        // Verifikasi signature dari Midtrans
        console.log("KEY CHECK", {
  keyExists: !!env.MIDTRANS_SERVER_KEY,
  keyLength: env.MIDTRANS_SERVER_KEY?.length,
  keyHasWhitespace:
    env.MIDTRANS_SERVER_KEY !== env.MIDTRANS_SERVER_KEY?.trim()
});
        const signatureInput =
          orderId +
          statusCode +
          grossAmount +
          env.MIDTRANS_SERVER_KEY;

        const expectedSignature = await sha512(signatureInput);

const signatureInput2 =
  orderId +
  statusCode +
  grossAmount +
  env.MIDTRANS_SIGNATURE_SECRET_KEY;

const expectedSignature2 = await sha512(signatureInput2);

console.log("SIGNATURE COMPARE", {
  serverKeyExists: !!env.MIDTRANS_SERVER_KEY,
  signatureSecretExists: !!env.MIDTRANS_SIGNATURE_SECRET_KEY,
  serverKeyMatch:
    signature.toLowerCase() === expectedSignature.toLowerCase(),
  signatureSecretMatch:
    signature.toLowerCase() === expectedSignature2.toLowerCase()
});
        console.log("WEBHOOK DEBUG", {
  orderId,
  statusCode,
  grossAmount,
  merchantIdReceived: notification.merchant_id,
  transactionStatus: notification.transaction_status,
  signatureReceivedLength: signature.length,
  signatureExpectedLength: expectedSignature.length,
  signatureMatch:
  signature.toLowerCase() === expectedSignature2.toLowerCase()
});

        
if (
  signature.toLowerCase() !== expectedSignature2.toLowerCase()
) {
  return respond({
    success: false,
    message: "Signature notifikasi tidak valid"
  }, 403);
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

        // Cek status langsung ke server Midtrans
        
const transactionId = notification.transaction_id;

if (!transactionId) {
  return respond({
    success: false,
    message: "Transaction ID tidak ditemukan dalam notifikasi"
  }, 400);
}


const transactionId = notification.transaction_id;

if (!transactionId) {
  return respond({
    success: false,
    message: "Transaction ID tidak ditemukan dalam notifikasi"
  }, 400);
}

const statusResponse = await fetch(
  `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(transactionId)}/status`,
  {
    headers: {
      "Authorization": "Basic " +
        btoa(env.MIDTRANS_SERVER_KEY + ":"),
      "Accept": "application/json"
    }
  }
);


const statusText = await statusResponse.text();

let statusData = {};

try {
  statusData = JSON.parse(statusText);
} catch {
  statusData = {};
}

console.log("MIDTRANS STATUS CHECK", {
  httpStatus: statusResponse.status,
  orderId: statusData.order_id,
  transactionStatus: statusData.transaction_status,
  statusCode: statusData.status_code,
  message: statusData.status_message
});

if (!statusResponse.ok) {
  return respond({
    success: false,
    message: "Gagal memeriksa status Midtrans",
    midtrans_http_status: statusResponse.status,
    midtrans_error: statusText
  }, 502);
}


        if (!statusResponse.ok) {
  const errorText = await statusResponse.text();

  return respond({
    success: false,
    message: "Gagal memeriksa status Midtrans",
    midtrans_http_status: statusResponse.status,
    midtrans_error: errorText
  }, 502);
}

        if (
          statusData.order_id !== orderId ||
          Number(statusData.gross_amount) !== Number(order.amount) ||
          statusData.currency !== "IDR"
        ) {
          return respond({
            success: false,
            message: "Data pembayaran tidak sesuai"
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
            WHERE id = ? AND status = 'pending'`
          ).bind(orderId).run();

          await env.DB.prepare(
            `UPDATE inventory
            SET status = 'sold'
            WHERE order_id = ? AND status = 'reserved'`
          ).bind(orderId).run();

        } else if (
          ["expire", "cancel", "deny"].includes(
            statusData.transaction_status
          )
        ) {
          await env.DB.prepare(
            `UPDATE orders
            SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'pending'`
          ).bind(orderId).run();

          await env.DB.prepare(
            `UPDATE inventory
            SET status = 'available', order_id = NULL
            WHERE order_id = ? AND status = 'reserved'`
          ).bind(orderId).run();
        }

        return respond({
          success: true,
          message: "Notifikasi berhasil diverifikasi dan diproses"
        });
      }

      // DETAIL PESANAN DAN PENGIRIMAN AKUN
      const orderMatch = url.pathname.match(
        /^\/api\/orders\/([^/]+)$/
      );

      if (orderMatch && request.method === "GET") {
        const orderId = decodeURIComponent(orderMatch[1]);

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

        const base = {
          success: true,
          order_id: order.id,
          product: PRODUCTS[order.product_id]?.name || order.product_id,
          buyer: order.buyer,
          amount: order.amount,
          status: order.status
        };

        if (
          !["paid", "processing", "completed"].includes(order.status)
        ) {
          return respond({
            ...base,
            message: order.status === "cancelled"
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
          "SELECT * FROM inventory WHERE id = ?"
        ).bind(order.inventory_id).first();

        if (!stock) {
          return respond({
            success: false,
            message: "Data akun tidak ditemukan"
          }, 404);
        }

        const keyBytes = hexToBytes(env.ACCOUNT_ENCRYPTION_KEY);

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

      // WEBSITE STATIS
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

// HEX KE BYTE
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

// BYTE KE HEX
function bytesToHex(bytes) {
  return Array.from(
    bytes,
    b => b.toString(16).padStart(2, "0")
  ).join("");
}

// SHA-256 UNTUK TOKEN PESANAN
async function sha256(value) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return bytesToHex(new Uint8Array(hash));
}

// SHA-512 UNTUK SIGNATURE MIDTRANS
async function sha512(value) {
  const hash = await crypto.subtle.digest(
    "SHA-512",
    new TextEncoder().encode(value)
  );

  return bytesToHex(new Uint8Array(hash));
}
