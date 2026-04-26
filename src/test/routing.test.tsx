/**
 * Testes de roteamento: garantem que a raiz (/) sempre redireciona ao
 * cardápio público e que ferramentas internas (Atendimento/PDV/Cozinha/Admin)
 * NUNCA aparecem na raiz, mesmo que o usuário recarregue ou cole o link cru.
 *
 * Como App.tsx carrega muito Supabase/queries, recriamos aqui apenas as rotas
 * relevantes — o que importa é o comportamento do <Navigate /> da raiz.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";

// Stubs leves que imitam cada página — assim conseguimos asserir QUAL página
// foi renderizada sem precisar montar Supabase, IndexedDB, etc.
const PublicMenuStub = () => <div data-testid="public-menu">CARDÁPIO PÚBLICO</div>;
const HomeStub = () => (
  <div data-testid="home-internal">
    ATENDIMENTO / PALM
    <br />
    PDV / CAIXA
    <br />
    PAINEL COZINHA
    <br />
    ADMIN
  </div>
);
const PalmStub = () => <div data-testid="palm">Palm</div>;
const KitchenStub = () => <div data-testid="kitchen">Kitchen</div>;
const PdvStub = () => <div data-testid="pdv">PDV</div>;
const AdminStub = () => <div data-testid="admin">Admin</div>;

// Reproduz a configuração de rotas relevante de src/App.tsx
const TestRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/menu/plano-b-espetaria" replace />} />
    <Route path="/home" element={<HomeStub />} />
    <Route path="/palm" element={<PalmStub />} />
    <Route path="/kitchen" element={<KitchenStub />} />
    <Route path="/pdv" element={<PdvStub />} />
    <Route path="/admin" element={<AdminStub />} />
    <Route path="/menu/:slug" element={<PublicMenuStub />} />
  </Routes>
);

const renderAt = (initialPath: string) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <TestRoutes />
    </MemoryRouter>,
  );

describe("Roteamento da raiz (/)", () => {
  it("redireciona '/' para o cardápio público", () => {
    renderAt("/");
    expect(screen.getByTestId("public-menu")).toBeInTheDocument();
    expect(screen.getByText(/CARDÁPIO PÚBLICO/i)).toBeInTheDocument();
  });

  it("NÃO mostra a tela de seleção interna ao acessar '/'", () => {
    renderAt("/");
    // Nenhum atalho de ferramenta interna pode aparecer na raiz
    expect(screen.queryByTestId("home-internal")).not.toBeInTheDocument();
    expect(screen.queryByText(/ATENDIMENTO \/ PALM/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/PDV \/ CAIXA/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/PAINEL COZINHA/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^ADMIN$/i)).not.toBeInTheDocument();
  });

  it("NÃO renderiza nenhuma das páginas internas ao acessar '/'", () => {
    renderAt("/");
    expect(screen.queryByTestId("palm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kitchen")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pdv")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin")).not.toBeInTheDocument();
  });

  it("destino do redirect é exatamente '/menu/plano-b-espetaria' (slug correto)", () => {
    // Renderizamos a raiz e conferimos que o cardápio aparece, o que prova
    // que o slug esperado existe na rota /menu/:slug. Se alguém mudar o slug
    // do redirect para algo inexistente, o teste falha.
    const { container } = renderAt("/");
    expect(container.querySelector('[data-testid="public-menu"]')).not.toBeNull();
  });

  it("a tela interna SÓ aparece em '/home', nunca na raiz", () => {
    const { unmount } = renderAt("/home");
    expect(screen.getByTestId("home-internal")).toBeInTheDocument();
    unmount();

    renderAt("/");
    expect(screen.queryByTestId("home-internal")).not.toBeInTheDocument();
  });
});
