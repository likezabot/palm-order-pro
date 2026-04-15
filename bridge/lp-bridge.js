const express = require('express');
const cors = require('cors');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

const app = express();
const port = 9100;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

console.log('=========================================');
console.log('   PONTE DE IMPRESSÃO TÉRMICA (USB)      ');
console.log('   Plano B Espetaria - Local Service     ');
console.log('=========================================');

// Helper to find printer
function getUSBPrinter() {
  try {
    const devices = escpos.USB.findPrinter();
    if (devices && devices.length > 0) {
      // Retorna o primeiro dispositivo encontrado
      return new escpos.USB();
    }
  } catch (e) {
    console.error('[ERRO] Falha ao buscar dispositivo USB:', e.message);
  }
  return null;
}

// GET /health
app.get('/health', (req, res) => {
  const devices = escpos.USB.findPrinter();
  const printerConnected = devices && devices.length > 0;
  
  console.log(`[LOG] Verificação de saúde: ${printerConnected ? 'OK' : 'SEM IMPRESSORA'}`);
  
  res.json({
    status: 'online',
    printer_connected: printerConnected,
    printer_count: devices ? devices.length : 0,
    timestamp: new Date().toISOString()
  });
});

// GET /printers
app.get('/printers', (req, res) => {
  try {
    const devices = escpos.USB.findPrinter();
    console.log(`[LOG] Listando impressoras: ${devices.length} encontradas.`);
    res.json(devices || []);
  } catch (e) {
    console.error('[ERRO] Falha ao listar impressoras:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /print
app.post('/print', (req, res) => {
  const { payload, format, source } = req.body;

  if (!payload) {
    console.error('[ERRO] Payload de impressão ausente.');
    return res.status(400).json({ success: false, error: 'Payload is required' });
  }

  const origin = source || 'Desconhecido';
  console.log(`[LOG] Recebida solicitação de: ${origin}`);
  console.log(`[LOG] Tamanho do payload: ${payload.length} chars (base64)`);

  try {
    const device = getUSBPrinter();
    if (!device) {
      console.error('[ERRO] Nenhuma impressora USB detectada.');
      return res.status(503).json({ 
        success: false, 
        error: 'Impressora USB não encontrada. Verifique se está ligada e conectada.' 
      });
    }

    const printer = new escpos.Printer(device);
    const buffer = Buffer.from(payload, 'base64');

    device.open((err) => {
      if (err) {
        console.error('[ERRO] Falha ao abrir porta USB:', err.message);
        return res.status(500).json({ success: false, error: `Erro USB: ${err.message}` });
      }

      console.log('[LOG] Enviando dados para a impressora...');
      
      // Envia o buffer bruto (ESC/POS já formatado no frontend)
      device.write(buffer, (err) => {
        if (err) {
          console.error('[ERRO] Falha na escrita:', err.message);
          device.close();
          return res.status(500).json({ success: false, error: `Erro de Escrita: ${err.message}` });
        }
        
        console.log('[SUCESSO] Impressão finalizada com êxito!');
        device.close();
        res.json({ success: true });
      });
    });

  } catch (e) {
    console.error('[ERRO FATAL] Exceção inesperada:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[OK] Servidor ativo em: http://localhost:${port}`);
  console.log(`[OK] Endpoints: /health, /printers, /print`);
  console.log('-----------------------------------------');
  console.log('Mantenha esta janela aberta para imprimir.');
});
