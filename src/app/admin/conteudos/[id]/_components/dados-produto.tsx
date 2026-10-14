"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PreviaCorMarca } from "@/components/admin/previa-cor-marca";
import { SeletorCorMarca } from "@/components/admin/seletor-cor-marca";
import { AreaTexto } from "@/components/ui/area-texto";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { Interruptor } from "@/components/ui/interruptor";
import { Selecao } from "@/components/ui/selecao";
import { acaoSalvarProduto } from "@/lib/actions/produtos";
import { ROTULO_TIPO_PRODUTO } from "@/lib/catalogo/regras";
import { TIPOS_PRODUTO, type TipoProduto } from "@/lib/db/schema/_enums";
import { validarHex } from "@/lib/marca/paleta";

export interface DadosProdutoProps {
  produto: {
    id: string;
    titulo: string;
    slug: string;
    descricao: string;
    tipo: TipoProduto;
    professorMembroId: string | null;
    corMarca: string | null;
    /** `updated_at` ISO (trava). Muda a cada refresh depois de capa/situação. */
    versao: string;
  };
  equipe: { membroId: string; nome: string; papel: string }[];
  /** Cor da área (criador) ou o dourado padrão: ponto de partida da cor própria. */
  corDaArea: string;
}

/** Dados do produto: título, endereço, descrição, tipo, professor e cor própria do curso. */
export function DadosProduto({ produto, equipe, corDaArea }: DadosProdutoProps) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoProduto>(produto.tipo);
  const [corPropria, setCorPropria] = useState(produto.corMarca !== null);
  const [cor, setCor] = useState(validarHex(produto.corMarca ?? "") ?? corDaArea);
  const [corValida, setCorValida] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, iniciar] = useTransition();

  return (
    <form
      className="flex flex-col gap-5"
      onChange={() => setFeito(false)}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setErro(null);
        iniciar(async () => {
          const r = await acaoSalvarProduto({
            produtoId: produto.id,
            versao: produto.versao,
            titulo: String(f.get("titulo") ?? ""),
            slug: String(f.get("slug") ?? ""),
            descricao: String(f.get("descricao") ?? ""),
            tipo,
            professorMembroId: String(f.get("professor") ?? "") || null,
            corMarca: corPropria ? cor : null,
          });
          if (!r.ok) return setErro(r.erro);
          setFeito(true);
          router.refresh();
        });
      }}
    >
      <Campo rotulo="Título" name="titulo" defaultValue={produto.titulo} required minLength={2} maxLength={160} tamanho="42" autoComplete="off" />
      <Campo
        rotulo="Endereço"
        name="slug"
        defaultValue={produto.slug}
        required
        maxLength={80}
        tamanho="42"
        spellCheck={false}
        className="font-mono"
        ajuda="Parte do link do curso. Só letras minúsculas, números e hífens."
      />
      <AreaTexto rotulo="Descrição" name="descricao" defaultValue={produto.descricao} maxLength={5000} rows={5} />
      <div className="grid gap-5 desk:grid-cols-2">
        <CampoMoldura id="tipo-produto" rotulo="Tipo">
          <GrupoChips
            id="tipo-produto"
            aria-labelledby="tipo-produto-rotulo"
            opcoes={TIPOS_PRODUTO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_PRODUTO[t] }))}
            valor={tipo}
            onMudar={(v) => {
              setTipo(v);
              setFeito(false);
            }}
          />
        </CampoMoldura>
        <Selecao
          rotulo="Professor"
          name="professor"
          defaultValue={produto.professorMembroId ?? ""}
          vazio="Sem professor"
          opcoes={equipe.map((m) => ({ valor: m.membroId, rotulo: `${m.nome} (${m.papel === "DONO" ? "Dono" : "Admin"})` }))}
          ajuda="Alguém da equipe desta área."
        />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div id="cor-propria" className="text-sm font-semibold">
              Cor própria do curso
            </div>
            <div className="text-xs text-muted">Vale só dentro do curso (página, player, certificado). Desligada, usa a cor da área.</div>
          </div>
          <Interruptor
            aria-labelledby="cor-propria"
            ligado={corPropria}
            onAlternar={(v) => {
              setCorPropria(v);
              setFeito(false);
            }}
          />
        </div>
        {corPropria && (
          <>
            <SeletorCorMarca
              cor={cor}
              onMudar={(hex) => {
                setCor(hex);
                setFeito(false);
              }}
              onValidade={setCorValida}
            />
            <PreviaCorMarca cor={cor} />
          </>
        )}
      </div>

      {erro && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro}
        </p>
      )}
      {feito && (
        <p role="status" className="m-0 text-[13px] font-semibold text-ok">
          Dados salvos.
        </p>
      )}
      <Button type="submit" size="42" carregando={pendente} disabled={corPropria && !corValida} className="self-start">
        Salvar dados
      </Button>
    </form>
  );
}
