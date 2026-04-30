const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3001; // Porta diferente da 9100 (que é da impressora)
const PRINTER_NAME = 'POS80 Printer'; // Nome exato da impressora no Windows

app.use(cors());
app.use(express.json({ limit: '10mb' }));

console.log('=========================================');
console.log('   PONTE DE IMPRESSÃO TÉRMICA            ');
console.log('   Plano B Espetaria - Local Service     ');
console.log('   Porta: ' + PORT);
console.log('   Impressora: ' + PRINTER_NAME);
console.log('=========================================');

// Gera os bytes ESC/POS a partir do objeto de pedido
function gerarEscPos(pedido) {
  const ESC = 0x1B;
  const GS = 0x1D;
  const LF = 0x0A;

  const bytes = [];

  const push = (...vals) => vals.forEach(v => bytes.push(v));
  const text = (str) => {
    const buf = Buffer.from(str + '\n', 'latin1');
    buf.forEach(b => bytes.push(b));
  };
  const line = (char = '-', len = 32) => text(char.repeat(len));

  // Init
  push(ESC, 0x40); // Reset
  push(ESC, 0x74, 0x00); // Charset PC437

  // Centralizar
  push(ESC, 0x61, 0x01);
  // Negrito + Tamanho maior
  push(ESC, 0x45, 0x01);
  push(GS, 0x21, 0x11);
  text('PLANO B ESPETARIA');
  push(GS, 0x21, 0x00);
  push(ESC, 0x45, 0x00);

  // Tipo do pedido
  push(ESC, 0x61, 0x01);
  const tipo = pedido.tipo || pedido.order_type || 'PEDIDO';
  push(ESC, 0x45, 0x01);
  text('*** ' + tipo.toUpperCase() + ' ***');
  push(ESC, 0x45, 0x00);

  // Alinhar esquerda
  push(ESC, 0x61, 0x00);
  line();

  // Info do pedido
  const num = pedido.numero || pedido.order_number || pedido.id || '-';
  text('Pedido: #' + num);

  const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande' });
  text('Data: ' + hora);

  if (pedido.cliente || pedido.customer_name) {
    text('Cliente: ' + (pedido.cliente || pedido.customer_name));
  }
  if (pedido.telefone || pedido.customer_phone) {
    text('Telefone: ' + (pedido.telefone || pedido.customer_phone));
  }
  if (pedido.endereco || pedido.address) {
    text('Endereco: ' + (pedido.endereco || pedido.address));
  }
  if (pedido.mesa || pedido.table_number) {
    text('Mesa: ' + (pedido.mesa || pedido.table_number));
  }

  line();

  // Itens
  push(ESC, 0x45, 0x01);
  text('ITENS DO PEDIDO:');
  push(ESC, 0x45, 0x00);

  const itens = pedido.itens || pedido.items || [];
  itens.forEach(item => {
    const nome = item.nome || item.name || item.product_name || 'Item';
    const qtd = item.quantidade || item.quantity || 1;
    const preco = item.preco || item.price || item.unit_price || 0;
    const total = (qtd * preco).toFixed(2).replace('.', ',');
    const linha = `${qtd}x ${nome}`.padEnd(22) + `R$${total}`;
    text(linha);

    if (item.observacao || item.note) {
      text('  Obs: ' + (item.observacao || item.note));
    }
    if (item.sabores || item.flavors) {
      const sabores = Array.isArray(item.sabores || item.flavors)
        ? (item.sabores || item.flavors).map(s => s.nome || s.name || s).join(', ')
        : '';
      if (sabores) text('  Sabores: ' + sabores);
    }
  });

  line();

  // Totais
  if (pedido.subtotal !== undefined) {
    text('Subtotal:' + ('R$' + Number(pedido.subtotal).toFixed(2).replace('.', ',')).padStart(23));
  }
  if (pedido.taxa_entrega !== undefined || pedido.delivery_fee !== undefined) {
    const taxa = pedido.taxa_entrega || pedido.delivery_fee || 0;
    text('Taxa entrega:' + ('R$' + Number(taxa).toFixed(2).replace('.', ',')).padStart(19));
  }
  if (pedido.desconto !== undefined || pedido.discount !== undefined) {
    const desc = pedido.desconto || pedido.discount || 0;
    if (desc > 0) text('Desconto:' + ('-R$' + Number(desc).toFixed(2).replace('.', ',')).padStart(23));
  }

  push(ESC, 0x45, 0x01);
  const total = pedido.total || pedido.total_cents / 100 || 0;
  text('TOTAL:' + ('R$' + Number(total).toFixed(2).replace('.', ',')).padStart(26));
  push(ESC, 0x45, 0x00);

  if (pedido.pagamento || pedido.payment_method) {
    text('Pagamento: ' + (pedido.pagamento || pedido.payment_method));
  }

  if (pedido.observacoes || pedido.notes) {
    line();
    push(ESC, 0x45, 0x01);
    text('OBSERVACOES:');
    push(ESC, 0x45, 0x00);
    text(pedido.observacoes || pedido.notes);
  }

  line('=');

  // Centralizar rodapé
  push(ESC, 0x61, 0x01);
  text('Obrigado pela preferencia!');
  text('Plano B Espetaria');

  // Feed e corte
  push(LF, LF, LF, LF);
  push(GS, 0x56, 0x41, 0x03); // Corte parcial

  return Buffer.from(bytes);
}

