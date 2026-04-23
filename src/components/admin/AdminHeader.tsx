import { ArrowLeft, Eye, EyeOff, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DuplicatesResolver from "@/components/admin/DuplicatesResolver";
import SettingsDialog from "@/components/admin/SettingsDialog";
import TabIdBadge from "@/components/TabIdBadge";
import { Button } from "@/components/ui/button";
import { useFeedback } from "@/hooks/use-feedback";

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
    <div className="border-b border-border bg-card px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            playFeedback("click");
            navigate("/");
          }}
          className="h-9 w-9 shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate text-foreground">
          <span className="hidden sm:inline">Painel de Controle</span>
          <span className="sm:hidden">Admin</span>
        </h1>
        <TabIdBadge />
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
        <DuplicatesResolver />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            playFeedback("click");
            onToggleStaffMode();
          }}
          className={`h-9 gap-1.5 font-medium ${
            staffMode
              ? "border-warning/40 bg-warning/10 text-warning hover:bg-warning/15 hover:text-warning"
              : ""
          }`}
          title={
            staffMode
              ? "Modo Garçom: dados sensíveis ocultos"
              : "Modo Admin: tudo visível"
          }
        >
          {staffMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span className="hidden xs:inline">{staffMode ? "Garçom" : "Admin"}</span>
        </Button>
        <SettingsDialog autoPrint={autoPrint} onAutoPrintChange={onAutoPrintChange} />
        <Button
          size="sm"
          onClick={() => {
            playFeedback("click");
            onNewProduct();
          }}
          className="h-9 gap-1.5 font-medium"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo produto</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>
    </div>
  );
};

export default AdminHeader;
