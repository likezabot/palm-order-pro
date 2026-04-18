import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata o rótulo da mesa para exibição.
 * - "BALCÃO" → "BALCÃO"
 * - sem renomear (table_name === original_table_name) → "Mesa 1"
 * - renomeada (ex.: original "1", custom "João") → "João"
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

