import { ArrowLeft, Eye, EyeOff, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DuplicatesResolver from "@/components/admin/DuplicatesResolver";
import SettingsDialog from "@/components/admin/SettingsDialog";
import TabIdBadge from "@/components/TabIdBadge";
import { useFeedback } from "@/hooks/use-feedback";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface Props {
  staffMode: boolean;
  onToggleStaffMode: () => void;
  autoPrint: boolean;
  onAutoPrintChange: (v: boolean) => void;
  onNewProduct: () => void;
}

export const AdminHeader = ({
  staffMode,
  onToggleStaffMode,
  autoPrint,
  onAutoPrintChange,
  onNewProduct,
}: Props) => {
  const navigate = useNavigate();
  const { playFeedback } = useFeedback();

  return (
    <div className="border-b border-border p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2 bg-white shadow-sm">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
        <SidebarTrigger className="shrink-0" />
        <button
          onClick={() => {
            playFeedback("click");
            navigate("/home");
          }}
          className="text-muted-foreground hover:bg-secondary p-2 rounded-full transition-colors shrink-0"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-base sm:text-xl font-black uppercase tracking-tight truncate">
          <span className="hidden sm:inline">Painel de Controle</span>
          <span className="sm:hidden">Admin</span>
        </h1>
        <TabIdBadge />
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
        <DuplicatesResolver />
        <button
          onClick={() => {
            playFeedback("click");
            onToggleStaffMode();
          }}
          className={`flex items-center gap-1 rounded-lg px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-black uppercase tracking-wider transition-colors ${
            staffMode
              ? "bg-warning/20 text-warning border border-warning/40"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
          title={
            staffMode
              ? "Modo Garçom: dados sensíveis ocultos"
              : "Modo Admin: tudo visível"
          }
        >
          {staffMode ? <EyeOff size={14} /> : <Eye size={14} />}
          <span className="hidden xs:inline">{staffMode ? "Garçom" : "Admin"}</span>
        </button>
        <SettingsDialog autoPrint={autoPrint} onAutoPrintChange={onAutoPrintChange} />
        <button
          onClick={() => {
            playFeedback("click");
            onNewProduct();
          }}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-bold text-primary-foreground active:scale-95 shadow-lg shadow-primary/20 transition-all"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">NOVO PRODUTO</span>
          <span className="sm:hidden">NOVO</span>
        </button>
      </div>
    </div>
  );
};

export default AdminHeader;
