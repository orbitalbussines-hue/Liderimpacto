import type { Metadata } from "next";
import { Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import { COOKIE_TEMA } from "@/lib/tema-constantes";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Líder de Impacto", template: "%s · Líder de Impacto" },
  description: "Área de membros da Líder de Impacto — Valmer Albuquerque.",
};

// Aplica o tema do cookie antes da primeira pintura: sem piscar e sem tornar o layout dinamico.
const scriptTema = `try{var m=document.cookie.match(/(?:^|; )${COOKIE_TEMA}=(light|dark)/);if(m)document.documentElement.dataset.theme=m[1]}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      data-theme="dark"
      suppressHydrationWarning
      className={`${jakarta.variable} ${newsreader.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
