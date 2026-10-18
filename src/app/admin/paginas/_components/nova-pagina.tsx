"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { DialogoAdmin } from "@/components/admin/dialogo-admin";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { acaoCriarPagina } from "@/lib/actions/paginas";
import type { ModeloPagina } from "@/lib/db/schema/_enums";
import { slugDoTitulo } from "@/lib/paginas/config";
import { ROTULO_MODELO } from "@/lib/paginas/modelos";
import { cn } from "@/lib/utils";

const MODELOS = Object.keys(ROTULO_MODELO) as ModeloPagina[];

/** "Nova página": escolhe o modelo, o nome e o endereço; cria o rascunho e abre o editor. */
export function NovaPagina({ endereco }: { endereco: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [modelo, setModelo] = useState<ModeloPagina>("VENDA");
  const [titulo, setTitulo] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTocado, setSlugTocado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const fechar = () => {
    setAberto(false);
    setErro(null);
  };
  const criar = () =>
    iniciar(async () => {
      const r = await acaoCriarPagina({ modelo, titulo, slug });
      if (!r.ok) return setErro(r.erro);
      router.push(`/admin/paginas/${r.dados.id}`);
    });
  return (
    <>
      <Button size="36" onClick={() => setAberto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Nova página
      </Button>
      <DialogoAdmin
        aberto={aberto}
        onFechar={fechar}
        titulo="Nova página"
        descricao="Comece de um modelo pronto. Todos os textos e blocos podem ser trocados no editor."
        rodape={
          <>
            <Button variant="contorno" size="42" onClick={fechar}>
              Cancelar
            </Button>
            <Button size="42" carregando={pendente} onClick={criar}>
              Criar e editar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-1.5 text-[13px] font-semibold">Modelo</legend>
            {MODELOS.map((m) => (
              <label key={m} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors", modelo === m ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}>
                <input type="radio" name="modelo" value={m} checked={modelo === m} onChange={() => setModelo(m)} className="mt-0.5 accent-accent" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold">{ROTULO_MODELO[m].titulo}</span>
                  <span className="text-xs text-muted">{ROTULO_MODELO[m].descricao}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Campo
            rotulo="Nome da página"
            ajuda="Só a equipe vê este nome."
            value={titulo}
            maxLength={80}
            onChange={(e) => {
              setTitulo(e.target.value);
              if (!slugTocado) setSlug(slugDoTitulo(e.target.value));
            }}
          />
          <Campo
            rotulo="Endereço"
            ajuda={`${endereco}/p/${slug || "seu-endereco"}`}
            value={slug}
            maxLength={60}
            onChange={(e) => {
              setSlugTocado(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      </DialogoAdmin>
    </>
  );
}
