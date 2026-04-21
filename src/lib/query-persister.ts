// Persister do React Query usando IndexedDB (idb-keyval).
// Mantém cache entre reloads e disponível offline.
import { get, set, del } from "idb-keyval";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

const idbStorage = {
  getItem: (key: string) => get<string>(key).then((v) => v ?? null),
  setItem: (key: string, value: string) => set(key, value),
  removeItem: (key: string) => del(key),
};

export const queryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key: "plano-b-rq-cache",
  throttleTime: 1000,
});

// Whitelist de queries que valem a pena persistir.
const PERSIST_KEYS = new Set([
  "active-orders",
  "table-count",
  "products",
  "menu",
]);

export const shouldPersistQuery = (query: { queryKey: readonly unknown[] }) => {
  const first = query.queryKey?.[0];
  return typeof first === "string" && PERSIST_KEYS.has(first);
};
