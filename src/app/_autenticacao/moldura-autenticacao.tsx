import type { ReactNode } from "react";
import { LayoutAutenticacao } from "@/components/aluno/layout-autenticacao";
import { EstiloMarca } from "@/components/marca/estilo-marca";
import type { AlvoDoHost } from "@/lib/criador/area";

interface MolduraAutenticacaoProps {
  alvo: AlvoDoHost;
  children: ReactNode;
}

/**
 * Casca das telas publicas de entrada (login, codigo, definir senha, esqueci a senha).
 * No host de um criador: cor e nome DO CRIADOR. No apex: a plataforma, com luz neutra.
 * Titulo e foto proprios do criador ainda nao tem coluna no banco: vale o texto padrao do layout
 * (quando houver, passe `titulo`/`subtitulo`/`imagemUrl` ao LayoutAutenticacao aqui).
 */
export function MolduraAutenticacao({ alvo, children }: MolduraAutenticacaoProps) {
  if (alvo.tipo === "plataforma") {
    return (
      <LayoutAutenticacao
        variante="plataforma"
        eyebrow="Plataforma"
        titulo="Painel da plataforma."
        subtitulo="Acesso restrito à equipe que opera a plataforma. Toda entrada pede o segundo fator e fica registrada."
        rodape="Líder de Impacto · Plataforma"
      >
        {children}
      </LayoutAutenticacao>
    );
  }
  const { criador } = alvo;
  return (
    <>
      <EstiloMarca cor={criador.cor_marca} />
      <LayoutAutenticacao rodape={`${criador.nome} · Área de membros`}>{children}</LayoutAutenticacao>
    </>
  );
}
