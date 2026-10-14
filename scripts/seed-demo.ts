/**
 * Dados de DEMONSTRAÇÃO da área do aluno — SÓ DESENVOLVIMENTO (`npm run seed:demo`).
 *
 * Recusa rodar com NODE_ENV=production ou com DATABASE_URL fora do localhost. Idempotente:
 * cada peça é procurada pela chave natural (slug, e-mail, ordem) e só é criada se faltar.
 *
 * Cria o criador `demo` ("Escola Demo", cor nula; abre em http://demo.localhost:3011), um DONO
 * (`dono@demo.local`) e um ALUNO (`aluno@demo.local`), os dois SEM SENHA (para entrar use
 * `npm run sessao:demo`), 3 produtos publicados com módulos, aulas (duração preenchida, sem vídeo),
 * capítulos, materiais LINK, capas geradas com FFmpeg e enviadas ao storage, matrícula do aluno
 * nos 2 cursos, progresso variado, favoritos e visualizações para o Top 10, e mais 7 alunos com
 * atividade e conclusões para o painel do admin (`seed-demo-painel.ts`), e o passo 7 (2 avaliações,
 * 1 trilha e 1 certificado com PDF da Ana: `seed-demo-passo7.ts`) e o passo 8 (canais, publicações,
 * comentários, curtidas, enquete, fixado, comentários numa aula e notificações da Ana:
 * `seed-demo-passo8.ts`).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { urlDeEnvio } from "@/lib/armazenamento/cliente";
import { chaveDeArquivo } from "@/lib/armazenamento/regras";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { db } from "@/lib/db";
import type { PapelCriador, TipoProduto } from "@/lib/db/schema/_enums";
import {
  arquivos,
  criadores,
  criadores_membros,
  criadores_membros_favoritos,
  produtos,
  produtos_modulos,
  produtos_modulos_aulas,
  produtos_modulos_aulas_materiais,
  produtos_modulos_aulas_progressos,
  produtos_modulos_aulas_visualizacoes,
  usuarios,
} from "@/lib/db/schema";
import type { Capitulo } from "@/lib/db/schema/produtos";
import { vivos } from "@/lib/db/soft-delete";
import { matricular } from "@/lib/matriculas/servico";
import { semearPainel } from "./seed-demo-painel";
import { semearPasso7 } from "./seed-demo-passo7";
import { semearPasso8 } from "./seed-demo-passo8";

// ---------------------------------------------------------------- travas de ambiente
function exigirAmbienteDeDesenvolvimento(): void {
  if (process.env.NODE_ENV === "production") throw new Error("Recusado: NODE_ENV=production. Dados de demonstração são só de desenvolvimento.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error(`Recusado: DATABASE_URL aponta para "${host}", não para o banco local.`);
}

// ---------------------------------------------------------------- roteiro (protótipo)
const DIA = 86_400_000;
const atras = (dias: number) => new Date(Date.now() - dias * DIA);
const min = (m: number) => m * 60;

interface AulaRoteiro {
  titulo: string;
  minutos: number;
  descricao?: string;
  capitulos?: Capitulo[];
  material?: { nome: string; url: string };
  /** Libera daqui a N dias (drip). */
  liberaEmDias?: number;
  /** Título da aula pré-requisito (mesmo produto). */
  preRequisito?: string;
  /** Criada há N dias (padrão: antes da publicação do curso). */
  criadaHaDias?: number;
}
interface ProdutoRoteiro {
  codigo: number;
  slug: string;
  titulo: string;
  tipo: TipoProduto;
  descricao: string;
  publicadoHaDias: number;
  cores: [string, string];
  modulos: { titulo: string; aulas: AulaRoteiro[] }[];
}

const CAPITULOS: Capitulo[] = [
  { inicioSeg: 0, titulo: "Abertura" },
  { inicioSeg: 180, titulo: "O conceito" },
  { inicioSeg: 540, titulo: "Na prática" },
  { inicioSeg: 900, titulo: "Para levar" },
];

