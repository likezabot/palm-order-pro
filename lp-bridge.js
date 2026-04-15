const express = require('express');
const cors = require('cors');
const { USB, Printer } = require('escpos');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

const app = express();
const port = 9100;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

console.log('--- LP-BRIDGE: Ponte de Impressão Térmica ---');

// Helper to find printer
function getUSBPrinter() {
  try {
    const devices = escpos.USB.findPrinter();
    if (devices && devices.length > 0) {
      console.log(`[bridge] Encontrada(s) ${devices.length} impressora(s) USB.`);
      return new escpos.USB();
    }
  } catch (e) {
    console.error('[bridge] Erro ao buscar impressoras USB:', e.message);
  }
  return null;
}

// GET /health
app.get('/health', (req, res) => {
  const printer = getUSBPrinter();
  res.json({
    status: 'online',
    printer_connected: !!printer,
    timestamp: new Date().toISOString()
  });
});

// GET /printers
app.get('/printers', (req, res) => {
  try {
    const devices = escpos.USB.findPrinter();
    res.json(devices || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /print
app.post('/print', (req, res) => {
  const { payload, format } = req.body;

  if (!payload) {
    console.error('[bridge] Payload ausente');
    return res.status(400).json({ success: false, error: 'Payload is required' });
  }

  console.log(`[bridge] Recebida solicitação de impressão (${format || 'raw'})`);

  try {
    const device = getUSBPrinter();
    if (!device) {
      console.error('[bridge] Nenhuma impressora USB encontrada ou conectada.');
      return res.status(503).json({ success: false, error: 'No USB printer found' });
    }

    const printer = new escpos.Printer(device);
    const buffer = Buffer.from(payload, 'base64');

    device.open((err) => {
      if (err) {
        console.error('[bridge] Erro ao abrir dispositivo:', err);
        return res.status(500).json({ success: false, error: err.message });
      }

      // Send raw buffer (payload already contains ESC/POS commands)
      device.write(buffer, (err) => {
        if (err) {
          console.error('[bridge] Erro ao escrever no dispositivo:', err);
          device.close();
          return res.status(500).json({ success: false, error: err.message });
        }
        
        console.log('[bridge] Impressão enviada com sucesso!');
        device.close();
        res.json({ success: true });
      });
    });

  } catch (e) {
    console.error('[bridge] Erro inesperado:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[bridge] Servidor rodando em http://localhost:${port}`);
  console.log(`[bridge] Endpoints disponíveis: /health, /printers, /print`);
  console.log(`[bridge] Pressione CTRL+C para encerrar.`);
});
