import http from 'node:http';
import { readLedger, searchLedger, buildGraph, scoreDecision, validateLedger, findConflicts, auditLedger, type Decision, type ScoreResult } from '../core';

interface LedgerStats {
  total: number;
  byStatus: Record<string, number>;
  evidence: number;
  alternatives: number;
  avgQuality: number;
  errors: number;
  warnings: number;
}

export function createLedgerServer(root: string): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');

    if (url.pathname === '/api/health') {
      return sendJson(res, { ok: true });
    }

    if (url.pathname === '/api/ledger') {
      const ledger = await readLedger(root);
      const q = url.searchParams.get('q') ?? '';
      const hits = q ? searchLedger(ledger, q) : [];
      const scores = new Map(ledger.map((d) => [d.id, scoreDecision(d)]));
      const graph = buildGraph(ledger);
      const diagnostics = validateLedger(ledger);
      return sendJson(res, {
        root,
        ledger,
        search: hits.map((hit) => ({
          decision: hit.decision,
          relevance: hit.score,
          reason: hit.reason,
          quality: scores.get(hit.decision.id),
        })),
        scores: Object.fromEntries(scores),
        graph,
        conflicts: findConflicts(ledger),
        audit: await auditLedger(ledger, root),
        diagnostics,
        stats: buildStats(ledger, scores, diagnostics),
      });
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderHtml());
      return;
    }

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
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

