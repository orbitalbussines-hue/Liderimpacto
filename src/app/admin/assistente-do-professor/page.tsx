import type { Metadata } from "next";
import { Suspense } from "react";
import { MolduraAbas } from "@/components/admin/moldura-abas";
import { iaConfigurada } from "@/lib/assistente/cliente";
import { configDoAssistente } from "@/lib/assistente/config";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE } from "@/lib/auth/permissoes";
import { cursosDoCriador } from "@/lib/conhecimento/consultas";
import { ABAS_ASSISTENTE, AvisoIaNaoConfigurada, SeloSituacao } from "./_components/comum";
import { FormAssistente } from "./_components/form-assistente";

export const metadata: Metadata = { title: "Assistente do professor" };

async function Conteudo() {
  const { criador } = await membroDaPagina(EQUIPE);
  const [c, cursos] = await Promise.all([configDoAssistente(criador.id), cursosDoCriador(criador.id)]);
  return (
    <div className="flex flex-col gap-4">
      {!iaConfigurada() && <AvisoIaNaoConfigurada />}
      <MolduraAbas titulo="Assistente do professor" meta={<SeloSituacao ligado={c.ligado} />} abas={ABAS_ASSISTENTE} ativa="Configuração">
        <FormAssistente
          cursos={cursos}
          inicial={{ ligado: c.ligado, nome: c.nome, instrucoes: c.instrucoes, limiteDiario: c.limiteDiario, todosOsCursos: c.todosOsCursos, produtos: c.produtos, versao: c.versao?.toISOString() ?? null }}
        />
      </MolduraAbas>
    </div>
  );
}

/** Configuração do assistente do professor (DONO e ADMIN, ADR-0014). */
export default function PaginaAssistente() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}
