import React, { useState, useEffect } from "react";
import { 
  AuditScenario, 
  auditTestLogger, 
  AuditLogEntry 
} from "@/lib/audit-test-logger";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, PlayCircle, StopCircle, Trash2, Clipboard } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

const SCENARIOS: { id: AuditScenario; label: string; desc: string }[] = [
  { 
    id: "one_order_normal", 
    label: "1 Pedido (Normal)", 
    desc: "Crie um pedido e verifique se imprime apenas uma vez." 
  },
  { 
    id: "bridge_offline_test", 
    label: "Bridge Offline/Online", 
    desc: "Simule bridge fora e depois volte. O pedido não deve duplicar ao retornar." 
  },
  { 
    id: "two_rapid_orders", 
    label: "2 Pedidos Rápidos", 
    desc: "Crie dois pedidos em sequência rápida (< 5s)." 
  },
  { 
    id: "one_hour_stability", 
    label: "1 Hora de Estabilidade", 
    desc: "Deixe o sistema aberto e monitore impressões fantasmas." 
  },
];

export const PrintAuditChecklist: React.FC = () => {
  const [activeScenario, setActiveScenario] = useState<AuditScenario | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [timer, setTimer] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLogs(auditTestLogger.getLogs());
      setActiveScenario(auditTestLogger.getCurrentScenario());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let t: any;
    if (activeScenario) {
      t = setInterval(() => setTimer(prev => prev + 1), 1000);
    } else {
      setTimer(0);
    }
    return () => clearInterval(t);
  }, [activeScenario]);

  const handleStart = (scenario: AuditScenario) => {
    auditTestLogger.startScenario(scenario);
    setActiveScenario(scenario);
  };

  const handleStop = () => {
    auditTestLogger.stopScenario();
    setActiveScenario(null);
  };

  const handleClear = () => {
    auditTestLogger.clearLogs();
    setLogs([]);
  };

  const handleCopy = () => {
    const text = logs.map(l => `${new Date(l.ts).toISOString()} [${l.scenario}] ${l.event} ${l.orderId || ""} ${l.data ? JSON.stringify(l.data) : ""}`).join("\n");
    navigator.clipboard.writeText(text);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SCENARIOS.map((s) => (
          <Card key={s.id} className={activeScenario === s.id ? "border-primary ring-1 ring-primary" : ""}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-sm font-bold">{s.label}</CardTitle>
                  <CardDescription className="text-xs">{s.desc}</CardDescription>
                </div>
                {activeScenario === s.id ? (
                  <Badge variant="default" className="animate-pulse">Ativo {formatTime(timer)}</Badge>
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {activeScenario === s.id ? (
                <Button variant="destructive" size="sm" className="w-full" onClick={handleStop}>
                  <StopCircle className="w-4 h-4 mr-2" /> Parar Teste
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="w-full" onClick={() => handleStart(s.id)} disabled={!!activeScenario}>
                  <PlayCircle className="w-4 h-4 mr-2" /> Iniciar Teste
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2 border-b flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Logs de Auditoria de Impressão</CardTitle>
            <CardDescription className="text-xs">Monitoramento em tempo real do fluxo at-most-once</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={handleCopy} title="Copiar logs">
              <Clipboard className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClear} title="Limpar logs">
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px] w-full p-4 font-mono text-[10px]">
            {logs.length === 0 ? (
              <div className="text-center text-muted-foreground py-10 italic">Nenhum log capturado. Inicie um cenário acima.</div>
            ) : (
              <div className="space-y-1">
                {logs.slice().reverse().map((log, i) => (
                  <div key={i} className="flex gap-2 border-b border-muted py-1">
                    <span className="text-muted-foreground whitespace-nowrap">{new Date(log.ts).toLocaleTimeString()}</span>
                    <Badge variant="outline" className="text-[9px] px-1 h-4">{log.scenario}</Badge>
                    <span className={`font-bold ${log.event.includes("SUCCESS") ? "text-green-500" : log.event.includes("FAILED") || log.event.includes("ERROR") ? "text-red-500" : "text-blue-500"}`}>
                      {log.event}
                    </span>
                    {log.orderId && <span className="bg-muted px-1 rounded text-primary">ID: {log.orderId.slice(0, 8)}</span>}
                    {log.data && <span className="text-muted-foreground truncate max-w-[300px]">{JSON.stringify(log.data)}</span>}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
      
      <Card className="bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" /> 
            Garantia At-Most-Once
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>O sistema registra cada tentativa de autoimpressão no <code>autoAttempted Set</code>.</p>
          <p>Se o evento for duplicado pelo Realtime ou Polling, o log mostrará <code>skip — autoimpressão já tentada</code>.</p>
        </CardContent>
      </Card>
    </div>
  );
};
