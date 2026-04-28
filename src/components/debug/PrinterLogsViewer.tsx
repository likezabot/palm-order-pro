import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RefreshCcw, AlertTriangle, Info, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const PrinterLogsViewer = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["printer-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("printer_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const getStatusBadge = (type: string) => {
    switch (type) {
      case "success":
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> Sucesso</Badge>;
      case "error":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Erro</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black"><AlertTriangle className="w-3 h-3 mr-1" /> Aviso</Badge>;
      default:
        return <Badge variant="secondary"><Info className="w-3 h-3 mr-1" /> Info</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Repositório de Movimentos e Erros</CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()} 
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCcw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">Carregando logs...</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Data/Hora</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="w-[100px]">Pedido</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhum log encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {logs?.map((log) => (
                  <>
                    <TableRow 
                      key={log.id} 
                      className={`cursor-pointer transition-colors ${expandedId === log.id ? "bg-muted/50" : "hover:bg-muted/30"}`}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <TableCell className="text-xs font-mono">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(log.event_type)}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {log.message}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {log.order_id ? `#${log.order_id.slice(0, 8)}` : "-"}
                      </TableCell>
                      <TableCell>
                        {expandedId === log.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </TableCell>
                    </TableRow>
                    {expandedId === log.id && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={5} className="p-4">
                          <div className="text-xs space-y-2">
                            <div className="font-semibold text-muted-foreground uppercase tracking-wider">Detalhes do Evento:</div>
                            <pre className="bg-black/5 p-3 rounded-md overflow-auto max-h-[200px] font-mono whitespace-pre-wrap">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                            {log.order_id && (
                              <div className="flex gap-2 items-center text-muted-foreground">
                                <span>ID do Pedido:</span>
                                <code className="bg-muted px-1 rounded">{log.order_id}</code>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
