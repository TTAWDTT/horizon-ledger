import http from 'node:http';
import path from 'node:path';
import { readLedger, searchLedger, buildGraph, scoreDecision, validateLedger } from '../core';

export function createLedgerServer(root: string): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === '/api/ledger') {
      const ledger = await readLedger(root);
      const q = url.searchParams.get('q');
      const hits = q ? searchLedger(ledger, q) : [];
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          root,
          ledger,
          search: hits.map((h) => ({ decision: h.decision, score: h.score, reason: h.reason })),
          graph: buildGraph(ledger),
          diagnostics: validateLedger(ledger),
        }),
      );
      return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderHtml());
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });
}

export function startLedgerServer(root: string, port = 4173): Promise<http.Server> {
  const server = createLedgerServer(root);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function renderHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Horizon Ledger</title>
<style>
:root { color-scheme: light dark; --bg:#f6f7fb; --card:#ffffff; --text:#111827; --muted:#6b7280; --accent:#2563eb; }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; margin:0; background:var(--bg); color:var(--text); }
header { padding:18px 22px; background:var(--card); border-bottom:1px solid #e5e7eb; }
main { padding:22px; max-width:1100px; margin:0 auto; }
h1 { margin:0; font-size:20px; }
.controls { display:flex; gap:10px; align-items:center; margin:16px 0; }
input { flex:1; padding:9px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; }
button { padding:9px 12px; border-radius:8px; border:0; background:var(--accent); color:white; font-size:14px; cursor:pointer; }
.card { background:var(--card); border:1px solid #e5e7eb; border-radius:10px; padding:14px 16px; margin-bottom:12px; }
.title { font-weight:650; }
.meta { color:var(--muted); font-size:12px; margin:4px 0 8px; }
.badge { display:inline-block; padding:2px 7px; border-radius:999px; background:#eef2ff; color:#3730a3; font-size:11px; margin-right:6px; }
.score { font-size:12px; color:var(--muted); }
.section { margin-top:8px; font-size:14px; line-height:1.5; }
a { color:var(--accent); text-decoration:none; }
</style>
</head>
<body>
<header><h1>Horizon Ledger</h1></header>
<main>
<div class="controls"><input id="q" placeholder="Search decisions" /><button id="btn">Search</button></div>
<div id="status"></div>
<div id="decisions"></div>
</main>
<script>
async function load() {
  const q = document.getElementById('q').value.trim();
  const res = await fetch('/api/ledger' + (q ? '?q=' + encodeURIComponent(q) : ''));
  const data = await res.json();
  const decisions = q ? data.search.map((h) => h.decision) : data.ledger;
  document.getElementById('status').textContent = decisions.length + ' decisions';
  const html = decisions.map((d) => {
    const score = d.score || 0;
    const total = d.total || 10;
    return '<div class="card"><div class="title">' + d.title + '</div>' +
      '<div class="meta">' + d.id + ' &middot; ' + d.status + ' &middot; score ' + score + '/' + total + '</div>' +
      '<div class="section">' + (d.summary || '') + '</div></div>';
  }).join('');
  document.getElementById('decisions').innerHTML = html || '<div class="card">No decisions found.</div>';
}
document.getElementById('btn').onclick = load;
document.getElementById('q').onkeydown = (e) => { if (e.key === 'Enter') load(); };
load();
</script>
</body>
</html>`;
}
