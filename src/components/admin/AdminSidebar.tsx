/**
 * AdminSidebar — navegação lateral do /admin agrupada por seção.
 *
 * Substitui a lista horizontal de 11 abas. Mantém a regra `admin-only`
 * (itens ocultos no modo Garçom) e exibe o badge de erros não resolvidos.
 *
 * Comunicação: lê/escreve `?section=` na URL via callback.
 */
import {
  ShoppingBag,
  Printer,
  Wrench,
  BarChart3,
  Activity,
  Globe,
  ShoppingCart,
  ShieldAlert,
  Link2,
  Gift,
  UtensilsCrossed,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Item = {
  value: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  badge?: number;
};

type Group = { title: string; items: Item[] };

interface Props {
  active: string;
  onChange: (value: string) => void;
  staffMode: boolean;
  unresolvedErrors: number;
}

export default function AdminSidebar({ active, onChange, staffMode, unresolvedErrors }: Props) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const groups: Group[] = [
    {
      title: "Cardápio",
      items: [
        { value: "products", label: "Produtos", icon: UtensilsCrossed },
        { value: "online", label: "Cardápio Online", shortLabel: "Online", icon: Globe },
        { value: "loyalty", label: "Fidelidade", icon: Gift },
      ],
    },
    {
      title: "Pedidos",
      items: [
        { value: "orders", label: "Editor de Pedidos", shortLabel: "Editor", icon: ShoppingBag },
        { value: "online-orders", label: "Pedidos Online", shortLabel: "Online", icon: ShoppingCart },
      ],
    },
    {
      title: "Operação",
      items: [
        { value: "print", label: "Impressão", icon: Printer },
        { value: "network", label: "Rede", icon: Activity, adminOnly: true },
        { value: "routes", label: "Rotas & URLs", shortLabel: "Rotas", icon: Link2, adminOnly: true },
      ],
    },
    {
      title: "Sistema",
      items: [
        {
          value: "errors",
          label: "Erros & Saúde",
          shortLabel: "Erros",
          icon: ShieldAlert,
          adminOnly: true,
          badge: unresolvedErrors,
        },
        { value: "stats", label: "Estatísticas", shortLabel: "Stats", icon: BarChart3, adminOnly: true },
        { value: "system", label: "Manutenção", icon: Wrench, adminOnly: true },
      ],
    },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent className="bg-white">
        {groups.map((group) => {
          const visible = group.items.filter((i) => !i.adminOnly || !staffMode);
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={group.title}>
              {!collapsed && (
                <SidebarGroupLabel className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">
                  {group.title}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.value;
                    return (
                      <SidebarMenuItem key={item.value}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                        >
                          <button
                            type="button"
                            onClick={() => onChange(item.value)}
                            className={cn(
                              "w-full flex items-center gap-2 font-bold text-sm",
                              isActive && "text-primary",
                            )}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            {!collapsed && <span className="truncate">{item.label}</span>}
                            {!collapsed && item.badge != null && item.badge > 0 && (
                              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-black leading-none">
                                {item.badge > 99 ? "99+" : item.badge}
                              </span>
                            )}
                          </button>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
