/**
 * Legendas de DEMONSTRAÇÃO (RN-180) — SÓ DESENVOLVIMENTO. Roda depois do `seed-demo-video.ts`.
 *
 *   npx tsx --conditions=react-server scripts/seed-demo-legendas.ts
 *
 * Recusa NODE_ENV=production e DATABASE_URL/S3_ENDPOINT fora do localhost. Grava, pelo MESMO
 * serviço do envio real (`gravarLegenda`: valida, converte, sanitiza, storage + banco + trilha),
 * uma legenda pt-BR coerente com a duração do vídeo de teste em 2 aulas do criador `demo` (uma em
 * VTT, outra em SRT com tag, para mostrar a conversão). Idempotente: aula com legenda pt-BR viva
 * fica como está.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { criadores, criadores_membros, produtos_modulos_aulas, produtos_modulos_aulas_legendas as legendas, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { gravarLegenda } from "@/lib/legendas/servico";
import { tempoVtt } from "@/lib/legendas/regras";
import { videoVivoDaAula } from "@/lib/video/registro";

const PLANO: { aula: string; formato: "vtt" | "srt"; falas: string[] }[] = [
  {
    aula: "O que é cultura organizacional",
    formato: "vtt",
    falas: [
      "Olá! Nesta aula vamos falar sobre cultura organizacional.",
      "Cultura é o jeito como as coisas realmente acontecem na empresa,",
      "e não só o que está escrito na parede ou no manual.",
      "Ela aparece nas decisões do dia a dia, principalmente quando ninguém está olhando.",
      "Pense na última vez em que alguém da sua equipe errou.",
      "Como o líder reagiu? Houve conversa, aprendizado ou punição?",
      "Essa resposta diz mais sobre a cultura do que qualquer apresentação.",
      "O líder é quem mais influencia a cultura, porque é observado o tempo todo.",
      "Pequenos gestos, repetidos, viram regras não escritas.",
      "Por isso, cultura não se decreta: se constrói com exemplo e coerência.",
      "Ao longo do curso, você vai mapear a cultura atual do seu time",
      "e escolher os comportamentos que quer fortalecer.",
      "Anote o que você observou e siga para a próxima aula.",
    ],
  },
  {
    aula: "Cultura forte × cultura tóxica",
    formato: "srt",
    falas: [
      "Toda empresa tem cultura. A pergunta é: ela é <i>forte</i> ou <i>tóxica</i>?",
      "Uma cultura forte tem valores claros e vividos por todos.",
      "As pessoas sabem o que se espera delas e confiam umas nas outras.",
      "Já a cultura tóxica cresce no silêncio, no medo e na fofoca.",
      "Ela premia quem aparece, e não quem entrega.",
      "O primeiro passo para mudar é dar nome ao que está acontecendo.",
      "Na próxima aula, vamos ver o papel do líder nessa virada.",
    ],
  },
];

const LOCAIS = ["localhost", "127.0.0.1", "::1", "[::1]"];

function exigirDesenvolvimento(): void {
  if (process.env.NODE_ENV === "production") throw new Error("Recusado: NODE_ENV=production.");
  for (const nome of ["DATABASE_URL", "S3_ENDPOINT"]) {
    const valor = process.env[nome];
    if (!valor) throw new Error(`${nome} ausente (rode com o env de dev).`);
    if (!LOCAIS.includes(new URL(valor).hostname)) throw new Error(`Recusado: ${nome} não aponta para o ambiente local.`);
  }
}

/** Falas espalhadas pela duração do vídeo (cada uma ocupa a sua fatia, com um respiro). */
function montar(formato: "vtt" | "srt", falas: string[], duracaoSeg: number): string {
  const fatia = (duracaoSeg - 0.5) / falas.length;
  const blocos = falas.map((f, i) => {
    const [ini, fim] = [i * fatia + 0.3, (i + 1) * fatia - 0.1].map(tempoVtt);
    return formato === "vtt" ? `${ini} --> ${fim}\n${f}` : `${i + 1}\n${ini.replace(".", ",")} --> ${fim.replace(".", ",")}\n${f}`;
  });
  return `${formato === "vtt" ? "WEBVTT\n\n" : ""}${blocos.join("\n\n")}\n`;
}

async function main() {
  exigirDesenvolvimento();
  const [c] = await db.select({ id: criadores.id }).from(criadores).where(and(eq(criadores.slug, "demo"), vivos(criadores)));
  if (!c) throw new Error("Criador `demo` não existe: rode `npm run seed:demo` antes.");
  const [dono] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .innerJoin(criadores_membros, and(eq(criadores_membros.usuario_id, usuarios.id), eq(criadores_membros.criador_id, c.id), vivos(criadores_membros)))
    .where(and(eq(usuarios.email, "dono@demo.local"), eq(criadores_membros.papel, "DONO"), vivos(usuarios)));
  if (!dono) throw new Error("DONO do demo não encontrado.");

  for (const item of PLANO) {
    const [aula] = await db
      .select({ id: produtos_modulos_aulas.id })
      .from(produtos_modulos_aulas)
      .where(and(eq(produtos_modulos_aulas.criador_id, c.id), eq(produtos_modulos_aulas.titulo, item.aula), vivos(produtos_modulos_aulas)));
    if (!aula) throw new Error(`Aula "${item.aula}" não existe no demo.`);
    const [ja] = await db.select({ id: legendas.id }).from(legendas).where(and(eq(legendas.aula_id, aula.id), eq(legendas.idioma, "pt-BR"), vivos(legendas)));
    if (ja) {
      console.log(`[seed-demo-legendas] ${item.aula}: já tem legenda`);
      continue;
    }
    const video = await videoVivoDaAula(c.id, aula.id);
    if (video?.situacao !== "PRONTO" || !video.duracao_seg) throw new Error(`Aula "${item.aula}" sem vídeo PRONTO: rode o seed-demo-video.ts antes.`);
    const texto = montar(item.formato, item.falas, video.duracao_seg);
    const { id } = await gravarLegenda({
      criadorId: c.id,
      usuarioId: dono.id,
      aulaId: aula.id,
      idioma: "pt-BR",
      rotulo: "Português",
      nome: `legenda-demo.${item.formato}`,
      bytes: new TextEncoder().encode(texto),
      substituir: null,
    });
    console.log(`[seed-demo-legendas] ${item.aula}: legenda ${id} (${item.falas.length} trechos, ${video.duracao_seg} s)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
