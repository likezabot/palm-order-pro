const STORAGE_KEY = "device_friendly_name";

export type DeviceType = "mobile" | "tablet" | "desktop";
export type DeviceRole = "Palm" | "Cozinha" | "Caixa" | "Admin" | "Estação" | "Estoque" | "Início";

export function getDeviceType(): DeviceType {
  const ua = navigator.userAgent.toLowerCase();
  const w = window.innerWidth;

  if (/ipad|tablet|playbook|silk/.test(ua) || (/(android)/.test(ua) && !/mobile/.test(ua))) {
    return "tablet";
  }
  if (/mobi|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/.test(ua)) {
    return "mobile";
  }
  // Fallback por viewport
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

export function getDeviceTypeIcon(type: DeviceType): string {
  if (type === "mobile") return "📱";
  if (type === "tablet") return "📱";
  return "💻";
}

export function getDeviceTypeLabel(type: DeviceType): string {
  if (type === "mobile") return "Celular";
  if (type === "tablet") return "Tablet";
  return "Computador";
}

export function getDeviceFriendlyName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setDeviceFriendlyName(name: string): void {
  try {
    if (name.trim()) localStorage.setItem(STORAGE_KEY, name.trim());
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getCurrentRole(pathname: string): DeviceRole {
  const p = pathname.toLowerCase();
  if (p.startsWith("/palm")) return "Palm";
  if (p.startsWith("/kitchen")) return "Cozinha";
  if (p.startsWith("/cashier") || p.startsWith("/pdv")) return "Caixa";
  if (p.startsWith("/admin")) return "Admin";
  if (p.startsWith("/print-station")) return "Estação";
  if (p.startsWith("/stock")) return "Estoque";
  return "Início";
}

/** Roles que normalmente usam impressora local */
export function roleUsesPrinter(role: DeviceRole): boolean {
  return role === "Caixa" || role === "Admin" || role === "Estação" || role === "Cozinha";
}
