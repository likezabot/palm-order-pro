import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retrying: boolean;
  retryCount: number;
}

const MAX_AUTO_RETRIES = 1;
const RETRY_DELAY_MS = 900;
const RELOAD_GUARD_KEY = "admin-chunk-hard-reload-v1";
const RELOAD_GUARD_WINDOW_MS = 15_000;

class AdminErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    retrying: false,
    retryCount: 0,
  };

  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    if (this.isDynamicImportError(error) && this.canHardReloadOnce()) {
      this.scheduleHardReload();
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  private isDynamicImportError(error: Error | null): boolean {
    if (!error) return false;
    const msg = `${error.name} ${error.message}`.toLowerCase();
    return (
      msg.includes("failed to fetch dynamically imported module") ||
      msg.includes("importing a module script failed") ||
      msg.includes("loading chunk") ||
      msg.includes("loading css chunk")
    );
  }

  private canHardReloadOnce(): boolean {
    try {
      const lastAttempt = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? "0");
      return !lastAttempt || Date.now() - lastAttempt > RELOAD_GUARD_WINDOW_MS;
    } catch {
      return true;
    }
  }

  private reloadAdminRoute = () => {
    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      const url = new URL(window.location.href);
      url.pathname = "/admin";
      url.searchParams.set("adminReload", String(Date.now()));
      window.location.replace(url.toString());
    } catch {
      window.location.reload();
    }
  };

  private scheduleHardReload = () => {
    this.setState((s) => ({ retrying: true, retryCount: s.retryCount + 1 }));
    this.retryTimer = setTimeout(() => {
      this.reloadAdminRoute();
    }, RETRY_DELAY_MS);
  };

  private handleManualReload = () => {
    this.reloadAdminRoute();
  };

  render() {
    if (this.state.retrying) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
          <RefreshCw className="h-10 w-10 animate-spin text-primary" />
          <p className="font-medium text-foreground">Recarregando Admin…</p>
          <p className="text-center text-sm text-muted-foreground">
            Atualizando a rota para buscar o módulo novamente.
          </p>
        </div>
      );
    }

    if (this.state.hasError) {
      const isChunkError = this.isDynamicImportError(this.state.error);
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h1 className="text-xl font-bold text-foreground">
            {isChunkError ? "Falha ao carregar o Admin" : "Algo deu errado"}
          </h1>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {isChunkError
              ? "O preview perdeu a referência do módulo do Admin após uma atualização."
              : this.state.error?.message ?? "Erro inesperado no painel."}
          </p>
          <Button onClick={this.handleManualReload} size="lg" className="mt-2 gap-2">
            <RefreshCw className="h-4 w-4" />
            Recarregar Admin
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AdminErrorBoundary;
