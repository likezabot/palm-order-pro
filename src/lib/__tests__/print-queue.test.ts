import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  enqueuePrintJob,
  getPrintQueue,
  removePrintJob,
  incrementAttempts,
  clearPrintQueue,
  encodePayloadB64,
  decodePayloadB64,
  PRINT_QUEUE_MAX_ATTEMPTS,
} from "@/lib/print-queue";

const baseJob = {
  orderId: "order-1",
  tableName: "Mesa 1",
  printType: "full" as const,
  payloadB64: "AAA=",
  bridgeUrl: "http://localhost:3001/print",
};

describe("print-queue (IndexedDB)", () => {
  beforeEach(async () => {
    await clearPrintQueue();
  });

  it("enqueues a new job and lists it", async () => {
    const j = await enqueuePrintJob(baseJob);
    expect(j.id).toBeTruthy();
    expect(j.attempts).toBe(0);
    const all = await getPrintQueue();
    expect(all.length).toBe(1);
    expect(all[0].orderId).toBe("order-1");
  });

  it("dedupes by (orderId + printType): updates payload, keeps id", async () => {
    const a = await enqueuePrintJob(baseJob);
    const b = await enqueuePrintJob({ ...baseJob, payloadB64: "BBB=" });
    expect(b.id).toBe(a.id);
    const all = await getPrintQueue();
    expect(all.length).toBe(1);
    expect(all[0].payloadB64).toBe("BBB=");
  });

  it("different printType creates separate job", async () => {
    await enqueuePrintJob(baseJob);
    await enqueuePrintJob({ ...baseJob, printType: "bill" });
    const all = await getPrintQueue();
    expect(all.length).toBe(2);
  });

  it("incrementAttempts marks dead after MAX_ATTEMPTS", async () => {
    const j = await enqueuePrintJob(baseJob);
    for (let i = 0; i < PRINT_QUEUE_MAX_ATTEMPTS; i++) {
      await incrementAttempts(j.id, "boom");
    }
    const all = await getPrintQueue();
    expect(all[0].attempts).toBe(PRINT_QUEUE_MAX_ATTEMPTS);
    expect(all[0].dead).toBe(true);
    expect(all[0].lastError).toBe("boom");
  });

  it("removePrintJob removes a job", async () => {
    const j = await enqueuePrintJob(baseJob);
    await removePrintJob(j.id);
    const all = await getPrintQueue();
    expect(all.length).toBe(0);
  });

  it("getPrintQueue returns sorted by createdAt", async () => {
    const a = await enqueuePrintJob(baseJob);
    await new Promise((r) => setTimeout(r, 5));
    const b = await enqueuePrintJob({ ...baseJob, orderId: "order-2", printType: "delta" });
    const all = await getPrintQueue();
    expect(all[0].id).toBe(a.id);
    expect(all[1].id).toBe(b.id);
  });
});

describe("print-queue payload helpers", () => {
  it("round-trips Uint8Array via base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 27, 64, 128, 255]);
    const b64 = encodePayloadB64(bytes);
    const back = decodePayloadB64(b64);
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });
});
