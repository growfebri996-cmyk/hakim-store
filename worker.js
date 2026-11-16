
const PRODUCTS = {
  safeban: {
    name: "Akun SAFEBAN",
    price: 30000
  },
  starter: {
    name: "Paket 1 - Starter",
    price: 70000
  },
  pro: {
    name: "Paket 2 - Pro",
    price: 150000
  },
  elite: {
    name: "Paket 3 - Elite",
    price: 300000
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        success: true,
        message: "HAKIM STORE backend aktif",
        database: Boolean(env.DB)
      });
    }

    if (url.pathname === "/api/products" && request.method === "GET") {
      return Response.json({
        success: true,
        products: PRODUCTS
      });
    }

    if (url.pathname === "/api/orders" && request.method === "POST") {
      return Response.json({
        success: false,
        message: "Sistem pembayaran belum dikonfigurasi. Silakan lanjutkan setup database dan Midtrans."
      }, { status: 503 });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        success: false,
        message: "API tidak ditemukan"
      }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