// Envia buffer ESC/POS para a impressora via arquivo temporário + print command
function imprimirBuffer(buffer, callback) {
  const tmpFile = path.join(os.tmpdir(), `plano-b-print-${Date.now()}.bin`);

  fs.writeFile(tmpFile, buffer, (err) => {
    if (err) return callback(err);

    // Comando Windows: manda o arquivo binário direto para a fila da impressora
    const cmd = `copy /b "${tmpFile}" "\\\\localhost\\${PRINTER_NAME}"`;

    exec(cmd, { shell: 'cmd.exe' }, (err, stdout, stderr) => {
      fs.unlink(tmpFile, () => {}); // Limpa arquivo temporário

      if (err) {
        console.error('[ERRO] Falha no comando de impressão:', stderr || err.message);
        return callback(new Error(stderr || err.message));
      }

      console.log('[SUCESSO] Impressão enviada para: ' + PRINTER_NAME);
      callback(null);
    });
  });
}

// ─── ENDPOINTS ───────────────────────────────────────────────────────────────

// GET /health
app.get('/health', (req, res) => {
  exec(`wmic printer where "Name='${PRINTER_NAME}'" get WorkOffline,PrinterStatus /format:value`, 
    { shell: 'cmd.exe' }, 
    (err, stdout) => {
      const online = !err && stdout.toLowerCase().includes('printerstatus=3');
      console.log(`[LOG] Health check: ${online ? 'IMPRESSORA OK' : 'VERIFICAR IMPRESSORA'}`);
      res.json({
        status: 'online',
        printer: PRINTER_NAME,
        printer_ready: online,
        timestamp: new Date().toISOString()
      });
    }
  );
});

// POST /print — recebe JSON do pedido e imprime
app.post('/print', (req, res) => {
  const pedido = req.body;

  if (!pedido || Object.keys(pedido).length === 0) {
    return res.status(400).json({ success: false, error: 'Corpo da requisição vazio' });
  }

  console.log('[LOG] Pedido recebido para impressão:', JSON.stringify(pedido).substring(0, 100) + '...');

  try {
    const buffer = gerarEscPos(pedido);
    console.log(`[LOG] Buffer ESC/POS gerado: ${buffer.length} bytes`);

    imprimirBuffer(buffer, (err) => {
      if (err) {
        console.error('[ERRO] Falha na impressão:', err.message);
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, bytes: buffer.length });
    });

  } catch (e) {
    console.error('[ERRO FATAL]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /print-raw — recebe base64 ESC/POS puro (compatibilidade com sistema antigo)
app.post('/print-raw', (req, res) => {
  const { payload } = req.body;

  if (!payload) {
    return res.status(400).json({ success: false, error: 'Payload base64 ausente' });
  }

  try {
    const buffer = Buffer.from(payload, 'base64');
    console.log(`[LOG] Print RAW recebido: ${buffer.length} bytes`);

    imprimirBuffer(buffer, (err) => {
      if (err) {
        console.error('[ERRO] Falha na impressão raw:', err.message);
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, bytes: buffer.length });
    });

  } catch (e) {
    console.error('[ERRO FATAL]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /test — imprime ticket de teste
app.get('/test', (req, res) => {
  const pedidoTeste = {
    tipo: 'TESTE',
    numero: 'TEST-001',
    cliente: 'Teste do Sistema',
    itens: [
      { nome: 'Espeto de Frango', quantidade: 2, preco: 8.50 },
      { nome: 'Coca-Cola 350ml', quantidade: 1, preco: 6.00 }
    ],
    subtotal: 23.00,
    total: 23.00,
    pagamento: 'Dinheiro',
    observacoes: 'Sem cebola'
  };

  try {
    const buffer = gerarEscPos(pedidoTeste);
    imprimirBuffer(buffer, (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, message: 'Ticket de teste enviado!' });
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n[OK] Bridge ativo em: http://localhost:${PORT}`);
  console.log(`[OK] Endpoints disponíveis:`);
  console.log(`     GET  /health     - Status da impressora`);
  console.log(`     GET  /test       - Imprime ticket de teste`);
  console.log(`     POST /print      - Imprime pedido (JSON)`);
  console.log(`     POST /print-raw  - Imprime ESC/POS base64`);
  console.log('-----------------------------------------');
  console.log('Mantenha esta janela aberta para imprimir.');
  console.log('=========================================\n');
});
