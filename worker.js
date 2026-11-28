const STREAMER_HTML = `
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HAKIM STORE - STREAMER</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b0b12;color:#eee;font-family:Arial,sans-serif}
main{max-width:900px;margin:30px auto;padding:16px}
.card{background:#151522;border:1px solid #29293b;border-radius:14px;padding:20px;margin-bottom:16px}
h2,h3{margin-top:0}
p{color:#aaa}
input{width:100%;padding:13px;margin:8px 0;background:#0b0b12;color:white;border:1px solid #35354a;border-radius:8px}
button{padding:11px 15px;border:0;border-radius:8px;background:#7655d9;color:white;font-weight:bold;cursor:pointer;margin:4px}
button.secondary{background:#35354a}
button.danger{background:#a83246}
button:disabled{opacity:.5}
.hidden{display:none}
.item{background:#0d0d17;border:1px solid #303044;border-radius:10px;padding:14px;margin-top:10px}
.info{font-size:13px;color:#aaa;line-height:1.8}
.value{color:#fff;word-break:break-all}
#msg,#loginMsg{font-size:13px;margin-top:12px;color:#d4c6ff}
.stats{display:flex;gap:10px;flex-wrap:wrap}
.stat{flex:1;min-width:120px;background:#0d0d17;padding:15px;border-radius:10px}
.stat strong{display:block;font-size:24px;margin-top:7px}
.top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
</style>
</head>
<body>
<main>

<div id="loginPanel" class="card">
<h2 style="text-align:center">HAKIM STORE</h2>
<p style="text-align:center">STREAMER PANEL</p>
<h3>Login Streamer</h3>
<input id="username" placeholder="Username">
<input id="password" type="password" placeholder="Password">
<button style="width:100%" onclick="loginStreamer()">LOGIN STREAMER</button>
<div id="loginMsg"></div>
</div>

<div id="dashboard" class="hidden">
<div class="card">
<div class="top">
<div>
<h2>HAKIM STORE</h2>
<p id="welcome">Dashboard Streamer</p>
</div>
<button class="danger" onclick="logoutStreamer()">LOGOUT</button>
</div>
</div>

<div class="card">
<h3>Ringkasan Stok</h3>
<div class="stats">
<div class="stat">
Stok Tersedia
<strong id="stockCount">0</strong>
</div>
<div class="stat">
Akun Diklaim
<strong id="claimCount">0</strong>
</div>
</div>
<button onclick="loadStock()">REFRESH STOK</button>
<div id="stockList"></div>
</div>

<div class="card">
<h3>Akun Hasil Klaim</h3>
<div id="claimedList" class="info">Belum ada akun yang diklaim.</div>
</div>

<div class="card">
<h3>Riwayat Klaim</h3>
<div id="historyList" class="info">Memuat riwayat...</div>
</div>

<div id="msg"></div>
</div>

</main>

<script>
var streamerToken = localStorage.getItem("streamerToken") || "";
var streamerData = {};

function apiStreamer(path, options){
  options = options || {};
  options.headers = Object.assign({}, options.headers || {}, {
    "Authorization": "Bearer " + streamerToken
  });

  return fetch(path, options).then(async function(response){
    var data = await response.json();
    if(!response.ok || !data.success){
      throw new Error(data.message || "Terjadi kesalahan");
    }
    return data;
  });
}

function showDashboard(){
  document.getElementById("loginPanel").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
}

function showLogin(){
  document.getElementById("loginPanel").classList.remove("hidden");
  document.getElementById("dashboard").classList.add("hidden");
}

async function loginStreamer(){
  var username = document.getElementById("username").value.trim();
  var password = document.getElementById("password").value;
  var msg = document.getElementById("loginMsg");

  if(!username || !password){
    msg.textContent = "Isi username dan password";
    return;
  }

  msg.textContent = "Memproses login...";

  try{
    var response = await fetch("/api/streamer/login", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username:username,password:password})
    });

    var data = await response.json();

    if(!response.ok || !data.success){
      throw new Error(data.message || "Login gagal");
    }

    streamerToken = data.token;
    localStorage.setItem("streamerToken", streamerToken);
    localStorage.setItem("streamerData", JSON.stringify(data.streamer));

    await startDashboard();

  }catch(error){
    msg.textContent = error.message;
  }
}

async function startDashboard(){
  try{
    var data = await apiStreamer("/api/streamer/me");
    streamerData = data.streamer;

    document.getElementById("welcome").textContent =
      "Login sebagai: " + streamerData.username;

    showDashboard();

    await loadStock();
    await loadClaims();

  }catch(error){
    logoutStreamer();
    document.getElementById("loginMsg").textContent = error.message;
  }
}

async function loadStock(){
  var list = document.getElementById("stockList");
  list.innerHTML = "Memuat stok...";

  try{
    var data = await apiStreamer("/api/streamer/stock");
    var stock = data.stock || [];

    document.getElementById("stockCount").textContent = stock.length;

    if(stock.length === 0){
      list.innerHTML = "<p>Stok sedang kosong.</p>";
      return;
    }

    list.innerHTML = "";

    stock.forEach(function(item){
      var div = document.createElement("div");
      div.className = "item";

      var product = document.createElement("div");
      product.className = "info";
      product.textContent = "Produk: " + item.product_id;

      var id = document.createElement("div");
      id.className = "info";
      id.textContent = "ID Stok: " + item.id;

      var button = document.createElement("button");
      button.textContent = "KLAIM AKUN";
      button.onclick = function(){
        claimAccount(item.id);
      };

      div.appendChild(product);
      div.appendChild(id);
      div.appendChild(button);
      list.appendChild(div);
    });

  }catch(error){
    list.textContent = error.message;
  }
}

async function claimAccount(id){
  if(!confirm("Klaim akun ini? Stok akan diambil dari persediaan bersama.")){
    return;
  }

  document.getElementById("msg").textContent = "Memproses klaim...";

  try{
    var data = await apiStreamer("/api/streamer/claim/" + id, {
      method:"POST"
    });

    document.getElementById("msg").textContent = "Akun berhasil diklaim.";

    await loadStock();
    await loadClaims();

    alert(
      "KLAIM BERHASIL\\n\\nEmail: " +
      data.account.account_email +
      "\\nPassword: " +
      data.account.password
    );

  }catch(error){
    document.getElementById("msg").textContent = error.message;
    await loadStock();
  }
}

function copyText(value){
  navigator.clipboard.writeText(value).then(function(){
    alert("Berhasil disalin");
  }).catch(function(){
    prompt("Salin teks berikut:", value);
  });
}

async function loadClaims(){
  var list = document.getElementById("claimedList");
  var history = document.getElementById("historyList");

  list.textContent = "Memuat akun...";
  history.textContent = "Memuat riwayat...";

  try{
    var data = await apiStreamer("/api/streamer/claims");
    var claims = data.claims || [];
    var active = claims.filter(function(item){
      return item.status === "claimed";
    });

    document.getElementById("claimCount").textContent = active.length;

    list.innerHTML = "";
    history.innerHTML = "";

    if(active.length === 0){
      list.textContent = "Belum ada akun aktif yang diklaim.";
    }

    active.forEach(function(item){
      var div = document.createElement("div");
      div.className = "item";

      var title = document.createElement("strong");
      title.textContent = "Akun #" + item.id;

      var email = document.createElement("div");
      email.className = "info";
      email.textContent = "Email: " + (item.account_email || "-");

      var password = document.createElement("div");
      password.className = "info";
      password.textContent = "Password: " + (item.password || "-");

      var copyEmail = document.createElement("button");
      copyEmail.textContent = "SALIN EMAIL";
      copyEmail.onclick = function(){
        copyText(item.account_email || "");
      };

      var copyPassword = document.createElement("button");
      copyPassword.textContent = "SALIN PASSWORD";
      copyPassword.onclick = function(){
        copyText(item.password || "");
      };

      div.appendChild(title);
      div.appendChild(email);
      div.appendChild(password);
      div.appendChild(copyEmail);
      div.appendChild(copyPassword);
      list.appendChild(div);
    });

    if(claims.length === 0){
      history.textContent = "Belum ada riwayat klaim.";
    }else{
      claims.forEach(function(item){
        var div = document.createElement("div");
        div.className = "item";
        div.textContent =
          "ID Klaim: " + item.id +
          " | Produk: " + item.product_id +
          " | Status: " + item.status;
        history.appendChild(div);
      });
    }

  }catch(error){
    list.textContent = error.message;
    history.textContent = error.message;
  }
}

function logoutStreamer(){
  localStorage.removeItem("streamerToken");
  localStorage.removeItem("streamerData");
  streamerToken = "";
  streamerData = {};
  showLogin();
}

if(streamerToken){
  startDashboard();
}else{
  showLogin();
}
</script>
</body>
</html>
`;
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
<button type="button" onclick="loginAdmin()">LOGIN</button>
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
<textarea
  id="email"
  placeholder="Masukkan email, satu email setiap baris"
  rows="7"
  style="width:100%;padding:12px;resize:vertical"
