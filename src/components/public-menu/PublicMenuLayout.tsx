import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Estilo dos botões de ação (vem de public_menu_settings.button_style). */
  buttonStyle?: "solid" | "outline" | "soft";
};

/**
 * Layout isolado do cardápio público.
 * NÃO inclui banners, links para /admin, /palm, /pdv, /kitchen, etc.
 *
 * `buttonStyle` é exposto como atributo `data-btn-style` para que regras
 * CSS em index.css ajustem os botões marcados com `.btn-accent`.
 */
export default function PublicMenuLayout({ children, buttonStyle = "solid" }: Props) {
  return (
    <div
      data-btn-style={buttonStyle}
      className="public-menu-theme dark min-h-screen bg-gradient-to-b from-background via-background to-[hsl(14_30%_8%)] text-foreground"
    >
      <main className="pb-24">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 py-8 text-center">
        <div className="mx-auto h-px w-16 bg-gradient-to-r from-transparent via-border to-transparent" />
        <p className="mt-4 text-[11px] font-medium tracking-wide text-muted-foreground/80">
          Cardápio digital · Plano B Espetaria
        </p>
      </footer>
    </div>
  );
}
