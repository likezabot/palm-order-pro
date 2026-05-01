import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Save, RotateCcw, Loader2, CircleDot, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  loadPrintConfig,
  savePrintConfig,
  resetPrintConfig,
  syncPrintConfigFromDb,
  ensureFreshPrintConfig,
  type PrintConfig,
} from "@/lib/print-config";

import BridgeStatusCard from "@/components/printer-settings/BridgeStatusCard";
import PaperFormatSection from "@/components/printer-settings/PaperFormatSection";
import HeaderFooterSection from "@/components/printer-settings/HeaderFooterSection";
import VisibleSectionsSection from "@/components/printer-settings/VisibleSectionsSection";
import AutoPrintSection from "@/components/printer-settings/AutoPrintSection";
import AdvancedSection from "@/components/printer-settings/AdvancedSection";
import PerTypeSection from "@/components/printer-settings/PerTypeSection";
import LivePreview from "@/components/printer-settings/LivePreview";

function formatTimestamp(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function PrinterSettings() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<PrintConfig>(loadPrintConfig);
  const [savedCfg, setSavedCfg] = useState<PrintConfig>(cfg);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(true);
  const [resyncing, setResyncing] = useState(false);

  // Sync inicial: usa ensureFreshPrintConfig para preservar dados locais
  // se eles forem mais novos que o banco (evita sobrescrever save recente).
  useEffect(() => {
    ensureFreshPrintConfig()
      .then((fresh) => {
        setCfg(fresh);
        setSavedCfg(fresh);
      })
      .finally(() => setSyncing(false));
  }, []);

  const dirty = JSON.stringify(cfg) !== JSON.stringify(savedCfg);

  const patch = useCallback((p: Partial<PrintConfig>) => {
    setCfg((c) => ({ ...c, ...p }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const stamped = { ...cfg, configUpdatedAt: new Date().toISOString() };
      savePrintConfig(stamped);
      setCfg(stamped);
      setSavedCfg(stamped);
      toast.success("Configurações salvas");
    } catch (e: any) {
      toast.error(`Falha ao salvar: ${e?.message ?? "erro desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const fresh = resetPrintConfig();
    setCfg(fresh);
    setSavedCfg(fresh);
    toast.success("Configurações restauradas ao padrão");
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      const fresh = await syncPrintConfigFromDb();
      setCfg(fresh);
      setSavedCfg(fresh);
      toast.success("Configurações sincronizadas do banco");
    } catch {
      toast.error("Falha ao sincronizar do banco");
    } finally {
      setResyncing(false);
    }
  };

  const formContent = (
    <div className="space-y-4">
      <PaperFormatSection cfg={cfg} onChange={patch} />
      <HeaderFooterSection cfg={cfg} onChange={patch} />
      <VisibleSectionsSection cfg={cfg} onChange={patch} />
      <AutoPrintSection cfg={cfg} onChange={patch} />
      <PerTypeSection cfg={cfg} onChange={patch} />
      <AdvancedSection cfg={cfg} onChange={patch} />
    </div>
  );

  const previewContent = <LivePreview cfg={cfg} />;

  return (
    <div className="min-h-screen w-full bg-background">
      {/* HEADER */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
              Configurações de Impressão
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {syncing ? "Carregando do banco…" : `Última alteração salva: ${formatTimestamp(savedCfg.configUpdatedAt)}`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleResync} disabled={resyncing} className="gap-1.5">
            {resyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Sincronizar</span>
          </Button>
          {dirty && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-500 hidden sm:inline-flex">
              <CircleDot className="w-3 h-3 mr-1" /> Não salvo
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5 pb-32">
        {/* BRIDGE STATUS */}
        <BridgeStatusCard cfg={cfg} onChangeBridgeUrl={(url) => patch({ bridgeUrl: url })} />

        {/* DESKTOP/TABLET: 2 colunas */}
        <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] gap-6 w-full items-start">
          <div className="min-w-0 space-y-4">{formContent}</div>
          <div className="min-w-0">
            <div className="sticky top-24">
              <div className="bg-card border border-border rounded-xl p-4 max-h-[calc(100vh-180px)] overflow-auto">
                {previewContent}
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE: tabs */}
        <div className="md:hidden">
          <Tabs defaultValue="config">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="config">Configurações</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="config" className="mt-4">
              {formContent}
            </TabsContent>
            <TabsContent value="preview" className="mt-4">
              <div className="bg-card border border-border rounded-xl p-4 min-h-[600px]">
                {previewContent}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* FOOTER FIXO DE AÇÕES */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="default" className="gap-2">
                <RotateCcw className="w-4 h-4" /> Restaurar padrão
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restaurar configurações ao padrão?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todas as personalizações desta página serão perdidas. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Restaurar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex-1 text-[11px] text-muted-foreground hidden sm:block">
            {dirty ? "Há alterações não salvas." : "Tudo salvo."}
          </div>

          <Button
            size="default"
            className="gap-2 font-bold"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar configurações
          </Button>
        </div>
      </div>
    </div>
  );
}
