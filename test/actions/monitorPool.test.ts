import { describe, it, expect } from "vitest";

// monitorPool requires a live RPC connection, so we test the interface shape
// and the stop mechanism without connecting.

describe("monitorPool action (unit)", () => {
  it("should export monitorPool and stopMonitoring", async () => {
    const mod = await import("../../skill/actions/monitorPool.js");
    expect(typeof mod.monitorPool).toBe("function");
    expect(typeof mod.stopMonitoring).toBe("function");
  });

  it("stopMonitoring should return false for unknown session", async () => {
    const { stopMonitoring } = await import(
      "../../skill/actions/monitorPool.js"
    );
    expect(stopMonitoring("nonexistent-session")).toBe(false);
  });
});
