/**
 * Regression test: ensure all critical components import without errors.
 * Catches broken imports / circular deps / missing exports BEFORE they reach
 * production. Does NOT render — render-level tests live with each component.
 */
import { describe, it, expect } from "vitest";

describe("smoke: critical modules load", () => {
  it("loads pure libs", async () => {
    await expect(import("@/lib/utils")).resolves.toBeDefined();
    await expect(import("@/lib/inventory")).resolves.toBeDefined();
    await expect(import("@/lib/payment")).resolves.toBeDefined();
    await expect(import("@/lib/senha")).resolves.toBeDefined();
    await expect(import("@/lib/receipt-layout")).resolves.toBeDefined();
    await expect(import("@/lib/order-delta")).resolves.toBeDefined();
    await expect(import("@/lib/order-items-group")).resolves.toBeDefined();
    await expect(import("@/lib/duplicates")).resolves.toBeDefined();
    await expect(import("@/lib/product-order")).resolves.toBeDefined();
    await expect(import("@/lib/print-config")).resolves.toBeDefined();
  });

  it("loads connectivity + tab id", async () => {
    await expect(import("@/lib/connectivity-monitor")).resolves.toBeDefined();
    await expect(import("@/lib/connectivity-store")).resolves.toBeDefined();
    await expect(import("@/lib/tab-id")).resolves.toBeDefined();
  });

  it("loads print-queue helpers", async () => {
    const m = await import("@/lib/print-queue");
    expect(typeof m.encodePayloadB64).toBe("function");
    expect(typeof m.decodePayloadB64).toBe("function");
  });
});