const ROTEIRO: ProdutoRoteiro[] = [
  {
    codigo: 164,
    slug: "lider-de-impacto",
    titulo: "Líder de Impacto",
    tipo: "CURSO",
    descricao: "Formação para líderes que influenciam, desenvolvem pessoas e geram resultados reais.",
    publicadoHaDias: 60,
    cores: ["0x3a2510", "0x0c0a08"],
    modulos: [
      {
        titulo: "Fundamentos da liderança",
        aulas: [
          { titulo: "Comece por aqui", minutos: 8, material: { nome: "Guia de boas-vindas", url: "https://www.example.com/guia-boas-vindas" } },
          { titulo: "Qual é o seu porquê?", minutos: 18 },
          { titulo: "O primeiro fundamento da liderança", minutos: 22 },
        ],
      },
      {
        titulo: "Comunicação dentro da liderança",
        aulas: [
          { titulo: "Escuta ativa na liderança", minutos: 20 },
          { titulo: "Feedback que desenvolve", minutos: 22 },
          { titulo: "Comunicação que influencia", minutos: 19 },
        ],
      },
      {
        titulo: "Cultura organizacional",
        aulas: [
          { titulo: "O que é cultura organizacional", minutos: 18 },
          {
            titulo: "Cultura organizacional do líder",
            minutos: 22,
            descricao: "Como o comportamento do líder vira o padrão da equipe e o que fazer para que esse padrão trabalhe a seu favor.",
            capitulos: CAPITULOS,
            material: { nome: "Roteiro de diagnóstico de cultura", url: "https://www.example.com/roteiro-cultura" },
          },
          { titulo: "Cultura forte × cultura tóxica", minutos: 19, capitulos: CAPITULOS.slice(0, 3) },
          { titulo: "Qual é o papel do líder na criação da cultura", minutos: 24 },
          { titulo: "O que são os riscos", minutos: 15, criadaHaDias: 3 },
        ],
      },
      {
        titulo: "Desenvolvimento de pessoas",
        aulas: [
          { titulo: "Delegação e autonomia", minutos: 21, liberaEmDias: 12 },
          { titulo: "Plano de desenvolvimento individual", minutos: 25, liberaEmDias: 19 },
        ],
      },
      {
        titulo: "Resultados e legado",
        aulas: [{ titulo: "Resultados que ficam", minutos: 26, preRequisito: "O que são os riscos" }],
      },
    ],
  },
  {
    codigo: 165,
    slug: "editora-signature",
    titulo: "Editora Signature",
    tipo: "CURSO",
    descricao: "Mentoria editorial para estruturar, escrever e entregar o seu capítulo do livro.",
    publicadoHaDias: 12,
    cores: ["0x2b1630", "0x0b0a0d"],
    modulos: [
      {
        titulo: "Seu capítulo",
        aulas: [
          { titulo: "Como estruturar o seu projeto", minutos: 24, material: { nome: "Modelo de estrutura", url: "https://www.example.com/modelo-estrutura" } },
          { titulo: "A estrutura de escrita do seu capítulo", minutos: 28 },
          { titulo: "Revisão e entrega", minutos: 17 },
        ],
      },
    ],
  },
  {
    codigo: 166,
    slug: "mentorias-ao-vivo",
    titulo: "Mentorias ao vivo",
    tipo: "MENTORIA",
    descricao: "Gravações e materiais das mentorias em grupo, na ordem em que aconteceram.",
    publicadoHaDias: 5,
    cores: ["0x10283a", "0x08090c"],
    modulos: [
      {
        titulo: "Encontros 2026",
        aulas: [
          { titulo: "Encontro 1 · Fundamentos", minutos: 72 },
          { titulo: "Encontro 2 · Comunicação", minutos: 65 },
          { titulo: "Encontro 3 · Cultura", minutos: 80 },
        ],
      },
    ],
  },
];

