import { Abas } from "@/components/ui/abas";
import { ControleSegmentado } from "@/components/ui/controle-segmentado";
import { GrupoChips } from "@/components/ui/grupo-chips";
import { CampoMoldura } from "@/components/ui/campo-moldura";
import { Amostra, Secao } from "./secao";

const opcoes = (...rotulos: string[]) => rotulos.map((r) => ({ valor: r, rotulo: r }));

export function CatalogoNavegacao() {
  return (
    <Secao
      id="abas"
      titulo="Abas, chips e controle segmentado"
      arquivo="ui/abas.tsx · grupo-chips.tsx · controle-segmentado.tsx · use-selecao-unica.ts"
    >
      <Amostra rotulo="Abas do aluno (botões, 14px) — setas do teclado trocam" className="block">
        <Abas
          aria-label="Conteúdo da aula"
          itens={opcoes("Descrição", "Materiais", "Comentários", "Anotações")}
        />
      </Amostra>
      <Amostra rotulo="Abas do admin (links, 13px, aria-current)" className="block">
        <Abas
          tamanho="admin"
          aria-label="Seções de membros"
          ativo="membros"
          itens={[
            { valor: "membros", rotulo: "Membros", href: "#abas" },
            { valor: "grupos", rotulo: "Grupos de acesso", href: "#abas" },
            { valor: "vouchers", rotulo: "Vouchers", href: "#abas" },
            { valor: "gamificacao", rotulo: "Gamificação", href: "#abas" },
            { valor: "tags", rotulo: "Tags", href: "#abas" },
          ]}
        />
      </Amostra>
      <div className="grid gap-6 desk:grid-cols-2">
        <Amostra rotulo="Grupo de chips (construtor)" className="flex-col items-stretch">
          <CampoMoldura id="chips-tipo" rotulo="Tipo de conteúdo" estiloRotulo="discreto">
            <GrupoChips
              id="chips-tipo" aria-labelledby="chips-tipo-rotulo"
              valorInicial="Top 10"
              opcoes={opcoes("Continuar assistindo", "Top 10", "Novidades", "Trilhas", "Mentorias", "Minha lista")}
            />
          </CampoMoldura>
          <CampoMoldura id="chips-qtd" rotulo="Quantidade de itens" estiloRotulo="discreto">
            <GrupoChips id="chips-qtd" aria-labelledby="chips-qtd-rotulo" valorInicial="7" opcoes={opcoes("3", "5", "7", "10")} />
          </CampoMoldura>
          <CampoMoldura id="chips-quem" rotulo="Quem vê" estiloRotulo="discreto">
            <GrupoChips
              id="chips-quem" aria-labelledby="chips-quem-rotulo"
              valorInicial="Todos os alunos"
              opcoes={opcoes("Todos os alunos", "Grupo: Mentoria", "Grupo: Autores")}
            />
          </CampoMoldura>
        </Amostra>
        <Amostra rotulo="Controle segmentado (período do dashboard)">
          <ControleSegmentado
            aria-label="Período"
            valorInicial="30 dias"
            opcoes={opcoes("7 dias", "30 dias", "6 meses")}
          />
          <GrupoChips aria-label="Prévia" valorInicial="Desktop" opcoes={opcoes("Desktop", "Mobile")} />
        </Amostra>
      </div>
    </Secao>
  );
}
