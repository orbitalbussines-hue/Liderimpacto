"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { Selecao } from "@/components/ui/selecao";
import { acaoCriarAvaliacao } from "@/lib/actions/avaliacoes";
import { ROTULO_TIPO_AVALIACAO } from "@/lib/avaliacoes/regras";
import { TIPOS_AVALIACAO, type TipoAvaliacao } from "@/lib/db/schema/_enums";

export interface FormNovaAvaliacaoProps {
  cursos: { id: string; titulo: string }[];
  cursoInicial?: string;
}

/** Nova avaliação: curso, título e tipo. Nasce em rascunho com os padrões (RN-123); o resto vai no editor. */
export function FormNovaAvaliacao({ cursos, cursoInicial }: FormNovaAvaliacaoProps) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoAvaliacao>("QUIZ");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (cursos.length === 0) return <Aviso>Crie um curso em Conteúdos antes: toda avaliação pertence a um curso.</Aviso>;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setErro(null);
        iniciar(async () => {
          const r = await acaoCriarAvaliacao({
            produtoId: String(f.get("curso") ?? ""),
            campos: { titulo: String(f.get("titulo") ?? ""), tipo, moduloId: null },
          });
          if (!r.ok) return setErro(r.erro);
          router.push(`/admin/avaliacoes/${r.dados.id}`);
        });
      }}
    >
      <Selecao rotulo="Curso" name="curso" required defaultValue={cursoInicial ?? ""} vazio="Escolha o curso" opcoes={cursos.map((c) => ({ valor: c.id, rotulo: c.titulo }))} />
      <Campo rotulo="Título" name="titulo" required minLength={2} maxLength={160} tamanho="42" autoComplete="off" placeholder="Ex.: Quiz · Cultura organizacional" />
      <CampoMoldura id="tipo-nova-avaliacao" rotulo="Tipo" ajuda="Quiz e simulado mostram o gabarito logo após a correção; a prova só quando o aluno não pode mais tentar.">
        <GrupoChips
          id="tipo-nova-avaliacao"
          aria-labelledby="tipo-nova-avaliacao-rotulo"
          opcoes={TIPOS_AVALIACAO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_AVALIACAO[t] }))}
          valor={tipo}
          onMudar={setTipo}
        />
      </CampoMoldura>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Button type="submit" size="42" carregando={pendente} className="self-start">
        Criar avaliação
      </Button>
    </form>
  );
}