></textarea>
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
<option value="claimed">Diklaim Streamer</option>
</select>

<div class="wrap"><table>
<thead>
<tr>
<th>ID</th>
<th>Produk</th>
<th>Akun</th>
<th>Status</th>
<th>Order</th>
</tr>
</thead>
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

<!-- ================================= -->
<!-- MANAJEMEN STREAMER -->
<!-- ================================= -->

<h3>Manajemen Streamer</h3>

<div class="card">
  <h4>Tambah Akun Streamer</h4>

  <input
    id="newStreamerUsername"
    placeholder="Username streamer"
  >

  <input
    id="newStreamerPassword"
    type="password"
    placeholder="Password minimal 10 karakter"
  >

  <button onclick="createStreamer()">
    BUAT AKUN STREAMER
  </button>

  <div id="streamerMsg"></div>
</div>

<div class="card">
  <h4>Daftar Streamer</h4>

  <button onclick="loadStreamers()">
    REFRESH STREAMER
  </button>

  <div class="wrap">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Username</th>
          <th>Status</th>
          <th>Klaim Aktif</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody id="streamers">
        <tr>
          <td colspan="5">Belum dimuat</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<h3>Riwayat Klaim Streamer</h3>

<div class="card">
  <select
    id="claimFilter"
    onchange="loadStreamerClaims()"
  >
    <option value="all">Semua klaim</option>
    <option value="claimed">Masih diklaim</option>
    <option value="returned">Sudah dikembalikan</option>
  </select>

  <button onclick="loadStreamerClaims()">
    REFRESH RIWAYAT
  </button>

  <div class="wrap">
    <table>
      <thead>
        <tr>
          <th>ID Klaim</th>
          <th>Streamer</th>
          <th>ID Akun</th>
          <th>Email Akun</th>
          <th>Status</th>
          <th>Tanggal</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody id="streamerClaims">
        <tr>
          <td colspan="7">Belum dimuat</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div id="claimMsg"></div>
