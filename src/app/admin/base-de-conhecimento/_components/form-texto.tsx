"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { AreaTexto } from "@/components/ui/area-texto";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Selecao } from "@/components/ui/selecao";
import { acaoCriarTexto, acaoSalvarTexto } from "@/lib/actions/conhecimento";
import { dividirEmTrechos, LIMITES_CONHECIMENTO } from "@/lib/conhecimento/regras";
import { conteudoTextoSchema, tituloTextoSchema } from "@/lib/validators/ia";
import { useExcluirTexto } from "./acoes-texto";
import { ROTA_BASE } from "./comum";

export interface FormTextoProps {
  cursos: { id: string; titulo: string }[];
  /** Editar; sem = criar. */
  texto?: { id: string; titulo: string; texto: string; produtoId: string | null; versao: string };
}

/**
 * Texto escrito pela equipe para a Base de conhecimento (FAQ, política de certificados, sobre o
 * professor). Texto puro; os trechos são refeitos ao salvar e a "Testar busca" já os enxerga.
 */
export function FormTexto({ cursos, texto }: FormTextoProps) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(texto?.titulo ?? "");
  const [conteudo, setConteudo] = useState(texto?.texto ?? "");
  const [produtoId, setProdutoId] = useState(texto?.produtoId ?? "");
  const [versao, setVersao] = useState(texto?.versao ?? "");
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [erros, setErros] = useState<{ titulo?: string; texto?: string }>({});
  const [pendente, iniciar] = useTransition();
  const excluir = useExcluirTexto({ documentoId: texto?.id ?? "", titulo: texto?.titulo ?? "", versao, aoExcluir: () => router.push(ROTA_BASE) });
  const trechos = conteudo.trim() ? dividirEmTrechos(conteudo).length : 0;

  const salvar = () =>
    iniciar(async () => {
      setAviso(null);
      const t = tituloTextoSchema.safeParse(titulo);
      const c = conteudoTextoSchema.safeParse(conteudo);
      setErros({ titulo: t.error?.issues[0]?.message, texto: c.error?.issues[0]?.message });
      if (!t.success || !c.success) return;
      const base = { titulo, texto: conteudo, produtoId: produtoId || null };
      if (!texto) {
        const r = await acaoCriarTexto(base).catch(() => null);
        if (!r || !r.ok) return setAviso({ tom: "erro", texto: r?.erro ?? "Sem conexão com o servidor. Tente de novo." });
        router.push(`${ROTA_BASE}/textos/${r.dados.id}?criado=1`);
        return;
      }
      const r = await acaoSalvarTexto({ ...base, documentoId: texto.id, versao }).catch(() => null);
      if (!r || !r.ok) return setAviso({ tom: "erro", texto: r?.erro ?? "Sem conexão com o servidor. Tente de novo." });
      setVersao(r.dados.versao);
      setAviso({ tom: "ok", texto: "Texto salvo. O assistente já usa a versão nova." });
      router.refresh();
    });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <Campo
        rotulo="Título"
        value={titulo}
        maxLength={LIMITES_CONHECIMENTO.tituloTexto}
        tamanho="42"
        placeholder="Ex.: Perguntas frequentes sobre certificados"
        erro={erros.titulo}
        onChange={(e) => setTitulo(e.target.value)}
      />
      <Selecao
        rotulo="Vale para"
        value={produtoId}
        onChange={(e) => setProdutoId(e.target.value)}
        vazio="Todos os alunos da área"
        opcoes={cursos.map((c) => ({ valor: c.id, rotulo: `Só quem tem o curso ${c.titulo}` }))}
        ajuda="Texto de um curso só chega às respostas de quem tem acesso a ele."
      />
      <AreaTexto
        rotulo="Conteúdo"
        rows={16}
        value={conteudo}
        maxLength={LIMITES_CONHECIMENTO.texto}
        erro={erros.texto}
        ajuda={`Texto puro, em parágrafos. ${conteudo.length.toLocaleString("pt-BR")} de ${LIMITES_CONHECIMENTO.texto.toLocaleString("pt-BR")} caracteres${trechos ? ` · vira ${trechos} ${trechos === 1 ? "trecho" : "trechos"}` : ""}.`}
        onChange={(e) => setConteudo(e.target.value)}
      />
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" size="42" carregando={pendente}>
          {texto ? "Salvar texto" : "Criar texto"}
        </Button>
        {texto && (
          <Button type="button" variant="fantasma" size="40" className="text-warn" onClick={excluir.abrir}>
            <Trash2 aria-hidden />
            Excluir
          </Button>
        )}
      </div>
      {texto && excluir.modais}
    </form>
  );
}
