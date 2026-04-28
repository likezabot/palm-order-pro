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
  // Forcing expanded view by removing collapse logic

  );
}
