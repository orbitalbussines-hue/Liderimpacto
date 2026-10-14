"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Aviso } from "@/components/ui/aviso";
import { AreaTexto } from "@/components/ui/area-texto";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { Interruptor } from "@/components/ui/interruptor";
import { Selecao } from "@/components/ui/selecao";
import { acaoSalvarAvaliacao } from "@/lib/actions/avaliacoes";
import { ROTULO_TIPO_AVALIACAO } from "@/lib/avaliacoes/regras";
import { TIPOS_AVALIACAO, type StatusModulo, type TipoAvaliacao } from "@/lib/db/schema/_enums";

export interface CamposAvaliacao {
  titulo: string;
  tipo: TipoAvaliacao;
  moduloId: string | null;
  instrucoes: string;
  notaMinima: number;
  tentativasMax: number;
  tempoLimiteMin: number | null;
  obrigatoriaParaCertificado: boolean;
  liberaProximoModulo: boolean;
  embaralhar: boolean;
  exigeAulasConcluidas: boolean;
}

export interface DadosAvaliacaoProps {
  avaliacaoId: string;
  /** `updated_at` ISO (trava). Quem usa passa `key={versao}`: salvou, remonta com o dado novo. */
  versao: string;
  campos: CamposAvaliacao;
  modulos: { id: string; titulo: string; ordem: number; status: StatusModulo }[];
}

type Chave = "obrigatoriaParaCertificado" | "liberaProximoModulo" | "exigeAulasConcluidas" | "embaralhar";

function LinhaInterruptor({ titulo, descricao, ligado, onAlternar, desabilitado }: { titulo: string; descricao: string; ligado: boolean; onAlternar: (v: boolean) => void; desabilitado?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div>
        <div id={`${id}-t`} className="text-sm font-semibold">
          {titulo}
        </div>
        <div id={`${id}-d`} className="text-xs text-muted">
          {descricao}
        </div>
      </div>
      <Interruptor aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} ligado={ligado} onAlternar={onAlternar} disabled={desabilitado} />
    </div>
  );
}

const inteiro = (v: FormDataEntryValue | null) => Number.parseInt(String(v ?? ""), 10);