</div>

</div>
</main>
<script>
alert("JAVASCRIPT ADMIN DIMUAT");
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
  alert("LOGIN ADMIN TERPANGGIL");

  adminToken = document.getElementById("token").value.trim();
if(!adminToken){
  document.getElementById("msg").textContent = "Masukkan token admin!";
  return;
}

document.getElementById("msg").textContent = "Memeriksa token...";

  try{
    var d = await api("/api/admin/dashboard");

    var p = await fetch("/api/products");

if(!p.ok){
  throw new Error("Gagal memuat daftar produk");
}

var productData = await p.json();
products = productData.products || {};

document.getElementById("login").classList.add("hidden");
document.getElementById("app").classList.remove("hidden");

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
document.getElementById("login").classList.remove("hidden");
document.getElementById("app").classList.add("hidden");
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
    await loadStreamers();
await loadStreamerClaims();
  }catch(e){
    alert(e.message);
  }
}



async function addStock(){
  var product_id = document.getElementById("product").value;
  var emailText = document.getElementById("email").value.trim();
  var password = document.getElementById("password").value;

  var account_emails = emailText
    .split(String.fromCharCode(10))
    .map(function(email){
      return email.trim();
    })
    .filter(function(email){
      return email.length > 0;
    });

  if(account_emails.length === 0 || !password){
    alert("Email dan password wajib diisi");
    return;
  }

  if(!confirm(
    "Tambahkan " + account_emails.length +
    " akun dengan satu password yang sama?"
  )) return;

  try{
    var d = await api("/api/admin/stock",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        product_id:product_id,
        account_emails:account_emails,
        password:password
      })
    });

    document.getElementById("stockmsg").textContent =
      d.message || "Stok berhasil ditambahkan";

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
        var statusText = x.status === "claimed"
          ? "Diklaim Streamer"
          : x.status;

        var accountInfo = esc(x.account_email);

        if(x.streamer_username){
          accountInfo += "<br><small>Streamer: " +
            esc(x.streamer_username) + "</small>";
        }

        return "<tr><td>" + esc(x.id) +
          "</td><td>" + esc(products[x.product_id] ? products[x.product_id].name : x.product_id) +
          "</td><td>" + accountInfo +
          "</td><td>" + esc(statusText) +
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


// =====================================
// ADMIN STREAMER MANAGEMENT
// =====================================

// MEMBUAT STREAMER
async function createStreamer(){
  const username =
    document.getElementById("newStreamerUsername").value.trim();

  const password =
    document.getElementById("newStreamerPassword").value;

  const msg =
    document.getElementById("streamerMsg");

  if(!username || !password){
    msg.textContent = "Username dan password wajib diisi";
    return;
  }

  if(!confirm("Buat akun streamer ini?")) return;

  try{
    const d = await api("/api/admin/streamers",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username,password})
    });

    msg.textContent = d.message;

    document.getElementById("newStreamerUsername").value = "";
    document.getElementById("newStreamerPassword").value = "";

    await loadStreamers();

  }catch(e){
    msg.textContent = e.message;
  }
}


// MEMUAT DAFTAR STREAMER
async function loadStreamers(){
  try{
    const d = await api("/api/admin/streamers");

    document.getElementById("streamers").innerHTML =
      (d.streamers || []).map(function(s){
        const nextStatus = s.status === "active" ? "suspended" : "active";
        const action = s.status === "active" ? "SUSPEND" : "AKTIFKAN";

        return "<tr>" +
          "<td>" + esc(s.id) + "</td>" +
          "<td>" + esc(s.username) + "</td>" +
          "<td>" + esc(s.status) + "</td>" +
          "<td>" + esc(s.active_claims) + "</td>" +
          "<td><button onclick=\\"changeStreamerStatus(" + Number(s.id) + ",'" + nextStatus + "')\\">" + action + "</button></td>" +
          "</tr>";
      }).join("") ||
      "<tr><td colspan='5'>Belum ada streamer</td></tr>";

  }catch(e){
    document.getElementById("streamers").innerHTML =
      "<tr><td colspan='5'>" + esc(e.message) + "</td></tr>";
  }
}

