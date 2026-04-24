# Salvar os dois prompts de reconstrução

Vou criar dois arquivos em `docs/`:

## 1. `docs/PROMPT_LOVABLE_NOVO_PROJETO.md`
Prompt completo para colar em uma **nova sessão Lovable** e reconstruir o app web do zero, já com as correções aprendidas:
- Stack React 18 + Vite + TS + Tailwind + shadcn + Lovable Cloud, dark theme #0D0D0D / #E25822, Inter, PWA, sem auth.
- 5 módulos: Home, Palm (garçom), Kitchen (kanban), Cashier, Admin.
- Schema completo: products, orders, order_items, cash_register, cash_movements, inventory_items, inventory_movements, settings, agregados diários, notification_queue.
- RPCs SECURITY DEFINER: create_order, update_order_items, update_order_status, rename_order_table, merge_table_duplicates, claim/complete/defer_order_print, recover_stuck_prints, force_clear_orphan_prints, cash_open/close/movement_add, verify_manager_pin.
- Triggers de estoque automático e reset de served_at.
- Seed do cardápio (Refeições, Espetos, Bebidas, Cervejas) com preços reais.
- **Camada de impressão correta desde o dia 1**: `LOCAL_ONLY_KEYS = ['bridgeUrl','printMode']` nunca sincronizam via DB; `checkBridgeStatus` aceita formato legado e v2.2; fila IndexedDB; worker tick 15s; `manualPrintOrder` retorna `{ok, bridgeOk, queued, error}` e PDV/Cashier checam corretamente.
- PWA com sw.js network-first, manifest standalone.
- Critério de aceite explícito.

## 2. `docs/PROMPT_CODEX_BRIDGE_ELECTRON_FINAL.md`
Prompt completo para o **Codex** gerar **um único instalador Windows** (.exe) que substitui bridge.exe + console preto:
- Estrutura `desktop/` com main.cjs, preload.cjs, bridge/server.cjs, bridge/printer.cjs, bridge/config.cjs, assets, build/installer.nsh.
- package.json com electron 31 + electron-builder 24, target nsis x64, oneClick=false.
- main.cjs: Express na 9100, BrowserWindow → palm-order-pro.lovable.app/admin, Tray (Abrir, Status, Reiniciar Bridge, Logs, Iniciar com Windows, Sair), close→hide, singleInstanceLock, ping de status 30s.
- bridge/server.cjs: `/health` (cache 5s, formato v2.2 com bridge_version, printer_ok, printer_ready, printer_name, printer_method), `/printers`, `/config` GET+POST em %APPDATA%, `/test`, `/print` (base64 → tempfile .bin → PowerShell Out-Printer → unlink).
- bridge/printer.cjs: spawn powershell.exe NoProfile NonInteractive windowsHide com Get-Content -Encoding Byte | Out-Printer -Name.
- build/installer.nsh: netsh advfirewall add/delete rule porta 9100 no install/uninstall.
- Comandos de build gerando `dist/Plano B Fast Order Setup 2.2.0.exe`.
- Critério de aceite: 2 cliques, sem console preto, bandeja funcional, close→hide, firewall automático, "Iniciar com Windows" persistente, diagnóstico mostra "PONTE ONLINE v2.2.0".
- NÃO MEXER: código React do palm-order-pro nem Supabase.

Depois de salvos, basta abrir cada arquivo em `docs/`, copiar e colar no destino correspondente.
