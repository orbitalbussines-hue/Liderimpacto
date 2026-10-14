import type { Metadata } from "next";
import { Suspense } from "react";
import { hostAtual } from "@/lib/criador/atual";
import { MolduraAutenticacao } from "../_autenticacao/moldura-autenticacao";
import { FormDefinirSenha } from "./form-definir-senha";

// O token vem no FRAGMENTO (#token=): nunca chega ao servidor, a log ou ao Referer.
export const metadata: Metadata = { title: "Definir senha", referrer: "no-referrer" };

async function DefinirSenha() {
  const alvo = await hostAtual();
  return (
    <MolduraAutenticacao alvo={alvo}>
      <FormDefinirSenha />
    </MolduraAutenticacao>
  );
}

/** Primeiro acesso e redefinicao: a pessoa escolhe a propria senha com o link de uso unico. Publica. */
export default function PaginaPrimeiroAcesso() {
  return (
    <Suspense fallback={null}>
      <DefinirSenha />
    </Suspense>
  );
}