// AKTIFKAN / SUSPEND STREAMER
async function changeStreamerStatus(id,status){
  const action =
    status === "active" ? "mengaktifkan" : "menonaktifkan";

  if(!confirm("Yakin ingin " + action + " streamer ini?")){
    return;
  }

  try{
    const d = await api(
      "/api/admin/streamers/" + id + "/status",
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({status})
      }
    );

    alert(d.message);
    await loadStreamers();

  }catch(e){
    alert(e.message);
  }
}


// MEMUAT RIWAYAT KLAIM
async function loadStreamerClaims(){
  try{
    const status =
      document.getElementById("claimFilter").value;

    const d = await api(
      "/api/admin/streamer-claims?status=" +
      encodeURIComponent(status)
    );

    document.getElementById("streamerClaims").innerHTML =
      (d.claims || []).map(function(c){
        let action = "-";

        if(c.claim_status === "claimed"){
  action =
  "<button onclick=\\"returnStreamerClaim(" +
  Number(c.claim_id) +
  ")\\">KEMBALIKAN</button>";
}

        return "<tr>" +
          "<td>" + esc(c.claim_id) + "</td>" +
          "<td>" + esc(c.username) + "</td>" +
          "<td>" + esc(c.inventory_id) + "</td>" +
          "<td>" + esc(c.account_email) + "</td>" +
          "<td>" + esc(c.claim_status) + "</td>" +
          "<td>" + esc(c.claimed_at) + "</td>" +
          "<td>" + action + "</td>" +
          "</tr>";
      }).join("") ||
      "<tr><td colspan='7'>Belum ada riwayat klaim</td></tr>";

  }catch(e){
    document.getElementById("streamerClaims").innerHTML =
      "<tr><td colspan='7'>" + esc(e.message) + "</td></tr>";
  }
}


// ADMIN MENGEMBALIKAN AKUN
async function returnStreamerClaim(id){
  if(!confirm(
    "Kembalikan akun ini ke stok penjualan?"
  )){
    return;
  }

  try{
    const d = await api(
      "/api/admin/streamer-claims/" + id + "/return",
      {
        method:"POST"
      }
    );

    document.getElementById("claimMsg").textContent =
      d.message;

    await loadStreamerClaims();
    await loadStreamers();
    await refreshAll();

  }catch(e){
    document.getElementById("claimMsg").textContent =
      e.message;
  }
}


function logout(){
  adminToken = "";
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login").classList.remove("hidden");
  document.getElementById("token").value = "";
  document.getElementById("msg").textContent = "";
}

window.loginAdmin = loginAdmin;
</script>
</body>
</html>`;

const PRODUCTS = {
  safeban: { name: "Akun SAFEBAN", price: 30000 },
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

    if (
  url.pathname === "/streamer" ||
  url.pathname === "/streamer.html"
) {
  return new Response(STREAMER_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
    }

    if (
  url.pathname === "/admin" ||
  url.pathname === "/admin.html"
) {
  return new Response(ADMIN_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
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

      
// =====================================
// STREAMER AUTHENTICATION API
// =====================================

// STREAMER LOGIN
if (
  url.pathname === "/api/streamer/login" &&
  request.method === "POST"
) {
  const body = await request.json();

  const username =
    typeof body.username === "string"
      ? body.username.trim().toLowerCase()
      : "";

  const password =
    typeof body.password === "string"
      ? body.password
      : "";

  if (!username || !password) {
    return respond({
      success: false,
      message: "Username dan password wajib diisi"
    }, 400);
  }

  const streamer = await env.DB.prepare(`
    SELECT id, username, password_hash, status
    FROM streamers
    WHERE username = ?
    LIMIT 1
  `).bind(username).first();

  if (
    !streamer ||
    streamer.status !== "active" ||
    !(await verifyStreamerPassword(
      password,
      streamer.password_hash
    ))
  ) {
    return respond({
      success: false,
      message: "Username atau password salah"
    }, 401);
  }

  const sessionToken = bytesToHex(
    crypto.getRandomValues(new Uint8Array(32))
  );

  const tokenHash = await sha256(sessionToken);

  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  await env.DB.prepare(`
    INSERT INTO streamer_sessions
    (streamer_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).bind(
    streamer.id,
    tokenHash,
    expiresAt
  ).run();

  return respond({
    success: true,
    message: "Login berhasil",
    token: sessionToken,
    streamer: {
      id: streamer.id,
      username: streamer.username
    },
    expires_at: expiresAt
  });
}


// STREAMER SESSION CHECK
if (
  url.pathname === "/api/streamer/me" &&
  request.method === "GET"
) {
  const streamer = await getStreamerSession(
    request,
    env
  );

  if (!streamer) {
    return respond({
      success: false,
      message: "Sesi login tidak valid atau sudah berakhir"
    }, 401);
  }

  return respond({
    success: true,
    streamer: {
      id: streamer.id,
      username: streamer.username
    }
  });
}


