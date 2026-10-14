import { Aviso } from "@/components/ui/aviso";
import { Selo } from "@/components/ui/selo";

/** Assistente do professor (ADR-0014): abas em rota e o selo de situação, iguais nas 4 telas. */

export const ROTA_ASSISTENTE = "/admin/assistente-do-professor";

export const ABAS_ASSISTENTE = [
  { rotulo: "Configuração", href: ROTA_ASSISTENTE },
  { rotulo: "Testar", href: `${ROTA_ASSISTENTE}/testar` },
  { rotulo: "Perguntas", href: `${ROTA_ASSISTENTE}/perguntas` },
  { rotulo: "Consumo", href: `${ROTA_ASSISTENTE}/consumo` },
] as const;

export function SeloSituacao({ ligado }: { ligado: boolean }) {
  return <Selo tom={ligado ? "ok" : "neutro"}>{ligado ? "Ligado para os alunos" : "Desligado"}</Selo>;
}

export function AvisoIaNaoConfigurada() {
  return (
    <Aviso tom="info">
      IA não configurada: falta a chave da Anthropic no servidor. Você pode deixar tudo pronto; os alunos só veem o assistente quando ela estiver definida.
    </Aviso>
  );
}
