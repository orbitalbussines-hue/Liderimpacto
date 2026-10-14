import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { LayoutDashboard, LogOut, Trophy } from "lucide-react";
import { duracaoCurta, mesAno } from "@/components/aluno/formatos";
import { CartaoPerfil } from "@/components/engajamento/cartao-perfil";
import { Button, buttonVariants } from "@/components/ui/button";
import { Esqueleto } from "@/components/ui/esqueleto";
import { sair } from "@/lib/actions/auth";
import { membroDaPagina } from "@/lib/auth/guarda";
import { EQUIPE, TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { configDaGamificacao } from "@/lib/gamificacao/pontos";
import { pontosPtBr } from "@/lib/gamificacao/regras";
import { dadosDoPerfil } from "@/lib/perfil/consultas";
import { numerosDoPerfil, preferenciasDoAluno } from "@/lib/progresso/consultas";
import { FormularioPerfil } from "./_components/formulario-perfil";

export const metadata: Metadata = { title: "Meu perfil" };

/**
 * Meu perfil (README tela 10): cartão com números REAIS (aulas concluídas, tempo de estudo,
 * cursos concluídos e, com a gamificação ligada, os pontos + atalho para Conquistas), dados
 * pessoais e preferências. Tudo da pessoa da SESSÃO. "Alterar foto" fica de fora até existir o envio.
 */
async function Perfil() {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const [dados, numeros, preferencias, gamificacao] = await Promise.all([
    dadosDoPerfil(q.usuario.id, q.criador.id),
    numerosDoPerfil(q),
    preferenciasDoAluno(q.usuario.id),
    configDaGamificacao(q.criador.id),
  ]);
  const comPontos = gamificacao.ligada;
  if (!dados) return null; // conta excluída entre a guarda e a leitura: a próxima requisição cai no login
  return (
    <div className="mx-auto grid max-w-[1000px] items-start gap-6 desk:grid-cols-[300px_minmax(0,1fr)]">
      <h1 className="sr-only">Meu perfil</h1>
      <div className="flex flex-col gap-3">
        <CartaoPerfil
          nome={dados.nome}
          membroDesde={mesAno(dados.membroDesde)}
          estatisticas={[
            { valor: numeros.aulasConcluidas, rotulo: numeros.aulasConcluidas === 1 ? "aula concluída" : "aulas concluídas" },
            { valor: numeros.segundosAssistidos > 0 ? duracaoCurta(numeros.segundosAssistidos) : "0", rotulo: "tempo de estudo", tom: comPontos ? "padrao" : "accent" },
            { valor: numeros.cursosConcluidos, rotulo: numeros.cursosConcluidos === 1 ? "curso concluído" : "cursos concluídos" },
            ...(comPontos ? [{ valor: pontosPtBr(numeros.pontos), rotulo: numeros.pontos === 1 ? "ponto" : "pontos", tom: "accent" as const }] : []),
          ]}
        />
        {comPontos && (
          // No celular a tab bar não tem Conquistas: o acesso é por aqui.
          <Link href="/conquistas" className={buttonVariants({ variant: "contorno", size: "40", larguraTotal: true })}>
            <Trophy aria-hidden />
            Conquistas
          </Link>
        )}
        {EQUIPE.includes(q.membro.papel) && (
          // Atalho da equipe para o painel (no desktop ele tambem fica no header; no celular so aqui).
          <Link href="/admin" className={buttonVariants({ variant: "contorno", size: "40", larguraTotal: true })}>
            <LayoutDashboard aria-hidden />
            Painel admin
          </Link>
        )}
        <form action={sair}>
          <Button type="submit" variant="fantasma" size="40" larguraTotal className="text-muted">
            <LogOut aria-hidden />
            Sair desta conta
          </Button>
        </form>
      </div>
      <FormularioPerfil
        dados={{ nome: dados.nome, email: dados.email, whatsapp: dados.whatsapp, empresaCargo: dados.empresaCargo, versao: dados.versao }}
        preferencias={preferencias}
        mostrarRanking={comPontos}
      />
    </div>
  );
}

function EsqueletoPerfil() {
  return (
    <div aria-busy="true" className="mx-auto grid max-w-[1000px] items-start gap-6 desk:grid-cols-[300px_minmax(0,1fr)]">
      <span className="sr-only">Carregando o perfil</span>
      <Esqueleto className="h-[300px] rounded-[18px]" />
      <div className="flex flex-col gap-4">
        <Esqueleto className="h-[260px] rounded-[18px]" />
        <Esqueleto className="h-[220px] rounded-[18px]" />
      </div>
    </div>
  );
}

export default function PaginaPerfil() {
  return (
    <Suspense fallback={<EsqueletoPerfil />}>
      <Perfil />
    </Suspense>
  );
}
