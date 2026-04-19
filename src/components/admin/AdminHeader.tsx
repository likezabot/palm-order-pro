import { ArrowLeft, Eye, EyeOff, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DuplicatesResolver from "@/components/admin/DuplicatesResolver";
import SettingsDialog from "@/components/admin/SettingsDialog";
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
    <div className="border-b border-border p-4 flex items-center justify-between bg-white shadow-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={() => {
            playFeedback("click");
            navigate("/");
          }}
          className="text-muted-foreground hover:bg-secondary p-2 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-black uppercase tracking-tight">Painel de Controle</h1>
      </div>
      <div className="flex items-center gap-2">
        <DuplicatesResolver />
        <button
          onClick={() => {
            playFeedback("click");
            onToggleStaffMode();
          }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
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
          {staffMode ? "Modo Garçom" : "Modo Admin"}
        </button>
        <SettingsDialog autoPrint={autoPrint} onAutoPrintChange={onAutoPrintChange} />
        <button
          onClick={() => {
            playFeedback("click");
            onNewProduct();
          }}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground active:scale-95 shadow-lg shadow-primary/20 transition-all"
        >
          <Plus size={18} /> NOVO PRODUTO
        </button>
      </div>
    </div>
  );
};

export default AdminHeader;
