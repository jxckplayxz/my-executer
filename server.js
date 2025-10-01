const express = require("express");
const request = require("request");
const app = express();
const PORT = 3000;

// Serve the mini browser UI directly
app.get("/", (req, res) => {
  res.send(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Mini Browser — Proxy Edition</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    html,body {height:100%;margin:0;font-family:system-ui,Segoe UI,Roboto,Arial;}
    .toolbar {display:flex;align-items:center;gap:8px;padding:8px;background:#111;color:#fff;}
    .toolbar button{padding:6px 8px;border-radius:6px;border:0;background:#222;color:#fff;cursor:pointer;}
    .toolbar input[type="text"]{flex:1;padding:8px;border-radius:6px;border:0;}
    #viewport {height:calc(100% - 48px);width:100%;border:0;}
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="reloadBtn">⟳</button>
    <input id="addressBar" type="text" value="https://doctoraux.com" />
    <button id="goBtn">Go</button>
  </div>
  <iframe id="viewport" style="width:100%;height:calc(100% - 48px);border:0;"></iframe>

<script>
const iframe = document.getElementById("viewport");
const addressBar = document.getElementById("addressBar");

function proxyURL(url) {
  return "/proxy?url=" + encodeURIComponent(url);
}

function loadURL(url) {
  if (!/^https?:\\/\\//i.test(url)) url = "https://" + url;
  iframe.src = proxyURL(url);
  addressBar.value = url;
}

document.getElementById("goBtn").onclick = () => loadURL(addressBar.value);
document.getElementById("reloadBtn").onclick = () => iframe.src = iframe.src;

loadURL("https://doctoraux.com");
</script>
</body>
</html>
  `);
});

// Proxy route
app.use("/proxy", (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url");

  request(targetUrl)
    .on("response", response => {
      delete response.headers["x-frame-options"];
      delete response.headers["content-security-policy"];
    })
    .pipe(res);
});

app.listen(PORT, () => {
  console.log(\`✅ Mini Browser running at http://localhost:\${PORT}\`);
});