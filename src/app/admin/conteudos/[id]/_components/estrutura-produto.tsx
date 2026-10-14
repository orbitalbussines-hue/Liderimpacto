"use client";

import { useState } from "react";
import { Layers, Plus } from "lucide-react";
import { ListaOrdenavel, useOrdemPersistida } from "@/components/admin/lista-ordenavel";
import { Button } from "@/components/ui/button";
import { CartaoTitulo } from "@/components/ui/cartao";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { acaoCriarModulo, acaoReordenarModulos } from "@/lib/actions/produtos-estrutura";
import { DialogoTitulo } from "./dialogo-titulo";
import { ModuloEstrutura, useAcaoEstrutura, type ModuloDaEstrutura } from "./modulo-estrutura";

export interface EstruturaProdutoProps {
  produtoId: string;
  modulos: ModuloDaEstrutura[];
}

/**
 * Estrutura do produto: módulos e aulas com arrastar e soltar (mouse, toque e teclado) ou
 * subir/descer. Cada reordenação grava na hora com trava (versões de todos os irmãos).
 * Quem usa passa `key` com as versões: dado novo do servidor remonta o estado local.
 */
export function EstruturaProduto({ produtoId, modulos }: EstruturaProdutoProps) {
  const ordem = useOrdemPersistida(modulos, (itens) => acaoReordenarModulos({ produtoId, itens }));
  const [novo, setNovo] = useState(false);
  const { erro, setErro, pendente, rodar } = useAcaoEstrutura();
  const totalAulas = ordem.itens.reduce((n, m) => n + m.aulas.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CartaoTitulo tamanho={15} como="h2">
            Estrutura
          </CartaoTitulo>
          <p className="m-0 text-xs text-muted">
            {ordem.itens.length} {ordem.itens.length === 1 ? "módulo" : "módulos"} · {totalAulas} {totalAulas === 1 ? "aula" : "aulas"} · arraste pela alça ou use as setas
          </p>
        </div>
        <Button
          size="36"
          onClick={() => {
            setErro(null);
            setNovo(true);
          }}
        >
          <Plus className="size-3.5" aria-hidden />
          Novo módulo
        </Button>
      </div>

      {ordem.erro && (
        <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
          {ordem.erro}
        </p>
      )}
      {ordem.itens.length === 0 ? (
        <EstadoVazio comMoldura icone={<Layers />} titulo="Nenhum módulo ainda" descricao="Crie o primeiro módulo e depois as aulas dentro dele." />
      ) : (
        <ListaOrdenavel
          itens={ordem.itens}
          rotulo={(m) => `Módulo ${m.titulo}`}
          onReordenar={ordem.reordenar}
          desabilitado={ordem.pendente}
          renderItem={(m, controles) => <ModuloEstrutura modulo={m} numero={ordem.itens.indexOf(m) + 1} produtoId={produtoId} controles={controles} />}
        />
      )}

      <DialogoTitulo
        aberto={novo}
        onFechar={() => setNovo(false)}
        titulo="Novo módulo"
        descricao="Entra no fim da lista; depois é só arrastar para o lugar."
        textoSalvar="Criar módulo"
        carregando={pendente}
        erro={erro}
        onSalvar={(titulo) => rodar(() => acaoCriarModulo({ produtoId, titulo }), () => setNovo(false))}
      />
    </div>
  );
}
