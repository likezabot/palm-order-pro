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
 * Formata o rótulo da mesa para impressão de cupom.
 * - "BALCÃO" → "BALCÃO"
 * - sem renomear → "Mesa 1"
 * - renomeada → "Mesa 1 - João" (mantém referência física p/ cozinha/conta)
 */
export function formatPrintTableLabel(
  tableName: string,
  originalTableName?: string | null
): string {
  if (!tableName) return "";
  if (tableName === "BALCÃO") return "BALCÃO";
  const original = originalTableName ?? tableName;
  if (tableName === original) return `Mesa ${tableName}`;
  return `Mesa ${original} - ${tableName}`;
}

