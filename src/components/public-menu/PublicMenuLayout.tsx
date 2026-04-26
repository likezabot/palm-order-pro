import { type ReactNode } from "react";

type Props = { children: ReactNode };

/**
 * Layout isolado do cardápio público.
 * NÃO inclui banners, links para /admin, /palm, /pdv, /kitchen, etc.
 */
export default function PublicMenuLayout({ children }: Props) {
  return (
    <div className="public-menu-theme min-h-screen text-foreground">
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
