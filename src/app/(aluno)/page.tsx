import { Suspense } from "react";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { configPublicada } from "@/lib/vitrine/cache";
import { EsqueletoVitrine, VitrineMontada } from "./_vitrine/vitrine-montada";

/**
 * VITRINE do aluno (README tela 2): destaque + fileiras da versão PUBLICADA no construtor
 * (passo 9, cache por criador); sem publicação, o padrão (destaque automático + 6 fileiras).
 * Fileira sem itens não aparece (SISTEMA.md §6). Sessão dentro do <Suspense> (cacheComponents).
 */
async function Vitrine() {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  return <VitrineMontada q={q} config={await configPublicada(q.criador.id)} />;
}

export default function Inicio() {
  return (
    <Suspense fallback={<EsqueletoVitrine />}>
      <Vitrine />
    </Suspense>
  );
}
