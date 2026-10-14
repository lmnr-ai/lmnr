import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CELL,
  type Connection,
  getGridLoopLayout,
  type Rect,
  ROWS,
} from "@/components/landing/hero/grid-loop/geometry";

type Point = { x: number; y: number };

const QUARTER_ARC = (24 * Math.PI) / 2;
const EPS = 0.5;

// Walks M/H/V/C commands; each C must be a quarter arc of radius 24.
const walkPath = (d: string) => {
  const tokens = d.match(/[MHVC]|-?\d+(?:\.\d+)?/g) ?? [];
  let i = 0;
  const num = () => Number(tokens[i++]);
  let cur: Point = { x: 0, y: 0 };
  let start: Point | null = null;
  let length = 0;

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M") {
      cur = { x: num(), y: num() };
      start = cur;
    } else if (cmd === "H") {
      const x = num();
      length += Math.abs(x - cur.x);
      cur = { x, y: cur.y };
    } else if (cmd === "V") {
      const y = num();
      length += Math.abs(y - cur.y);
      cur = { x: cur.x, y };
    } else if (cmd === "C") {
      for (let k = 0; k < 4; k++) num();
      const end = { x: num(), y: num() };
      assert.ok(Math.abs(Math.abs(end.x - cur.x) - 24) < 1e-6, `arc dx in ${d}`);
      assert.ok(Math.abs(Math.abs(end.y - cur.y) - 24) < 1e-6, `arc dy in ${d}`);
      length += QUARTER_ARC;
      cur = end;
    } else {
      assert.fail(`unexpected token ${cmd} in ${d}`);
    }
  }
  assert.ok(start, `path has no M: ${d}`);
  return { start, end: cur, length };
};

const near = (a: number, b: number) => Math.abs(a - b) <= EPS;
const within = (v: number, lo: number, hi: number) => v >= lo - EPS && v <= hi + EPS;

type Edge = "left" | "right" | "top" | "bottom";

const assertOnEdge = (p: Point, r: Rect, edge: Edge, label: string) => {
  const ok =
    edge === "left"
      ? near(p.x, r.x) && within(p.y, r.y, r.y + r.h)
      : edge === "right"
        ? near(p.x, r.x + r.w) && within(p.y, r.y, r.y + r.h)
        : edge === "top"
          ? near(p.y, r.y) && within(p.x, r.x, r.x + r.w)
          : near(p.y, r.y + r.h) && within(p.x, r.x, r.x + r.w);
  assert.ok(ok, `${label}: (${p.x}, ${p.y}) not on ${edge} edge of ${JSON.stringify(r)}`);
};

for (const cols of [44, 47, 50]) {
  describe(`grid loop layout (cols=${cols})`, () => {
    const layout = getGridLoopLayout(cols);
    const width = cols * CELL;
    const height = ROWS * CELL;
    const rects: Array<[string, Rect]> = [
      ...Object.entries(layout.nodes),
      ...Object.entries(layout.boxes),
      ...Object.entries(layout.labels),
    ];

    it("has pixel size matching the grid", () => {
      assert.equal(layout.width, width);
      assert.equal(layout.height, height);
    });

    it("puts the Traces box flush with the right edge", () => {
      assert.equal(layout.boxes.traces.x + layout.boxes.traces.w, width);
    });

    it("snaps every rect to the 20px grid", () => {
      for (const [name, r] of rects) {
        for (const v of [r.x, r.y, r.w, r.h]) {
          assert.equal(v % CELL, 0, `${name} ${JSON.stringify(r)}`);
        }
      }
    });

    it("keeps every rect and path inside the diagram", () => {
      for (const [name, r] of rects) {
        assert.ok(r.x >= 0 && r.x + r.w <= width, `${name} x out of bounds`);
        assert.ok(r.y >= 0 && r.y + r.h <= height, `${name} y out of bounds`);
      }
      for (const [name, c] of Object.entries(layout.connections)) {
        const nums = c.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        for (const v of nums) {
          assert.ok(v >= 0 && v <= Math.max(width, height), `${name} coord ${v}`);
        }
      }
    });

    it("anchors each connection to the edges it connects", () => {
      const { nodes, boxes, connections: c } = layout;
      const ends = (conn: Connection) => walkPath(conn.d);
      const checks: Array<[string, Connection, Rect, Edge, Rect, Edge]> = [
        ["agentToTraces", c.agentToTraces, nodes.agent, "right", boxes.traces, "left"],
        ["tracesToFlow", c.tracesToFlow, boxes.traces, "bottom", nodes.flow, "right"],
        ["flowToIssues", c.flowToIssues, nodes.flow, "left", boxes.issues, "right"],
        ["issuesToEvals", c.issuesToEvals, boxes.issues, "left", boxes.evals, "bottom"],
        ["agentToEvals", c.agentToEvals, nodes.agent, "right", boxes.evals, "right"],
        ["evalsToFix", c.evalsToFix, boxes.evals, "left", nodes.fix, "bottom"],
        ["fixToAgent", c.fixToAgent, nodes.fix, "top", nodes.agent, "left"],
      ];
      for (const [name, conn, from, fromEdge, to, toEdge] of checks) {
        const { start, end } = ends(conn);
        assertOnEdge(start, from, fromEdge, `${name} start`);
        assertOnEdge(end, to, toEdge, `${name} end`);
      }
    });

    it("reports lengths matching the straight + arc sum", () => {
      for (const [name, conn] of Object.entries(layout.connections)) {
        assert.ok(conn.length > 0, `${name} length`);
        const { length } = walkPath(conn.d);
        assert.ok(Math.abs(conn.length - length) < 1, `${name}: ${conn.length} vs ${length}`);
      }
    });
  });
}
