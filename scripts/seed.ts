/**
 * Seed inicial — RODAR A MAO (`npm run db:seed`), NUNCA no entrypoint do container.
 *
 * Cria (se faltar) o criador "lider-de-impacto", o SUPER_ADMIN e o DONO do criador, a
 * partir de variaveis de ambiente. SEM SENHA: imprime os links de primeiro acesso, e cada
 * pessoa escolhe a propria senha. Idempotente: rodar de novo nao duplica nada; so gera
 * link novo (que invalida o anterior) para quem ainda nao definiu a senha.
 *
 *   SEED_SUPER_ADMIN_EMAIL=voce@exemplo.com \
 *   SEED_DONO_EMAIL=dono@exemplo.com SEED_DONO_NOME="Nome do Dono" \
 *   DATABASE_URL=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=... PLATAFORMA_DOMINIO=... \
 *   npm run db:seed
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/audit/registrar";
import { gerarLinkDeSenha } from "@/lib/auth/recuperacao";
import { db } from "@/lib/db";
import { criadores, criadores_membros, usuarios, usuarios_contas } from "@/lib/db/schema";
import { vivos } from "@/lib/db/soft-delete";

const CRIADOR = { slug: "lider-de-impacto", nome: "Líder de Impacto" } as const;

const env = z
  .object({
    SEED_SUPER_ADMIN_EMAIL: z.email("SEED_SUPER_ADMIN_EMAIL inválido ou ausente."),
    SEED_DONO_EMAIL: z.email("SEED_DONO_EMAIL inválido ou ausente."),
    SEED_DONO_NOME: z.string().trim().min(2, "SEED_DONO_NOME ausente."),
  })
  .parse(process.env);

async function porEmail(email: string) {
  const [u] = await db
    .select({ id: usuarios.id, papel: usuarios.papel_plataforma })
    .from(usuarios)
    .where(and(sql`lower(${usuarios.email}) = ${email.toLowerCase()}`, vivos(usuarios)));
  return u ?? null;
}

async function semSenha(usuarioId: string): Promise<boolean> {
  const [c] = await db
    .select({ hash: usuarios_contas.senha_hash })
    .from(usuarios_contas)
    .where(and(eq(usuarios_contas.usuario_id, usuarioId), eq(usuarios_contas.provedor_id, "credential"), vivos(usuarios_contas)));
  return !c?.hash;
}

async function garantirSuperAdmin(): Promise<string> {
  const email = env.SEED_SUPER_ADMIN_EMAIL.toLowerCase();
  const existe = await porEmail(email);
  if (existe?.papel === "SUPER_ADMIN") return existe.id;
  if (existe) {
    // Trilha ANTES do efeito: promocao a SUPER_ADMIN e concessao de poder.
    await db.transaction(async (tx) => {
      await registrarAuditoria(tx, { userId: existe.id, acao: "atualizar", tabela: "usuarios", registroId: existe.id, detalhes: "Promovido a SUPER_ADMIN pelo seed", dadosAnteriores: { papel_plataforma: existe.papel }, dadosNovos: { papel_plataforma: "SUPER_ADMIN" } });
      await tx.update(usuarios).set({ papel_plataforma: "SUPER_ADMIN", updated_at: new Date(), modified_by: existe.id }).where(eq(usuarios.id, existe.id));
    });
    return existe.id;
  }
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(usuarios).values({ id, nome: "Equipe da plataforma", email, papel_plataforma: "SUPER_ADMIN", modified_by: id });
    await registrarAuditoria(tx, { userId: id, acao: "criar", tabela: "usuarios", registroId: id, detalhes: "SUPER_ADMIN criado pelo seed (sem senha; link de primeiro acesso)" });
  });
  return id;
}

async function garantirCriador(autorId: string) {
  const [existe] = await db.select().from(criadores).where(and(eq(criadores.slug, CRIADOR.slug), vivos(criadores)));
  if (existe) return existe;
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(criadores).values({ slug: CRIADOR.slug, nome: CRIADOR.nome, cor_marca: null, modified_by: autorId }).returning();
    await registrarAuditoria(tx, { userId: autorId, criadorId: c.id, acao: "criar", tabela: "criadores", registroId: c.id, detalhes: `Criador "${c.nome}" criado pelo seed` });
    return c;
  });
}

async function garantirDono(criadorId: string, autorId: string): Promise<string> {
  const email = env.SEED_DONO_EMAIL.toLowerCase();
  let usuarioId = (await porEmail(email))?.id;
  if (!usuarioId) {
    const [u] = await db.insert(usuarios).values({ nome: env.SEED_DONO_NOME, email, modified_by: autorId }).returning({ id: usuarios.id });
    usuarioId = u.id;
    await registrarAuditoria(db, { userId: autorId, criadorId, acao: "criar", tabela: "usuarios", registroId: usuarioId, detalhes: "Dono do criador criado pelo seed (sem senha; link de primeiro acesso)" });
  }
  const [vinculo] = await db
    .select({ id: criadores_membros.id })
    .from(criadores_membros)
    .where(and(eq(criadores_membros.criador_id, criadorId), eq(criadores_membros.usuario_id, usuarioId), vivos(criadores_membros)));
  if (!vinculo) {
    const id = usuarioId;
    await db.transaction(async (tx) => {
      const [m] = await tx.insert(criadores_membros).values({ criador_id: criadorId, usuario_id: id, papel: "DONO", modified_by: autorId }).returning({ id: criadores_membros.id });
      await registrarAuditoria(tx, { userId: autorId, criadorId, acao: "criar", tabela: "criadores_membros", registroId: m.id, detalhes: "Vínculo DONO criado pelo seed" });
    });
  }
  return usuarioId;
}

async function principal() {
  const superAdminId = await garantirSuperAdmin();
  const criador = await garantirCriador(superAdminId);
  const donoId = await garantirDono(criador.id, superAdminId);

  console.log(`Criador: ${criador.nome} (${criador.slug})`);
  const contas = [
    { rotulo: "SUPER_ADMIN", id: superAdminId, area: null },
    { rotulo: `DONO de ${criador.slug}`, id: donoId, area: criador },
  ];
  for (const c of contas) {
    if (!(await semSenha(c.id))) {
      console.log(`${c.rotulo}: senha já definida (nenhum link gerado).`);
      continue;
    }
    const link = await gerarLinkDeSenha(c.id, c.area, { id: superAdminId, motivo: "seed: primeiro acesso" });
    console.log(`${c.rotulo}: ${link.url}  (válido até ${link.expiraEm.toISOString()})`);
  }
  console.log("Entregue cada link só ao dono da conta, por canal privado. Rodar de novo invalida os links acima.");
}

principal()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error("Seed falhou:", erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
