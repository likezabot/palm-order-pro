# Ponte de Impressão Local (LP-BRIDGE)

Este guia explica como configurar e rodar o serviço de impressão local para que o site possa imprimir diretamente na sua impressora USB (POS80/58mm) sem abrir o diálogo do navegador.

## Requisitos
1. **Node.js instalado**: Baixe e instale a versão LTS do [nodejs.org](https://nodejs.org/).
2. **Impressora USB conectada** e ligada.
3. **Zadig (Opcional, mas recomendado para Windows)**: Algumas impressoras USB no Windows exigem que o driver seja alterado para "WinUSB" usando a ferramenta [Zadig](https://zadig.akeo.ie/) para que o Node.js tenha acesso direto ao dispositivo.

---

## Instalação e Execução

### 1. Criar pasta e arquivos
Crie uma pasta no seu computador (ex: `C:\lp-bridge`) e salve o arquivo `lp-bridge.js` dentro dela.

### 2. Abrir o terminal (Prompt de Comando ou PowerShell)
Navegue até a pasta:
```bash
cd C:\lp-bridge
```

### 3. Instalar as dependências
Execute os comandos abaixo para instalar as bibliotecas necessárias:
```bash
npm init -y
npm install express cors escpos escpos-usb
```

### 4. Iniciar o serviço
Execute o script:
```bash
node lp-bridge.js
```

Você verá a mensagem: `[bridge] Servidor rodando em http://localhost:9100`.

---

## Configuração no Site
1. Vá em **Configurações → Impressão**.
2. Altere o **Modo de Impressão** para **Ponte Local**.
3. Certifique-se de que a URL da ponte é: `http://localhost:9100/print`.
4. Clique em **TESTAR**.

---

## Solução de Problemas

- **Ponte não encontrada**: Verifique se o terminal com `node lp-bridge.js` ainda está aberto.
- **Erro de Acesso USB**: No Windows, se o Node.js não encontrar a impressora, use o **Zadig** para trocar o driver da impressora USB para **WinUSB**.
- **Porta 9100 em uso**: Se você já tiver outro serviço nessa porta, altere a porta no arquivo `lp-bridge.js` e no site.

---

## Logs do Servidor
O terminal mostrará exatamente o que está acontecendo:
- `[bridge] Recebida solicitação de impressão`: O site enviou o pedido.
- `[bridge] Impressão enviada com sucesso!`: O comando chegou na impressora.
- `[bridge] Erro ao buscar impressoras USB`: Verifique o cabo e se a impressora está ligada.
