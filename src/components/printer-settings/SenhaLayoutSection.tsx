import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  type PrintConfig,
  type SenhaLayoutBlocks,
  type SenhaLayoutFontSizes,
  type SenhaPreset,
  applySenhaPreset,
  DEFAULT_SENHA_LAYOUT,
  DEFAULT_SENHA_BLOCKS,
  DEFAULT_SENHA_FONT_SIZES,
} from "@/lib/print-config";

interface Props {
  cfg: PrintConfig;
  onChange: (patch: Partial<PrintConfig>) => void;
}

const BLOCK_LABELS: { key: keyof SenhaLayoutBlocks; label: string; hint?: string }[] = [
  { key: "establishmentHeader", label: "Cabeçalho do estabelecimento", hint: "Nome / endereço / telefone" },
  { key: "senhaTitle", label: "Texto 'SENHA'" },
  { key: "senhaNumber", label: "Número da senha (#001)" },
  { key: "banner", label: "Faixa 'BALCÃO / RETIRADA'" },
  { key: "customer", label: "Nome do cliente" },
  { key: "phone", label: "Telefone do cliente" },
  { key: "dateTime", label: "Data e hora" },
  { key: "items", label: "Lista de itens" },
  { key: "total", label: "Total do pedido" },
  { key: "payment", label: "Forma de pagamento" },
  { key: "message", label: "Mensagem livre", hint: "Texto personalizado abaixo" },
  { key: "pickupBanner", label: "Aviso 'RETIRE NO BALCÃO'" },
  { key: "footer", label: "Rodapé padrão", hint: "'Obrigado pela preferência!'" },
];

const FONT_FIELDS: { key: keyof SenhaLayoutFontSizes; label: string; min: number; max: number; step?: number }[] = [
  { key: "senhaNumber", label: "Tamanho do número da senha", min: 48, max: 200, step: 4 },
  { key: "senhaTitle", label: "Tamanho do título 'SENHA'", min: 10, max: 40 },
  { key: "items", label: "Tamanho dos itens", min: 10, max: 28 },
  { key: "total", label: "Tamanho do total", min: 12, max: 40 },
  { key: "auxiliary", label: "Tamanho dos textos auxiliares", min: 9, max: 22 },
];

const PRESETS: { value: SenhaPreset; label: string; description: string }[] = [
  { value: "minimal", label: "Só Senha", description: "Cupom mínimo: número gigante e nome" },
  { value: "senha_items", label: "Senha + Itens", description: "Senha grande com lista do pedido" },
  { value: "completo", label: "Completo", description: "Tudo: pagamento, mensagem, etc." },
];

export default function SenhaLayoutSection({ cfg, onChange }: Props) {
  const sl = cfg.senhaLayout ?? DEFAULT_SENHA_LAYOUT;

  const patchSenha = (next: Partial<typeof sl>) => {
    onChange({
      senhaLayout: {
        ...sl,
        ...next,
        blocks: { ...sl.blocks, ...(next.blocks || {}) },
        fontSizes: { ...sl.fontSizes, ...(next.fontSizes || {}) },
      },
    });
  };

  const toggleBlock = (key: keyof SenhaLayoutBlocks, value: boolean) => {
    patchSenha({ blocks: { ...sl.blocks, [key]: value } });
  };

  const setFontSize = (key: keyof SenhaLayoutFontSizes, value: number) => {
    patchSenha({ fontSizes: { ...sl.fontSizes, [key]: value } });
  };

  const handlePreset = (preset: SenhaPreset) => {
    const next = applySenhaPreset(preset);
    // preserva mensagem livre que o usuário já escreveu
    next.customMessage = sl.customMessage || next.customMessage;
    onChange({ senhaLayout: next });
  };

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-base font-bold mb-1">Cupom de Senha (BALCÃO)</h3>
        <p className="text-xs text-muted-foreground">
          Personalize exatamente o que aparece no cupom da senha do cliente. O preview reflete fielmente o que será impresso.
        </p>
      </div>

      {/* Presets rápidos */}
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
          Modelos prontos
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.value}
              type="button"
              size="sm"
              variant={sl.preset === p.value ? "default" : "outline"}
              onClick={() => handlePreset(p.value)}
              className="flex-col h-auto py-2 px-2 gap-0.5"
            >
              <span className="font-bold text-xs">{p.label}</span>
              <span className="text-[10px] opacity-70 leading-tight">{p.description}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Blocos visíveis */}
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
          O que aparece no cupom
        </Label>
        <div className="space-y-2">
          {BLOCK_LABELS.map(({ key, label, hint }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{label}</div>
                {hint && <div className="text-[11px] text-muted-foreground truncate">{hint}</div>}
              </div>
              <Switch
                checked={sl.blocks[key] ?? DEFAULT_SENHA_BLOCKS[key]}
                onCheckedChange={(v) => toggleBlock(key, v)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Mensagem livre */}
      <div>
        <Label htmlFor="senha-msg" className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
          Mensagem ao cliente (opcional)
        </Label>
        <Input
          id="senha-msg"
          value={sl.customMessage}
          onChange={(e) => patchSenha({ customMessage: e.target.value })}
          maxLength={120}
          placeholder="Ex.: Aguarde sua senha ser chamada"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Aparece somente se o bloco "Mensagem livre" estiver ligado.
        </p>
      </div>

      {/* Tamanhos de fonte */}
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
          Tamanhos de fonte
        </Label>
        <div className="space-y-4">
          {FONT_FIELDS.map(({ key, label, min, max, step }) => {
            const value = sl.fontSizes[key] ?? DEFAULT_SENHA_FONT_SIZES[key];
            return (
              <div key={key} className="rounded-lg border border-border/60 bg-background px-3 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs font-mono tabular-nums text-muted-foreground">
                    {value}px
                  </div>
                </div>
                <Slider
                  value={[value]}
                  min={min}
                  max={max}
                  step={step ?? 1}
                  onValueChange={(v) => setFontSize(key, v[0])}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