/** Dados e regras da avaliação (RN-123). Salva tudo de uma vez, com trava de colisão. */
export function DadosAvaliacao({ avaliacaoId, versao, campos, modulos }: DadosAvaliacaoProps) {
  const router = useRouter();
  const [tipo, setTipo] = useState(campos.tipo);
  const [moduloId, setModuloId] = useState(campos.moduloId ?? "");
  const [chaves, setChaves] = useState<Record<Chave, boolean>>({
    obrigatoriaParaCertificado: campos.obrigatoriaParaCertificado,
    liberaProximoModulo: campos.liberaProximoModulo,
    exigeAulasConcluidas: campos.exigeAulasConcluidas,
    embaralhar: campos.embaralhar,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, iniciar] = useTransition();
  const alternar = (k: Chave) => (v: boolean) => {
    setChaves((c) => ({ ...c, [k]: v }));
    setFeito(false);
  };

  return (
    <form
      className="flex flex-col gap-5"
      onChange={() => setFeito(false)}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const tempo = String(f.get("tempo") ?? "").trim();
        setErro(null);
        iniciar(async () => {
          const r = await acaoSalvarAvaliacao({
            avaliacaoId,
            versao,
            campos: {
              titulo: String(f.get("titulo") ?? ""),
              tipo,
              moduloId: moduloId || null,
              instrucoes: String(f.get("instrucoes") ?? ""),
              notaMinima: inteiro(f.get("notaMinima")),
              tentativasMax: inteiro(f.get("tentativas")),
              tempoLimiteMin: tempo ? inteiro(tempo) : null,
              ...chaves,
              liberaProximoModulo: moduloId ? chaves.liberaProximoModulo : false,
            },
          });
          if (!r.ok) return setErro(r.erro);
          setFeito(true);
          router.refresh();
        });
      }}
    >
      <Campo rotulo="Título" name="titulo" defaultValue={campos.titulo} required minLength={2} maxLength={160} tamanho="42" autoComplete="off" />
      <AreaTexto rotulo="Instruções" name="instrucoes" defaultValue={campos.instrucoes} maxLength={2000} rows={4} ajuda="Aparecem para o aluno antes de começar." />
      <div className="grid gap-5 desk:grid-cols-2">
        <Selecao
          rotulo="Módulo"
          value={moduloId}
          onChange={(e) => {
            setModuloId(e.target.value);
            setFeito(false);
          }}
          vazio="Avaliação do curso (sem módulo)"
          opcoes={modulos.map((m) => ({ valor: m.id, rotulo: `Módulo ${m.ordem} · ${m.titulo}${m.status === "RASCUNHO" ? " (rascunho)" : ""}` }))}
          ajuda="Sem módulo, ela fica no fim do curso."
        />
        <CampoMoldura id="tipo-avaliacao" rotulo="Tipo">
          <GrupoChips
            id="tipo-avaliacao"
            aria-labelledby="tipo-avaliacao-rotulo"
            opcoes={TIPOS_AVALIACAO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_AVALIACAO[t] }))}
            valor={tipo}
            onMudar={(v) => {
              setTipo(v);
              setFeito(false);
            }}
          />
        </CampoMoldura>
      </div>
      <div className="grid gap-5 desk:grid-cols-3">
        <Campo rotulo="Nota mínima" name="notaMinima" type="number" inputMode="numeric" min={0} max={100} step={1} required defaultValue={campos.notaMinima} tamanho="42" sufixo={<span className="text-xs text-muted">%</span>} />
        <Campo rotulo="Tentativas" name="tentativas" type="number" inputMode="numeric" min={0} max={50} step={1} required defaultValue={campos.tentativasMax} tamanho="42" ajuda="0 = ilimitadas." />
        <Campo
          rotulo="Tempo limite"
          name="tempo"
          type="number"
          inputMode="numeric"
          min={1}
          max={600}
          step={1}
          defaultValue={campos.tempoLimiteMin ?? ""}
          placeholder="Sem limite"
          tamanho="42"
          sufixo={<span className="text-xs text-muted">min</span>}
          ajuda="Vazio = sem limite."
        />
      </div>
      <div className="rounded-xl border border-border px-4">
        <LinhaInterruptor
          titulo="Obrigatória para o certificado"
          descricao="O certificado do curso só sai depois da aprovação."
          ligado={chaves.obrigatoriaParaCertificado}
          onAlternar={alternar("obrigatoriaParaCertificado")}
        />
        <LinhaInterruptor
          titulo="Libera o próximo módulo"
          descricao={moduloId ? "Os módulos seguintes ficam travados até a aprovação." : "Só para avaliação de módulo."}
          ligado={!!moduloId && chaves.liberaProximoModulo}
          onAlternar={alternar("liberaProximoModulo")}
          desabilitado={!moduloId}
        />
        <LinhaInterruptor
          titulo="Exige as aulas concluídas"
          descricao={moduloId ? "Abre quando todas as aulas do módulo estiverem concluídas." : "Abre quando todas as aulas do curso estiverem concluídas."}
          ligado={chaves.exigeAulasConcluidas}
          onAlternar={alternar("exigeAulasConcluidas")}
        />
        <LinhaInterruptor titulo="Embaralhar questões e opções" descricao="Cada tentativa sorteia uma ordem (verdadeiro ou falso não troca)." ligado={chaves.embaralhar} onAlternar={alternar("embaralhar")} />
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {feito && <Aviso tom="ok">Dados salvos.</Aviso>}
      <Button type="submit" size="42" carregando={pendente} className="self-start">
        Salvar dados
      </Button>
    </form>
  );
}
