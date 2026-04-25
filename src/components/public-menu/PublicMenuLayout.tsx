import { type ReactNode } from "react";

type Props = { children: ReactNode };

/**
 * Layout isolado do cardápio público.
 * NÃO inclui banners, links para /admin, /palm, /pdv, /kitchen, etc.
 */
export default function PublicMenuLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="pb-24">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 py-6 text-center text-[11px] text-muted-foreground">
        Cardápio digital · Plano B Espetaria
      </footer>
    </div>
  );
}