/** Progresso do aluno: título da aula -> percentual (100 = concluída) e "há quantos minutos" parou. */
const PROGRESSO: Record<string, { p: number; haMin: number }> = {
  "Comece por aqui": { p: 100, haMin: 60 * 24 * 20 },
  "Qual é o seu porquê?": { p: 100, haMin: 60 * 24 * 19 },
  "O primeiro fundamento da liderança": { p: 100, haMin: 60 * 24 * 18 },
  "Escuta ativa na liderança": { p: 100, haMin: 60 * 24 * 9 },
  "Feedback que desenvolve": { p: 100, haMin: 60 * 24 * 7 },
  "Comunicação que influencia": { p: 80, haMin: 60 * 26 },
  "O que é cultura organizacional": { p: 100, haMin: 60 * 5 },
  "Cultura organizacional do líder": { p: 42, haMin: 35 },
  "Como estruturar o seu projeto": { p: 15, haMin: 60 * 50 },
  "A estrutura de escrita do seu capítulo": { p: 64, haMin: 60 * 3 },
};

/** Visualizações dos últimos 7 dias (agregado do Top 10): título -> total distribuído nos dias. */
const VISUALIZACOES: Record<string, number> = {
  "Qual é o seu porquê?": 41,
  "O primeiro fundamento da liderança": 36,
  "Escuta ativa na liderança": 30,
  "Cultura forte × cultura tóxica": 27,
  "Comece por aqui": 22,
  "Cultura organizacional do líder": 18,
  "Como estruturar o seu projeto": 14,
  "O que são os riscos": 9,
};

const FAVORITOS = { produtos: ["editora-signature", "mentorias-ao-vivo"], aulas: ["Cultura forte × cultura tóxica"] };

// ---------------------------------------------------------------- imagens (FFmpeg + storage)
const pasta = mkdtempSync(join(tmpdir(), "seed-demo-"));
copyFileSync("C:/Windows/Fonts/georgiab.ttf", join(pasta, "serif.ttf"));
copyFileSync("C:/Windows/Fonts/segoeuib.ttf", join(pasta, "sans.ttf"));

/** Gera um JPG (gradiente na cor do produto; pôster 3:4 leva o título) e devolve os bytes. */
function gerarImagem(nome: string, l: number, a: number, cores: [string, string], texto?: { eyebrow: string; titulo: string }): Buffer {
  const filtros = ["vignette=PI/5"];
  if (texto) {
    writeFileSync(join(pasta, `${nome}-e.txt`), texto.eyebrow);
    writeFileSync(join(pasta, `${nome}-t.txt`), texto.titulo);
    filtros.push(
      `drawtext=fontfile=sans.ttf:textfile=${nome}-e.txt:fontsize=${Math.round(l / 30)}:fontcolor=0xd9a441:x=${Math.round(l / 14)}:y=h-${Math.round(a / 4.2)}`,
      `drawtext=fontfile=serif.ttf:textfile=${nome}-t.txt:fontsize=${Math.round(l / 11)}:fontcolor=0xf3ede4:x=${Math.round(l / 14)}:y=h-${Math.round(a / 5.4)}`,
    );
  }
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `gradients=s=${l}x${a}:c0=${cores[0]}:c1=${cores[1]}:x0=0:y0=0:x1=${l}:y1=${a}:n=2,format=rgb24`, "-frames:v", "1", "-vf", filtros.join(","), "-q:v", "3", `${nome}.jpg`],
    { cwd: pasta },
  );
  if (r.status !== 0) throw new Error(`ffmpeg falhou (${nome}): ${r.stderr?.toString() ?? r.error?.message}`);
  return readFileSync(join(pasta, `${nome}.jpg`));
}

/** Envia ao storage pela URL assinada (o caminho do navegador) e registra o arquivo DISPONÍVEL. */
async function enviarImagem(criadorId: string, autorId: string, nome: string, bytes: Buffer): Promise<string> {
  const id = randomUUID();
  const chave = chaveDeArquivo(criadorId, "IMAGEM", id, "jpg");
  const envio = await urlDeEnvio({ bucket: "arquivos", criadorId, chave, mime: "image/jpeg", tamanho: bytes.byteLength });
  const put = await fetch(envio.url, { method: "PUT", headers: envio.cabecalhos, body: new Uint8Array(bytes) });
  if (!put.ok) throw new Error(`storage recusou ${nome}: HTTP ${put.status} (docker compose up? npm run armazenamento:preparar?)`);
  await db.insert(arquivos).values({ id, criador_id: criadorId, chave, finalidade: "IMAGEM", nome_original: `${nome}.jpg`, mime: "image/jpeg", tamanho_bytes: bytes.byteLength, status: "DISPONIVEL", modified_by: autorId });
  return id;
}

