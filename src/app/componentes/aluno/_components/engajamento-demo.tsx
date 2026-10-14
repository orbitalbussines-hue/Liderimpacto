import { LayoutAutenticacao } from "@/components/aluno/layout-autenticacao";
import { CartaoCertificado } from "@/components/engajamento/cartao-certificado";
import { CartaoEncontroAoVivo } from "@/components/engajamento/cartao-encontro-ao-vivo";
import { CartaoFixados } from "@/components/engajamento/cartao-fixados";
import { CartaoMembrosAtivos } from "@/components/engajamento/cartao-membros-ativos";
import { CartaoPerfil } from "@/components/engajamento/cartao-perfil";
import { CartaoPost } from "@/components/engajamento/cartao-post";
import { CartaoTrilha } from "@/components/engajamento/cartao-trilha";
import { CompositorPost } from "@/components/engajamento/compositor-post";
import { LinhaAvaliacao } from "@/components/engajamento/linha-avaliacao";
import { LinhaPreferencia } from "@/components/engajamento/linha-preferencia";
import { ListaCanais } from "@/components/engajamento/lista-canais";
import { AlternarTema } from "@/components/ui/alternar-tema";
import { Button } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Interruptor } from "@/components/ui/interruptor";
import { Secao } from "../../_components/secao";
import { AVALIACOES, CANAIS, CERTIFICADOS, FIXADOS, MEMBROS_ATIVOS, POSTS, TRILHAS } from "../dados";

export function EngajamentoDemo() {
  return (
    <>
      <Secao id="avaliacoes" titulo="Avaliações" arquivo="engajamento/linha-cartao.tsx · linha-avaliacao.tsx">
        <div className="flex max-w-[1000px] flex-col gap-3">
          <CabecalhoPagina
            titulo="Avaliações"
            descricao="Quizzes e provas dos seus cursos. A avaliação final libera o certificado."
            className="mb-3"
          />
          {AVALIACOES.map(({ id, ...a }) => (
            <LinhaAvaliacao key={id} {...a} />
          ))}
        </div>
      </Secao>

      <Secao id="trilhas" titulo="Trilhas" arquivo="engajamento/cartao-trilha.tsx · etapas-trilha.tsx">
        <div className="flex max-w-[1100px] flex-col gap-4">
          {TRILHAS.map(({ id, ...t }) => (
            <CartaoTrilha key={id} href="#" {...t} />
          ))}
        </div>
      </Secao>

      <Secao id="certificados" titulo="Certificados" arquivo="engajamento/cartao-certificado.tsx">
        <div className="grid gap-[18px] md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {CERTIFICADOS.map(({ id, ...c }) => (
            <CartaoCertificado
              key={id}
              nomeAluno="Valmer Albuquerque"
              hrefPdf={c.bloqueado ? undefined : "#"}
              hrefCurso={c.bloqueado ? "#" : undefined}
              {...c}
            />
          ))}
        </div>
      </Secao>

      <Secao
        id="comunidade"
        titulo="Comunidade"
        arquivo="engajamento/compositor-post · cartao-post · lista-canais · cartao-encontro-ao-vivo · cartao-membros-ativos · cartao-fixados"
      >
        <div className="grid items-start gap-6 desk:grid-cols-[220px_minmax(0,1fr)_280px]">
          <div className="hidden desk:block">
            <ListaCanais canais={CANAIS} ativoId="0" />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <CompositorPost nomeUsuario="Valmer Albuquerque" />
            {POSTS.map(({ id, aula, ...p }) => (
              <CartaoPost key={id} aula={{ titulo: aula, href: "#" }} {...p} />
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <CartaoEncontroAoVivo dia="30" mes="set" titulo="Mentoria em grupo" quando="Terça-feira, 30 de setembro · 20:00" href="#" hrefAgenda="#" hrefTodos="#" />
            <CartaoFixados links={FIXADOS} />
            <CartaoMembrosAtivos membros={MEMBROS_ATIVOS} />
          </div>
        </div>
      </Secao>

      <Secao id="perfil" titulo="Perfil" arquivo="engajamento/cartao-perfil.tsx · linha-preferencia.tsx">
        <div className="grid max-w-[1000px] items-start gap-6 desk:grid-cols-[300px_minmax(0,1fr)]">
          <CartaoPerfil
            nome="Valmer Albuquerque"
            membroDesde="mai/2026"
            estatisticas={[
              { valor: 12, rotulo: "aulas" },
              { valor: 1, rotulo: "certificado" },
              { valor: 340, rotulo: "pontos", tom: "accent" },
            ]}
          />
          <Cartao raio={18} padding={24} className="flex flex-col gap-3.5">
            <CartaoTitulo tamanho={16}>Preferências</CartaoTitulo>
            <div>
              <LinhaPreferencia titulo="Tema" descricao="Escuro ou claro" controle={<AlternarTema variante="texto" />} />
              <LinhaPreferencia
                titulo="Lembretes de aula"
                descricao="E-mail e WhatsApp"
                controle={<Interruptor aria-label="Lembretes de aula" ligadoInicial />}
              />
              <LinhaPreferencia
                titulo="Reprodução automática"
                descricao="Avançar para a próxima aula"
                controle={<Interruptor aria-label="Reprodução automática" />}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2.5">
              <Button variant="contorno" size="42">
                Alterar senha
              </Button>
              <Button size="42">Salvar alterações</Button>
            </div>
          </Cartao>
        </div>
      </Secao>

      <Secao id="autenticacao" titulo="Layout de autenticação" arquivo="aluno/layout-autenticacao.tsx">
        <div className="overflow-hidden rounded-2xl border border-border">
          <LayoutAutenticacao className="min-h-[640px]">
            <h2 className="m-0 mb-2 text-[34px]">Bem-vindo de volta</h2>
            <p className="m-0 text-sm text-muted">O formulário de login entra aqui (passo 2).</p>
          </LayoutAutenticacao>
        </div>
      </Secao>
    </>
  );
}
