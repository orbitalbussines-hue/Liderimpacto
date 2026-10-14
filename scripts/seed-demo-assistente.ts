/**
 * Base de conhecimento e assistente do criador `demo` — SÓ desenvolvimento (`npm run seed:demo:assistente`).
 *
 * 1. Cria (se não existirem, pelo título) 3 textos da equipe: FAQ, política de certificados e um
 *    texto SÓ do curso "Mentorias ao vivo" (o aluno demo não tem esse curso: prova o isolamento).
 * 2. Reindexa o criador inteiro (descrições + legendas das aulas de "Cultura organizacional").
 * 3. Liga o assistente (todos os cursos) se ainda não houver configuração.
 * 4. Se o aluno demo ainda não tem conversa, faz 3 perguntas pelo fluxo REAL (acesso, recuperação,
 *    limite, gravação) com o cliente FALSO — nenhuma chamada à API da Anthropic.
 *
 * Mesmas travas do seed:demo (NODE_ENV=production ou banco fora do localhost: recusa).
 */
import { and, eq } from "drizzle-orm";
import { ClienteFalso } from "@/lib/assistente/cliente-falso";
import { conversasDoMembro } from "@/lib/assistente/conversas";
import { prepararResposta } from "@/lib/assistente/responder";
import { indexarTexto, reindexarCriador } from "@/lib/conhecimento/indexar";
import { db } from "@/lib/db";
import { criadores, criadores_assistentes, criadores_conhecimento_documentos as documentos, criadores_membros, produtos, produtos_modulos_aulas, usuarios } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

function exigirDesenvolvimento(): void {
  if (process.env.NODE_ENV === "production") throw new Error("Recusado: NODE_ENV=production.");
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x").hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error(`Recusado: DATABASE_URL aponta para "${host}".`);
}

const TEXTOS = [
  {
    titulo: "Perguntas frequentes da área de membros",
    curso: null,
    texto: `Quanto tempo tenho de acesso aos cursos? O acesso vale enquanto a sua matrícula estiver ativa. Cursos com prazo mostram a data de expiração em "Continuar".

Posso assistir pelo celular? Sim. A área funciona no navegador do celular e do computador, com legenda nas aulas que já têm transcrição.

Como tiro dúvidas sobre uma aula? Use a aba "Pergunte ao professor" na própria aula ou publique na Comunidade. A equipe acompanha a Comunidade nos dias úteis.

Perdi o acesso ou não consigo entrar. Use "Esqueci a senha" na tela de entrada. Se o problema continuar, fale com o suporte pelo e-mail informado na sua compra.`,
  },
  {
    titulo: "Política de certificados",
    curso: null,
    texto: `O certificado de conclusão é emitido automaticamente quando você conclui todas as aulas obrigatórias do curso e é aprovado nas avaliações que liberam módulos.

Uma aula conta como concluída quando você assiste pelo menos 90% dela, ou quando usa o botão "Concluir e avançar" nas aulas que permitem.

O certificado traz seu nome, o curso, a carga horária e um código de verificação. Qualquer pessoa pode conferir a autenticidade pelo link de verificação impresso no PDF.

Se o seu nome saiu errado, corrija em Perfil e peça à equipe uma nova versão do certificado.`,
  },
  {
    titulo: "Como funcionam as mentorias ao vivo",
    curso: "Mentorias ao vivo",
    texto: `As mentorias ao vivo acontecem quinzenalmente às quintas, às 20h, pelo link publicado em Eventos 15 minutos antes do início.

Cada encontro tem 90 minutos: 30 minutos de conteúdo e 60 minutos de perguntas dos participantes. As gravações ficam disponíveis no curso em até dois dias úteis.`,
  },
];

const PERGUNTAS = [
  { aula: "O que é cultura organizacional", pergunta: "O que é cultura organizacional, na prática?" },
  { aula: null, pergunta: "Quando o certificado é emitido?" },
  // Sem nada na base sobre isso: vira "sem resposta" (aparece na aba Perguntas da equipe).
  { aula: null, pergunta: "Como faço para trocar a forma de pagamento?" },
];

