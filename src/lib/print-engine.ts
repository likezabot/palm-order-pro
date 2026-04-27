import { debugLog } from "@/lib/debug-logger";

declare const __APP_VERSION__: string;

export const PRINT_ENGINE_VERSION = "v2026-04-27-delivery-layout";
export const PRINT_ENGINE_FOOTER = `PRINT_ENGINE: ${PRINT_ENGINE_VERSION}`;
export const APP_BUILD =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

export type PrintConfigMetaLike = {
  updatedAt?: string | null;
  source?: string | null;
};

export function logPrintEngine(input: {
  functionName: string;
  orderId?: string | null;
  serviceType?: string | null;
  tableName?: string | null;
  headerText?: string | null;
  footerText?: string | null;
  paperWidth?: string | null;
  configMeta?: PrintConfigMetaLike | null;
  extra?: Record<string, unknown>;
}) {
  const parts = [
    `[PRINT_ENGINE] function=${input.functionName}`,
    `order_id=${input.orderId ?? "-"}`,
    `service_type=${input.serviceType ?? "-"}`,
    `table_name=${input.tableName ?? "-"}`,
    `headerText=${JSON.stringify(input.headerText ?? "")}`,
    `footerText=${JSON.stringify(input.footerText ?? "")}`,
    `paperWidth=${input.paperWidth ?? "-"}`,
    `config_updated_at=${input.configMeta?.updatedAt ?? "-"}`,
    `config_source=${input.configMeta?.source ?? "-"}`,
    `app_build=${APP_BUILD}`,
    `engine=${PRINT_ENGINE_VERSION}`,
  ];

  debugLog.info("print", parts.join(" "), input.extra);
}
