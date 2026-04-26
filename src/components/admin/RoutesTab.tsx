import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, Globe, Lock, Smartphone, Monitor, Settings, Printer, ShoppingBag, ChefHat, Download, RefreshCw, ShoppingCart, Receipt, ListOrdered } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type RouteEntry = {
  path: string;
  label: string;
  description: string;
  audience: "public" | "staff";
  Icon: React.ComponentType<{ className?: string }>;
  example?: string; // path com parâmetros preenchidos para teste
};

const RoutesTab = () => {
  const { toast } = useToast();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Pega o slug ativo (assume único restaurante)
  const { data: restaurant } = useQuery({
    queryKey: ["routes-tab-restaurant"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("slug, name")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const slug = restaurant?.slug || "plano-b-espetaria";

  // Pega 1 pedido recente p/ exemplificar /sucesso/:orderId
  const { data: sampleOrder } = useQuery({
    queryKey: ["routes-tab-sample-order"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, public_token")
        .eq("channel", "online")
        .not("public_token", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const publicRoutes: RouteEntry[] = [
    {
      path: "/",
      label: "Raiz do site",
      description: "Redireciona automaticamente para o cardápio público. É o link curto que pode ser compartilhado.",
      audience: "public",
      Icon: Globe,
    },
    {
      path: `/menu/${slug}`,
      label: "Cardápio público",
      description: "Página principal que clientes veem. Lista produtos, categorias, banner, status aberto/fechado.",
      audience: "public",
      Icon: ShoppingBag,
    },
    {
      path: `/menu/${slug}/checkout`,
      label: "Checkout do cliente",
      description: "Formulário de finalização do pedido online (endereço, pagamento, troco).",
      audience: "public",
      Icon: ShoppingCart,
    },
    {
      path: `/menu/${slug}/sucesso/:orderId`,
      label: "Sucesso do pedido",
      description: "Tela mostrada após o cliente concluir um pedido online. Mostra status em tempo real.",
      audience: "public",
      Icon: Receipt,
      example: sampleOrder?.id
        ? `/menu/${slug}/sucesso/${sampleOrder.id}${sampleOrder.public_token ? `?t=${sampleOrder.public_token}` : ""}`
        : undefined,
    },
    {
      path: `/menu/${slug}/pedidos`,
      label: "Meus pedidos (cliente)",
      description: "Histórico de pedidos do cliente identificado por telefone.",
      audience: "public",
      Icon: ListOrdered,
    },
  ];

  const staffRoutes: RouteEntry[] = [
    {
      path: "/home",
      label: "Tela inicial da equipe",
      description: "Menu com atalhos para Atendimento, PDV, Cozinha e Admin. Protegida por PIN.",
      audience: "staff",
      Icon: Globe,
    },
    {
      path: "/palm",
      label: "Atendimento (Palm)",
      description: "App do garçom: seleção de mesa, montagem de pedido, envio à cozinha.",
      audience: "staff",
      Icon: Smartphone,
    },
    {
      path: "/kitchen",
      label: "Painel da Cozinha",
      description: "Kanban dos pedidos (novo / preparando / pronto). Para a TV ou tablet da cozinha.",
      audience: "staff",
      Icon: ChefHat,
    },
    {
      path: "/pdv",
      label: "PDV / Caixa",
      description: "Fechamento de contas, pagamento, histórico do dia.",
      audience: "staff",
      Icon: ShoppingBag,
    },
    {
      path: "/cashier",
      label: "Caixa (apelido)",
      description: "Mesma tela do PDV, rota alternativa.",
      audience: "staff",
      Icon: ShoppingBag,
    },
    {
      path: "/admin",
      label: "Painel Administrativo",
      description: "Cardápio, configurações, estatísticas, sistema, erros (você está aqui).",
      audience: "staff",
      Icon: Settings,
    },
    {
      path: "/print-station",
      label: "Estação de Impressão",
      description: "Tela auxiliar que processa a fila de impressão (usada quando não há bridge EXE).",
      audience: "staff",
      Icon: Printer,
    },
    {
      path: "/instalar/palm",
      label: "Instalar PWA — Atendimento",
      description: "Página de instruções para instalar o app Palm no celular do garçom.",
      audience: "staff",
      Icon: Download,
    },
    {
      path: "/instalar/cozinha",
      label: "Instalar PWA — Cozinha",
      description: "Página de instruções para instalar o app de Cozinha no tablet/TV.",
      audience: "staff",
      Icon: Monitor,
    },
    {
      path: "/atualizar",
      label: "Forçar atualização",
      description: "Limpa caches do navegador e força recarregar a versão mais nova do app.",
      audience: "staff",
      Icon: RefreshCw,
    },
  ];

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado!", description: url });
    } catch {
      toast({ variant: "destructive", title: "Não foi possível copiar" });
    }
  };

  const renderRoute = (r: RouteEntry) => {
    const Icon = r.Icon;
    const displayPath = r.example || r.path;
    const fullUrl = `${origin}${displayPath}`;
    const hasParams = displayPath.includes(":");
    return (
      <div
        key={r.path}
        className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              r.audience === "public"
                ? "bg-success/10 text-success"
                : "bg-primary/10 text-primary"
            }`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm text-card-foreground">{r.label}</h3>
              {r.audience === "staff" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  <Lock className="h-3 w-3" /> PIN
                </span>
              )}
              {r.audience === "public" && (
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-success/10 text-success">
                  Público
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {r.description}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 font-mono text-xs text-foreground break-all">
          {fullUrl}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => copyToClipboard(fullUrl)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold px-3 py-2 hover:bg-secondary/80 transition-colors"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar
          </button>
          {hasParams ? (
            <button
              disabled
              title="Esta URL precisa de parâmetros (ex: orderId) — não pode ser aberta diretamente"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold px-3 py-2 cursor-not-allowed"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Precisa de ID
            </button>
          ) : (
            <a
              href={displayPath}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold px-3 py-2 hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="rounded-xl border border-success/20 bg-success/5 p-4">
        <h2 className="text-base font-bold text-success flex items-center gap-2">
          <Globe className="h-5 w-5" /> URLs Públicas (Clientes)
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Estes são os links que você pode compartilhar com clientes. Não pedem PIN.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {publicRoutes.map(renderRoute)}
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mt-8">
        <h2 className="text-base font-bold text-primary flex items-center gap-2">
          <Lock className="h-5 w-5" /> Rotas Internas (Equipe)
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Estas rotas pedem o PIN da equipe ao serem acessadas em um aparelho não destravado.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {staffRoutes.map(renderRoute)}
      </div>

      <div className="text-[11px] text-muted-foreground/60 text-center pt-4">
        Slug do restaurante: <code className="font-mono">{slug}</code>
        {restaurant?.name ? ` · ${restaurant.name}` : ""}
      </div>
    </div>
  );
};

export default RoutesTab;
