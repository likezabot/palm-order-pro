import { useCallback, useEffect, useState } from "react";
import {
  getPrintQueue,
  subscribePrintQueue,
  type PrintJob,
} from "@/lib/print-queue";
import { tickPrintQueue } from "@/lib/print-queue-worker";

export interface UsePrintQueueResult {
  jobs: PrintJob[];
  loading: boolean;
  refresh: () => Promise<void>;
  retryNow: () => Promise<void>;
}

export function usePrintQueue(): UsePrintQueueResult {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await getPrintQueue();
      setJobs(all);
    } finally {
      setLoading(false);
    }
  }, []);

  const retryNow = useCallback(async () => {
    await tickPrintQueue();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    const unsub = subscribePrintQueue(() => { refresh(); });
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(refresh, 5000);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  }, [refresh]);

  return { jobs, loading, refresh, retryNow };
}
