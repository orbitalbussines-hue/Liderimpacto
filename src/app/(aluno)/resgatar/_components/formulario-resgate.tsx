"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Aviso } from "@/components/ui/aviso";
import { Campo } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";
import { acaoResgatarVoucher } from "@/lib/actions/vouchers";
import { RE_CODIGO_VOUCHER, normalizarCodigoVoucher } from "@/lib/vouchers/regras";

/** "2 cursos liberados" / "Você já tinha 1 deles" a partir do resultado de cada matrícula. */
export function resumoDoResgate(matriculas: readonly { resultado: string }[]): string {
  const novos = matriculas.filter((m) => m.resultado !== "ja-existia").length;
  const tinha = matriculas.length - novos;
  const liberados = `${novos} ${novos === 1 ? "curso liberado" : "cursos liberados"}`;
  return tinha > 0 ? `${liberados}. Você já tinha ${tinha === 1 ? "1 deles" : `${tinha} deles`}.` : `${liberados}.`;
}

/** Formulário do resgate: confere o formato antes de enviar; as recusas (expirado, esgotado…) vêm da action. */
export function FormularioResgate({ codigoInicial }: { codigoInicial: string }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState(codigoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const resgatar = () => {
    if (!RE_CODIGO_VOUCHER.test(normalizarCodigoVoucher(codigo))) {
      return setErro("Código inválido: use de 6 a 16 letras e números (sem 0, O, 1 e I).");
    }
    iniciar(async () => {
      const r = await acaoResgatarVoucher({ codigo });
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      setSucesso(resumoDoResgate(r.dados.matriculas));
      router.refresh();
    });
  };

  if (sucesso) {
    return (
      <Cartao className="flex flex-col gap-4">
        <Aviso tom="ok">
          <strong className="font-bold">Pronto! </strong>
          {sucesso}
        </Aviso>
        <div className="flex flex-wrap gap-2">
          <Link href="/continuar" className={buttonVariants({ size: "42" })}>
            Ver meus cursos
          </Link>
          <Button
            type="button"
            variant="fantasma"
            size="42"
            onClick={() => {
              setSucesso(null);
              setCodigo("");
            }}
          >
            Resgatar outro código
          </Button>
        </div>
      </Cartao>
    );
  }

  return (
    <Cartao como="section" aria-label="Resgate">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          resgatar();
        }}
      >
        <Campo
          rotulo="Código do voucher"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            if (erro) setErro(null);
          }}
          erro={erro ?? undefined}
          ajuda="Letras e números, sem 0, O, 1 e I. Pode digitar com ou sem hífen."
          placeholder="ABCD-EFGH"
          maxLength={40}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={!codigoInicial}
          className="font-mono tracking-wider uppercase"
        />
        <Button type="submit" size="42" className="self-start" carregando={pendente} disabled={!codigo.trim()}>
          Resgatar
        </Button>
      </form>
    </Cartao>
  );
}
