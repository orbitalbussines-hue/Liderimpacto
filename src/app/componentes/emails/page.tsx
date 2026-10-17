import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { EMAILS_EXEMPLO, MARCAS_EXEMPLO, exemplo, type EmailExemplo, type MarcaExemplo } from "./_exemplos";
import { PreviaEmails, type ExemploPronto } from "./previa-emails";

export const metadata: Metadata = { title: "Componentes · E-mails", robots: { index: false } };

/** Previa dos e-mails do sistema com cada marca. So em desenvolvimento (producao = 404). */
export default function CatalogoEmails() {
  if (process.env.NODE_ENV === "production") notFound();

  const marcas = Object.keys(MARCAS_EXEMPLO) as MarcaExemplo[];
  const emails = Object.keys(EMAILS_EXEMPLO) as EmailExemplo[];
  const exemplos: ExemploPronto[] = marcas.flatMap((marca) =>
    emails.map((email) => ({ marca, email, rotulo: EMAILS_EXEMPLO[email], ...exemplo(email, marca) })),
  );

  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-10 px-5 py-6 desk:px-10 desk:py-11">
      <CabecalhoPagina
        eyebrow="Design system"
        titulo="E-mails do sistema"
        descricao="Modelo único (src/lib/email/modelo.ts) com a marca da área. Os textos são os de src/lib/email/mensagens.ts; dados e token de exemplo."
        acoes={
          <Link href="/componentes" className={buttonVariants({ variant: "contorno", size: "40" })}>
            Primitivas
          </Link>
        }
      />
      <PreviaEmails
        exemplos={exemplos}
        marcas={marcas.map((m) => ({ valor: m, rotulo: MARCAS_EXEMPLO[m].rotulo }))}
      />
    </main>
  );
}
