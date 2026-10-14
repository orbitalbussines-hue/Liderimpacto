import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Selo } from "@/components/ui/selo";
import { sair } from "@/lib/actions/auth";
import { listarSessoes } from "@/lib/auth/conta-seguranca";
import { estadoDoTotp } from "@/lib/auth/fatores";
import { exige2FA } from "@/lib/auth/politica-fatores";
import { obterSessaoDeSeguranca } from "@/lib/auth/sessao";
import { CadastroTotp } from "./_components/cadastro-totp";
import { EncerrarOutrasSessoes } from "./_components/encerrar-outras-sessoes";
import { NovosCodigos } from "./_components/novos-codigos";
import { TrocarSenha } from "./_components/trocar-senha";

export const metadata: Metadata = { title: "Segurança da conta", robots: { index: false } };

const dataHora = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/**
 * Conta > Seguranca (aluno, equipe e SUPER_ADMIN, em qualquer host). Unica tela que aceita a
 * sessao PROVISORIA: e aqui que o SUPER_ADMIN cadastra o segundo fator obrigatorio.
 * Toda action mira a SESSAO corrente; nenhuma recebe id de usuario.
 */
async function Seguranca() {
  const s = await obterSessaoDeSeguranca();
  if (!s) redirect("/login");
  const inicio = s.alvo.tipo === "plataforma" ? "/plataforma" : "/";
  const botaoSair = (
    <form action={sair}>
      <Button type="submit" variant="contorno" size="40">
        <LogOut aria-hidden />
        Sair
      </Button>
    </form>
  );

  if (s.provisoria) {
    return (
      <>
        <CabecalhoPagina
          variante="admin"
          titulo="Proteja sua conta"
          descricao="Contas da plataforma entram com senha e um código do aplicativo autenticador. Configure agora para continuar."
          acoes={botaoSair}
        />
        <Cartao padding={24} className="flex flex-col gap-4">
          <CartaoTitulo tamanho={16}>Aplicativo autenticador</CartaoTitulo>
          <CadastroTotp />
        </Cartao>
      </>
    );
  }

  const [totp, sessoes] = await Promise.all([estadoDoTotp(s.userId), listarSessoes(s)]);
  return (
    <>
      <CabecalhoPagina
        variante="admin"
        titulo="Segurança da conta"
        descricao={s.email}
        acoes={
          <div className="flex gap-2">
            <Link href={inicio} className={buttonVariants({ variant: "fantasma", size: "40" })}>
              Voltar
            </Link>
            {botaoSair}
          </div>
        }
      />
      <Cartao padding={24} className="flex flex-col gap-4">
        <CartaoTitulo tamanho={16}>Senha</CartaoTitulo>
        <TrocarSenha />
      </Cartao>
      {exige2FA(s.papelPlataforma) && (
        <Cartao padding={24} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <CartaoTitulo tamanho={16}>Aplicativo autenticador</CartaoTitulo>
            <Selo tom={totp.ativo ? "ok" : "warn"}>{totp.ativo ? "Ativo" : "Pendente"}</Selo>
          </div>
          <p className="m-0 text-sm text-muted">
            Perdeu o celular? Entre com um código de recuperação e gere novos códigos aqui. Para trocar de aplicativo, peça a
            outro SUPER_ADMIN (runbook de autenticação).
          </p>
          <NovosCodigos />
        </Cartao>
      )}
      <Cartao padding={24} className="flex flex-col gap-3">
        <CartaoTitulo tamanho={16}>Sessões abertas</CartaoTitulo>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {sessoes.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-b-0">
              <span className="min-w-0 truncate">
                {x.agente ?? "Aparelho desconhecido"} <span className="text-muted">· IP {x.ip ?? "?"}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                desde {dataHora(x.criadaEm)}
                {x.atual && <Selo tom="accent">Esta sessão</Selo>}
              </span>
            </li>
          ))}
        </ul>
        {sessoes.length > 1 && <EncerrarOutrasSessoes />}
      </Cartao>
    </>
  );
}

export default function PaginaSeguranca() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col gap-5 bg-bg px-5 py-10 text-text">
      <Suspense fallback={null}>
        <Seguranca />
      </Suspense>
    </main>
  );
}
