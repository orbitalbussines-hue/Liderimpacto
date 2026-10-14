import { Plus } from "lucide-react";
import { AreaTexto } from "@/components/ui/area-texto";
import { Aviso } from "@/components/ui/aviso";
import { BotaoFiltro } from "@/components/ui/botao-filtro";
import { Button } from "@/components/ui/button";
import { CaixaSelecao } from "@/components/ui/caixa-selecao";
import { Campo } from "@/components/ui/campo";
import { CampoBusca } from "@/components/ui/campo-busca";
import { CampoCodigo } from "@/components/ui/campo-codigo";
import { CampoSenha } from "@/components/ui/campo-senha";
import { FiltroAtivo } from "@/components/ui/filtro-ativo";
import { Interruptor } from "@/components/ui/interruptor";
import { Selecao } from "@/components/ui/selecao";
import { Amostra, Secao } from "./secao";

export function CatalogoFormularios() {
  return (
    <Secao id="campos" titulo="Campos" arquivo="ui/campo.tsx · campo-senha.tsx · campo-codigo.tsx · aviso.tsx · area-texto.tsx · caixa-selecao.tsx · campo-moldura.tsx · selecao.tsx">
      <div className="grid gap-6 desk:grid-cols-2">
        <Amostra rotulo="Login (48px, fundo surface)" className="flex-col items-stretch">
          <Campo rotulo="E-mail" type="email" tamanho="48" fundo="surface" defaultValue="valmer@lideredeimpacto.com.br" />
          <CampoSenha rotulo="Senha" tamanho="48" fundo="surface" defaultValue="senha-de-exemplo" />
          <div className="flex items-center justify-between">
            <CaixaSelecao rotulo="Manter conectado" defaultChecked />
            <Button variant="link" size="36">
              Esqueci minha senha
            </Button>
          </div>
        </Amostra>
        <Amostra rotulo="Perfil (44px, fundo bg) e estados derivados" className="flex-col items-stretch">
          <Campo rotulo="Nome completo" defaultValue="Valmer Albuquerque" />
          <Campo rotulo="WhatsApp" defaultValue="(11) 99999-0000" ajuda="Usado nos lembretes de aula." />
          <Campo rotulo="E-mail" defaultValue="valmer@" erro="Informe um e-mail válido." />
          <Campo rotulo="Empresa / cargo" defaultValue="Diretor executivo" disabled />
        </Amostra>
        <Amostra rotulo="Construtor (42px, rótulo discreto)" className="flex-col items-stretch">
          <Campo rotulo="Título" tamanho="42" estiloRotulo="discreto" defaultValue="Líder de Impacto" />
          <AreaTexto
            rotulo="Descrição"
            estiloRotulo="discreto"
            defaultValue="Formação para líderes que influenciam, desenvolvem pessoas e geram resultados reais."
          />
          <Selecao
            rotulo="Pré-requisito"
            estiloRotulo="discreto"
            vazio="Nenhum"
            defaultValue="b"
            opcoes={[
              { valor: "a", rotulo: "Boas-vindas", grupo: "Módulo 1" },
              { valor: "b", rotulo: "O papel do líder", grupo: "Módulo 1" },
              { valor: "c", rotulo: "Feedback que transforma", grupo: "Módulo 2" },
            ]}
          />
        </Amostra>
        <Amostra rotulo="Interruptor (44×26)" className="flex-col items-stretch gap-0">
          {[
            ["Lembretes de aula", "E-mail e WhatsApp", true],
            ["Reprodução automática", "Avançar para a próxima aula", false],
            ["Visível para os alunos", "Fileira aparece na vitrine", true],
          ].map(([titulo, desc, ligado], i) => (
            <div
              key={String(titulo)}
              className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
            >
              <div>
                <div id={`interruptor-${i}`} className="text-sm font-semibold">
                  {titulo}
                </div>
                <div className="text-xs text-muted">{desc}</div>
              </div>
              <Interruptor aria-labelledby={`interruptor-${i}`} ligadoInicial={Boolean(ligado)} />
            </div>
          ))}
        </Amostra>
        <Amostra rotulo="Entrada: código de 6 dígitos (2FA) e avisos" className="flex-col items-stretch">
          <CampoCodigo name="codigo-demo" rotulo="Código do aplicativo" />
          <Aviso tom="erro">E-mail ou senha inválidos.</Aviso>
          <Aviso tom="info">Se o e-mail estiver cadastrado, enviamos um link para definir a senha.</Aviso>
          <Aviso tom="ok">Sua senha foi salva com segurança.</Aviso>
        </Amostra>
      </div>
    </Secao>
  );
}

export function CatalogoFiltros() {
  return (
    <Secao id="filtros" titulo="Busca e filtros" arquivo="ui/campo-busca.tsx · botao-filtro.tsx · filtro-ativo.tsx">
      <Amostra rotulo="Barra de filtros do admin (busca fundo bg)">
        <CampoBusca
          placeholder="Pesquise por nome, e-mail, CPF ou tag..."
          classNameMoldura="min-w-[200px] flex-1"
        />
        <FiltroAtivo rotulo="Status · Ativo" hrefRemover="#filtros" />
        <BotaoFiltro>Grupos</BotaoFiltro>
        <Button variant="contorno" size="36" className="px-3">
          <Plus aria-hidden />
          Filtro
        </Button>
      </Amostra>
      <Amostra rotulo="Busca do aluno (fundo surface, 220px)">
        <CampoBusca fundo="surface" placeholder="Pesquisar conteúdo..." classNameMoldura="w-[220px]" />
        <BotaoFiltro className="bg-surface">Esta área</BotaoFiltro>
        <CampoBusca
          rotulo="Pesquisar no painel"
          classNameMoldura="w-[220px]"
          sufixo={
            <kbd className="rounded border border-border px-[5px] py-px font-sans text-[10px] text-muted">⌘K</kbd>
          }
        />
      </Amostra>
    </Secao>
  );
}
