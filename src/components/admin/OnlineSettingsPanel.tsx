import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import RestaurantInfoEditor from "./online-settings/RestaurantInfoEditor";
import HoursEditor from "./online-settings/HoursEditor";
import DeliveryZonesEditor from "./online-settings/DeliveryZonesEditor";

export default function OnlineSettingsPanel() {
  const { data: restaurantId, isLoading } = useQuery({
    queryKey: ["admin", "online-settings", "restaurant-id"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants" as any)
        .select("id")
        .limit(1)
        .single();
      if (error) throw error;
      return (data as any).id as string;
    },
  });

  if (isLoading || !restaurantId) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
        Configurações que afetam apenas o <strong>cardápio público online</strong>: status, dados,
        horários, tempo de preparo e zonas de entrega.
      </div>
      <RestaurantInfoEditor />
      <HoursEditor restaurantId={restaurantId} />
      <DeliveryZonesEditor restaurantId={restaurantId} />
    </div>
  );
}
