import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  tableName: string;
  setTableName: (v: string) => void;
  onStart: () => void;
}

const TableSelect = ({ tableName, setTableName, onStart }: Props) => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col p-4">
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-muted-foreground mb-8 text-base"
      >
        <ArrowLeft size={20} /> Voltar
      </button>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-bold text-primary">NOVO PEDIDO</h1>

        <input
          type="text"
          placeholder="Mesa / Nome do Cliente"
          value={tableName}
          onChange={(e) => setTableName(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-border bg-card p-4 text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />

        <div className="grid grid-cols-3 gap-3 max-w-sm w-full">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button
              key={n}
              onClick={() => setTableName(tableName + n)}
              className="rounded-lg bg-card border border-border p-4 text-xl font-semibold text-foreground active:scale-95 transition-transform duration-150"
            >
              {n}
            </button>
          ))}
          <div />
          <button
            onClick={() => setTableName(tableName + "0")}
            className="rounded-lg bg-card border border-border p-4 text-xl font-semibold text-foreground active:scale-95 transition-transform duration-150"
          >
            0
          </button>
          <button
            onClick={() => setTableName(tableName.slice(0, -1))}
            className="rounded-lg bg-card border border-border p-4 text-xl font-semibold text-foreground active:scale-95 transition-transform duration-150"
          >
            ⌫
          </button>
        </div>

        <button
          onClick={onStart}
          disabled={!tableName.trim()}
          className="w-full max-w-sm rounded-lg bg-primary p-4 text-lg font-bold text-primary-foreground transition-all duration-150 active:scale-[0.97] disabled:opacity-40 min-h-[56px]"
        >
          INICIAR PEDIDO
        </button>
      </div>
    </div>
  );
};

export default TableSelect;
