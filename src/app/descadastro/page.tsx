import type { Metadata } from "next";
import { Suspense } from "react";
import { hostAtual } from "@/lib/criador/atual";
import { lerTokenDescadastro } from "@/lib/marketing/tokens";
import { MolduraAutenticacao } from "../_autenticacao/moldura-autenticacao";
import { CabecalhoEntrada } from "../_autenticacao/pecas";
import { ConfirmarDescadastro } from "./confirmar";

// Sem Referer: o token do link não vaza para outro site.
export const metadata: Metadata = { title: "Descadastrar", referrer: "no-referrer", robots: { index: false, follow: false } };

async function Descadastro({ searchParams }: { searchParams: PageProps<"/descadastro">["searchParams"] }) {
  const alvo = await hostAtual();
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  // Token de outra área, adulterado ou ausente: mensagem genérica, nada sobre a pessoa.
  const valido = alvo.tipo === "criador" && lerTokenDescadastro(alvo.criador.id, token) !== null;
  return (
    <MolduraAutenticacao alvo={alvo}>
      {valido && alvo.tipo === "criador" ? (
        <ConfirmarDescadastro token={token} area={alvo.criador.nome} />
      ) : (
        <CabecalhoEntrada titulo="Link inválido">
          Este link de descadastro não é válido. Use o link do e-mail mais recente que você recebeu.
        </CabecalhoEntrada>
      )}
    </MolduraAutenticacao>
  );
}

/**
 * Confirmação do descadastro (RN-227), pública e no host da área. GET nunca descadastra (robô de
 * antivírus abre links): só o botão confirma. O link dos e-mails (`/api/email/descadastro?t=`) chega
 * aqui por 303; o one-click do cliente de e-mail continua no POST da API.
 */
export default function PaginaDescadastro({ searchParams }: PageProps<"/descadastro">) {
  return (
    <Suspense fallback={null}>
      <Descadastro searchParams={searchParams} />
    </Suspense>
  );
}
