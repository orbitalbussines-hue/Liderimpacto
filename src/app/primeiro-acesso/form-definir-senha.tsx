"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { CampoSenha } from "@/components/ui/campo-senha";
import { definirNovaSenha } from "@/lib/actions/auth";
import { MAX_SENHA, MIN_SENHA, problemaNaSenha } from "@/lib/validators/senha";
import { CabecalhoEntrada, LinhaConfianca, LinkVoltarLogin } from "../_autenticacao/pecas";
import { RequisitosSenha } from "./requisitos-senha";

const assinarHash = (avisar: () => void) => {
  window.addEventListener("hashchange", avisar);
  return () => window.removeEventListener("hashchange", avisar);
};
const lerToken = () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";

/** Le o token do fragmento (#token=) e grava a senha. A regra mostrada e a mesma do servidor. */
export function FormDefinirSenha() {
  // null = servidor/hidratacao (fragmento desconhecido); "" = link sem token.
  const token = useSyncExternalStore<string | null>(assinarHash, lerToken, () => null);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [estado, setEstado] = useState<"form" | "ok" | "expirado">("form");
  const [pendente, iniciar] = useTransition();
  const idRequisitos = useId();

  if (estado === "ok") {
    return (
      <div className="flex flex-col gap-6">
        <CabecalhoEntrada titulo="Senha definida">
          Pronto. Use a nova senha para entrar; sessões abertas em outros aparelhos foram encerradas.
        </CabecalhoEntrada>
        <Aviso tom="ok">Sua senha foi salva com segurança.</Aviso>
        <Link href="/login" className={buttonVariants({ size: "50", larguraTotal: true, className: "group" })}>
          Ir para o login
          <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    );
  }

  if (estado === "expirado" || token === "") {
    return (
      <div className="flex flex-col gap-6">
        <CabecalhoEntrada titulo="Link inválido">
          Este link expirou ou já foi usado. Os links de senha valem por pouco tempo e servem uma vez só.
        </CabecalhoEntrada>
        <Aviso tom="erro">Peça um novo link: informe seu e-mail ou fale com a equipe da sua área.</Aviso>
        <div className="flex flex-col gap-2">
          <Link href="/recuperar-senha" className={buttonVariants({ size: "50", larguraTotal: true })}>
            Pedir novo link
          </Link>
          <LinkVoltarLogin />
        </div>
      </div>
    );
  }

  const problema = senha.length > 0 ? problemaNaSenha(senha) : null;
  const conferem = confirmacao.length > 0 && confirmacao === senha;
  // So acusa a diferenca quando a confirmacao ja tem o tamanho da senha (nao grita no meio da digitacao).
  const naoConferem = confirmacao.length >= senha.length && confirmacao.length > 0 && !conferem;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        iniciar(async () => {
          const r = await definirNovaSenha({ token: token ?? "", senha, confirmacao });
          if (r.ok) setEstado("ok");
          else if (r.expirado) setEstado("expirado");
          else setErro(r.erro);
        });
      }}
    >
      <CabecalhoEntrada titulo="Defina sua senha">
        Ela vale para entrar na sua área. Prefira uma frase que só você conhece.
      </CabecalhoEntrada>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <div className="flex flex-col gap-4">
        <CampoSenha
          rotulo="Nova senha"
          autoComplete="new-password"
          autoFocus
          required
          minLength={MIN_SENHA}
          maxLength={MAX_SENHA}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          tamanho="48"
          fundo="surface"
          aria-describedby={idRequisitos}
        />
        <RequisitosSenha senha={senha} id={idRequisitos} />
        <CampoSenha
          rotulo="Confirmar senha"
          autoComplete="new-password"
          required
          maxLength={MAX_SENHA}
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          tamanho="48"
          fundo="surface"
          erro={naoConferem ? "As senhas não conferem." : undefined}
          ajuda={conferem ? "As senhas conferem." : undefined}
        />
      </div>

      <Button
        type="submit"
        size="50"
        larguraTotal
        carregando={pendente}
        disabled={!token || !!problema || !conferem}
      >
        {pendente ? "Salvando…" : "Salvar senha"}
      </Button>

      <div className="flex flex-col items-center gap-3 border-t border-border pt-4">
        <LinkVoltarLogin />
        <LinhaConfianca />
      </div>
    </form>
  );
}