// STREAMER LOGOUT
if (
  url.pathname === "/api/streamer/logout" &&
  request.method === "POST"
) {
  const token = getBearerToken(request);

  if (token) {
    await env.DB.prepare(`
      DELETE FROM streamer_sessions
      WHERE token_hash = ?
    `).bind(await sha256(token)).run();
  }

  return respond({
    success: true,
    message: "Logout berhasil"
  });
}


// ADMIN: LIST STREAMERS
if (
  url.pathname === "/api/admin/streamers" &&
  request.method === "GET"
) {
  if (!isAdmin(request, env)) {
    return respond({
      success: false,
      message: "Akses admin ditolak"
    }, 401);
  }

  const result = await env.DB.prepare(`
    SELECT
      s.id,
      s.username,
      s.status,
      s.created_at,
      COUNT(
        CASE WHEN c.status = 'claimed' THEN 1 END
      ) AS active_claims
    FROM streamers s
    LEFT JOIN streamer_claims c
      ON c.streamer_id = s.id
    GROUP BY s.id
    ORDER BY s.id DESC
  `).all();

  return respond({
    success: true,
    streamers: result.results || []
  });
}


// ADMIN: CREATE STREAMER
if (
  url.pathname === "/api/admin/streamers" &&
  request.method === "POST"
) {
  if (!isAdmin(request, env)) {
    return respond({
      success: false,
      message: "Akses admin ditolak"
    }, 401);
  }

  const body = await request.json();

  const username =
    typeof body.username === "string"
      ? body.username.trim().toLowerCase()
      : "";

  const password =
    typeof body.password === "string"
      ? body.password
      : "";

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return respond({
      success: false,
      message: "Username harus 3-30 karakter, hanya huruf, angka, dan underscore"
    }, 400);
  }

  if (password.length < 10 || password.length > 128) {
    return respond({
      success: false,
      message: "Password harus 10-128 karakter"
    }, 400);
  }

  const existing = await env.DB.prepare(`
    SELECT id FROM streamers WHERE username = ?
  `).bind(username).first();

  if (existing) {
    return respond({
      success: false,
      message: "Username sudah digunakan"
    }, 409);
  }

  const passwordHash = await hashStreamerPassword(
    password
  );

  await env.DB.prepare(`
    INSERT INTO streamers
    (username, password_hash, status)
    VALUES (?, ?, 'active')
  `).bind(
    username,
    passwordHash
  ).run();

  return respond({
    success: true,
    message: "Akun streamer berhasil dibuat",
    username
  });
}


// ADMIN: CHANGE STREAMER STATUS
const streamerStatusMatch =
  url.pathname.match(
    /^\/api\/admin\/streamers\/(\d+)\/status$/
  );

if (
  streamerStatusMatch &&
  request.method === "POST"
) {
  if (!isAdmin(request, env)) {
    return respond({
      success: false,
      message: "Akses admin ditolak"
    }, 401);
  }

  const streamerId = Number(streamerStatusMatch[1]);
  const body = await request.json();
  const status = body.status;

  if (!["active", "suspended"].includes(status)) {
    return respond({
      success: false,
      message: "Status tidak valid"
    }, 400);
  }

  const result = await env.DB.prepare(`
    UPDATE streamers
    SET status = ?
    WHERE id = ?
  `).bind(status, streamerId).run();

  if (!result.meta || result.meta.changes !== 1) {
    return respond({
      success: false,
      message: "Streamer tidak ditemukan"
    }, 404);
  }

  // Hapus semua sesi saat streamer dinonaktifkan
  if (status === "suspended") {
    await env.DB.prepare(`
      DELETE FROM streamer_sessions
      WHERE streamer_id = ?
    `).bind(streamerId).run();
  }

  return respond({
    success: true,
    message: status === "active"
      ? "Streamer berhasil diaktifkan"
      : "Streamer berhasil dinonaktifkan"
  });
}

      
// =====================================
// STREAMER INVENTORY & CLAIM API
// =====================================


// STREAMER: LIHAT STOK TERSEDIA
if (
  url.pathname === "/api/streamer/stock" &&
  request.method === "GET"
) {
  const streamer = await getStreamerSession(
    request,
    env
  );

  if (!streamer) {
    return respond({
      success: false,
      message: "Silakan login kembali"
    }, 401);
  }

  const result = await env.DB.prepare(`
    SELECT
      id,
      product_id,
      account_email,
      created_at
    FROM inventory
    WHERE status = 'available'
    ORDER BY id ASC
  `).all();

  return respond({
    success: true,
    stock: result.results || []
  });
}


// STREAMER: KLAIM AKUN
const streamerClaimMatch =
  url.pathname.match(
    /^\/api\/streamer\/claim\/(\d+)$/
  );

