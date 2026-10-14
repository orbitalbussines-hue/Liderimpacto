"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PreviaCorMarca } from "@/components/admin/previa-cor-marca";
import { SeletorCorMarca } from "@/components/admin/seletor-cor-marca";
import { Button } from "@/components/ui/button";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { acaoSalvarCorDaMarca } from "@/lib/actions/aparencia";
import { PALETA_PADRAO, validarHex } from "@/lib/marca/paleta";

export interface EditorAparenciaProps {
  /** Hex salvo; nulo = dourado padrão. */
  corInicial: string | null;
  /** `updated_at` ISO do criador (trava de colisão). */
  versaoInicial: string;
  area: string;
}

const PADRAO = validarHex(PALETA_PADRAO)!;

/**
 * Seletor da cor da marca com prévia ao vivo nos dois temas, usando os componentes reais da
 * área do aluno. Salvar grava `criadores.cor_marca` (trava pelo `updated_at`).
 */
export function EditorAparencia({ corInicial, versaoInicial, area }: EditorAparenciaProps) {
  const router = useRouter();
  const [salva, setSalva] = useState(validarHex(corInicial ?? "") ?? PADRAO);
  const [cor, setCor] = useState(salva);
  const [valido, setValido] = useState(true);
  const [versao, setVersao] = useState(versaoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [pendente, iniciar] = useTransition();

  const mudar = (hex: string) => {
    setCor(hex);
    setFeito(false);
  };
  const salvar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await acaoSalvarCorDaMarca({ cor: cor === PADRAO ? null : cor, versao });
      if (!r.ok) return setErro(r.erro);
      setVersao(r.dados.versao);
      setSalva(cor);
      setFeito(true);
      router.refresh();
    });

  return (
    <div className="grid gap-5 desk:grid-cols-[340px_minmax(0,1fr)]">
      <Cartao className="flex flex-col gap-5 self-start">
        <CartaoTitulo tamanho={15}>Cor da marca</CartaoTitulo>
        <SeletorCorMarca cor={cor} onMudar={mudar} onValidade={setValido} />
        {erro && (
          <p role="alert" className="m-0 text-[13px] font-semibold text-warn">
            {erro}
          </p>
        )}
        {feito && (
          <p role="status" className="m-0 text-[13px] font-semibold text-ok">
            Salvo. A área do aluno de {area} já usa esta cor.
          </p>
        )}
        <div className="flex flex-wrap gap-2.5 border-t border-border pt-4">
          <Button size="42" carregando={pendente} disabled={cor === salva || !valido} onClick={salvar}>
            Salvar
          </Button>
          <Button
            variant="contorno"
            size="42"
            disabled={cor === PADRAO}
            onClick={() => {
              mudar(PADRAO);
              setValido(true);
            }}
          >
            Voltar ao padrão
          </Button>
        </div>
      </Cartao>

      <PreviaCorMarca cor={cor} />
    </div>
  );
}
