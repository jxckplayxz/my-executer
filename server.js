const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { URL } = require('url');
const mime = require('mime');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Simple frontend - form
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html>
<head><meta charset="utf-8"><title>Referrer Changer</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
  <h2>Custom Referrer Proxy</h2>
  <form method="POST" action="/open" style="max-width:720px;">
    <label>Referrer to send (e.g. https://example.com/):<br>
      <input name="referrer" style="width:100%" placeholder="https://example.com/" required>
    </label>
    <br><br>
    <label>Target URL (include https://):<br>
      <input name="url" style="width:100%" placeholder="https://target-site.example/" required>
    </label>
    <br><br>
    <button type="submit">Open with custom referer</button>
  </form>
  <p style="color:#555">Notes: navigation from the proxied page will stay proxied so the server can keep sending the referrer. Some sites (CSP, dynamic JS or heavy cross-origin resources) may not work perfectly.</p>
</body>
</html>`);
});

// Form handler: redirect to proxied fetch
app.post('/open', (req, res) => {
  const { url, referrer } = req.body;
  if (!url || !referrer) return res.status(400).send('Missing url or referrer.');
  // redirect to the proxy path with both params encoded
  const prox = '/proxy?url=' + encodeURIComponent(url) + '&ref=' + encodeURIComponent(referrer);
  res.redirect(prox);
});

// Proxy endpoint
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  const ref = req.query.ref || '';
  if (!target) return res.status(400).send('Missing url param.');

  let parsed;
  try { parsed = new URL(target); } catch (e) { return res.status(400).send('Invalid URL.'); }

  try {
    // forward headers as needed; set Referer header to the chosen referrer
    const response = await fetch(target, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Referrer-Proxy/1.0',
        'Referer': ref
      },
      redirect: 'follow',
      compress: true
    });

    // Get content type
    const contentType = response.headers.get('content-type') || '';
    // For HTML, rewrite resource URLs so subsequent requests route back through this proxy
    if (contentType.includes('text/html')) {
      const text = await response.text();
      const $ = cheerio.load(text, { decodeEntities: false });

      // helper to rewrite one URL (href/src/action)
      function rewriteAttr(i, el, attrName) {
        const old = $(el).attr(attrName);
        if (!old) return;
        try {
          const resolved = new URL(old, parsed).toString();
          const proxied = '/proxy?url=' + encodeURIComponent(resolved) + '&ref=' + encodeURIComponent(ref);
          $(el).attr(attrName, proxied);
        } catch (e) {
          // ignore if can't parse
        }
      }

      // rewrite common attributes
      $('a').each((i, el) => rewriteAttr(i, el, 'href'));
      $('link').each((i, el) => rewriteAttr(i, el, 'href'));
      $('img').each((i, el) => rewriteAttr(i, el, 'src'));
      $('script').each((i, el) => rewriteAttr(i, el, 'src'));
      $('iframe').each((i, el) => rewriteAttr(i, el, 'src'));
      $('form').each((i, el) => {
        // For form action, set method to GET for safety if missing; rewrite action
        rewriteAttr(i, el, 'action');
        if (!$(el).attr('method')) $(el).attr('method', 'GET');
      });

      // also insert a small banner so you know it's proxied
      $('body').prepend(`<div style="background:#222;color:#fff;padding:8px;font-size:13px;">
        PROXY MODE — sent Referer: ${escapeHtml(ref)} — <a href="/" style="color:#9cf;">open new</a>
      </div>`);

      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.send($.html());
    } else {
      // Non-HTML: stream back the bytes with original content-type
      const buffer = await response.buffer();
      const ct = contentType || mime.getType(parsed.pathname) || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      return res.send(buffer);
    }
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).send('Error fetching target site.');
  }
});

// helper escaping
function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Referrer proxy listening on', PORT));