if (
  streamerClaimMatch &&
  request.method === "POST"
) {
  const streamer = await getStreamerSession(
    request,
    env
  );

  if (!streamer) {
    return respond({
      success: false,
      message: "Silakan login kembali"
    }, 401);
  }

  const inventoryId = Number(
    streamerClaimMatch[1]
  );

  if (
    !Number.isSafeInteger(inventoryId) ||
    inventoryId <= 0
  ) {
    return respond({
      success: false,
      message: "ID akun tidak valid"
    }, 400);
  }

  // Ambil stok hanya jika masih tersedia.
  const stock = await env.DB.prepare(`
    SELECT
      id,
      product_id,
      account_email,
      password_cipher,
      password_iv,
      status
    FROM inventory
    WHERE id = ?
      AND status = 'available'
    LIMIT 1
  `).bind(inventoryId).first();

  if (!stock) {
    return respond({
      success: false,
      message: "Akun sudah diklaim atau tidak tersedia"
    }, 409);
  }

  // Kunci stok dengan perubahan status bersyarat.
  const update = await env.DB.prepare(`
    UPDATE inventory
    SET status = 'claimed',
        order_id = NULL
    WHERE id = ?
      AND status = 'available'
  `).bind(inventoryId).run();

  if (
    !update.meta ||
    update.meta.changes !== 1
  ) {
    return respond({
      success: false,
      message: "Akun sudah diambil streamer lain atau pembeli"
    }, 409);
  }

  // Catat klaim streamer.
  try {
    await env.DB.prepare(`
      INSERT INTO streamer_claims
      (streamer_id, inventory_id, status, claimed_at)
      VALUES (?, ?, 'claimed', CURRENT_TIMESTAMP)
    `).bind(
      streamer.id,
      inventoryId
    ).run();

  } catch (error) {
    console.error(
      "STREAMER CLAIM INSERT ERROR:",
      error
    );

    // Jangan kembalikan stok jika ternyata
    // sudah ada klaim aktif yang tercatat.
    const existingClaim = await env.DB.prepare(`
      SELECT id
      FROM streamer_claims
      WHERE inventory_id = ?
        AND status = 'claimed'
      LIMIT 1
    `).bind(inventoryId).first();

    if (!existingClaim) {
      await env.DB.prepare(`
        UPDATE inventory
        SET status = 'available'
        WHERE id = ?
          AND status = 'claimed'
      `).bind(inventoryId).run();
    }

    return respond({
      success: false,
      message: "Gagal menyimpan klaim akun"
    }, 500);
  }

  // Dekripsi password setelah klaim berhasil.
  let password;

  try {
    password = await decryptInventoryPassword(
      stock,
      env
    );
  } catch (error) {
    console.error(
      "STREAMER PASSWORD DECRYPT ERROR:",
      error
    );

    return respond({
      success: false,
      message: "Klaim tersimpan, tetapi password gagal dibuka. Hubungi admin."
    }, 500);
  }

  return respond({
    success: true,
    message: "Akun berhasil diklaim",
    account: {
      id: stock.id,
      product_id: stock.product_id,
      account_email: stock.account_email,
      password
    }
  });
}


// STREAMER: RIWAYAT KLAIM SENDIRI
if (
  url.pathname === "/api/streamer/claims" &&
  request.method === "GET"
) {
  const streamer = await getStreamerSession(
    request,
    env
  );

  if (!streamer) {
    return respond({
      success: false,
      message: "Silakan login kembali"
    }, 401);
  }

  const result = await env.DB.prepare(`
    SELECT
      c.id AS claim_id,
      c.inventory_id,
      c.status AS claim_status,
      c.claimed_at,
      c.returned_at,
      i.product_id,
      i.account_email,
      i.password_cipher,
      i.password_iv,
      i.status AS inventory_status
    FROM streamer_claims c
    JOIN inventory i
      ON i.id = c.inventory_id
    WHERE c.streamer_id = ?
    ORDER BY c.id DESC
  `).bind(streamer.id).all();

  const claims = [];

  for (const item of result.results || []) {
    const claim = {
      claim_id: item.claim_id,
      inventory_id: item.inventory_id,
      product_id: item.product_id,
      account_email: item.account_email,
      status: item.claim_status,
      claimed_at: item.claimed_at,
      returned_at: item.returned_at,
    };

    // Password hanya ditampilkan untuk klaim aktif
    // yang masih berstatus claimed di inventory.
    if (
      item.claim_status === "claimed" &&
      item.inventory_status === "claimed"
    ) {
      claim.password = await decryptInventoryPassword(
        item,
        env
      );
    }

    claims.push(claim);
  }

  return respond({
    success: true,
    claims
  });
}

    
// =====================================
// ADMIN: STREAMER CLAIM MANAGEMENT
// =====================================


