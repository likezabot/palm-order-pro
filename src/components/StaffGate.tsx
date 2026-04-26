import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { isStaffUnlocked, unlockStaff } from "@/lib/staff-access";
import { useFeedback } from "@/hooks/use-feedback";

/**
 * Envolve rotas internas. Se o aparelho ainda não destravou,
 * mostra uma tela de PIN. Caso contrário, renderiza normalmente.
 */
const StaffGate = ({ children }: { children: React.ReactNode }) => {
  const [unlocked, setUnlocked] = useState(() => isStaffUnlocked());
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { playFeedback } = useFeedback();

  useEffect(() => {
    if (unlocked) return;
    // Foco automático no input ao abrir
    const t = setTimeout(() => {
      const el = document.getElementById("staff-pin-input") as HTMLInputElement | null;
      el?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [unlocked]);

  if (unlocked) return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unlockStaff(pin)) {
      playFeedback("success");
      setUnlocked(true);
    } else {
      playFeedback("error");
      setError("PIN incorreto");
      setPin("");
    }
  };

  return (
    <div className="flex min-h-screen-safe flex-col items-center justify-center gap-6 p-6">
      <div className="text-center mb-2">
        <h1 className="text-3xl font-black tracking-widest brand-gradient-text">
          PLANO B
        </h1>
        <p className="text-xs font-bold tracking-[0.4em] text-muted-foreground mt-1">
          ACESSO INTERNO
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs flex flex-col gap-4 rounded-2xl bg-card border border-border p-6 shadow-card"
      >
        <div className="flex items-center gap-3 text-card-foreground">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold">Área restrita</p>
            <p className="text-xs text-muted-foreground">
              Digite o PIN da equipe
            </p>
          </div>
        </div>

        <input
          id="staff-pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="• • • •"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 8));
            if (error) setError(null);
          }}
          className="w-full rounded-xl bg-background border border-border px-4 py-4 text-center text-2xl tracking-[0.5em] text-foreground focus:outline-none focus:border-primary"
        />

        {error && (
          <p className="text-sm text-destructive text-center -mt-1">{error}</p>
        )}

        <button
          type="submit"
          disabled={pin.length < 4}
          className="rounded-xl bg-primary text-primary-foreground font-semibold py-3 disabled:opacity-50 active:scale-[0.97] transition-transform"
        >
          Entrar
        </button>

        <p className="text-[11px] text-muted-foreground/70 text-center leading-relaxed">
          Esse aparelho ficará destravado até você limpar o cache ou sair.
        </p>
      </form>
    </div>
  );
};

export default StaffGate;
