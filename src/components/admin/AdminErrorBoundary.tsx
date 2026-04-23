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

const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 1200;

/**
 * ErrorBoundary específico para a rota Admin.
 * Captura falhas de lazy loading (chunk 404, "Failed to fetch dynamically imported module")
 * e tenta recarregar automaticamente até MAX_AUTO_RETRIES vezes antes de mostrar UI de fallback.
 */
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
    const isChunkError = this.isDynamicImportError(error);
    if (isChunkError && this.state.retryCount < MAX_AUTO_RETRIES) {
      this.scheduleAutoRetry();
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

  private scheduleAutoRetry = () => {
    this.setState({ retrying: true });
    this.retryTimer = setTimeout(() => {
      this.setState((s) => ({
        hasError: false,
        error: null,
        retrying: false,
        retryCount: s.retryCount + 1,
      }));
    }, RETRY_DELAY_MS);
  };

  private handleManualReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.retrying) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background">
          <RefreshCw className="w-10 h-10 text-primary animate-spin" />
          <p className="text-foreground font-medium">Recarregando Admin…</p>
          <p className="text-sm text-muted-foreground">
            Tentativa {this.state.retryCount + 1} de {MAX_AUTO_RETRIES}
          </p>
        </div>
      );
    }

    if (this.state.hasError) {
      const isChunkError = this.isDynamicImportError(this.state.error);
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background">
          <AlertTriangle className="w-12 h-12 text-destructive" />
          <h1 className="text-xl font-bold text-foreground">
            {isChunkError ? "Falha ao carregar o Admin" : "Algo deu errado"}
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {isChunkError
              ? "O carregamento do módulo falhou. Pode ser uma atualização recente ou conexão instável."
              : this.state.error?.message ?? "Erro inesperado no painel."}
          </p>
          <Button onClick={this.handleManualReload} size="lg" className="mt-2 gap-2">
            <RefreshCw className="w-4 h-4" />
            Recarregar Admin
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AdminErrorBoundary;
