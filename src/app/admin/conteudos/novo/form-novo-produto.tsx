"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AreaTexto } from "@/components/ui/area-texto";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { acaoCriarProduto } from "@/lib/actions/produtos";
import { ROTULO_TIPO_PRODUTO } from "@/lib/catalogo/regras";
import { TIPOS_PRODUTO, type TipoProduto } from "@/lib/db/schema/_enums";
import { sugerirSlug } from "@/lib/validators/catalogo";

/** Novo produto: título, endereço (sugerido do título até ser editado), tipo e descrição. Nasce em rascunho. */
export function FormNovoProduto() {
  const router = useRouter();
  const [titulo, setTitulo] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [tipo, setTipo] = useState<TipoProduto>("CURSO");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const endereco = slugEditado ? slug : sugerirSlug(titulo);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const descricao = String(new FormData(e.currentTarget).get("descricao") ?? "");
        setErro(null);
        iniciar(async () => {
          const r = await acaoCriarProduto({ titulo, slug: endereco || undefined, descricao, tipo });
          if (!r.ok) return setErro(r.erro);
          router.push(`/admin/conteudos/${r.dados.id}`);
        });
      }}
    >
      <Campo rotulo="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={2} maxLength={160} tamanho="42" autoComplete="off" />
      <Campo
        rotulo="Endereço"
        value={endereco}
        onChange={(e) => {
          setSlugEditado(true);
          setSlug(e.target.value.toLowerCase());
        }}
        maxLength={80}
        tamanho="42"
        spellCheck={false}
        className="font-mono"
        ajuda="Aparece no link do curso. Só letras minúsculas, números e hífens."
      />
      <CampoMoldura id="tipo-produto" rotulo="Tipo">
        <GrupoChips
          id="tipo-produto"
          aria-labelledby="tipo-produto-rotulo"
          opcoes={TIPOS_PRODUTO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_PRODUTO[t] }))}
          valor={tipo}
          onMudar={(v) => setTipo(v as TipoProduto)}
        />
      </CampoMoldura>
      <AreaTexto rotulo="Descrição" name="descricao" maxLength={5000} rows={5} />
      {erro && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {erro}
        </p>
      )}
      <Button type="submit" size="42" carregando={pendente} className="self-start">
        Criar produto
      </Button>
    </form>
  );
}
