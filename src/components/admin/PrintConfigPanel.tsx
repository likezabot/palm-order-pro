/**
 * Painel ÚNICO de configuração de impressão (Admin).
 *
 * Edita exclusivamente a config global `print_config` (RPC admin_save_print_config).
 * Banco é a fonte de verdade — localStorage é só cache.
 *
 * Seções:
 *  1. Status da impressão (APP_BUILD, PRINT_ENGINE, CONFIG_SOURCE, etc.)
 *  2. Conexão da bridge
 *  3. Layout do talão
 *  4. Conteúdo exibido
 *  5. Preview real (usa createReceiptLayoutModel)
 *  6. Diagnóstico
 *
 * NÃO mexe em: bridge, EXE, USB, print_jobs, dispatcher, thermal-printer,
 * receipt-layout — só orquestra a UI de configuração.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  loadPrintConfig,
  savePrintConfig,
  resetPrintConfig,
  syncPrintConfigFromDb,
  applyPreset,
  type PrintConfig,
  type LayoutPreset,
  type VisibleSections,
} from "@/lib/print-config";
import {
  buildReceiptHtml,
  buildSenhaHtml,
  printReceipt,
  printSenha,
  printDelivery,
  printBill,
} from "@/lib/print-receipt";
import { buildHtmlFromLayout } from "@/lib/receipt-html";
import { checkBridgeStatus, type BridgeHealth } from "@/lib/thermal-printer";
import { PRINT_ENGINE_VERSION, APP_BUILD } from "@/lib/print-engine";
import PrinterDiagnostics from "./PrinterDiagnostics";
import BridgeOriginDiagnostics from "./BridgeOriginDiagnostics";
import PrintConfigSelfTest from "./PrintConfigSelfTest";
import PrintOriginPanel from "./PrintOriginPanel";
import AdvancedSection from "./AdvancedSection";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Printer,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Info,
  Cloud,
  CloudOff,
  Save,
  RefreshCw,
  Truck,
  Store,
  Utensils,
  Receipt,
  Hash,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ============================================================
// Sample data — usado em previews E nos testes de impressão
// ============================================================

const SAMPLE_ITEMS = [
  { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0, note: "Bem passado" },
  { product_name: "Refrigerante Lata", quantity: 1, product_price: 8.5, note: null },
  { product_name: "Cerveja Original", quantity: 3, product_price: 12.0, note: "Bem gelada" },
];
const SAMPLE_TOTAL = SAMPLE_ITEMS.reduce(
  (s, i) => s + i.product_price * i.quantity,
  0,
);

const SAMPLE_DELIVERY = {
  customerName: "Maria Souza",
  customerPhone: "(11) 99999-1234",
  deliveryAddress: {
    street: "Rua das Flores",
    number: "123",
    neighborhood: "Centro",
    complement: "Apto 42",
    reference: "Próximo à padaria",
  },
  deliveryFee: 5,
  paymentMethod: "cash",
  changeFor: 100,
};

const PRESET_LABELS: Record<LayoutPreset, string> = {
  classico: "Clássico",
  mesa_simples: "Mesa simples",
  conta_destacada: "Conta destacada",
};

const SECTION_FIELDS: { key: keyof VisibleSections; label: string }[] = [
  { key: "title", label: "Título do estabelecimento" },
  { key: "waiter", label: "Garçom" },
  { key: "date", label: "Data e hora" },
  { key: "notes", label: "Observações dos itens" },
  { key: "footer", label: "Rodapé" },
];

type PreviewKind = "mesa" | "retirada" | "delivery" | "conta" | "senha";

const PREVIEW_TABS: { value: PreviewKind; label: string; icon: typeof Truck }[] = [
  { value: "mesa", label: "Mesa", icon: Utensils },
  { value: "retirada", label: "Retirada", icon: Store },
  { value: "delivery", label: "Delivery", icon: Truck },
  { value: "conta", label: "Conta", icon: Receipt },
  { value: "senha", label: "Senha", icon: Hash },
];

// ============================================================
// Componente
// ============================================================

export default function PrintConfigPanel() {
  const [cfg, setCfg] = useState<PrintConfig>(loadPrintConfig);
  const [previewKind, setPreviewKind] = useState<PreviewKind>("mesa");
  const [bridgeStatus, setBridgeStatus] = useState<BridgeHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState<PreviewKind | null>(null);

  // ---- Carrega do banco no mount ----
  useEffect(() => {
    setSyncing(true);
    syncPrintConfigFromDb()
      .then((fresh) => setCfg(fresh))
      .finally(() => setSyncing(false));
  }, []);

  // ---- Verificação de bridge ----
  const verifyBridge = useCallback(async (url: string) => {
    setChecking(true);
    try {
      const status = await checkBridgeStatus(url);
      setBridgeStatus(status);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (cfg.printMode === "bridge" && cfg.bridgeUrl) {
      verifyBridge(cfg.bridgeUrl);
      const id = setInterval(() => verifyBridge(cfg.bridgeUrl), 10_000);
      return () => clearInterval(id);
    }
    setBridgeStatus(null);
  }, [cfg.printMode, cfg.bridgeUrl, verifyBridge]);

  // ---- Persistência ----
  const persist = useCallback((next: PrintConfig) => {
    setCfg(next);
    setSaving(true);
    try {
      savePrintConfig(next);
      toast.success("Configuração salva no banco e sincronizada.");
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("42501") || /row-level security/i.test(msg)) {
        toast.error("Erro de permissão ao salvar print_config. Verifique RPC admin_save_print_config.");
      } else {
        toast.error(`Falha ao salvar: ${msg || "erro desconhecido"}`);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const update = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) => {
    persist({ ...cfg, [key]: value });
  };
  const updateSection = (key: keyof VisibleSections, value: boolean) => {
    persist({ ...cfg, visibleSections: { ...cfg.visibleSections, [key]: value } });
  };
  const handlePreset = (preset: LayoutPreset) => {
    persist(applyPreset(preset, cfg));
  };

  // ---- Ações ----
  const handleSyncFromDb = async () => {
    setSyncing(true);
    try {
      const fresh = await syncPrintConfigFromDb();
      setCfg(fresh);
      toast.success("Configuração sincronizada do banco.");
    } catch (e: any) {
      toast.error(`Falha ao sincronizar: ${e?.message ?? "?"}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleReset = () => {
    const fresh = resetPrintConfig();
    setCfg(fresh);
    toast.success("Configuração restaurada ao padrão.");
  };

  // ---- Testes de impressão ----
  const runTestPrint = async (kind: PreviewKind) => {
    setPrinting(kind);
    let ok = false;
    let err = "";
    try {
      let result: { ok: boolean; error?: string };
      switch (kind) {
        case "mesa":
          result = await printReceipt("Mesa 5", "Carlos", SAMPLE_ITEMS, SAMPLE_TOTAL, {
            serviceType: "dine_in",
            fingerprint: { printPath: "admin.test.mesa", source: "test" },
          });
          ok = result.ok;
          err = result.error || "";
          break;
        case "retirada":
          result = await printReceipt("", "", SAMPLE_ITEMS, SAMPLE_TOTAL, {
            serviceType: "pickup",
            customerName: "João Pereira",
            customerPhone: "(11) 98888-2222",
            fingerprint: { printPath: "admin.test.retirada", source: "test" },
          });
          ok = result.ok;
          err = result.error || "";
          break;
        case "delivery":
          result = await printDelivery({
            items: SAMPLE_ITEMS,
            customerName: SAMPLE_DELIVERY.customerName,
            customerPhone: SAMPLE_DELIVERY.customerPhone,
            deliveryAddress: SAMPLE_DELIVERY.deliveryAddress,
            deliveryFee: SAMPLE_DELIVERY.deliveryFee,
            subtotal: SAMPLE_TOTAL,
            total: SAMPLE_TOTAL + SAMPLE_DELIVERY.deliveryFee,
            paymentMethod: SAMPLE_DELIVERY.paymentMethod,
            changeFor: SAMPLE_DELIVERY.changeFor,
            orderId: "test-delivery-001",
            orderShortId: "T001",
            serviceType: "delivery",
            fingerprint: { printPath: "admin.test.delivery", source: "test" },
          });
          ok = result.ok;
          err = result.error || "";
          break;
        case "conta":
          result = await printBill("Mesa 5", "Carlos", SAMPLE_ITEMS, SAMPLE_TOTAL, {
            serviceType: "dine_in",
            fingerprint: { printPath: "admin.test.conta", source: "test" },
          });
          ok = result.ok;
          err = result.error || "";
          break;
        case "senha":
          ok = await printSenha("146", SAMPLE_ITEMS, {
            waiterName: "Carlos",
            orderId: "test-senha-0001",
            customerName: "CONSUMIDOR FINAL",
            total: SAMPLE_TOTAL,
            force: true,
            source: "test",
          });
          break;
      }
    } catch (e: any) {
      err = e?.message ?? "";
    } finally {
      setPrinting(null);
    }
    if (ok) {
      toast.success(`Teste de ${kind} enviado para impressão.`);
    } else {
      toast.error(
        cfg.printMode === "bridge"
          ? `Falha no teste de ${kind}: ${err || "ponte indisponível"}`
          : `Modo Navegador não imprime de verdade — ative a Ponte Local.`,
      );
    }
  };

  // ---- Preview HTML (mesma fonte do ESC/POS) ----
  const previewHtml = useMemo(() => {
    switch (previewKind) {
      case "mesa":
        return buildReceiptHtml("Mesa 5", "Carlos", SAMPLE_ITEMS, SAMPLE_TOTAL, cfg);
      case "retirada":
        return buildHtmlFromLayout(
          "PEDIDO",
          "Retirada",
          {
            tableName: "",
            waiterName: "",
            items: SAMPLE_ITEMS,
            total: SAMPLE_TOTAL,
            serviceType: "pickup",
            customerName: "João Pereira",
            customerPhone: "(11) 98888-2222",
          },
          cfg,
        );
      case "delivery":
        return buildHtmlFromLayout(
          "DELIVERY",
          "Delivery",
          {
            items: SAMPLE_ITEMS,
            subtotal: SAMPLE_TOTAL,
            deliveryFee: SAMPLE_DELIVERY.deliveryFee,
            total: SAMPLE_TOTAL + SAMPLE_DELIVERY.deliveryFee,
            customerName: SAMPLE_DELIVERY.customerName,
            customerPhone: SAMPLE_DELIVERY.customerPhone,
            deliveryAddress: SAMPLE_DELIVERY.deliveryAddress,
            paymentMethod: SAMPLE_DELIVERY.paymentMethod,
            changeFor: SAMPLE_DELIVERY.changeFor,
            orderShortId: "T001",
            serviceType: "delivery",
          },
          cfg,
        );
      case "conta":
        return buildHtmlFromLayout(
          "CONTA",
          "Conta",
          {
            tableName: "Mesa 5",
            waiterName: "Carlos",
            items: SAMPLE_ITEMS,
            total: SAMPLE_TOTAL,
            serviceType: "dine_in",
          },
          cfg,
        );
      case "senha":
        return buildSenhaHtml("146", SAMPLE_ITEMS, cfg, {
          waiterName: "Carlos",
          orderId: "test-senha-0001",
          customerName: "CONSUMIDOR FINAL",
          total: SAMPLE_TOTAL,
        });
    }
  }, [cfg, previewKind]);

  const pxWidth = cfg.paperWidth === "58mm" ? 219 : 302;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-6 w-full">
      {/* ========== COLUNA ESQUERDA — Editor ========== */}
      <div className="space-y-6 min-w-0">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            <strong>Nova!</strong> Página dedicada com preview ao vivo e tudo editável.
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={() => { window.location.href = "/configuracoes/impressora"; }}
          >
            Abrir página completa
          </Button>
        </div>
        {/* 1. STATUS */}
        <StatusCard
          cfg={cfg}
          bridgeStatus={bridgeStatus}
          syncing={syncing}
          saving={saving}
          onSync={handleSyncFromDb}
          onReset={handleReset}
        />

        {/* 2. BRIDGE */}
        <BridgeCard
          cfg={cfg}
          bridgeStatus={bridgeStatus}
          checking={checking}
          onChange={(patch) => persist({ ...cfg, ...patch })}
          onTest={() => verifyBridge(cfg.bridgeUrl)}
        />

        {/* 3. LAYOUT */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
              <Printer className="w-4 h-4" /> Layout do talão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground">Cabeçalho</Label>
              <Input
                value={cfg.headerText}
                onChange={(e) => setCfg({ ...cfg, headerText: e.target.value })}
                onBlur={() => persist(cfg)}
                placeholder="PLANO B ESPETARIA"
                aria-label="cabeçalho do talão"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase font-bold text-muted-foreground">Rodapé</Label>
              <Input
                value={cfg.footerText}
                onChange={(e) => setCfg({ ...cfg, footerText: e.target.value })}
                onBlur={() => persist(cfg)}
                placeholder="Obrigado pela preferência!"
                aria-label="rodapé do talão"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Largura</Label>
                <div className="flex gap-2">
                  {(["58mm", "80mm"] as const).map((w) => (
                    <Button
                      key={w}
                      size="sm"
                      variant={cfg.paperWidth === w ? "default" : "outline"}
                      className="flex-1 font-bold"
                      onClick={() => update("paperWidth", w)}
                    >
                      {w}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Tamanho</Label>
                <div className="flex gap-2">
                  {(["normal", "grande"] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={cfg.printSize === s ? "default" : "outline"}
                      className="flex-1 font-bold capitalize"
                      onClick={() => update("printSize", s)}
                    >
                      {s === "normal" ? "Pequeno" : "Grande"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Alinhamento</Label>
                <div className="flex gap-2">
                  {([
                    { v: "left", label: "Esquerda" },
                    { v: "center", label: "Centro" },
                  ] as const).map((opt) => (
                    <Button
                      key={opt.v}
                      size="sm"
                      variant={cfg.contentAlign === opt.v ? "default" : "outline"}
                      className="flex-1 font-bold"
                      onClick={() => update("contentAlign", opt.v)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Preset visual</Label>
                <Select value={cfg.layoutPreset} onValueChange={(v) => handlePreset(v as LayoutPreset)}>
                  <SelectTrigger className="font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRESET_LABELS) as LayoutPreset[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {PRESET_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. CONTEÚDO EXIBIDO */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wide">Conteúdo exibido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {SECTION_FIELDS.map((s) => (
              <div key={s.key} className="flex items-center justify-between py-1">
                <span className="text-sm font-medium">{s.label}</span>
                <Switch
                  checked={cfg.visibleSections[s.key]}
                  onCheckedChange={(v) => updateSection(s.key, v)}
                  aria-label={`exibir ${s.label}`}
                />
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 mt-2 border-t">
              <span className="text-sm font-medium">Imprimir senha automaticamente no BALCÃO</span>
              <Switch
                checked={cfg.printSenhaEnabled}
                onCheckedChange={(v) => update("printSenhaEnabled", v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* 5. DIAGNÓSTICOS (auto-teste, origem, bridge, impressora) — escondidos por padrão */}
        <AdvancedSection
          id="print-diagnostics"
          label="Mostrar diagnósticos avançados"
          description="Auto-teste, origem dos pedidos reais, diagnóstico da bridge e da impressora."
        >
          <PrintConfigSelfTest cfg={cfg} onConfigSynced={(next) => setCfg(next)} />
          <PrintOriginPanel />
          <BridgeOriginDiagnostics
            bridgeUrl={cfg.bridgeUrl}
            configSource={cfg.configSource ?? "default"}
            onBridgeUrlChange={(url) => persist({ ...cfg, bridgeUrl: url, printMode: "bridge" })}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wide">Diagnóstico da impressora</CardTitle>
            </CardHeader>
            <CardContent>
              <PrinterDiagnostics
                bridgeUrl={cfg.bridgeUrl}
                onBridgeUrlChange={(url) => persist({ ...cfg, bridgeUrl: url, printMode: "bridge" })}
              />
            </CardContent>
          </Card>
        </AdvancedSection>
      </div>

      {/* ========== COLUNA DIREITA — Preview + Testes ========== */}
      <div className="space-y-4 min-w-0">
        <Card className="sticky top-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center justify-between">
              <span>Preview real</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {cfg.paperWidth}
              </Badge>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Atualiza ao vivo. Usa o mesmo modelo do ESC/POS — se o papel sair diferente,
              é cache antigo no EXE.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Tabs value={previewKind} onValueChange={(v) => setPreviewKind(v as PreviewKind)}>
              <TabsList className="grid grid-cols-5 w-full">
                {PREVIEW_TABS.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger key={value} value={value} className="text-[10px] font-bold gap-1">
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div
              className="bg-white rounded-lg shadow-md overflow-hidden mx-auto border border-border"
              style={{ width: pxWidth, maxHeight: 520 }}
            >
              <iframe
                title={`Preview ${previewKind}`}
                srcDoc={previewHtml}
                style={{
                  width: pxWidth,
                  minHeight: 350,
                  maxHeight: 520,
                  border: "none",
                  display: "block",
                }}
              />
            </div>

            <Button
              className="w-full font-bold gap-2"
              onClick={() => runTestPrint(previewKind)}
              disabled={printing === previewKind}
            >
              <Printer className="w-4 h-4" />
              {printing === previewKind
                ? "Imprimindo..."
                : `Imprimir teste de ${PREVIEW_TABS.find((t) => t.value === previewKind)?.label}`}
            </Button>

            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
              Se o papel não mostrar o mesmo <strong>PRINT_ENGINE: {PRINT_ENGINE_VERSION}</strong> exibido aqui, a impressora está usando outra versão/cache.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Subcomponentes
// ============================================================

function StatusCard({
  cfg,
  bridgeStatus,
  syncing,
  saving,
  onSync,
  onReset,
}: {
  cfg: PrintConfig;
  bridgeStatus: BridgeHealth | null;
  syncing: boolean;
  saving: boolean;
  onSync: () => void;
  onReset: () => void;
}) {
  const isLocalStale = cfg.configSource && cfg.configSource !== "db";
  const configOk = cfg.configSource === "db";
  const bridgeOk = !!bridgeStatus?.online;
  const usbOk = !!bridgeStatus?.printer_connected;

  // Status global resumido
  const allOk = configOk && bridgeOk && usbOk;
  const partial = configOk || bridgeOk;
  const statusLabel = allOk
    ? "Tudo certo"
    : partial
    ? "Atenção"
    : "Com problemas";
  const statusTone = allOk ? "success" : partial ? "warning" : "danger";
  const StatusIcon = allOk ? CheckCircle2 : partial ? AlertTriangle : XCircle;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            Status da impressão
            <DetailsDialog
              cfg={cfg}
              bridgeStatus={bridgeStatus}
              syncing={syncing}
            />
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={onSync} disabled={syncing}>
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span className="text-xs hidden sm:inline">Sincronizar</span>
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={onReset}>
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-xs hidden sm:inline">Padrão</span>
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Resumo visual compacto — só o essencial */}
        <div className="grid grid-cols-3 gap-2">
          <StatusPill
            label="Config"
            value={configOk ? "Banco" : "Local"}
            tone={configOk ? "success" : "warning"}
          />
          <StatusPill
            label="Ponte"
            value={bridgeOk ? "Online" : bridgeStatus ? "Offline" : "—"}
            tone={bridgeOk ? "success" : bridgeStatus ? "danger" : "neutral"}
          />
          <StatusPill
            label="Impressora"
            value={usbOk ? "OK" : bridgeOk ? "N/D" : "—"}
            tone={usbOk ? "success" : bridgeOk ? "warning" : "neutral"}
          />
        </div>

        <div className={`mt-3 flex items-center gap-2 text-xs font-bold ${
          statusTone === "success"
            ? "text-emerald-600 dark:text-emerald-400"
            : statusTone === "warning"
            ? "text-amber-600 dark:text-amber-400"
            : "text-rose-600 dark:text-rose-400"
        }`}>
          <StatusIcon className="w-3.5 h-3.5" />
          <span>{statusLabel}</span>
          {saving && (
            <span className="ml-auto flex items-center gap-1 text-muted-foreground font-normal">
              <Save className="w-3 h-3 animate-pulse" /> Salvando...
            </span>
          )}
        </div>

        {isLocalStale && (
          <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2 text-[11px] text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
            Config local pode estar mais velha que a do banco. Clique em <strong>Sincronizar</strong>.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const cls =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900"
      : tone === "warning"
      ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900"
      : tone === "danger"
      ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900"
      : "bg-muted text-muted-foreground border-border";
  return (
    <div className={`rounded-md border px-2 py-1.5 text-center ${cls}`}>
      <div className="text-[9px] uppercase font-bold opacity-70 tracking-wide">{label}</div>
      <div className="text-xs font-bold truncate">{value}</div>
    </div>
  );
}

/**
 * Bolinha "i" — abre Dialog com TODAS as informações técnicas detalhadas
 * (APP_BUILD, PRINT_ENGINE, CONFIG_SOURCE, BRIDGE_URL, versões, latência, etc.)
 */
function DetailsDialog({
  cfg,
  bridgeStatus,
  syncing,
}: {
  cfg: PrintConfig;
  bridgeStatus: BridgeHealth | null;
  syncing: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Ver informações técnicas completas"
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
        >
          <Info className="w-3 h-3" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            Informações técnicas
          </DialogTitle>
          <DialogDescription>
            Diagnóstico completo desta instância do Admin. Use ao reportar bugs ou
            quando o papel impresso não bater com o preview.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <Section title="Versões">
            <Row label="APP_BUILD" value={APP_BUILD} mono />
            <Row label="PRINT_ENGINE" value={PRINT_ENGINE_VERSION} mono />
          </Section>

          <Section title="Configuração">
            <Row
              label="CONFIG_SOURCE"
              value={cfg.configSource ?? "default"}
              tone={cfg.configSource === "db" ? "success" : "warning"}
            />
            <Row
              label="CONFIG_UPDATED_AT"
              value={
                cfg.configUpdatedAt
                  ? new Date(cfg.configUpdatedAt).toLocaleString("pt-BR")
                  : "—"
              }
            />
            <Row
              label="LAST_SYNC"
              value={
                syncing
                  ? "..."
                  : cfg.configUpdatedAt
                  ? new Date(cfg.configUpdatedAt).toLocaleTimeString("pt-BR")
                  : "—"
              }
            />
          </Section>

          <Section title="Impressão">
            <Row label="PRINT_MODE" value={cfg.printMode} />
            <Row label="BRIDGE_URL" value={cfg.bridgeUrl || "—"} mono />
            <Row
              label="BRIDGE_STATUS"
              value={bridgeStatus?.online ? "ONLINE" : bridgeStatus ? "OFFLINE" : "—"}
              tone={
                bridgeStatus?.online
                  ? "success"
                  : bridgeStatus
                  ? "danger"
                  : undefined
              }
            />
            <Row
              label="USB_PRINTER"
              value={
                bridgeStatus?.printer_connected
                  ? "DETECTADA"
                  : bridgeStatus?.online
                  ? "N/D"
                  : "—"
              }
              tone={bridgeStatus?.printer_connected ? "success" : undefined}
            />
            {bridgeStatus?.bridge_version && (
              <Row label="BRIDGE_VERSION" value={bridgeStatus.bridge_version} mono />
            )}
            {typeof bridgeStatus?.queue_depth === "number" && (
              <Row label="QUEUE_DEPTH" value={String(bridgeStatus.queue_depth)} />
            )}
            {typeof bridgeStatus?.latencyMs === "number" && (
              <Row label="LATENCY" value={`${bridgeStatus.latencyMs}ms`} />
            )}
            {bridgeStatus?.error && (
              <Row label="LAST_ERROR" value={bridgeStatus.error} tone="danger" />
            )}
          </Section>

          <Section title="Layout">
            <Row label="PAPER_WIDTH" value={cfg.paperWidth} />
            <Row label="PRINT_SIZE" value={cfg.printSize} />
            <Row label="LAYOUT_PRESET" value={cfg.layoutPreset} />
            <Row label="CONTENT_ALIGN" value={cfg.contentAlign} />
          </Section>

          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
            Se o papel impresso não exibir <strong>PRINT_ENGINE: {PRINT_ENGINE_VERSION}</strong>,
            o EXE/bridge está rodando uma versão antiga em cache.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
        {title}
      </div>
      <div className="space-y-1 text-[11px] font-mono">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger";
  mono?: boolean;
}) {
  const cls =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "danger"
      ? "text-rose-600 dark:text-rose-400"
      : "";
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-bold truncate text-right ${cls} ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function BridgeCard({
  cfg,
  bridgeStatus,
  checking,
  onChange,
  onTest,
}: {
  cfg: PrintConfig;
  bridgeStatus: BridgeHealth | null;
  checking: boolean;
  onChange: (patch: Partial<PrintConfig>) => void;
  onTest: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          {bridgeStatus?.online ? (
            <Cloud className="w-4 h-4 text-emerald-500" />
          ) : (
            <CloudOff className="w-4 h-4 text-rose-500" />
          )}
          Conexão da bridge
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {(["browser", "bridge"] as const).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={cfg.printMode === m ? "default" : "outline"}
              className="flex-1 font-bold"
              onClick={() => onChange({ printMode: m })}
            >
              {m === "browser" ? "Navegador" : "Ponte Local"}
            </Button>
          ))}
        </div>

        {cfg.printMode === "bridge" ? (
          <>
            <div className="space-y-1">
              <Label className="text-xs uppercase font-bold text-muted-foreground">URL da Ponte Local</Label>
              <div className="flex gap-2">
                <Input
                  value={cfg.bridgeUrl}
                  onChange={(e) => onChange({ bridgeUrl: e.target.value })}
                  placeholder="http://localhost:9100/print"
                  className="font-mono text-xs"
                />
                <Button size="sm" variant="outline" onClick={onTest} disabled={checking} className="gap-1.5 shrink-0">
                  <RotateCcw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
                  Testar
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                <Info className="w-3 h-3 inline mr-1 mb-0.5" />
                Este campo é por dispositivo (não sincroniza com o banco).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
              <div className="rounded-md border p-2 flex items-center justify-between">
                <span className="text-muted-foreground uppercase">Bridge:</span>
                {bridgeStatus?.online ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ONLINE
                  </span>
                ) : (
                  <span className="text-rose-500 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> OFFLINE
                  </span>
                )}
              </div>
              <div className="rounded-md border p-2 flex items-center justify-between">
                <span className="text-muted-foreground uppercase">USB:</span>
                {bridgeStatus?.printer_connected ? (
                  <span className="text-emerald-600">DETECTADA</span>
                ) : bridgeStatus?.online ? (
                  <span className="text-amber-600">N/D</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>

            {bridgeStatus?.error && (
              <p className="text-[10px] text-rose-500 font-medium">{bridgeStatus.error}</p>
            )}
            {bridgeStatus?.online && (
              <div className="text-[10px] text-muted-foreground font-mono space-y-0.5">
                {bridgeStatus.bridge_version && <div>bridge_version: {bridgeStatus.bridge_version}</div>}
                {typeof bridgeStatus.queue_depth === "number" && <div>queue_depth: {bridgeStatus.queue_depth}</div>}
                {typeof bridgeStatus.latencyMs === "number" && <div>latency: {bridgeStatus.latencyMs}ms</div>}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
            <Info className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
            No modo <strong>Navegador</strong> a impressão real não acontece. Use a Ponte Local para imprimir de verdade.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
