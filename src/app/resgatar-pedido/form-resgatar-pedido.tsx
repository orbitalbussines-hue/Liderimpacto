"use client";

import Link from "next/link";
import { type ChangeEvent, useState, useTransition } from "react";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { ControleSegmentado } from "@/components/ui/controle-segmentado";
import type { Resultado } from "@/lib/acao";
import { acaoResgatarCodigo, acaoResgatarPedido } from "@/lib/actions/resgate-publico";
import { resgateCodigoSchema, resgatePedidoSchema } from "@/lib/validators/resgate-publico";
import { CabecalhoEntrada, LinhaConfianca, LinkVoltarLogin } from "../_autenticacao/pecas";

type Porta = "pedido" | "codigo";
type Erros = Partial<Record<"numeroPedido" | "cpf" | "codigo" | "nome" | "email", string>>;
const OPCOES = [
  { valor: "pedido", rotulo: "Número do pedido" },
  { valor: "codigo", rotulo: "Tenho um código" },
] as const;
const SEM_CONEXAO = "Sem conexão com o servidor. Tente de novo.";

/** Texto do sucesso: conta nova recebe o link por e-mail; conta existente entra com a senha de sempre. */
export function textoDoSucesso(r: { contaNova: boolean; cursos: number }, email: string): string {
  const cursos = `${r.cursos} ${r.cursos === 1 ? "curso liberado" : "cursos liberados"}.`;
  return r.contaNova
    ? `${cursos} Enviamos para ${email} um link para você criar sua senha e entrar.`
    : `${cursos} Entre com ${email} e a senha que você já usa.`;
}

/** As duas portas do resgate público (RN-262, RN-266). Formato conferido aqui; as recusas vêm da action. */
export function FormResgatarPedido({ codigoInicial }: { codigoInicial: string }) {
  const [porta, setPorta] = useState<Porta>(codigoInicial ? "codigo" : "pedido");
  const [v, setV] = useState({ numeroPedido: "", cpf: "", codigo: codigoInicial, nome: "", email: "" });
  const [erros, setErros] = useState<Erros>({});
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const campo = (k: keyof typeof v) => ({
    value: v[k],
    erro: erros[k],
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setV((a) => ({ ...a, [k]: e.target.value }));
      if (erros[k]) setErros((a) => ({ ...a, [k]: undefined }));
    },
  });

  const enviar = () => {
    const pessoa = { nome: v.nome, email: v.email };
    const s = porta === "pedido" ? resgatePedidoSchema.safeParse({ numeroPedido: v.numeroPedido, cpf: v.cpf, ...pessoa }) : resgateCodigoSchema.safeParse({ codigo: v.codigo, ...pessoa });
    if (!s.success) {
      const novos: Erros = {};
      for (const i of s.error.issues) novos[i.path[0] as keyof Erros] ??= i.message;
      return setErros(novos);
    }
    setErros({});
    iniciar(async () => {
      const r: Resultado<{ contaNova: boolean; cursos: number }> | null = await (porta === "pedido"
        ? acaoResgatarPedido({ numeroPedido: v.numeroPedido, cpf: v.cpf, ...pessoa })
        : acaoResgatarCodigo({ codigo: v.codigo, ...pessoa })
      ).catch(() => null);
      if (!r) return setErro(SEM_CONEXAO);
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      setSucesso(textoDoSucesso(r.dados, s.data.email));
    });
  };

  if (sucesso) {
    return (
      <div className="flex flex-col gap-6">
        <CabecalhoEntrada titulo="Acesso liberado" />
        <Aviso tom="ok">{sucesso}</Aviso>
        <Link href="/login" className={buttonVariants({ size: "50", larguraTotal: true })}>
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoEntrada titulo="Resgatar meu acesso">
        Comprou no Mercado Livre ou no TikTok Shop? Use o número do pedido e o seu CPF. Recebeu um código da equipe? Escolha &quot;Tenho um código&quot;.
      </CabecalhoEntrada>
      <ControleSegmentado
        aria-label="Como resgatar"
        opcoes={OPCOES}
        valor={porta}
        onMudar={(p) => {
          setPorta(p);
          setErro(null);
          setErros({});
        }}
        className="self-start"
      />
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        {porta === "pedido" ? (
          <>
            <Campo rotulo="Número do pedido" {...campo("numeroPedido")} maxLength={80} autoComplete="off" spellCheck={false} tamanho="48" fundo="surface" ajuda="Como aparece em Minhas compras no app do marketplace." />
            <Campo rotulo="CPF de quem comprou" {...campo("cpf")} inputMode="numeric" maxLength={20} autoComplete="off" placeholder="000.000.000-00" tamanho="48" fundo="surface" ajuda="Só para conferir o pedido. O CPF não fica guardado." />
          </>
        ) : (
          <Campo rotulo="Código" {...campo("codigo")} maxLength={40} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABCD-EFGH" tamanho="48" fundo="surface" className="font-mono tracking-wider uppercase" />
        )}
        <Campo rotulo="Seu nome" {...campo("nome")} maxLength={120} autoComplete="name" tamanho="48" fundo="surface" />
        <Campo rotulo="Seu e-mail" {...campo("email")} type="email" inputMode="email" maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false} tamanho="48" fundo="surface" ajuda="Vira o seu login. Já tem conta aqui? Use o mesmo e-mail." />
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Button type="submit" size="50" larguraTotal carregando={pendente}>
          {pendente ? "Conferindo…" : "Liberar meu acesso"}
        </Button>
      </form>
      <div className="flex flex-col items-center gap-3 border-t border-border pt-4">
        <LinkVoltarLogin />
        <LinhaConfianca />
      </div>
    </div>
  );
}