// ADMIN: MELIHAT SEMUA RIWAYAT KLAIM
if (
  url.pathname === "/api/admin/streamer-claims" &&
  request.method === "GET"
) {
  if (!isAdmin(request, env)) {
    return respond({
      success: false,
      message: "Akses admin ditolak"
    }, 401);
  }

  const status = url.searchParams.get("status") || "all";

  let query = `
    SELECT
      c.id AS claim_id,
      c.streamer_id,
      s.username,
      c.inventory_id,
      c.status AS claim_status,
      datetime(c.claimed_at, '+7 hours') AS claimed_at,
      c.returned_at,
      c.returned_by,
      i.product_id,
      i.account_email,
      i.status AS inventory_status
    FROM streamer_claims c
    JOIN streamers s
      ON s.id = c.streamer_id
    JOIN inventory i
      ON i.id = c.inventory_id
  `;

  if (["claimed", "returned"].includes(status)) {
    query += ` WHERE c.status = ?`;
  }

  query += ` ORDER BY c.id DESC LIMIT 500`;

  const result = ["claimed", "returned"].includes(status)
    ? await env.DB.prepare(query).bind(status).all()
    : await env.DB.prepare(query).all();

  return respond({
    success: true,
    claims: result.results || []
  });
}


// ADMIN: MENGEMBALIKAN AKUN KE STOK
const returnClaimMatch =
  url.pathname.match(
    /^\/api\/admin\/streamer-claims\/(\d+)\/return$/
  );

