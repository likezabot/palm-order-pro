import { supabase } from "@/integrations/supabase/client";

export type PrinterEventType = "info" | "warning" | "error" | "success";

export async function logPrinterEvent(
  message: string,
  orderId?: string | null,
  eventType: PrinterEventType = "info",
  details: Record<string, any> = {}
) {
  try {
    // Only log to console in dev or if explicitly requested
    console.log(`[PRINTER_LOG][${eventType}] ${message}`, { orderId, details });

    const { error } = await supabase.from("printer_logs").insert({
      order_id: orderId || null,
      event_type: eventType,
      message,
      details,
    });

    if (error) {
      console.error("Failed to insert printer log:", error);
    }
  } catch (err) {
    console.error("Exception while logging printer event:", err);
  }
}
