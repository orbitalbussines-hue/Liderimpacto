import "server-only";
import { cookies } from "next/headers";
import { COOKIE_TEMA, type Tema } from "@/lib/tema-constantes";

// O cookie e o que o <head> le antes de pintar; com sessao, a action grava tambem usuarios.tema.
// ponytail: o login ainda nao copia usuarios.tema para o cookie (aparelho novo comeca escuro).
export async function gravarTema(tema: Tema): Promise<void> {
  (await cookies()).set(COOKIE_TEMA, tema, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false, // o script do <head> precisa ler antes da hidratacao
  });
}
