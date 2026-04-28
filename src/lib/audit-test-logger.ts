import { debugLog } from "./debug-logger";

export type AuditScenario = 
  | "one_order_normal" 
  | "bridge_offline_test" 
  | "two_rapid_orders" 
  | "one_hour_stability";

export interface AuditLogEntry {
  ts: number;
  scenario: AuditScenario;
  orderId?: string;
  event: string;
  data?: any;
}

const auditLogs: AuditLogEntry[] = [];
let currentScenario: AuditScenario | null = null;

export const auditTestLogger = {
  startScenario: (scenario: AuditScenario) => {
    currentScenario = scenario;
    const msg = `--- INICIANDO CENÁRIO DE TESTE: ${scenario} ---`;
    console.log(`%c${msg}`, "background: #1e293b; color: #38bdf8; font-weight: bold; padding: 4px;");
    auditLogs.push({ ts: Date.now(), scenario, event: "START" });
    debugLog.info("system", msg);
  },
  
  stopScenario: () => {
    if (!currentScenario) return;
    const msg = `--- FINALIZANDO CENÁRIO DE TESTE: ${currentScenario} ---`;
    console.log(`%c${msg}`, "background: #1e293b; color: #38bdf8; font-weight: bold; padding: 4px;");
    auditLogs.push({ ts: Date.now(), scenario: currentScenario, event: "STOP" });
    currentScenario = null;
  },

  logEvent: (event: string, orderId?: string, data?: any) => {
    if (!currentScenario) return;
    
    const entry: AuditLogEntry = {
      ts: Date.now(),
      scenario: currentScenario,
      orderId,
      event,
      data
    };
    
    auditLogs.push(entry);
    console.log(`[AUDIT:${currentScenario}] ${event}${orderId ? ` (Order: ${orderId})` : ""}`, data || "");
  },

  getLogs: () => [...auditLogs],
  
  getCurrentScenario: () => currentScenario,

  clearLogs: () => {
    auditLogs.length = 0;
  }
};
