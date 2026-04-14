import { useState } from "react";
import { ArrowLeft, UserCircle, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFeedback } from "@/hooks/use-feedback";

interface Props {
  tableName: string;
  setTableName: (v: string) => void;
  waiterName: string;
  setWaiterName: (v: string) => void;
  onStart: () => void;
  onBack: () => void;
}

const TableSelect = ({ tableName, setTableName, waiterName, setWaiterName, onStart, onBack }: Props) => {
  const navigate = useNavigate();
  const [editingWaiter, setEditingWaiter] = useState(!waiterName.trim());
  const { playFeedback } = useFeedback();

  return (
    <div className="flex min-h-screen flex-col p-4">
      <button
        onClick={() => {
          playFeedback("click");
          onBack();
        }}
        className="flex items-center gap-2 text-muted-foreground mb-6 text-base"
      >
        <ArrowLeft size={20} /> Voltar
      </button>

      {/* Waiter identification banner */}
      {waiterName.trim() && !editingWaiter ? (
        <div className="flex items-center justify-between rounded-lg bg-card border border-border p-3 mb-6 max-w-sm mx-auto w-full">
          <div className="flex items-center gap-2">
            <UserCircle size={20} className="text-primary" />
            <span className="text-sm text-muted-foreground">Atendendo como:</span>
            <span className="font-bold text-foreground">{waiterName}</span>
          </div>
          <button
            onClick={() => {
              playFeedback("click");
              setEditingWaiter(true);
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <RefreshCw size={14} />
            Trocar
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-bold text-primary">NOVO PEDIDO</h1>

        {/* Waiter name input — only shown if no name saved or editing */}
        {editingWaiter && (
          <div className="w-full max-w-sm space-y-2">
            <input
              type="text"
              placeholder="Seu Nome (Garçom)"
              value={waiterName}
              onChange={(e) => setWaiterName(e.target.value)}
              className="w-full rounded-lg border border-border bg-card p-4 text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            {waiterName.trim() && (
              <button
                onClick={() => {
                  playFeedback("click");
                  setEditingWaiter(false);
                }}
                className="w-full rounded-lg bg-secondary p-2 text-sm font-semibold text-secondary-foreground"
              >
                Confirmar: {waiterName}
              </button>
            )}
          </div>
        )}

        <input
          type="text"
          placeholder="Mesa / Nome do Cliente"
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-border bg-card p-4 text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <div className="grid grid-cols-3 gap-3 max-w-sm w-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => {
                playFeedback("click");
                setTableName(tableName + n);
              }}
              className="rounded-lg bg-card border border-border p-4 text-xl font-semibold text-foreground active:scale-95 transition-transform duration-150"
            >
              {n}
            </button>
          ))}
          <div />
          <button
            onClick={() => {
              playFeedback("click");
              setTableName(tableName + "0");
            }}
            className="rounded-lg bg-card border border-border p-4 text-xl font-semibold text-foreground active:scale-95 transition-transform duration-150"
          >
            0
          </button>
          <button
            onClick={() => {
              playFeedback("click");
              setTableName(tableName.slice(0, -1));
            }}
            className="rounded-lg bg-card border border-border p-4 text-xl font-semibold text-foreground active:scale-95 transition-transform duration-150"
          >
            ⌫
          </button>
        </div>

        <button
          onClick={() => {
            playFeedback("click");
            onStart();
          }}
          disabled={!tableName.trim() || !waiterName.trim()}
          className="w-full max-w-sm rounded-lg bg-primary p-4 text-lg font-bold text-primary-foreground transition-all duration-150 active:scale-[0.97] disabled:opacity-40 min-h-[56px]"
        >
          INICIAR PEDIDO
        </button>
      </div>
    </div>
  );
};

export default TableSelect;
