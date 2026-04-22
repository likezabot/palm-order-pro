import { QueryClient } from "@tanstack/react-query";

/**
 * QueryClient singleton — usado tanto pela UI (App.tsx) quanto pelo
 * runtime global (global-order-runtime.ts). Sem isso, o runtime invalidaria
 * um cache diferente do que a UI consome.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
