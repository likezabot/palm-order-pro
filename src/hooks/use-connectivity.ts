import { useEffect, useState } from "react";
import {
  getConnectivity,
  subscribeConnectivity,
  type ConnectivityState,
} from "@/lib/connectivity-store";

export interface UseConnectivityResult extends ConnectivityState {
  isFullyOnline: boolean;
  isDegraded: boolean;
  isOffline: boolean;
}

export function useConnectivity(): UseConnectivityResult {
  const [state, setState] = useState<ConnectivityState>(() => getConnectivity());

  useEffect(() => {
    const unsub = subscribeConnectivity(setState);
    return () => { unsub(); };
  }, []);

  const isOffline = state.internet === "offline";
  const isFullyOnline =
    state.internet === "online" &&
    state.realtime === "online" &&
    state.backend !== "offline";
  const isDegraded = !isOffline && !isFullyOnline &&
    (state.realtime === "degraded" ||
      state.realtime === "offline" ||
      state.backend === "offline");

  return { ...state, isFullyOnline, isDegraded, isOffline };
}
