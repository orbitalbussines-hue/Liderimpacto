"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { LinhaPreferencia } from "@/components/engajamento/linha-preferencia";
import { AlternarTema } from "@/components/ui/alternar-tema";
import { Aviso } from "@/components/ui/aviso";
import { Button, buttonVariants } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Cartao, CartaoTitulo } from "@/components/ui/cartao";
import { Interruptor } from "@/components/ui/interruptor";
import { acaoSalvarPerfil } from "@/lib/actions/perfil";
import { acaoSalvarPreferencias } from "@/lib/actions/preferencias";
import { mascararWhatsapp, perfilSchema } from "@/lib/validators/perfil";

export interface FormularioPerfilProps {
  dados: { nome: string; email: string; whatsapp: string | null; empresaCargo: string | null; versao: string };
  preferencias: { reproducaoAutomatica: boolean; lembretes: boolean; aparecerNoRanking: boolean };
  /** Gamificação ligada nesta área: mostra "Aparecer no ranking" (a preferência vale em todas). */
  mostrarRanking?: boolean;
}

type Campos = "nome" | "whatsapp" | "empresaCargo";
const ID_FORM = "form-perfil";

/**
 * Dados pessoais + preferências de "Meu perfil". "Salvar alterações" grava só o que mudou: dados
 * (com a versão que a tela abriu: trava de colisão) e preferências. Tema troca na hora (cookie).
 * O alvo é sempre a sessão: nenhum id viaja no corpo.
 */
export function FormularioPerfil({ dados, preferencias, mostrarRanking = false }: FormularioPerfilProps) {
  const router = useRouter();
  const [nome, setNome] = useState(dados.nome);
  const [whatsapp, setWhatsapp] = useState(mascararWhatsapp(dados.whatsapp ?? ""));
  const [empresaCargo, setEmpresaCargo] = useState(dados.empresaCargo ?? "");
  const [versao, setVersao] = useState(dados.versao);
  const [salvos, setSalvos] = useState({ nome: dados.nome, whatsapp: mascararWhatsapp(dados.whatsapp ?? ""), empresaCargo: dados.empresaCargo ?? "", ...preferencias });
  const [lembretes, setLembretes] = useState(preferencias.lembretes);
  const [autoplay, setAutoplay] = useState(preferencias.reproducaoAutomatica);
  const [ranking, setRanking] = useState(preferencias.aparecerNoRanking);
  const [erros, setErros] = useState<Partial<Record<Campos, string>>>({});
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  const dadosMudaram = nome !== salvos.nome || whatsapp !== salvos.whatsapp || empresaCargo !== salvos.empresaCargo;
  const prefsMudaram = lembretes !== salvos.lembretes || autoplay !== salvos.reproducaoAutomatica || ranking !== salvos.aparecerNoRanking;

  function salvar(e: FormEvent) {
    e.preventDefault();
    setAviso(null);
    const entrada = { nome, whatsapp, empresaCargo, versao };
    const v = perfilSchema.safeParse(entrada);
    if (!v.success) {
      const novos: Partial<Record<Campos, string>> = {};
      for (const i of v.error.issues) novos[i.path[0] as Campos] ??= i.message;
      setErros(novos);
      return;
    }
    setErros({});
    if (!dadosMudaram && !prefsMudaram) {
      setAviso({ tom: "ok", texto: "Nada para salvar: tudo já está atualizado." });
      return;
    }
    iniciar(async () => {
      if (dadosMudaram) {
        const r = await acaoSalvarPerfil(entrada);
        if (!r.ok) return setAviso({ tom: "erro", texto: r.erro });
        setVersao(r.dados.versao);
        setSalvos((s) => ({ ...s, nome, whatsapp, empresaCargo }));
      }
      if (prefsMudaram) {
        const r = await acaoSalvarPreferencias({ lembretes, reproducaoAutomatica: autoplay, aparecerNoRanking: ranking });
        if (!r.ok) return setAviso({ tom: "erro", texto: r.erro });
        setSalvos((s) => ({ ...s, lembretes: r.dados.lembretes, reproducaoAutomatica: r.dados.reproducaoAutomatica, aparecerNoRanking: r.dados.aparecerNoRanking }));
      }
      setAviso({ tom: "ok", texto: "Alterações salvas." });
      router.refresh(); // nome novo no cabeçalho e no cartão
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <form id={ID_FORM} onSubmit={salvar} noValidate className="contents">
        <Cartao raio={18} padding={24} como="section" aria-labelledby="titulo-dados" className="flex flex-col gap-4">
          <CartaoTitulo id="titulo-dados" tamanho={16} como="h2">
            Dados pessoais
          </CartaoTitulo>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
            <Campo rotulo="Nome completo" name="nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.nome} maxLength={120} required />
            <Campo rotulo="E-mail" name="email" type="email" value={dados.email} readOnly ajuda="Para trocar o e-mail, fale com a equipe." className="cursor-default bg-surface-2 text-muted" />
            <Campo
              rotulo="WhatsApp"
              name="whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 99999-0000"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararWhatsapp(e.target.value))}
              erro={erros.whatsapp}
            />
            <Campo
              rotulo="Empresa / cargo"
              name="empresaCargo"
              autoComplete="organization-title"
              value={empresaCargo}
              onChange={(e) => setEmpresaCargo(e.target.value)}
              erro={erros.empresaCargo}
              maxLength={120}
            />
          </div>
        </Cartao>
        <Cartao raio={18} padding={24} como="section" aria-labelledby="titulo-preferencias" className="flex flex-col gap-1.5">
          <CartaoTitulo id="titulo-preferencias" tamanho={16} como="h2" className="mb-2">
            Preferências
          </CartaoTitulo>
          <LinhaPreferencia titulo="Tema" descricao="Escuro ou claro (vale na hora)" controle={<AlternarTema variante="texto" />} />
          <LinhaPreferencia
            titulo="Lembretes de aula"
            descricao="Avisos de aulas novas e de onde você parou"
            controle={<Interruptor ligado={lembretes} onAlternar={setLembretes} aria-label="Lembretes de aula" />}
          />
          <LinhaPreferencia
            titulo="Reprodução automática"
            descricao="Avançar para a próxima aula"
            controle={<Interruptor ligado={autoplay} onAlternar={setAutoplay} aria-label="Reprodução automática" />}
          />
          {mostrarRanking && (
            <LinhaPreferencia
              titulo="Aparecer no ranking"
              descricao="Desligado, seu nome some do ranking; seus pontos continuam contando"
              controle={<Interruptor ligado={ranking} onAlternar={setRanking} aria-label="Aparecer no ranking" />}
            />
          )}
        </Cartao>
      </form>
      {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
      <div className="flex flex-wrap justify-end gap-2.5">
        <Link href="/conta/seguranca" className={buttonVariants({ variant: "contorno", size: "42" })}>
          Alterar senha
        </Link>
        <Button type="submit" form={ID_FORM} size="42" carregando={salvando}>
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}
