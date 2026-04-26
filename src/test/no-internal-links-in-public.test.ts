/**
 * Teste de regressão de segurança:
 * GARANTE que nenhuma página pública (PublicMenu, PublicCheckout, PublicOrderSuccess,
 * PublicMyOrders) e nenhum componente em src/components/public-menu/ tenha referências
 * a rotas internas (/admin, /home, /palm, /kitchen, /pdv, /cashier, /print-station,
 * /instalar/, /atualizar).
 *
 * Por quê: clientes não devem descobrir essas rotas por links na UI pública nem por
 * mensagens compartilhadas (WhatsApp, QR code etc.).
 *
 * Como ler: se este teste falhar, alguém adicionou uma referência a uma rota interna
 * em código que é exibido ao público. Remova o link OU mova o arquivo para fora
 * da camada pública.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

// Rotas internas que NÃO podem aparecer em código público.
// Usamos regex que casa apenas como path (entre aspas, em string templates ou hrefs)
// para evitar falsos positivos com nomes de variáveis tipo "originalTableName".
const FORBIDDEN_PATHS = [
  "/admin",
  "/home",
  "/palm",
  "/kitchen",
  "/pdv",
  "/cashier",
  "/print-station",
  "/instalar/",
  "/atualizar",
];

// Arquivos que são públicos (renderizados para clientes não autenticados)
const PUBLIC_FILES: string[] = [
  "src/pages/PublicMenu.tsx",
  "src/pages/PublicCheckout.tsx",
  "src/pages/PublicOrderSuccess.tsx",
  "src/pages/PublicMyOrders.tsx",
  "src/lib/online-order-messages.ts",
  "src/lib/public-menu.ts",
  "src/lib/public-cart.ts",
];

// Diretório com componentes do cardápio público (todos varridos)
const PUBLIC_DIRS = ["src/components/public-menu"];

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) out.push(...listFilesRecursive(full));
      else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full);
    }
  } catch {
    /* dir pode não existir, ok */
  }
  return out;
}

function findForbiddenInFile(absPath: string): string[] {
  const content = readFileSync(absPath, "utf8");
  // Remove comentários de linha e bloco para evitar falsos positivos em docstrings.
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const hits: string[] = [];
  for (const route of FORBIDDEN_PATHS) {
    // Procura a rota cercada por aspas (", ', `) ou no início de uma string template,
    // ou como destino de href/to/navigate.
    // Exemplo aceito: navigate("/admin"), to="/palm", `${origin}/kitchen`
    const escaped = route.replace(/[/]/g, "\\/");
    const re = new RegExp(`["'\`]${escaped}(["'\`/?#])`, "g");
    if (re.test(stripped)) {
      hits.push(route);
    }
  }
  return hits;
}

describe("Vazamento de rotas internas em código público", () => {
  const allPublicFiles = [
    ...PUBLIC_FILES.map((p) => path.join(ROOT, p)),
    ...PUBLIC_DIRS.flatMap((d) => listFilesRecursive(path.join(ROOT, d))),
  ];

  it("encontra arquivos públicos para varrer", () => {
    expect(allPublicFiles.length).toBeGreaterThan(0);
  });

  for (const file of allPublicFiles) {
    const rel = path.relative(ROOT, file);
    it(`não referencia rotas internas: ${rel}`, () => {
      const hits = findForbiddenInFile(file);
      expect(hits, `${rel} contém referências a rotas internas: ${hits.join(", ")}`).toEqual(
        [],
      );
    });
  }
});