async function principal() {
  exigirDesenvolvimento();
  const [c] = await db.select({ id: criadores.id, nome: criadores.nome }).from(criadores).where(and(eq(criadores.slug, "demo"), vivos(criadores)));
  if (!c) throw new Error("Criador demo não existe: rode `npm run seed:demo`.");
  const pessoa = async (email: string) => {
    const [m] = await db
      .select({ usuarioId: usuarios.id, membroId: criadores_membros.id, papel: criadores_membros.papel })
      .from(criadores_membros)
      .innerJoin(usuarios, eq(usuarios.id, criadores_membros.usuario_id))
      .where(and(eq(criadores_membros.criador_id, c.id), eq(usuarios.email, email), vivos(criadores_membros)));
    if (!m) throw new Error(`${email} sem vínculo no demo.`);
    return m;
  };
  const dono = await pessoa("dono@demo.local");
  const aluno = await pessoa("aluno@demo.local");

  for (const t of TEXTOS) {
    const [existe] = await db.select({ id: documentos.id }).from(documentos).where(and(eq(documentos.criador_id, c.id), eq(documentos.titulo, t.titulo), vivos(documentos)));
    if (existe) continue;
    const [p] = t.curso ? await db.select({ id: produtos.id }).from(produtos).where(and(eq(produtos.criador_id, c.id), eq(produtos.titulo, t.curso), vivos(produtos))) : [];
    await db.transaction(async (tx) => {
      const [d] = await tx
        .insert(documentos)
        .values({ criador_id: c.id, fonte: "TEXTO", produto_id: p?.id ?? null, titulo: t.titulo, texto: t.texto, modified_by: dono.usuarioId })
        .returning({ id: documentos.id });
      await indexarTexto(tx, { id: d.id, criadorId: c.id, titulo: t.titulo, texto: t.texto }, dono.usuarioId);
    });
    console.log(`[assistente] texto criado: ${t.titulo}`);
  }
  console.log("[assistente] reindexação:", await reindexarCriador(c.id, dono.usuarioId));

  const [cfg] = await db.select({ id: criadores_assistentes.id }).from(criadores_assistentes).where(and(eq(criadores_assistentes.criador_id, c.id), vivos(criadores_assistentes)));
  if (!cfg) {
    await db.insert(criadores_assistentes).values({ criador_id: c.id, ligado: true, nome: "Assistente do professor", instrucoes: "Fale de forma próxima e prática, como o professor em aula.", modified_by: dono.usuarioId });
    console.log("[assistente] configuração criada (ligado, todos os cursos)");
  }

  if ((await conversasDoMembro(c.id, aluno.membroId)).length) return console.log("[assistente] o aluno demo já tem conversas: nada a fazer.");
  const cliente = new ClienteFalso();
  for (const q of PERGUNTAS) {
    const [a] = q.aula
      ? await db.select({ id: produtos_modulos_aulas.id }).from(produtos_modulos_aulas).where(and(eq(produtos_modulos_aulas.criador_id, c.id), eq(produtos_modulos_aulas.titulo, q.aula), vivos(produtos_modulos_aulas)))
      : [];
    const r = await prepararResposta(
      cliente,
      { criadorId: c.id, nomeArea: c.nome, usuarioId: aluno.usuarioId, membroId: aluno.membroId, papel: aluno.papel },
      { pergunta: q.pergunta, conversaId: null, aulaId: a?.id ?? null, teste: false },
    );
    for await (const ev of r.eventos(new AbortController().signal)) if (ev.tipo === "fim") console.log(`[assistente] "${q.pergunta}": ${ev.semResposta ? "sem resposta" : `${ev.citadas.length} fonte(s)`}`);
  }
}

principal()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error("seed:demo:assistente falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
