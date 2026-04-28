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
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Item = {
  value: string;
  label: string;
  shortLabel?: string;
  icon: any;
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
    <Sidebar 
      collapsible="none" 
      className="!bg-white border-r border-[#E5E5E5] w-[260px] min-w-[240px] max-w-[280px]"
      style={{ "--sidebar-width": "260px" } as React.CSSProperties}
    >
      <SidebarContent className="!bg-white p-3">
        {groups.map((group) => {
          const visible = group.items.filter((i) => !i.adminOnly || !staffMode);
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={group.title} className="p-0">
              <SidebarGroupLabel className="px-4 pt-8 pb-3 text-[14px] font-black uppercase tracking-widest !text-black opacity-100 h-auto">
                {group.title}
              </SidebarGroupLabel>
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
                          className={cn(
                            "w-full h-auto p-0 rounded-none border-none transition-none",
                            "hover:!bg-[#F3F3F3] hover:!text-black",
                            isActive && "!bg-[#EAEAEA] border-l-[3px] !border-black hover:!bg-[#EAEAEA]",
                            "data-[active=true]:!bg-[#EAEAEA] data-[active=true]:!text-black"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => onChange(item.value)}
                            className="w-full flex items-center gap-3 py-3 px-4 font-semibold text-sm transition-none !text-black"
                          >
                            <Icon className="w-5 h-5 shrink-0 !text-black" />
                            <span className="truncate whitespace-nowrap">{item.label}</span>
                            {item.badge != null && item.badge > 0 && (
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
