import { PrintAuditChecklist } from "@/components/debug/PrintAuditChecklist";
import { PrinterLogsViewer } from "@/components/debug/PrinterLogsViewer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bug } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DebugPrint = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold">Auditoria de Impressão</h1>
            </div>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            V.CONSERVATIVE_AUDIT_3.2.5
          </div>
        </div>
      </div>

      <div className="py-8 space-y-8 px-4 max-w-4xl mx-auto">
        <PrinterLogsViewer />
        <PrintAuditChecklist />
      </div>
    </div>
  );
};

export default DebugPrint;
