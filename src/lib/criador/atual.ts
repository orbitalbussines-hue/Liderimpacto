import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { alvoDosCabecalhos, type AlvoDoHost, type CriadorDaRequisicao } from "./area";

/**
 * Area da requisicao no servidor, UMA leitura por requisicao (`cache` do React).
 * Com cacheComponents, quem chama precisa estar dentro de <Suspense> (le `headers()`).
 */
export const alvoAtual = cache(async (): Promise<AlvoDoHost | null> => alvoDosCabecalhos(await headers()));

/** Para PAGINAS: host que nao e area nenhuma -> 404. */
export async function hostAtual(): Promise<AlvoDoHost> {
  const alvo = await alvoAtual();
  if (!alvo) notFound();
  return alvo;
}

/** Para PAGINAS da area do criador: apex, criador inexistente ou SUSPENSO -> 404. */
export async function criadorAtual(): Promise<CriadorDaRequisicao> {
  const alvo = await hostAtual();
  if (alvo.tipo !== "criador") notFound();
  return alvo.criador;
}
