import { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Edge, type Node, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Field, Select } from '../../components/ui';
import type { DependencyGraph } from '../../lib/types';

const MAX_NODES = 160;

/**
 * Dependency graph visualization. The layout is a deterministic layered pass
 * (not a physics simulation) so the same graph always renders identically.
 */
export function GraphView({ graph, onSelect }: { graph: DependencyGraph; onSelect?: (path: string) => void }) {
  const [mode, setMode] = useState<'internal' | 'all'>('internal');
  const [focus, setFocus] = useState<string>('');

  const { nodes, edges, hiddenCount } = useMemo(() => {
    const internal = graph.nodes.filter((n) => !n.external);
    const externals = graph.nodes.filter((n) => n.external);

    let pool = mode === 'all' ? [...internal, ...externals.slice(0, 40)] : internal;
    if (focus) {
      const neighbours = new Set<string>([focus]);
      for (const e of graph.edges) {
        if (e.from === focus) neighbours.add(e.to);
        if (e.to === focus) neighbours.add(e.from);
      }
      pool = pool.filter((n) => neighbours.has(n.path));
    }
    const hiddenCount = Math.max(0, pool.length - MAX_NODES);
    pool = pool.slice(0, MAX_NODES);
    const ids = new Set(pool.map((n) => n.path));

    // Layered layout by in-degree bucket: sources on the left.
    const indegree = new Map<string, number>();
    for (const n of pool) indegree.set(n.path, 0);
    for (const e of graph.edges) {
      if (ids.has(e.to) && ids.has(e.from) && e.from !== e.to) indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    }
    const layers = new Map<number, string[]>();
    for (const n of pool) {
      const deg = indegree.get(n.path) ?? 0;
      const layer = deg === 0 ? 0 : deg < 3 ? 1 : 2;
      if (!layers.has(layer)) layers.set(layer, []);
      layers.get(layer)!.push(n.path);
    }

    const rfNodes: Node[] = [];
    for (const [layer, paths] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
      paths.forEach((p, i) => {
        const meta = pool.find((n) => n.path === p)!;
        rfNodes.push({
          id: p,
          position: { x: layer * 300, y: i * 54 },
          data: { label: shortPath(p) },
          type: 'default',
          className: `xy-flow-node ${meta.external ? 'is-external' : ''} ${focus === p ? 'is-selected' : ''}`,
          draggable: true,
        });
      });
    }

    const rfEdges: Edge[] = graph.edges
      .filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
      .slice(0, 900)
      .map((e, i) => ({
        id: `e${i}`,
        source: e.from,
        target: e.to,
        animated: false,
        style: { stroke: e.external ? 'var(--line-3)' : 'var(--accent-line)', strokeWidth: 1, strokeDasharray: e.external ? '3 3' : undefined, opacity: focus ? 0.9 : 0.55 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: 'var(--line-3)' },
      }));

    return { nodes: rfNodes, edges: rfEdges, hiddenCount };
  }, [graph, mode, focus]);

  return (
    <div className="stack">
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 170 }}>
          <Field label="Scope">
            <Select
              value={mode}
              onChange={(v) => setMode(v as 'internal' | 'all')}
              options={[
                { value: 'internal', label: `Project files (${graph.nodes.filter((n) => !n.external).length})` },
                { value: 'all', label: `With externals (${graph.nodes.filter((n) => n.external).length})` },
              ]}
            />
          </Field>
        </div>
        <div style={{ width: 240 }}>
          <Field label="Focus on file">
            <Select
              value={focus}
              onChange={setFocus}
              options={[{ value: '', label: 'Whole graph' }, ...graph.nodes.filter((n) => !n.external).slice(0, 200).map((n) => ({ value: n.path, label: shortPath(n.path) }))]}
            />
          </Field>
        </div>
        <div className="spacer" />
        <div className="mono dim" style={{ fontSize: 11, alignSelf: 'flex-end', paddingBottom: 6 }}>
          {nodes.length} nodes · {edges.length} edges{hiddenCount ? ` · ${hiddenCount} hidden (limit ${MAX_NODES})` : ''}
        </div>
      </div>
      <div className="graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          proOptions={{ hideAttribution: false }}
          minZoom={0.15}
          maxZoom={1.6}
          onNodeClick={(_, node) => onSelect?.(node.id)}
          nodesConnectable={false}
          elementsSelectable
        >
          <Background color="var(--line-1)" gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor="var(--line-3)" maskColor="rgba(0,0,0,0.35)" style={{ background: 'var(--bg-2)' }} />
        </ReactFlow>
      </div>
      <p className="muted" style={{ fontSize: 11.5 }}>
        Layout is a deterministic layered pass over the parsed import graph: files with no importers are placed on the
        left. Drag nodes to explore; the positions are not persisted because the graph is derived from the index.
      </p>
    </div>
  );
}

function shortPath(p: string): string {
  const parts = p.split('/');
  if (parts.length <= 2) return p;
  return `…/${parts.slice(-2).join('/')}`;
}
