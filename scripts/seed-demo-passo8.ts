/**
 * Parte do `seed:demo` (SÓ DESENVOLVIMENTO) do passo 8: canais (Geral, Dúvidas das aulas, Autores ·
 * Signature só para quem tem o curso, Avisos só da equipe), ~10 publicações com comentários e
 * respostas, curtidas, 1 enquete, 1 fixado, comentários numa aula e as notificações da Ana que esses
 * eventos geram. Usa os serviços reais (o limite de frequência vale: os autores se revezam).
 * Idempotente: se o criador já tem publicação, não faz nada.
 */
import { and, eq } from "drizzle-orm";
import { garantirCanalGeral } from "@/lib/comunidade/canais";
import { comentar } from "@/lib/comunidade/comentarios";
import { fixarPublicacao } from "@/lib/comunidade/moderacao";
import { alternarCurtida, publicar, votarNaEnquete } from "@/lib/comunidade/publicacoes";
import type { Participante } from "@/lib/comunidade/sql";
import { db } from "@/lib/db";
import { criadores_canais, criadores_canais_posts, criadores_comentarios, criadores_membros, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";
import { acessoDaAula } from "@/lib/video/acesso-aula";

type Pessoa = { usuarioId: string; membroId: string };
type Curso = { id: string; slug: string };
type Aula = { id: string; titulo: string; produtoSlug: string };

const DIA = 86_400_000;

async function canal(criadorId: string, autor: string, nome: string, extra: Partial<typeof criadores_canais.$inferInsert> = {}) {
  const [existe] = await db.select().from(criadores_canais).where(and(eq(criadores_canais.criador_id, criadorId), eq(criadores_canais.nome, nome), vivos(criadores_canais)));
  if (existe) return existe;
  const [c] = await db.insert(criadores_canais).values({ criador_id: criadorId, nome, modified_by: autor, ...extra }).returning();
  return c;
}

/** Joga a publicação/comentário para o passado ("há 15 dias"); só dados de demonstração. */
async function envelhecer(tabela: typeof criadores_canais_posts | typeof criadores_comentarios, id: string, dias: number) {
  const quando = new Date(Date.now() - dias * DIA);
  await db.update(tabela).set({ created_at: quando, updated_at: quando }).where(eq(tabela.id, id));
}

export async function semearPasso8(criadorId: string, dono: Pessoa, ana: Pessoa, cursos: Curso[], aulas: Aula[]) {
  const [ja] = await db
    .select({ id: criadores_canais_posts.id })
    .from(criadores_canais_posts)
    .where(and(eq(criadores_canais_posts.criador_id, criadorId), vivos(criadores_canais_posts)))
    .limit(1);
  if (ja) return;

  const editora = cursos.find((c) => c.slug === "editora-signature")!;
  await garantirCanalGeral(db, criadorId, dono.usuarioId);
  const [geral] = await db.select().from(criadores_canais).where(and(eq(criadores_canais.criador_id, criadorId), eq(criadores_canais.padrao, true), vivos(criadores_canais)));
  const duvidas = await canal(criadorId, dono.usuarioId, "Dúvidas das aulas", { ordem: 2, descricao: "Pergunte sobre o conteúdo das aulas" });
  const autores = await canal(criadorId, dono.usuarioId, "Autores · Signature", { ordem: 3, acesso: "PRODUTO", produto_id: editora.id, descricao: "Para quem está escrevendo o capítulo" });
  const avisos = await canal(criadorId, dono.usuarioId, "Avisos", { ordem: 4, quem_posta: "EQUIPE", descricao: "Recados da equipe" });

  const linhas = await db
    .select({ usuarioId: usuarios.id, membroId: criadores_membros.id, nome: usuarios.nome, papel: criadores_membros.papel, email: usuarios.email })
    .from(criadores_membros)
    .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
    .where(and(eq(criadores_membros.criador_id, criadorId), vivos(criadores_membros)))
    .orderBy(usuarios.email);
  const por = (membroId: string) => linhas.find((l) => l.membroId === membroId)!;
  const p = (l: (typeof linhas)[number]): Participante => ({ criadorId, usuarioId: l.usuarioId, membroId: l.membroId, papel: l.papel, nome: l.nome });
  const pDono = p(por(dono.membroId));
  const pAna = p(por(ana.membroId));
  const outros = linhas.filter((l) => l.papel === "ALUNO" && l.membroId !== ana.membroId && l.email.endsWith("@demo.local")).map(p);
  const [bruno, carla, diego, elisa, fabio] = outros;

  const aulaDaAna = async () => {
    for (const a of aulas) if ((await acessoDaAula(criadorId, a.id, { papel: "ALUNO", membroId: ana.membroId }))?.pode) return a;
    return null;
  };
  const aula = await aulaDaAna();
  /** "em <aula>" só quando o autor pode assistir a aula (o serviço recusa o resto). */
  const aulaPara = async (autor: Participante) =>
    aula && (await acessoDaAula(criadorId, aula.id, { papel: autor.papel, membroId: autor.membroId }))?.pode ? aula.id : null;

  const roteiro: { autor: Participante; canal: string; texto: string; dias: number; aula?: boolean; enquete?: { pergunta: string; opcoes: string[] } }[] = [
    { autor: pDono, canal: geral.id, texto: "Boas-vindas à comunidade! Aqui é o lugar para trocar experiências, tirar dúvidas e se apresentar. Comece contando quem você é e o que lidera hoje.", dias: 30 },
    { autor: pAna, canal: geral.id, texto: "Oi, pessoal! Sou a Ana, coordeno um time de 8 pessoas numa escola. Animada para aplicar o que estou aprendendo.", dias: 20 },
    { autor: bruno ?? pDono, canal: duvidas.id, texto: "Estamos na Câmara procedendo atualização de sistemas; estão sendo analisados sistemas de gerenciamento via IA. Alguém já passou por isso com a equipe?", dias: 15, aula: true },
    { autor: carla ?? pDono, canal: duvidas.id, texto: "Na atualidade não sou líder, daí não tenho liderados. Como aplicar os exercícios do módulo 1 nessa situação?", dias: 15, aula: true },
    { autor: pAna, canal: duvidas.id, texto: "Não consigo ver o PDF que foi citado na aula sobre o porquê. Alguém tem o link? Achei este material complementar: https://www.lideresdeimpacto.com.br/materiais", dias: 9, aula: true },
    { autor: pDono, canal: geral.id, texto: "Qual o melhor horário para a próxima mentoria ao vivo?", dias: 6, enquete: { pergunta: "Melhor horário para a mentoria", opcoes: ["Terça, 20h", "Quarta, 19h", "Sábado, 10h"] } },
    { autor: diego ?? pDono, canal: geral.id, texto: "Apliquei o feedback específico com a minha equipe essa semana. Fez muita diferença falar do comportamento e não da pessoa.", dias: 4 },
    { autor: elisa ?? pDono, canal: autores.id, texto: "Terminei a estrutura do meu capítulo! Alguém quer trocar leitura crítica?", dias: 3 },
    { autor: pDono, canal: avisos.id, texto: "Lembrete: a mentoria em grupo de terça foi para as 20h. O link chega por e-mail no dia.", dias: 2 },
    { autor: fabio ?? pDono, canal: geral.id, texto: "Recomendo o livro “A Coragem de Liderar”, tem tudo a ver com o módulo de cultura.", dias: 1 },
  ];
  const criados: string[] = [];
  for (const r of roteiro) {
    const aulaId = r.aula ? await aulaPara(r.autor) : null;
    const { id } = await publicar(r.autor, { canalId: r.canal, texto: r.texto, aulaId, anexoIds: [], enquete: r.enquete ? { ...r.enquete, encerraEm: null } : null });
    criados.push(id);
  }

  // Fixado: as boas-vindas. Enquete: votos de alguns.
  const [boasVindas] = await db.select({ updated_at: criadores_canais_posts.updated_at }).from(criadores_canais_posts).where(eq(criadores_canais_posts.id, criados[0]));
  await fixarPublicacao({ criadorId, usuarioId: dono.usuarioId, membroId: dono.membroId, nome: pDono.nome }, criados[0], boasVindas.updated_at, true);
  for (const [i, v] of [pAna, bruno, carla, diego].filter(Boolean).entries()) await votarNaEnquete(v, criados[5], i % 2);

  // Comentários e respostas (geram as notificações da Ana).
  const c1 = await comentar(bruno ?? pDono, { postId: criados[1] }, "Bem-vinda, Ana! Também coordeno em escola, vamos trocar.", null);
  await comentar(pAna, { postId: criados[1] }, "Vamos sim, Bruno!", c1.id);
  await comentar(carla ?? pDono, { postId: criados[1] }, "Que bom ter você aqui.", null);
  const c2 = await comentar(pDono, { postId: criados[4] }, "Ana, o PDF está na aba Materiais da aula. Reenviei por lá.", null);
  await comentar(pAna, { postId: criados[4] }, "Achei, obrigada!", c2.id);
  await comentar(pDono, { postId: criados[2] }, "Ótima pergunta. Envolva a equipe na escolha desde o começo.", null);
  await comentar(pAna, { postId: criados[6] }, "Vou testar com o meu time também.", null);

  // Curtidas: várias na publicação da Ana (agregadas numa notificação).
  for (const quem of [pDono, bruno, carla, diego, elisa].filter(Boolean)) await alternarCurtida(quem, { postId: criados[1] });
  for (const quem of [pAna, bruno, fabio].filter(Boolean)) await alternarCurtida(quem, { postId: criados[0] });
  for (const quem of [pAna, carla].filter(Boolean)) await alternarCurtida(quem, { postId: criados[6] });

  // Comentários na aula (aba "Comentários" do player).
  if (aula) {
    const ca = await comentar(pAna, { aulaId: aula.id }, "Essa aula mudou minha forma de pensar sobre propósito.", null);
    await comentar(pDono, { aulaId: aula.id }, "Que bom, Ana! Leve isso para a próxima reunião com o time.", ca.id);
    if (bruno) await comentar(bruno, { aulaId: aula.id }, "Assisti duas vezes, muito boa.", null);
  }

  // Datas do roteiro (o feed mostra "há 15 dias").
  for (const [i, r] of roteiro.entries()) await envelhecer(criadores_canais_posts, criados[i], r.dias);
}
