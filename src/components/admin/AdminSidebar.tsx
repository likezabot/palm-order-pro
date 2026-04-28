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
  icon: any; // Allow any icon component with standard props
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
    <Sidebar collapsible="offcanvas" className="border-r border-gray-200 bg-white">
      <SidebarContent className="bg-white">
        {groups.map((group) => {
          const visible = group.items.filter((i) => !i.adminOnly || !staffMode);
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={group.title} className="p-0">
              {!collapsed && (
                <SidebarGroupLabel className="px-4 pt-6 pb-2 text-[11px] font-black uppercase tracking-widest text-black opacity-100 h-auto">
                  {group.title}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0">
                  {visible.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.value;
                    return (
                      <SidebarMenuItem key={item.value}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className={cn(
                            "w-full h-auto p-0 rounded-none border-none transition-none",
                            "hover:bg-[#F3F3F3] hover:text-black",
                            isActive && "bg-[#EAEAEA] border-l-[3px] border-black hover:bg-[#EAEAEA]",
                            "data-[active=true]:bg-[#EAEAEA] data-[active=true]:text-black"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onChange(item.value)}
                            className={cn(
                              "w-full flex items-center gap-3 py-3 px-4 font-semibold text-sm transition-none text-black",
                            )}
                          >
                            <Icon className="w-5 h-5 shrink-0 text-black" style={{ color: '#000000' }} />
                            {!collapsed && <span className="truncate">{item.label}</span>}
                            {!collapsed && item.badge != null && item.badge > 0 && (
                              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-black text-white text-[10px] font-black leading-none">
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
