/**
 * Fila local de impressão (IndexedDB).
 *
 * Quando o bridge USB (.exe) falha, o job é enfileirado aqui e retentado
 * pelo `print-queue-worker`. Persiste reload, fechamento de aba e queda
 * de energia. NÃO substitui nem altera o pipeline de impressão atual —
 * é apenas uma camada de resiliência paralela.
 */

const DB_NAME = "print-queue-db";
const DB_VERSION = 1;
const STORE = "jobs";
const MAX_ATTEMPTS = 10;

export type PrintJobType = "full" | "delta" | "bill";

export interface PrintJob {
  id: string;                 // uuid local
  orderId: string;
  tableName: string;
  printType: PrintJobType;
  payloadB64: string;         // ESC/POS já serializado (base64)
  bridgeUrl: string;
  attempts: number;
  lastError?: string | null;
  createdAt: number;
  lastAttemptAt?: number | null;
  dead?: boolean;             // excedeu MAX_ATTEMPTS
}

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("print-queue") : null;

function emit(kind: string, detail?: unknown) {
  try { channel?.postMessage({ kind, detail, ts: Date.now() }); } catch {}
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("by_createdAt", "createdAt");
        store.createIndex("by_order_type", ["orderId", "printType"], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function uuid(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export async function enqueuePrintJob(
  job: Omit<PrintJob, "id" | "attempts" | "createdAt">,
): Promise<PrintJob> {
  const db = await openDB();
  // Dedupe por (orderId + printType): se já existe, atualiza payload e zera dead.
  const existing = await new Promise<PrintJob | null>((res, rej) => {
    const idx = tx(db, "readonly").index("by_order_type");
    const r = idx.get([job.orderId, job.printType]);
    r.onsuccess = () => res((r.result as PrintJob) || null);
    r.onerror = () => rej(r.error);
  });

  const finalJob: PrintJob = existing
    ? { ...existing, payloadB64: job.payloadB64, bridgeUrl: job.bridgeUrl, dead: false, lastError: job.lastError ?? existing.lastError }
    : { ...job, id: uuid(), attempts: 0, createdAt: Date.now() };

  await new Promise<void>((res, rej) => {
    const r = tx(db, "readwrite").put(finalJob);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });

  emit("enqueued", { id: finalJob.id, orderId: finalJob.orderId });
  return finalJob;
}

export async function getPrintQueue(): Promise<PrintJob[]> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = tx(db, "readonly").getAll();
    r.onsuccess = () => {
      const all = (r.result as PrintJob[]) || [];
      all.sort((a, b) => a.createdAt - b.createdAt);
      res(all);
    };
    r.onerror = () => rej(r.error);
  });
}

export async function removePrintJob(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const r = tx(db, "readwrite").delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
  emit("removed", { id });
}

export async function incrementAttempts(id: string, error?: string | null): Promise<PrintJob | null> {
  const db = await openDB();
  return new Promise((res, rej) => {
    const store = tx(db, "readwrite");
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const job = getReq.result as PrintJob | undefined;
      if (!job) return res(null);
      job.attempts += 1;
      job.lastError = error || null;
      job.lastAttemptAt = Date.now();
      if (job.attempts >= MAX_ATTEMPTS) job.dead = true;
      const putReq = store.put(job);
      putReq.onsuccess = () => { emit("attempt", { id, attempts: job.attempts, dead: job.dead }); res(job); };
      putReq.onerror = () => rej(putReq.error);
    };
    getReq.onerror = () => rej(getReq.error);
  });
}

export async function clearPrintQueue(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const r = tx(db, "readwrite").clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
  emit("cleared");
}

export function subscribePrintQueue(listener: (msg: { kind: string; detail?: unknown }) => void): () => void {
  if (!channel) return () => {};
  const handler = (ev: MessageEvent) => listener(ev.data);
  channel.addEventListener("message", handler);
  return () => channel.removeEventListener("message", handler);
}

/** Helper para serializar Uint8Array em base64 (igual ao usado em thermal-printer). */
export function encodePayloadB64(payload: Uint8Array): string {
  let s = "";
  for (let i = 0; i < payload.length; i++) s += String.fromCharCode(payload[i]);
  return btoa(s);
}

/** Helper para decodificar base64 em Uint8Array. */
export function decodePayloadB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const PRINT_QUEUE_MAX_ATTEMPTS = MAX_ATTEMPTS;
