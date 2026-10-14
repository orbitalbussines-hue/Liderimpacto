"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Interruptor } from "@/components/ui/interruptor";
import { acaoSalvarConfigGamificacao } from "@/lib/actions/gamificacao";
import type { NivelGamificacao } from "@/lib/gamificacao/padroes";
import { esquemaNiveis } from "@/lib/gamificacao/regras";

type Pontos = { aulaConcluida: number; cursoConcluido: number; avaliacaoAprovada: number; publicacaoComunidade: number };

export interface FormGamificacaoProps {
  inicial: { ligada: boolean; pontos: Pontos; niveis: NivelGamificacao[]; versao: string | null };
}

const ACOES: { chave: keyof Pontos; titulo: string; ajuda: string }[] = [
  { chave: "aulaConcluida", titulo: "Aula concluída", ajuda: "Cada aula, uma vez." },
  { chave: "cursoConcluido", titulo: "Curso concluído", ajuda: "Todas as aulas do curso." },
  { chave: "avaliacaoAprovada", titulo: "Avaliação aprovada", ajuda: "Só a primeira aprovação." },
  { chave: "publicacaoComunidade", titulo: "Publicação na comunidade", ajuda: "Só a primeira do dia." },
];
const MAX_NIVEIS = 10;

/**
 * Configuração da gamificação (só DONO, RN-144): ligar/desligar, pontos por ação e níveis. Ligar ou
 * desligar passa pelo modal block (ligar calcula os pontos de tudo o que os alunos já fizeram).
 */