function sendJson(res: http.ServerResponse, value: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function buildStats(
  ledger: Decision[],
  scores: Map<string, ScoreResult>,
  diagnostics: Array<{ level: 'error' | 'warn' }>,
): LedgerStats {
  const byStatus: Record<string, number> = {};
  for (const d of ledger) {
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  }
  const total = scores.size;
  const sum = [...scores.values()].reduce((acc, score) => acc + score.score, 0);
  return {
    total,
    byStatus,
    evidence: ledger.reduce((acc, d) => acc + (d.evidence?.length ?? 0), 0),
    alternatives: ledger.reduce((acc, d) => acc + (d.alternatives?.length ?? 0), 0),
    avgQuality: total ? Math.round((sum / total) * 10) / 10 : 0,
    errors: diagnostics.filter((d) => d.level === 'error').length,
    warnings: diagnostics.filter((d) => d.level === 'warn').length,
  };
}

function renderHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Horizon Ledger</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='4' fill='%232563eb'/%3E%3Ctext x='8' y='12' font-size='11' font-family='Arial' text-anchor='middle' fill='white'%3EH%3C/text%3E%3C/svg%3E" />
<style>
:root {
  color-scheme: light dark;
  --bg: #f5f7fb; --card: #ffffff; --line: #e2e8f0; --text: #172033; --muted: #667085;
  --accent: #2563eb; --soft: #eef2ff; --danger: #dc2626; --warn: #d97706; --ok: #059669;
  --shadow: 0 1px 2px rgba(16,24,40,.05);
}
@media (prefers-color-scheme: dark) {
  :root { --bg:#0b1120; --card:#111827; --line:#263041; --text:#e6edf7; --muted:#94a3b8; --soft:#1e293b; --shadow:none; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
button, input { font: inherit; }
button { cursor:pointer; }
.shell { min-height:100vh; display:flex; flex-direction:column; }
header { padding:18px clamp(16px, 3vw, 32px) 12px; border-bottom:1px solid var(--line); background:var(--card); }
.top { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.brand { width:38px; height:38px; border-radius:12px; background:linear-gradient(135deg,#2563eb,#7c3aed); display:grid; place-items:center; color:#fff; font-weight:800; }
h1 { margin:0; font-size:18px; letter-spacing:-.01em; }
.subtitle { color:var(--muted); font-size:12px; }
.path { margin-left:auto; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:11px; }
.toolbar { display:grid; grid-template-columns:minmax(240px,1fr) auto auto; gap:10px; margin-top:14px; }
input { width:100%; min-width:0; padding:10px 12px; border:1px solid var(--line); border-radius:9px; background:var(--bg); color:var(--text); outline:none; }
input:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(37,99,235,.13); }
.view-group { display:flex; padding:3px; gap:3px; border:1px solid var(--line); border-radius:9px; background:var(--card); }
.view-group button { border:0; background:transparent; color:var(--muted); padding:7px 12px; border-radius:6px; }
.view-group button.active { background:var(--soft); color:var(--accent); font-weight:650; }
.secondary { border:1px solid var(--line); background:var(--card); color:var(--text); padding:9px 12px; border-radius:9px; }
main { flex:1; padding:clamp(14px,2.5vw,26px); width:100%; max-width:1320px; margin:0 auto; }
.stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:14px; }
.stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; box-shadow:var(--shadow); }
.stat b { display:block; font-size:20px; line-height:1.2; }
.stat span { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
.workspace { display:grid; grid-template-columns:minmax(300px,430px) minmax(0,1fr); gap:14px; align-items:start; }
.panel { background:var(--card); border:1px solid var(--line); border-radius:12px; box-shadow:var(--shadow); overflow:hidden; }
.list-head, .detail-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 16px; border-bottom:1px solid var(--line); color:var(--muted); font-size:12px; }
.card { width:100%; text-align:left; background:var(--card); border:0; border-bottom:1px solid var(--line); padding:14px 16px; display:block; }
.card:hover { background:color-mix(in srgb, var(--soft) 60%, transparent); }
.card.selected { background:var(--soft); box-shadow:inset 3px 0 0 var(--accent); }
.card-title { font-weight:650; line-height:1.35; }
.card-id { color:var(--muted); font-size:11px; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
.card-desc { color:var(--muted); font-size:12px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin:5px 0 8px; }
.row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.pill, .tag, .evidence-pill, .link-pill { display:inline-flex; align-items:center; gap:4px; padding:2px 7px; border-radius:999px; background:var(--soft); color:var(--muted); font-size:10.5px; }
.pill.decided { color:var(--ok); } .pill.proposed { color:var(--warn); } .pill.draft { color:var(--muted); }
.pill.rejected { color:var(--danger); } .pill.superseded { color:#7c3aed; }
.tag { background:transparent; border:1px solid var(--line); }
.score { margin-left:auto; color:var(--muted); font-size:11px; font-weight:650; }
.empty { padding:24px; color:var(--muted); text-align:center; }
.sections { padding:16px; display:grid; gap:16px; }
.section h3 { margin:0 0 6px; font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
.section p, .section pre { margin:0; white-space:pre-wrap; }
.section pre { font:inherit; }
.reason-list { margin:4px 0 0; padding-left:18px; color:var(--muted); }
.grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.item { border:1px solid var(--line); border-radius:9px; padding:10px 12px; background:var(--bg); }
.item-title { font-weight:650; font-size:13px; }
.item-desc { color:var(--muted); font-size:12px; margin-top:3px; }
.diagnostic { padding:8px 10px; border-left:3px solid var(--warn); background:color-mix(in srgb, var(--soft) 70%, transparent); margin-top:6px; font-size:12px; }
.diagnostic.error { border-left-color:var(--danger); }
.graph-wrap { padding:16px; }
.graph-controls { display:flex; align-items:center; gap:10px; color:var(--muted); margin-bottom:8px; }
svg { width:100%; height:auto; display:block; border:1px solid var(--line); border-radius:9px; background:var(--card); }
.edge { stroke:var(--muted); stroke-width:1.5; fill:none; opacity:.7; }
.edge-label { fill:var(--muted); font-size:9px; }
.node { stroke:var(--line); stroke-width:1.5; cursor:pointer; }
.node.decided { fill:#059669; stroke:#065f46; } .node.proposed { fill:#d97706; stroke:#92400e; }
.node.draft { fill:#94a3b8; stroke:#64748b; } .node.rejected { fill:#dc2626; stroke:#991b1b; }
.node.superseded { fill:#7c3aed; stroke:#5b21b6; } .node.alternative { fill:#c7d2fe; stroke:#6366f1; }
.node.evidence { fill:#a7f3d0; stroke:#059669; }
.node-label { fill:var(--text); font-size:10px; text-anchor:middle; paint-order:stroke; stroke:var(--card); stroke-width:4px; }
@media (max-width:900px) {
  .stats { grid-template-columns:repeat(2,1fr); }
  .workspace { grid-template-columns:1fr; }
  .toolbar { grid-template-columns:1fr; }
  .grid2 { grid-template-columns:1fr; }
  .path { display:none; }
}
</style>
</head>
<body>
<div class="shell">
<header>
  <div class="top">
    <div class="brand">H</div>
    <div><h1>Horizon Ledger</h1><div class="subtitle">Decision graph, evidence, and quality</div></div>
    <div class="path" id="root"></div>
  </div>
  <div class="toolbar">
    <input id="q" type="search" placeholder="Search decisions, evidence, scope, or alternatives" />
    <div class="view-group"><button id="board-view" class="active">Board</button><button id="graph-view">Graph</button></div>
    <button class="secondary" id="refresh" title="Reload from disk">Refresh</button>
  </div>
</header>
<main>
  <div class="stats" id="stats"></div>
  <div class="workspace">
    <section class="panel"><div class="list-head"><span id="list-count">Decisions</span><span id="list-note"></span></div><div id="list"></div></section>
    <section class="panel" id="detail-panel">
      <div class="detail-head"><span id="detail-label">Select a decision</span></div>
      <div id="detail"><div class="empty">Choose a decision from the board.</div></div>
    </section>
  </div>
</main>
</div>
<script>
const state = { data:null, selected:null, view:'board', query:'' };
const statusOrder = ['decided','proposed','draft','rejected','superseded'];
function el(tag, className, text){ const n=document.createElement(tag); if(className)n.className=className; if(text!==undefined)n.textContent=text; return n; }
function esc(s){ return String(s ?? ''); }
function scoreOf(item){ return item.quality ?? state.data?.scores?.[item.id] ?? {score:0,total:10,reasons:[]}; }
function decisionOf(item){ return item.decision && typeof item.decision==='object' ? item.decision : item; }
async function load(){
  const q=document.getElementById('q').value.trim(); state.query=q;
  const res=await fetch('/api/ledger'+(q?'?q='+encodeURIComponent(q):''));
  state.data=await res.json(); document.getElementById('root').textContent=state.data.root;
  render();
}
function render(){
  renderStats(); renderList(); if(state.view==='graph')renderGraph(); else renderDetail();
  document.getElementById('board-view').classList.toggle('active',state.view==='board');
  document.getElementById('graph-view').classList.toggle('active',state.view==='graph');
}
function renderStats(){
  const s=state.data.stats, host=document.getElementById('stats'); host.innerHTML='';
  const values=[['Decisions',s.total],['Average quality',s.avgQuality+'/10'],['Evidence',s.evidence],['Issues',(s.errors+s.warnings)+' ('+s.errors+'E/'+s.warnings+'W)']];
  for(const [label,value] of values){ const box=el('div','stat'); box.append(el('b',undefined,value),el('span',undefined,label)); host.append(box); }
}
function renderList(){
  const host=document.getElementById('list'); host.innerHTML='';
  const isSearch=(state.data.search?.length??0)>0; const raw=isSearch?state.data.search:state.data.ledger;
  const items=raw.map(decisionOf); document.getElementById('list-count').textContent=(isSearch?'Search':'Decisions')+' · '+items.length;
  if(!items.length){ host.append(el('div','empty',state.data.search?'No matching decisions.':'No decisions yet. Run horizon init.')); return; }
  items.sort((a,b)=>statusOrder.indexOf(a.status)-statusOrder.indexOf(b.status)||a.id.localeCompare(b.id));
  for(const d of items){ const q=scoreOf(d), card=el('button','card');
    if(d.id===state.selected)card.classList.add('selected');
    card.dataset.id=d.id; const title=el('div','card-title',d.title), meta=el('div','row');
    meta.append(el('span','card-id',d.id),el('span','pill '+d.status,d.status));
    if(d.kind)meta.append(el('span','pill',d.kind));
    for(const t of (d.tags??[]).slice(0,3))meta.append(el('span','tag',t));
    meta.append(el('span','score','Q '+q.score+'/'+q.total));
    card.append(title,el('div','card-desc',d.summary||d.decision||'No summary yet.'),meta);
    card.onclick=()=>{ state.selected=d.id; render(); location.hash=d.id; };
    host.append(card);
  }
}
function section(title, content, pre=false){ const wrap=el('section','section'); wrap.append(el('h3',undefined,title)); if(pre){const node=el('pre');node.textContent=content;wrap.append(node);}else wrap.append(el('p',undefined,content)); return wrap; }
function itemGrid(title, values, formatter){ const wrap=el('section','section'); wrap.append(el('h3',undefined,title)); if(!values.length){wrap.append(el('p',undefined,'None.'));return wrap;} const grid=el('div','grid2'); for(const value of values)grid.append(formatter(value)); wrap.append(grid); return wrap; }
function renderDetail(){
  const host=document.getElementById('detail'); host.innerHTML=''; const label=document.getElementById('detail-label');
  if(state.view==='graph'){ label.textContent='Decision graph'; host.className='graph-wrap'; renderGraphInto(host); return; }
  host.className='sections'; const found=state.data.ledger.find(d=>d.id===state.selected);
  if(!found){ label.textContent='Select a decision'; host.append(el('div','empty','Choose a decision from the board.')); return; }
  label.textContent=found.id+' · '+found.title;
  const quality=state.data.scores[found.id]??{score:0,total:10,reasons:[]};
  const meta=el('section','section'); meta.append(el('h3',undefined,'Metadata')); const row=el('div','row');
  row.append(el('span','pill '+found.status,found.status),el('span','pill',found.kind||'other'),el('span','pill',found.confidence||'medium'),el('span','pill',found.horizon||'medium'),el('span','pill','owner: '+(found.owner||'unassigned')),el('span','score','Quality '+quality.score+'/'+quality.total));
  if((found.scope??[]).length){ row.append(el('div','tag',found.scope.join(', '))); }
  meta.append(row); host.append(meta);
  if(found.summary)host.append(section('Summary',found.summary)); if(found.context)host.append(section('Context',found.context)); if(found.decision)host.append(section('Decision',found.decision)); if(found.consequences)host.append(section('Consequences',found.consequences));
  host.append(itemGrid('Alternatives',found.alternatives??[],a=>{ const box=el('div','item'); box.append(el('div','item-title',a.name),el('div','item-desc',(a.verdict||'unknown')+(a.reason?' — '+a.reason:''))); return box; }));
  host.append(itemGrid('Evidence',found.evidence??[],e=>{ const box=el('div','item'); box.append(el('div','item-title',e.title||e.value)); const row=el('div','row'); row.append(el('span','evidence-pill',e.type)); if(e.strength)row.append(el('span','evidence-pill',e.strength)); box.append(row); if(e.note)box.append(el('div','item-desc',e.note)); return box; }));
  host.append(itemGrid('Links',found.links??[],l=>{ const box=el('div','item'); box.append(el('div','item-title',l.id),el('div','item-desc',l.type+(l.note?' — '+l.note:''))); return box; }));
  const reasons=el('section','section'); reasons.append(el('h3',undefined,'Quality evidence')); const ul=el('ul','reason-list'); if(quality.reasons?.length)for(const r of quality.reasons)ul.append(el('li',undefined,r)); else ul.append(el('li',undefined,'No quality signals yet.')); reasons.append(ul); host.append(reasons);
  const diags=state.data.diagnostics.filter(d=>d.id===found.id); const ds=el('section','section'); ds.append(el('h3',undefined,'Diagnostics'));
  if(!diags.length)ds.append(el('p',undefined,'No warnings.')); else for(const d of diags)ds.append(el('div','diagnostic '+d.level,d.level.toUpperCase()+': '+d.message));
  host.append(ds);
}
function graphData(){
  const all=state.data.graph; const showEvidence=document.getElementById('show-evidence')?.checked ?? false;
  const ledgerIds=new Set(state.data.ledger.map(d=>d.id));
  if(!showEvidence){ const nodes=all.nodes.filter(n=>ledgerIds.has(n.id)); const edges=all.edges.filter(e=>ledgerIds.has(e.from)&&ledgerIds.has(e.to)); return {nodes,edges,mermaid:all.mermaid}; }
  return all;
}
function renderGraphInto(host){
  const controls=el('div','graph-controls'); const label=el('label');
  const box=document.createElement('input'); box.type='checkbox'; box.id='show-evidence'; box.checked=state.showEvidence===true; if(state.showEvidence===undefined)box.checked=true;
  box.onchange=()=>{ state.showEvidence=box.checked; renderGraphInto(host); }; label.append(box,document.createTextNode(' show evidence & alternatives')); controls.append(label); host.append(controls);
  const g=graphData(); if(!g.nodes.length){ host.append(el('div','empty','No graph nodes yet.')); return; }
  const width=Math.max(760,Math.min(1200,360+g.nodes.length*12)), height=Math.max(420,Math.min(760,260+g.nodes.length*10)), center={x:width/2,y:height/2};
  const positions=new Map(); g.nodes.forEach((node,i)=>{ const angle=(i/g.nodes.length)*Math.PI*2-Math.PI/2; const radius=Math.min(width,height)*0.32+Math.min(90,g.nodes.length*2); positions.set(node.id,{x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius}); });
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 '+width+' '+height); svg.setAttribute('role','img'); svg.setAttribute('aria-label','Decision relationship graph');
  const defs=document.createElementNS(svg.namespaceURI,'defs'); defs.innerHTML='<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="edge"/></marker>'; svg.append(defs);
  for(const edge of g.edges){ const a=positions.get(edge.from),b=positions.get(edge.to); if(!a||!b)continue; const line=document.createElementNS(svg.namespaceURI,'line'); line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('class','edge');line.setAttribute('marker-end','url(#arrow)');svg.append(line); const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2}; const t=document.createElementNS(svg.namespaceURI,'text');t.setAttribute('x',mid.x);t.setAttribute('y',mid.y-3);t.setAttribute('text-anchor','middle');t.setAttribute('class','edge-label');t.textContent=edge.label||'';svg.append(t); }
  for(const node of g.nodes){ const p=positions.get(node.id); if(!p)continue; const group=document.createElementNS(svg.namespaceURI,'g'); const c=document.createElementNS(svg.namespaceURI,'circle'); c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',node.kind==='decision'?11:7);c.setAttribute('class','node '+node.kind+' '+(node.status||'')); if(ledgerHas(node.id))group.dataset.select=node.id; c.onclick=()=>{ if(!ledgerHas(node.id))return; state.selected=node.id;state.view='board';render();location.hash=node.id; }; group.append(c); const t=document.createElementNS(svg.namespaceURI,'text');t.setAttribute('x',p.x);t.setAttribute('y',p.y+(node.kind==='decision'?21:16));t.setAttribute('class','node-label');t.textContent=truncate(node.label,node.kind==='decision'?40:26);group.append(t);svg.append(group); }
  host.append(svg);
}
function renderGraph(){ const host=document.getElementById('detail'); host.className='graph-wrap'; host.innerHTML=''; document.getElementById('detail-label').textContent='Decision graph'; renderGraphInto(host); }
function ledgerHas(id){ return state.data.ledger.some(d=>d.id===id); }
function truncate(text,max){ text=String(text||''); return text.length>max?text.slice(0,max-1)+'…':text; }
document.getElementById('refresh').onclick=load;
document.getElementById('board-view').onclick=()=>{ state.view='board';render(); };
document.getElementById('graph-view').onclick=()=>{ state.view='graph';render(); };
window.onhashchange=()=>{ if(location.hash.slice(1)&&state.data?.ledger.some(d=>d.id===location.hash.slice(1))){ state.selected=location.hash.slice(1);state.view='board';render(); } };
load().then(()=>{ if(location.hash){const id=location.hash.slice(1); if(state.data?.ledger.some(d=>d.id===id)){state.selected=id;state.view='board';render();}} });
</script>
</body>
</html>`;
}
