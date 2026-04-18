import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata o rótulo da mesa para exibição em UI.
 * - "BALCÃO" → "BALCÃO"
 * - sem renomear → "Mesa 1"
 * - renomeada (original "1", custom "João") → "João"
 */
export function formatTableLabel(
  tableName: string,
  originalTableName?: string | null
): string {
  if (!tableName) return "";
  if (tableName === "BALCÃO") return "BALCÃO";
  const original = originalTableName ?? tableName;
  if (tableName === original) return `Mesa ${tableName}`;
  return tableName;
}

/**
 * Valor da mesa para impressão (vai depois do prefixo "Mesa: " do layout).
 * - "BALCÃO" → "BALCÃO"
 * - sem renomear → "1"
 * - renomeada → "1 - João"
 * Resultado no cupom: "Mesa: 1 - João"
 */
export function formatPrintTableValue(
  tableName: string,
  originalTableName?: string | null
): string {
  if (!tableName) return "";
  if (tableName === "BALCÃO") return "BALCÃO";
  const original = originalTableName ?? tableName;
  if (tableName === original) return tableName;
  return `${original} - ${tableName}`;
}