// ---------------------------------------------------------------- pessoas
async function garantirCriador() {
  const [existe] = await db.select().from(criadores).where(and(eq(criadores.slug, "demo"), vivos(criadores)));
  if (existe) return existe;
  const autor = randomUUID();
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(criadores).values({ slug: "demo", nome: "Escola Demo", cor_marca: null, modified_by: autor }).returning();
    await registrarAuditoria(tx, { userId: null, criadorId: c.id, acao: "criar", tabela: "criadores", registroId: c.id, detalhes: "Criador de demonstração criado pelo seed:demo (só desenvolvimento)" });
    return c;
  });
}

async function garantirPessoa(criadorId: string, email: string, nome: string, papel: PapelCriador) {
  let [u] = await db.select({ id: usuarios.id }).from(usuarios).where(and(sql`lower(${usuarios.email}) = ${email}`, vivos(usuarios)));
  if (!u) {
    const id = randomUUID();
    [u] = await db.insert(usuarios).values({ id, nome, email, email_verificado: true, modified_by: id }).returning({ id: usuarios.id });
    await registrarAuditoria(db, { userId: null, criadorId, acao: "criar", tabela: "usuarios", registroId: u.id, detalhes: `Conta de demonstração ${papel} criada pelo seed:demo (sem senha)` });
  }
  let [m] = await db
    .select({ id: criadores_membros.id })
    .from(criadores_membros)
    .where(and(eq(criadores_membros.criador_id, criadorId), eq(criadores_membros.usuario_id, u.id), vivos(criadores_membros)));
  if (!m) {
    [m] = await db.insert(criadores_membros).values({ criador_id: criadorId, usuario_id: u.id, papel, modified_by: u.id }).returning({ id: criadores_membros.id });
    await registrarAuditoria(db, { userId: null, criadorId, acao: "criar", tabela: "criadores_membros", registroId: m.id, detalhes: `Vínculo ${papel} de demonstração criado pelo seed:demo` });
  }
  return { usuarioId: u.id, membroId: m.id };
}

// ---------------------------------------------------------------- catálogo
type AulaCriada = { id: string; titulo: string; duracao: number; produtoSlug: string };

