"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";
import { acaoCriarModeloEmail, acaoEnviarTesteEmail, acaoSalvarModeloEmail } from "@/lib/actions/campanhas";
import type { ConteudoMarketing } from "@/lib/db/schema/marketing";
import type { Marca } from "@/lib/email/modelo";
import { primeiroNome } from "@/lib/email/modelo";
import { CamposConteudo } from "./campos-conteudo";
import { CONTEUDO_VAZIO } from "./comum";
import { PreviaEmail } from "./previa-email";

export interface EditorModeloProps {
  /** Sem `modelo` = novo. */
  modelo?: { id: string; versao: string; nome: string; conteudo: ConteudoMarketing };
  marca: Marca;
  emailLigado: boolean;
  nomeUsuario: string;
}

/** Criar/editar modelo de e-mail (RN-220): mesmo texto e prévia da campanha, sem público. */
export function EditorModelo({ modelo, marca, emailLigado, nomeUsuario }: EditorModeloProps) {
  const router = useRouter();
  const [nome, setNome] = useState(modelo?.nome ?? "");
  const [conteudo, setConteudo] = useState<ConteudoMarketing>(modelo?.conteudo ?? CONTEUDO_VAZIO);
  const [versao, setVersao] = useState(modelo?.versao ?? "");
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const salvar = () =>
    iniciar(async () => {
      setAviso(null);
      if (!modelo) {
        const r = await acaoCriarModeloEmail({ nome, conteudo });
        if (!r.ok) return setAviso({ tom: "erro", texto: r.erro });
        return router.push("/admin/campanhas/modelos");
      }
      const r = await acaoSalvarModeloEmail({ modeloId: modelo.id, versao, nome, conteudo });
      if (!r.ok) return setAviso({ tom: "erro", texto: r.erro });
      setVersao(r.dados.versao);
      setAviso({ tom: "ok", texto: "Modelo salvo. Campanhas já criadas com ele não mudam." });
    });

  const testar = () =>
    iniciar(async () => {
      setAviso(null);
      const r = await acaoEnviarTesteEmail({ conteudo });
      setAviso(r.ok ? { tom: "ok", texto: `Teste enviado para ${r.dados.para}.` } : { tom: "erro", texto: r.erro });
    });

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/campanhas/modelos" className={buttonVariants({ variant: "link", className: "self-start" })}>
        <ArrowLeft aria-hidden />
        Modelos
      </Link>
      <Cartao padding={0} como="section" aria-label="Modelo" className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h1 className="m-0 text-base font-semibold">{modelo ? "Editar modelo" : "Novo modelo"}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="contorno" size="36" disabled={pendente || !emailLigado} onClick={testar}>
            Enviar teste para mim
          </Button>
          <Button size="36" disabled={pendente} onClick={salvar}>
            {modelo ? "Salvar" : "Criar modelo"}
          </Button>
        </div>
        {aviso && <Aviso tom={aviso.tom} className="w-full">{aviso.texto}</Aviso>}
      </Cartao>
      <div className="grid gap-4 xl:grid-cols-2">
        <Cartao como="section" aria-label="Texto do modelo" className="flex min-w-0 flex-col gap-4">
          <Campo rotulo="Nome do modelo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} tamanho="42" ajuda="Para achar na hora de criar a campanha. Ex.: Convite para live." />
          <CamposConteudo valor={conteudo} onMudar={setConteudo} />
        </Cartao>
        <Cartao como="section" aria-labelledby="titulo-previa-modelo" className="flex min-w-0 flex-col gap-3 self-start xl:sticky xl:top-4">
          <h2 id="titulo-previa-modelo" className="m-0 font-sans text-[15px] font-semibold">
            Prévia
          </h2>
          <PreviaEmail marca={marca} conteudo={conteudo} nome={primeiroNome(nomeUsuario) || "Ana"} />
        </Cartao>
      </div>
    </div>
  );
}
