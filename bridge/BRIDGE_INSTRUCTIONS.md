# Guia de Configuração da Ponte de Impressão (Windows)

Para imprimir diretamente em impressoras térmicas USB sem a janela do navegador, você precisa rodar um pequeno serviço local (Ponte Local).

## 1. Requisitos
- **Node.js instalado**: [Baixe aqui (LTS)](https://nodejs.org/)
- **Impressora USB conectada**: Deve estar ligada e visível no Windows.

## 2. Instalação e Execução

1. Baixe o projeto ou apenas os arquivos `lp-bridge.js` e `start-bridge.bat`.
2. Dê um duplo clique no arquivo **`start-bridge.bat`**.
3. Na primeira execução, ele instalará as dependências automaticamente.
4. Você deverá ver a mensagem: `[OK] Servidor ativo em: http://localhost:3001`.

> **Dica**: Mantenha a janela preta do terminal aberta enquanto o PDV estiver em uso.

## 3. Configuração no PDV (Site)

1. Vá em **Configurações → Impressão**.
2. Altere o **Modo de Impressão** para **Ponte Local**.
3. Verifique se o status aparece como **PONTE ONLINE**.
4. Clique em **TESTAR**.

## 4. Comandos de Teste (PowerShell)

Se quiser testar manualmente se a ponte está ouvindo:

```powershell
# Testar saúde e impressora
Invoke-RestMethod -Uri "http://localhost:3001/health"

# Listar impressoras encontradas
Invoke-RestMethod -Uri "http://localhost:3001/printers"
```

## 5. Solução de Problemas

- **Ponte Offline**: Verifique se o Node.js está instalado e se rodou o `start-bridge.bat`.
- **Impressora Não Detectada**: 
  - Verifique se a impressora está ligada.
  - Em alguns casos raros, o Node.js precisa de acesso direto ao USB. Se não funcionar, tente usar o utilitário [Zadig](https://zadig.akeo.ie/) para trocar o driver da sua impressora para **WinUSB**.
- **Erro de Porta**: Se a porta 3001 estiver ocupada, feche outros aplicativos que possam estar usando-a.

---
**Plano B Espetaria - Sistema de PDV**