async function garantirProduto(criadorId: string, dono: { usuarioId: string; membroId: string }, r: ProdutoRoteiro): Promise<{ id: string; aulas: AulaCriada[] }> {
  const [existe] = await db.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.criador_id, criadorId), eq(produtos.slug, r.slug), vivos(produtos)));
  if (existe) {
    const aulas = await db
      .select({ id: produtos_modulos_aulas.id, titulo: produtos_modulos_aulas.titulo, duracao: produtos_modulos_aulas.duracao_seg })
      .from(produtos_modulos_aulas)
      .innerJoin(produtos_modulos, eq(produtos_modulos.id, produtos_modulos_aulas.modulo_id))
      .where(and(eq(produtos_modulos.produto_id, existe.id), vivos(produtos_modulos_aulas), vivos(produtos_modulos)));
    return { id: existe.id, aulas: aulas.map((a) => ({ ...a, duracao: a.duracao ?? 0, produtoSlug: r.slug })) };
  }

  // Imagens antes da transação (se a transação falhar, sobra só objeto órfão no storage de dev).
  const autor = dono.usuarioId;
  const rotulo = r.tipo === "MENTORIA" ? "MENTORIA" : "CURSO";
  const capa3x4 = await enviarImagem(criadorId, autor, `${r.slug}-3x4`, gerarImagem(`${r.slug}-3x4`, 900, 1200, r.cores, { eyebrow: rotulo, titulo: r.titulo }));
  const capa16x9 = await enviarImagem(criadorId, autor, `${r.slug}-16x9`, gerarImagem(`${r.slug}-16x9`, 1600, 900, r.cores));
  const thumbs: string[] = [];
  let n = 0;
  for (const m of r.modulos) {
    for (let k = 0; k < m.aulas.length; k++) {
      n++;
      // Variação de tom por aula: inverte as cores nas pares.
      const cores: [string, string] = n % 2 ? r.cores : [r.cores[1], r.cores[0]];
      thumbs.push(await enviarImagem(criadorId, autor, `${r.slug}-aula-${n}`, gerarImagem(`${r.slug}-aula-${n}`, 640, 360, cores)));
    }
  }

  return db.transaction(async (tx) => {
    const publicadoEm = atras(r.publicadoHaDias);
    const [p] = await tx
      .insert(produtos)
      .values({
        criador_id: criadorId,
        codigo: r.codigo,
        titulo: r.titulo,
        slug: r.slug,
        descricao: r.descricao,
        tipo: r.tipo,
        status: "PUBLICADO",
        publicado_em: publicadoEm,
        capa_3x4_arquivo_id: capa3x4,
        capa_16x9_arquivo_id: capa16x9,
        professor_membro_id: dono.membroId,
        modified_by: autor,
        created_at: atras(r.publicadoHaDias + 2),
      })
      .returning({ id: produtos.id });
    const criadas: AulaCriada[] = [];
    const porTitulo = new Map<string, string>();
    let t = 0;
    for (const [i, m] of r.modulos.entries()) {
      const [mod] = await tx.insert(produtos_modulos).values({ criador_id: criadorId, produto_id: p.id, ordem: i + 1, titulo: m.titulo, modified_by: autor }).returning({ id: produtos_modulos.id });
      for (const [j, a] of m.aulas.entries()) {
        const duracao = min(a.minutos);
        const [aula] = await tx
          .insert(produtos_modulos_aulas)
          .values({
            criador_id: criadorId,
            modulo_id: mod.id,
            ordem: j + 1,
            titulo: a.titulo,
            descricao: a.descricao ?? "",
            duracao_seg: duracao,
            thumb_arquivo_id: thumbs[t++],
            capitulos: a.capitulos ?? [],
            libera_em: a.liberaEmDias ? new Date(Date.now() + a.liberaEmDias * DIA) : null,
            pre_requisito_aula_id: a.preRequisito ? porTitulo.get(a.preRequisito) : null,
            created_at: atras(a.criadaHaDias ?? r.publicadoHaDias + 1),
            modified_by: autor,
          })
          .returning({ id: produtos_modulos_aulas.id });
        porTitulo.set(a.titulo, aula.id);
        criadas.push({ id: aula.id, titulo: a.titulo, duracao, produtoSlug: r.slug });
        if (a.material) {
          await tx.insert(produtos_modulos_aulas_materiais).values({ criador_id: criadorId, aula_id: aula.id, nome: a.material.nome, tipo: "LINK", url: a.material.url, modified_by: autor });
        }
      }
    }
    await registrarAuditoria(tx, {
      userId: autor,
      criadorId,
      acao: "criar",
      tabela: "produtos",
      registroId: p.id,
      detalhes: `Produto de demonstração "${r.titulo}" (${criadas.length} aulas) criado pelo seed:demo`,
    });
    return { id: p.id, aulas: criadas };
  });
}