export function FormGamificacao({ inicial }: FormGamificacaoProps) {
  const router = useRouter();
  const [ligada, setLigada] = useState(inicial.ligada);
  const [pontos, setPontos] = useState<Record<keyof Pontos, string>>(() => {
    const p = inicial.pontos;
    return { aulaConcluida: String(p.aulaConcluida), cursoConcluido: String(p.cursoConcluido), avaliacaoAprovada: String(p.avaliacaoAprovada), publicacaoComunidade: String(p.publicacaoComunidade) };
  });
  const [niveis, setNiveis] = useState(inicial.niveis.map((n) => ({ nome: n.nome, minimo: String(n.minimo) })));
  const [versao, setVersao] = useState(inicial.versao);
  const [salvaLigada, setSalvaLigada] = useState(inicial.ligada);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const mudar = (fn: () => void) => {
    fn();
    setAviso(null);
  };

  const salvar = () =>
    iniciar(async () => {
      const entrada = {
        ligada,
        pontos: Object.fromEntries(ACOES.map((a) => [a.chave, Number(pontos[a.chave] || 0)])) as Pontos,
        niveis: niveis.map((n) => ({ nome: n.nome.trim(), minimo: Number(n.minimo || 0) })),
        versao,
      };
      setConfirmar(false);
      const r = await acaoSalvarConfigGamificacao(entrada).catch(() => null);
      if (!r) return setAviso({ tom: "erro", texto: "Sem conexão com o servidor. Tente de novo." });
      if (!r.ok) return setAviso({ tom: "erro", texto: r.erro });
      setVersao(r.dados.versao);
      setSalvaLigada(ligada);
      const rc = r.dados.recalculo;
      const novos = rc ? rc.AULA_CONCLUIDA + rc.CURSO_CONCLUIDO + rc.AVALIACAO_APROVADA + rc.PUBLICACAO_COMUNIDADE + rc.DESAFIO_CONCLUIDO : 0;
      setAviso({
        tom: "ok",
        texto: rc ? `Gamificação ligada. ${novos === 1 ? "1 lançamento retroativo" : `${novos} lançamentos retroativos`} a partir do que os alunos já fizeram.` : "Configuração salva.",
      });
      router.refresh();
    });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const v = esquemaNiveis.safeParse(niveis.map((n) => ({ nome: n.nome, minimo: Number(n.minimo || 0) })));
        if (!v.success) return setAviso({ tom: "erro", texto: v.error.issues[0]?.message ?? "Níveis inválidos." });
        if (ligada !== salvaLigada) return setConfirmar(true);
        salvar();
      }}
    >
      <Cartao padding={24} como="section" aria-labelledby="titulo-ligada" className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <CartaoTitulo tamanho={15} como="h2" id="titulo-ligada">
            Gamificação na área do aluno
          </CartaoTitulo>
          <p className="m-0 mt-1 text-[13px] leading-relaxed text-muted">
            Ligada, o aluno vê pontos, nível, ranking e desafios em Conquistas, e cada ação nova pontua. Ao ligar, o sistema calcula os pontos de tudo o que os alunos já fizeram.
          </p>
        </div>
        <Interruptor ligado={ligada} onAlternar={(v) => mudar(() => setLigada(v))} aria-labelledby="titulo-ligada" className="mt-0.5 shrink-0" />
      </Cartao>

      <Cartao padding={24} como="section" aria-labelledby="titulo-pontos" className="flex flex-col gap-4">
        <div>
          <CartaoTitulo tamanho={15} como="h2" id="titulo-pontos">
            Pontos por ação
          </CartaoTitulo>
          <p className="m-0 mt-1 text-[13px] text-muted">De 0 a 10.000 (0 não pontua). Mudar um valor vale dali em diante; o que já foi lançado fica.</p>
        </div>
        <div className="grid gap-4 min-[640px]:grid-cols-2">
          {ACOES.map((a) => (
            <Campo
              key={a.chave}
              rotulo={a.titulo}
              ajuda={a.ajuda}
              type="number"
              inputMode="numeric"
              min={0}
              max={10000}
              required
              tamanho="42"
              value={pontos[a.chave]}
              onChange={(e) => mudar(() => setPontos((p) => ({ ...p, [a.chave]: e.target.value })))}
            />
          ))}
        </div>
      </Cartao>

      <Cartao padding={24} como="section" aria-labelledby="titulo-niveis" className="flex flex-col gap-4">
        <div>
          <CartaoTitulo tamanho={15} como="h2" id="titulo-niveis">
            Níveis
          </CartaoTitulo>
          <p className="m-0 mt-1 text-[13px] text-muted">O primeiro começa em 0. Cada nível seguinte pede mais pontos que o anterior (até {MAX_NIVEIS}).</p>
        </div>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {niveis.map((n, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_110px_44px] items-end gap-2.5 min-[640px]:grid-cols-[minmax(0,1fr)_160px_44px]">
              <Campo
                rotulo={`Nível ${i + 1}`}
                value={n.nome}
                maxLength={30}
                required
                tamanho="42"
                onChange={(e) => mudar(() => setNiveis((l) => l.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x))))}
              />
              <Campo
                rotulo="A partir de"
                type="number"
                inputMode="numeric"
                min={0}
                value={i === 0 ? "0" : n.minimo}
                readOnly={i === 0}
                required
                tamanho="42"
                sufixo={<span className="text-xs text-muted">pts</span>}
                onChange={(e) => mudar(() => setNiveis((l) => l.map((x, j) => (j === i ? { ...x, minimo: e.target.value } : x))))}
              />
              {i === 0 ? (
                <span aria-hidden />
              ) : (
                <Button
                  type="button"
                  variant="fantasma"
                  size="icone44"
                  aria-label={`Remover o nível ${n.nome || i + 1}`}
                  className="text-muted"
                  onClick={() => mudar(() => setNiveis((l) => l.filter((_, j) => j !== i)))}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ol>
        {niveis.length < MAX_NIVEIS && (
          <Button
            type="button"
            variant="contorno"
            size="36"
            className="self-start"
            onClick={() =>
              mudar(() => setNiveis((l) => [...l, { nome: "", minimo: String((Number(l[l.length - 1]?.minimo) || 0) + 500) }]))
            }
          >
            <Plus aria-hidden />
            Adicionar nível
          </Button>
        )}
      </Cartao>

      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      <Button type="submit" size="42" carregando={pendente} className="self-start">
        Salvar configuração
      </Button>

      <ModalConfirmacaoBlock
        aberto={confirmar}
        titulo={ligada ? "Ligar a gamificação" : "Desligar a gamificação"}
        mensagem={
          ligada
            ? "Os alunos passam a ver pontos, nível, ranking e desafios em Conquistas. O sistema calcula agora os pontos de tudo o que eles já fizeram (aulas, cursos, avaliações e publicações), pela data em que cada coisa aconteceu."
            : "Conquistas some da área do aluno e nenhuma ação nova pontua. Os pontos já lançados ficam guardados e voltam a aparecer se você ligar de novo."
        }
        textoConfirmar={ligada ? "Ligar" : "Desligar"}
        carregando={pendente}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={salvar}
      />
    </form>
  );
}
