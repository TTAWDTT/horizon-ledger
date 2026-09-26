import type { Decision } from './types';

export interface GraphNode {
  id: string;
  label: string;
  kind: 'decision' | 'alternative' | 'evidence';
  status?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export function buildGraph(ledger: Decision[]): { nodes: GraphNode[]; edges: GraphEdge[]; mermaid: string } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const d of ledger) {
    nodes.push({ id: d.id, label: d.title, kind: 'decision', status: d.status });
    for (const a of d.alternatives ?? []) {
      const altId = `${d.id}-A-${a.id}`;
      nodes.push({ id: altId, label: a.name, kind: 'alternative', status: a.verdict });
      edges.push({ from: d.id, to: altId, label: a.verdict });
    }
    
    for (const link of d.links ?? []) {
      edges.push({ from: d.id, to: link.id, label: link.type });
    }
    for (const e of d.evidence ?? []) {
      const evId = `${d.id}-E-${e.id}`;
      nodes.push({ id: evId, label: e.title || e.value, kind: 'evidence', status: e.strength });
      edges.push({ from: d.id, to: evId, label: e.type });
    }
  }
  const mermaid = [
    'graph TD',
    ...nodes.map((n) => `  ${sanitizeId(n.id)}["${escapeLabel(n.label)}"]::=${n.kind}`),
    ...edges.map((e) => `  ${sanitizeId(e.from)} -->|${escapeLabel(e.label ?? '')}| ${sanitizeId(e.to)}`),
  ].join('\n');
  return { nodes, edges, mermaid };
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '&quot;');
}