if (
  returnClaimMatch &&
  request.method === "POST"
) {
  if (!isAdmin(request, env)) {
    return respond({
      success: false,
      message: "Akses admin ditolak"
    }, 401);
  }

  const claimId = Number(returnClaimMatch[1]);

  if (
    !Number.isSafeInteger(claimId) ||
    claimId <= 0
  ) {
    return respond({
      success: false,
      message: "ID klaim tidak valid"
    }, 400);
  }

  const claim = await env.DB.prepare(`
    SELECT
      id,
      inventory_id,
      status
    FROM streamer_claims
    WHERE id = ?
    LIMIT 1
  `).bind(claimId).first();

  if (!claim || claim.status !== "claimed") {
    return respond({
      success: false,
      message: "Klaim tidak ditemukan atau sudah dikembalikan"
    }, 404);
  }

  // Pastikan stok masih berstatus claimed
  const stockUpdate = await env.DB.prepare(`
    UPDATE inventory
    SET status = 'available',
        order_id = NULL
    WHERE id = ?
      AND status = 'claimed'
      AND EXISTS (
        SELECT 1
        FROM streamer_claims
        WHERE id = ?
          AND inventory_id = ?
          AND status = 'claimed'
      )
  `).bind(
    claim.inventory_id,
    claimId,
    claim.inventory_id
  ).run();

  if (
    !stockUpdate.meta ||
    stockUpdate.meta.changes !== 1
  ) {
    return respond({
      success: false,
      message: "Stok tidak dapat dikembalikan. Periksa status akun."
    }, 409);
  }

  // Tandai riwayat klaim sebagai returned
  try {
    const claimUpdate = await env.DB.prepare(`
      UPDATE streamer_claims
      SET status = 'returned',
          returned_at = CURRENT_TIMESTAMP,
          returned_by = 'admin'
      WHERE id = ?
        AND status = 'claimed'
        AND inventory_id = ?
    `).bind(
      claimId,
      claim.inventory_id
    ).run();

    if (
      !claimUpdate.meta ||
      claimUpdate.meta.changes !== 1
    ) {
      throw new Error("Gagal memperbarui riwayat klaim");
    }

  } catch (error) {
    console.error(
      "ADMIN RETURN CLAIM ERROR:",
      error
    );

    // Kembalikan status stok jika pencatatan gagal
    await env.DB.prepare(`
      UPDATE inventory
      SET status = 'claimed'
      WHERE id = ?
        AND status = 'available'
        AND NOT EXISTS (
          SELECT 1
          FROM streamer_claims
          WHERE inventory_id = ?
            AND status = 'claimed'
        )
    `).bind(
      claim.inventory_id,
      claim.inventory_id
    ).run();

    return respond({
      success: false,
      message: "Pengembalian gagal dicatat"
    }, 500);
  }

  return respond({
    success: true,
    message: "Akun berhasil dikembalikan ke stok tersedia",
    inventory_id: claim.inventory_id
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
      i.id,
      i.product_id,
      i.account_email,
      i.status,
      i.order_id,
      s.username AS streamer_username,
      sc.claimed_at AS claimed_at
    FROM inventory i
    LEFT JOIN streamer_claims sc
      ON sc.inventory_id = i.id
      AND sc.status = 'claimed'
    LEFT JOIN streamers s
      ON s.id = sc.streamer_id
    WHERE 1 = 1
  `;

  const bindings = [];

  if (["available", "reserved", "sold", "claimed"].includes(status)) {
    query += ` AND i.status = ?`;
    bindings.push(status);
  }

  if (productId) {
    query += ` AND i.product_id = ?`;
    bindings.push(productId);
  }

  query += ` ORDER BY i.rowid DESC LIMIT 100`;

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
// ADMIN: TAMBAH STOK (BISA BANYAK)
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
  const password = body.password;

  let emails = [];

  if (Array.isArray(body.account_emails)) {
    emails = body.account_emails;
  } else if (typeof body.account_emails === "string") {
    emails = body.account_emails.split(/\r?\n/);
  } else if (typeof body.account_email === "string") {
    // Tetap mendukung fitur tambah satu akun lama
    emails = [body.account_email];
  }

  emails = emails
    .filter(email => typeof email === "string")
    .map(email => email.trim())
    .filter(email => email.length > 0);

  if (
    !PRODUCTS[productId] ||
    emails.length === 0 ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    return respond({
      success: false,
      message: "Produk, email, atau password tidak valid"
    }, 400);
  }

  if (emails.length > 100) {
    return respond({
      success: false,
      message: "Maksimal 100 akun dalam satu kali penambahan"
    }, 400);
  }

  const uniqueEmails = new Set(
    emails.map(email => email.toLowerCase())
  );

  if (uniqueEmails.size !== emails.length) {
    return respond({
      success: false,
      message: "Ada email yang duplikat dalam daftar"
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

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const statements = [];

  for (const email of emails) {
    const iv = crypto.getRandomValues(
      new Uint8Array(12)
    );

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(password)
    );

    statements.push(
      env.DB.prepare(
        `INSERT INTO inventory
         (product_id, account_email, password_cipher,
          password_iv, status)
         VALUES (?, ?, ?, ?, 'available')`
      ).bind(
        productId,
        email,
        bytesToHex(new Uint8Array(encrypted)),
        bytesToHex(iv)
      )
    );
  }

  await env.DB.batch(statements);

  return respond({
    success: true,
    message: emails.length + " akun berhasil ditambahkan",
    total_added: emails.length
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

        // =========================
// DISKON STREAMER
// =========================

const streamerDiscount =
  streamerCode?.toUpperCase() === "VHEYRA2101";

const amount = streamerDiscount
  ? Math.round(product.price * 0.5)
  : product.price;

const discountAmount = product.price - amount;

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
            amount,
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
                  gross_amount: amount
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
  amount: amount,
  discount: discountAmount,
  streamer_discount: streamerDiscount
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


// =====================================
// STREAMER SECURITY HELPERS
// =====================================

function getBearerToken(request) {
  const header =
    request.headers.get("Authorization") || "";

  return header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : "";
}


// HASH PASSWORD STREAMER
async function hashStreamerPassword(password) {
  const iterations = 100000;

  const salt = crypto.getRandomValues(
    new Uint8Array(16)
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    key,
    256
  );

  return [
    "pbkdf2",
    iterations,
    bytesToHex(salt),
    bytesToHex(new Uint8Array(derived))
  ].join("$");
}


// VERIFIKASI PASSWORD STREAMER
async function verifyStreamerPassword(
  password,
  storedHash
) {
  try {
    const parts = storedHash.split("$");

    if (
      parts.length !== 4 ||
      parts[0] !== "pbkdf2"
    ) {
      return false;
    }

    const iterations = Number(parts[1]);
    const salt = hexToBytes(parts[2]);
    const expected = parts[3];

    if (
      !Number.isInteger(iterations) ||
      iterations < 100000 ||
      iterations > 500000 ||
      salt.length !== 16 ||
      !/^[0-9a-f]{64}$/i.test(expected)
    ) {
      return false;
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derived = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      key,
      256
    );

    const actual = bytesToHex(
      new Uint8Array(derived)
    );

    return constantTimeEqual(
      actual,
      expected.toLowerCase()
    );
  } catch {
    return false;
  }
}


// VALIDASI SESI STREAMER
async function getStreamerSession(request, env) {
  const token = getBearerToken(request);

  if (!token) return null;

  const tokenHash = await sha256(token);

  const session = await env.DB.prepare(`
    SELECT
      s.id,
      s.username,
      s.status,
      ss.id AS session_id,
      ss.expires_at
    FROM streamer_sessions ss
    JOIN streamers s
      ON s.id = ss.streamer_id
    WHERE ss.token_hash = ?
    LIMIT 1
  `).bind(tokenHash).first();

  if (!session) return null;

  if (
    session.status !== "active" ||
    !session.expires_at ||
    session.expires_at <= new Date().toISOString()
  ) {
    await env.DB.prepare(`
      DELETE FROM streamer_sessions
      WHERE token_hash = ?
    `).bind(tokenHash).run();

    return null;
  }

  return {
    id: session.id,
    username: session.username
  };
}


// =====================================
// DECRYPT INVENTORY PASSWORD
// =====================================

async function decryptInventoryPassword(stock, env) {
  const keyBytes = hexToBytes(
    env.ACCOUNT_ENCRYPTION_KEY
  );

  if (keyBytes.length !== 32) {
    throw new Error(
      "ACCOUNT_ENCRYPTION_KEY tidak valid"
    );
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

  return new TextDecoder().decode(decrypted);
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
