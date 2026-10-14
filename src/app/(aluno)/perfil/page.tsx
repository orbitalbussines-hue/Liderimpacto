import type { Metadata } from "next";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { duracaoCurta, mesAno } from "@/components/aluno/formatos";
import { CartaoPerfil } from "@/components/engajamento/cartao-perfil";
import { Button } from "@/components/ui/button";
import { Esqueleto } from "@/components/ui/esqueleto";
import { sair } from "@/lib/actions/auth";
import { membroDaPagina } from "@/lib/auth/guarda";
import { TODOS_OS_MEMBROS } from "@/lib/auth/permissoes";
import { dadosDoPerfil } from "@/lib/perfil/consultas";
import { numerosDoPerfil, preferenciasDoAluno } from "@/lib/progresso/consultas";
import { FormularioPerfil } from "./_components/formulario-perfil";

export const metadata: Metadata = { title: "Meu perfil" };

/**
 * Meu perfil (README tela 10): cartão com números REAIS (aulas concluídas, tempo de estudo e
 * cursos concluídos; certificados e pontos entram quando existirem), dados pessoais e
 * preferências. Tudo da pessoa da SESSÃO. "Alterar foto" fica de fora até existir o envio.
 */
async function Perfil() {
  const q = await membroDaPagina(TODOS_OS_MEMBROS);
  const [dados, numeros, preferencias] = await Promise.all([dadosDoPerfil(q.usuario.id, q.criador.id), numerosDoPerfil(q), preferenciasDoAluno(q.usuario.id)]);
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
            { valor: numeros.segundosAssistidos > 0 ? duracaoCurta(numeros.segundosAssistidos) : "0", rotulo: "tempo de estudo", tom: "accent" },
            { valor: numeros.cursosConcluidos, rotulo: numeros.cursosConcluidos === 1 ? "curso concluído" : "cursos concluídos" },
          ]}
        />
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