// ---------------------------------------------------------------- aluno
async function prepararAluno(criadorId: string, aluno: { usuarioId: string; membroId: string }, cursos: { id: string; slug: string; tipo: TipoProduto }[], aulas: AulaCriada[]) {
  await db.transaction(async (tx) => {
    for (const c of cursos.filter((x) => x.tipo === "CURSO")) {
      await matricular(tx, { criadorId, membroId: aluno.membroId, produtoId: c.id, origem: "MANUAL", autor: null });
    }
  });

  const pr = produtos_modulos_aulas_progressos;
  for (const a of aulas) {
    const alvo = PROGRESSO[a.titulo];
    if (!alvo || a.duracao < 1) continue;
    const assistidos = Math.floor((a.duracao * alvo.p) / 100);
    const quando = new Date(Date.now() - alvo.haMin * 60_000);
    const concluida = alvo.p >= 90;
    await db
      .insert(pr)
      .values({
        criador_id: criadorId,
        membro_id: aluno.membroId,
        aula_id: a.id,
        segundos_bitmap: "1".repeat(assistidos) + "0".repeat(a.duracao - assistidos),
        segundos_assistidos: assistidos,
        max_posicao_seg: assistidos,
        ultima_posicao_seg: concluida ? a.duracao : assistidos,
        percentual: alvo.p,
        concluida,
        concluida_em: concluida ? quando : null,
        concluida_por: concluida ? "ASSISTIU" : null,
        ultima_visualizacao_dia: quando.toISOString().slice(0, 10),
        created_at: quando,
        updated_at: quando,
        modified_by: aluno.usuarioId,
      })
      .onConflictDoNothing();
  }

  for (const slug of FAVORITOS.produtos) {
    const c = cursos.find((x) => x.slug === slug);
    if (c) await db.insert(criadores_membros_favoritos).values({ criador_id: criadorId, membro_id: aluno.membroId, produto_id: c.id, modified_by: aluno.usuarioId }).onConflictDoNothing();
  }
  for (const titulo of FAVORITOS.aulas) {
    const a = aulas.find((x) => x.titulo === titulo);
    if (a) await db.insert(criadores_membros_favoritos).values({ criador_id: criadorId, membro_id: aluno.membroId, aula_id: a.id, modified_by: aluno.usuarioId }).onConflictDoNothing();
  }
}

/** Agregado do Top 10 nos últimos 7 dias (dia de Brasília), espalhado de forma determinística. */
async function semearVisualizacoes(criadorId: string, autorId: string, aulas: AulaCriada[]) {
  for (const a of aulas) {
    const total = VISUALIZACOES[a.titulo];
    if (!total) continue;
    for (let d = 0; d < 7; d++) {
      const n = Math.max(1, Math.round(total / 7) + ((d * 3) % 4) - 1);
      await db
        .insert(produtos_modulos_aulas_visualizacoes)
        .values({ criador_id: criadorId, aula_id: a.id, dia: sql`((now() at time zone 'America/Sao_Paulo')::date - ${d}::int)`, visualizacoes: n, modified_by: autorId })
        .onConflictDoNothing();
    }
  }
}

async function principal() {
  exigirAmbienteDeDesenvolvimento();
  const criador = await garantirCriador();
  const dono = await garantirPessoa(criador.id, "dono@demo.local", "Dono Demo", "DONO");
  const aluno = await garantirPessoa(criador.id, "aluno@demo.local", "Ana Demo", "ALUNO");

  const cursos: { id: string; slug: string; tipo: TipoProduto }[] = [];
  const aulas: AulaCriada[] = [];
  for (const r of ROTEIRO) {
    const p = await garantirProduto(criador.id, dono, r);
    cursos.push({ id: p.id, slug: r.slug, tipo: r.tipo });
    aulas.push(...p.aulas);
  }
  await prepararAluno(criador.id, aluno, cursos, aulas);
  await semearVisualizacoes(criador.id, dono.usuarioId, aulas);
  await semearPainel(criador.id, garantirPessoa, aluno, cursos, aulas);
  await semearPasso7(criador.id, dono, aluno, cursos, aulas);
  await semearPasso8(criador.id, dono, aluno, cursos, aulas);

  const ids = (slug: string) => aulas.filter((a) => a.produtoSlug === slug).map((a) => `    ${a.id}  ${a.titulo}`).join("\n");
  console.log(`Criador demo: ${criador.id} (abra http://demo.localhost:3011)`);
  console.log(`DONO:  dono@demo.local   usuario ${dono.usuarioId}  membro ${dono.membroId}`);
  console.log(`ALUNO: aluno@demo.local  usuario ${aluno.usuarioId}  membro ${aluno.membroId}`);
  for (const c of cursos) console.log(`Produto ${c.slug} (${c.tipo}): ${c.id}\n${ids(c.slug)}`);
  console.log("Sem senha: gere o cookie com `npm run sessao:demo`.");
}

principal()
  .then(() => 0)
  .catch((erro) => {
    console.error("seed:demo falhou:", erro instanceof Error ? erro.message : erro);
    return 1;
  })
  .then((codigo) => {
    rmSync(pasta, { recursive: true, force: true });
    process.exit(codigo);
  });
