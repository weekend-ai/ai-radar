import { describe, it, expect } from "vitest";
import { clusterEdges } from "./topics";

describe("clusterEdges (connected-components)", () => {
  it("isolated nodes form singleton components", () => {
    const comps = clusterEdges(["a", "b", "c"], []);
    expect(comps.size).toBe(3);
    for (const members of Array.from(comps.values())) {
      expect(members.length).toBe(1);
    }
  });

  it("two connected nodes form one component of size 2", () => {
    const comps = clusterEdges(["a", "b"], [{ a: "a", b: "b" }]);
    expect(comps.size).toBe(1);
    expect(Array.from(comps.values())[0].sort()).toEqual(["a", "b"]);
  });

  it("transitively connected nodes form one component", () => {
    // a-b-c-d chain
    const comps = clusterEdges(["a", "b", "c", "d"], [
      { a: "a", b: "b" },
      { a: "b", b: "c" },
      { a: "c", b: "d" },
    ]);
    expect(comps.size).toBe(1);
    expect(Array.from(comps.values())[0].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("disconnected subgraphs stay separate", () => {
    // {a,b,c} and {d,e}, plus singleton f
    const comps = clusterEdges(["a", "b", "c", "d", "e", "f"], [
      { a: "a", b: "b" },
      { a: "b", b: "c" },
      { a: "d", b: "e" },
    ]);
    expect(comps.size).toBe(3);
    const sizes = Array.from(comps.values()).map((m) => m.length).sort();
    expect(sizes).toEqual([1, 2, 3]);
  });

  it("handles duplicate edges and self-loops gracefully", () => {
    const comps = clusterEdges(["a", "b"], [
      { a: "a", b: "b" },
      { a: "a", b: "b" }, // duplicate
      { a: "a", b: "a" }, // self-loop
    ]);
    expect(comps.size).toBe(1);
  });

  it("handles 100-node ring graph", () => {
    const nodes = Array.from({ length: 100 }, (_, i) => `n${i}`);
    const edges = nodes.map((n, i) => ({
      a: n,
      b: nodes[(i + 1) % 100],
    }));
    const comps = clusterEdges(nodes, edges);
    expect(comps.size).toBe(1);
    expect(Array.from(comps.values())[0].length).toBe(100);
  });
});
