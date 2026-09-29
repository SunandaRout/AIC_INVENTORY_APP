export default async function handler(req, res) {
  const gasUrl = process.env.GAS_WEB_APP_URL;
  if (!gasUrl) return res.status(500).json({ ok:false, error:'GAS_WEB_APP_URL is not configured in Vercel.' });
  try {
    const method = req.method || 'GET';
    const target = gasUrl.replace(/\/$/, '');
    let response;
    if (method === 'POST') {
      response = await fetch(target, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(req.body || {}) });
    } else {
      const q = new URLSearchParams(req.query || {});
      response = await fetch(`${target}?${q.toString()}`);
    }
    const text = await response.text();
    res.status(response.status).setHeader('Content-Type','application/json').send(text);
  } catch (e) {
    res.status(502).json({ ok:false, error:e.message || String(e) });
  }
}
