import { describe, it, expect, beforeEach } from "vitest";
import {
  recordPrintOrigin,
  getPrintOriginRecords,
  getLastPrintOrigin,
  subscribePrintOrigin,
} from "../print-origin-tracker";

describe("print-origin-tracker", () => {
  beforeEach(() => {
    // limpa registros entre testes (sem export oficial: gravamos > 20 e checamos limite)
  });

  it("começa registros (talvez vazio inicialmente)", () => {
    const list = getPrintOriginRecords();
    expect(Array.isArray(list)).toBe(true);
  });

  it("registra impressão e expõe como mais recente", () => {
    recordPrintOrigin({
      printPath: "test.path",
      source: "test",
      orderId: "abc12345",
      serviceType: "dine_in",
      tableName: "Mesa 1",
      bridgeUrl: "http://localhost:3001/print",
      bytes: 123,
      ok: true,
      errorMsg: null,
    });
    const last = getLastPrintOrigin();
    expect(last).toBeTruthy();
    expect(last!.printPath).toBe("test.path");
    expect(last!.source).toBe("test");
    expect(last!.ok).toBe(true);
    expect(last!.engineVersion).toBeTruthy();
    expect(last!.appBuild).toBeTruthy();
  });

  it("notifica subscribers em cada registro", () => {
    let count = 0;
    const unsub = subscribePrintOrigin(() => {
      count++;
    });
    recordPrintOrigin({
      printPath: "p",
      source: "auto",
      orderId: null,
      serviceType: null,
      tableName: null,
      bridgeUrl: null,
      bytes: null,
      ok: false,
      errorMsg: "x",
    });
    expect(count).toBeGreaterThanOrEqual(1);
    unsub();
  });

  it("limita a 20 registros (mais antigos descartados)", () => {
    for (let i = 0; i < 30; i++) {
      recordPrintOrigin({
        printPath: `p${i}`,
        source: "auto",
        orderId: null,
        serviceType: null,
        tableName: null,
        bridgeUrl: null,
        bytes: null,
        ok: true,
        errorMsg: null,
      });
    }
    const list = getPrintOriginRecords();
    expect(list.length).toBeLessThanOrEqual(20);
    // mais recente é o último gravado
    expect(list[0].printPath).toBe("p29");
  });
});
