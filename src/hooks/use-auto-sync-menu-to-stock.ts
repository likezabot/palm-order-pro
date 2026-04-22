import { useEffect, useRef } from "react";
import { useMenuProductsForStock } from "./use-menu-products-for-stock";
import { useBulkImportFromMenu } from "./use-inventory";

/**
 * Once per page-load, silently imports every active menu product that is not
 * yet linked to an inventory_item. No toasts. Used to keep the stock list
 * automatically in sync with the cardápio so the user never sees an empty
 * stock screen for products that already exist on the menu.
 */
export function useAutoSyncMenuToStock() {
  const { data: products, isLoading } = useMenuProductsForStock();
  const importMut = useBulkImportFromMenu();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (isLoading || !products) return;

    const pending = products.filter((p) => !p.linked && p.active);
    if (pending.length === 0) {
      ranRef.current = true;
      return;
    }

    ranRef.current = true;
    importMut
      .mutateAsync(pending)
      .then((r) => {
        // eslint-disable-next-line no-console
        console.log(`[stock-sync] importados ${r.inserted} novos itens do cardápio`);
      })
      .catch((e) => {
        // Don't block UX — just log.
        // eslint-disable-next-line no-console
        console.warn("[stock-sync] falha ao importar:", e?.message ?? e);
        ranRef.current = false; // allow retry on next mount
      });
  }, [products, isLoading, importMut]);
}
