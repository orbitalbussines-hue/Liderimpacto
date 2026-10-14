CREATE TABLE "criadores_canais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"ordem" integer DEFAULT 1 NOT NULL,
	"acesso" text DEFAULT 'TODOS' NOT NULL,
	"grupo_id" uuid,
	"produto_id" uuid,
	"quem_posta" text DEFAULT 'TODOS' NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_canais_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_canais_acesso" CHECK (acesso in ('TODOS', 'GRUPO', 'PRODUTO', 'EQUIPE')),
	CONSTRAINT "ck_criadores_canais_quem_posta" CHECK (quem_posta in ('TODOS', 'EQUIPE')),
	CONSTRAINT "ck_criadores_canais_alvo" CHECK ((acesso = 'GRUPO') = (grupo_id is not null) and (acesso = 'PRODUTO') = (produto_id is not null)),
	CONSTRAINT "ck_criadores_canais_padrao" CHECK (not padrao or acesso = 'TODOS'),
	CONSTRAINT "ck_criadores_canais_nome" CHECK (char_length(trim(nome)) between 2 and 60),
	CONSTRAINT "ck_criadores_canais_descricao" CHECK (char_length(descricao) <= 280),
	CONSTRAINT "ck_criadores_canais_ordem" CHECK (ordem >= 1)
);
--> statement-breakpoint
CREATE TABLE "criadores_canais_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"autor_membro_id" uuid NOT NULL,
	"aula_id" uuid,
	"texto" text NOT NULL,
	"enquete_pergunta" text,
	"enquete_opcoes" jsonb,
	"enquete_encerra_em" timestamp (3) with time zone,
	"fixado_em" timestamp (3) with time zone,
	"oculto_em" timestamp (3) with time zone,
	"motivo_ocultacao" text,
	"editado_em" timestamp (3) with time zone,
	"curtidas" integer DEFAULT 0 NOT NULL,
	"comentarios" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_canais_posts_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_canais_posts_texto" CHECK (char_length(texto) between 1 and 5000),
	CONSTRAINT "ck_criadores_canais_posts_enquete" CHECK ((enquete_pergunta is null and enquete_opcoes is null and enquete_encerra_em is null)
        or (enquete_pergunta is not null and jsonb_typeof(enquete_opcoes) = 'array' and jsonb_array_length(enquete_opcoes) between 2 and 6)),
	CONSTRAINT "ck_criadores_canais_posts_ocultacao" CHECK (oculto_em is null or char_length(trim(motivo_ocultacao)) >= 3),
	CONSTRAINT "ck_criadores_canais_posts_contadores" CHECK (curtidas >= 0 and comentarios >= 0)
);
--> statement-breakpoint
CREATE TABLE "criadores_canais_posts_anexos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_canais_posts_anexos_ordem" CHECK (ordem between 1 and 6)
);
--> statement-breakpoint
CREATE TABLE "criadores_canais_posts_votos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"opcao" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_canais_posts_votos_opcao" CHECK (opcao between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "criadores_comentarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"post_id" uuid,
	"aula_id" uuid,
	"pai_id" uuid,
	"autor_membro_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"oculto_em" timestamp (3) with time zone,
	"motivo_ocultacao" text,
	"editado_em" timestamp (3) with time zone,
	"curtidas" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_comentarios_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_comentarios_alvo" CHECK (num_nonnulls(post_id, aula_id) = 1),
	CONSTRAINT "ck_criadores_comentarios_pai" CHECK (pai_id is null or pai_id <> id),
	CONSTRAINT "ck_criadores_comentarios_texto" CHECK (char_length(texto) between 1 and 2000),
	CONSTRAINT "ck_criadores_comentarios_ocultacao" CHECK (oculto_em is null or char_length(trim(motivo_ocultacao)) >= 3),
	CONSTRAINT "ck_criadores_comentarios_curtidas" CHECK (curtidas >= 0)
);
--> statement-breakpoint
CREATE TABLE "criadores_curtidas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"post_id" uuid,
	"comentario_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_curtidas_alvo" CHECK (num_nonnulls(post_id, comentario_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "criadores_denuncias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"denunciante_membro_id" uuid NOT NULL,
	"post_id" uuid,
	"comentario_id" uuid,
	"motivo" text NOT NULL,
	"situacao" text DEFAULT 'ABERTA' NOT NULL,
	"resolvida_em" timestamp (3) with time zone,
	"decisao" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_denuncias_alvo" CHECK (num_nonnulls(post_id, comentario_id) = 1),
	CONSTRAINT "ck_criadores_denuncias_motivo" CHECK (char_length(trim(motivo)) between 3 and 500),
	CONSTRAINT "ck_criadores_denuncias_situacao" CHECK (situacao in ('ABERTA', 'RESOLVIDA', 'DESCARTADA')),
	CONSTRAINT "ck_criadores_denuncias_resolucao" CHECK ((situacao = 'ABERTA') = (resolvida_em is null))
);
--> statement-breakpoint
CREATE TABLE "criadores_membros_notificacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"chave" text,
	"atores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total" integer DEFAULT 1 NOT NULL,
	"evento_em" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"lida_em" timestamp (3) with time zone,
	"arquivada_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_membros_notificacoes_tipo" CHECK (tipo in ('COMENTARIO_NO_POST', 'RESPOSTA_AO_COMENTARIO', 'CURTIDAS_NO_POST', 'POST_FIXADO', 'AVISO', 'AULA_NOVA', 'CERTIFICADO_EMITIDO', 'MATRICULA_NOVA', 'DENUNCIA_NOVA')),
	CONSTRAINT "ck_criadores_membros_notificacoes_total" CHECK (total >= 1)
);
--> statement-breakpoint
CREATE TABLE "criadores_membros_silenciamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"ate" timestamp (3) with time zone NOT NULL,
	"motivo" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_membros_silenciamentos_motivo" CHECK (char_length(trim(motivo)) between 3 and 500)
);
--> statement-breakpoint
ALTER TABLE "arquivos" DROP CONSTRAINT "ck_arquivos_finalidade";--> statement-breakpoint
ALTER TABLE "criadores_canais" ADD CONSTRAINT "criadores_canais_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais" ADD CONSTRAINT "fk_criadores_canais_grupo" FOREIGN KEY ("grupo_id","criador_id") REFERENCES "public"."criadores_grupos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais" ADD CONSTRAINT "fk_criadores_canais_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais_posts" ADD CONSTRAINT "criadores_canais_posts_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais_posts" ADD CONSTRAINT "fk_criadores_canais_posts_canal" FOREIGN KEY ("canal_id","criador_id") REFERENCES "public"."criadores_canais"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais_posts" ADD CONSTRAINT "fk_criadores_canais_posts_autor" FOREIGN KEY ("autor_membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais_posts" ADD CONSTRAINT "fk_criadores_canais_posts_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais_posts_anexos" ADD CONSTRAINT "criadores_canais_posts_anexos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais_posts_anexos" ADD CONSTRAINT "fk_criadores_canais_posts_anexos_post" FOREIGN KEY ("post_id","criador_id") REFERENCES "public"."criadores_canais_posts"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais_posts_anexos" ADD CONSTRAINT "fk_criadores_canais_posts_anexos_arquivo" FOREIGN KEY ("arquivo_id","criador_id") REFERENCES "public"."arquivos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais_posts_votos" ADD CONSTRAINT "criadores_canais_posts_votos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais_posts_votos" ADD CONSTRAINT "fk_criadores_canais_posts_votos_post" FOREIGN KEY ("post_id","criador_id") REFERENCES "public"."criadores_canais_posts"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_canais_posts_votos" ADD CONSTRAINT "fk_criadores_canais_posts_votos_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_comentarios" ADD CONSTRAINT "criadores_comentarios_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_comentarios" ADD CONSTRAINT "fk_criadores_comentarios_post" FOREIGN KEY ("post_id","criador_id") REFERENCES "public"."criadores_canais_posts"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_comentarios" ADD CONSTRAINT "fk_criadores_comentarios_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_comentarios" ADD CONSTRAINT "fk_criadores_comentarios_pai" FOREIGN KEY ("pai_id","criador_id") REFERENCES "public"."criadores_comentarios"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_comentarios" ADD CONSTRAINT "fk_criadores_comentarios_autor" FOREIGN KEY ("autor_membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_curtidas" ADD CONSTRAINT "criadores_curtidas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_curtidas" ADD CONSTRAINT "fk_criadores_curtidas_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_curtidas" ADD CONSTRAINT "fk_criadores_curtidas_post" FOREIGN KEY ("post_id","criador_id") REFERENCES "public"."criadores_canais_posts"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_curtidas" ADD CONSTRAINT "fk_criadores_curtidas_comentario" FOREIGN KEY ("comentario_id","criador_id") REFERENCES "public"."criadores_comentarios"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_denuncias" ADD CONSTRAINT "criadores_denuncias_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_denuncias" ADD CONSTRAINT "fk_criadores_denuncias_denunciante" FOREIGN KEY ("denunciante_membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_denuncias" ADD CONSTRAINT "fk_criadores_denuncias_post" FOREIGN KEY ("post_id","criador_id") REFERENCES "public"."criadores_canais_posts"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_denuncias" ADD CONSTRAINT "fk_criadores_denuncias_comentario" FOREIGN KEY ("comentario_id","criador_id") REFERENCES "public"."criadores_comentarios"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_notificacoes" ADD CONSTRAINT "criadores_membros_notificacoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_notificacoes" ADD CONSTRAINT "fk_criadores_membros_notificacoes_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_silenciamentos" ADD CONSTRAINT "criadores_membros_silenciamentos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_silenciamentos" ADD CONSTRAINT "fk_criadores_membros_silenciamentos_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_canais_padrao_vivo" ON "criadores_canais" USING btree ("criador_id") WHERE is_deleted = false and padrao;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_canais_nome_vivo" ON "criadores_canais" USING btree ("criador_id",lower("nome")) WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_canais_posts_canal_recentes" ON "criadores_canais_posts" USING btree ("canal_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_canais_posts_canal_curtidos" ON "criadores_canais_posts" USING btree ("canal_id","curtidas" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_canais_posts_criador_recentes" ON "criadores_canais_posts" USING btree ("criador_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_canais_posts_autor" ON "criadores_canais_posts" USING btree ("autor_membro_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_criadores_canais_posts_fixados" ON "criadores_canais_posts" USING btree ("criador_id","fixado_em" DESC NULLS LAST) WHERE is_deleted = false and fixado_em is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_canais_posts_anexos_arquivo_vivo" ON "criadores_canais_posts_anexos" USING btree ("arquivo_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_canais_posts_anexos_post" ON "criadores_canais_posts_anexos" USING btree ("post_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_canais_posts_votos_vivo" ON "criadores_canais_posts_votos" USING btree ("post_id","membro_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_comentarios_post" ON "criadores_comentarios" USING btree ("post_id","created_at") WHERE is_deleted = false and post_id is not null;--> statement-breakpoint
CREATE INDEX "ix_criadores_comentarios_aula" ON "criadores_comentarios" USING btree ("aula_id","created_at") WHERE is_deleted = false and aula_id is not null;--> statement-breakpoint
CREATE INDEX "ix_criadores_comentarios_autor" ON "criadores_comentarios" USING btree ("autor_membro_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_curtidas_post" ON "criadores_curtidas" USING btree ("membro_id","post_id") WHERE post_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_curtidas_comentario" ON "criadores_curtidas" USING btree ("membro_id","comentario_id") WHERE comentario_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_denuncias_post_vivo" ON "criadores_denuncias" USING btree ("denunciante_membro_id","post_id") WHERE is_deleted = false and post_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_denuncias_comentario_vivo" ON "criadores_denuncias" USING btree ("denunciante_membro_id","comentario_id") WHERE is_deleted = false and comentario_id is not null;--> statement-breakpoint
CREATE INDEX "ix_criadores_denuncias_fila" ON "criadores_denuncias" USING btree ("criador_id","situacao","created_at" DESC NULLS LAST) WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_membros_notificacoes_chave" ON "criadores_membros_notificacoes" USING btree ("membro_id","chave") WHERE chave is not null;--> statement-breakpoint
CREATE INDEX "ix_criadores_membros_notificacoes_lista" ON "criadores_membros_notificacoes" USING btree ("membro_id","evento_em" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE is_deleted = false and arquivada_em is null;--> statement-breakpoint
CREATE INDEX "ix_criadores_membros_notificacoes_nao_lidas" ON "criadores_membros_notificacoes" USING btree ("membro_id","evento_em") WHERE is_deleted = false and arquivada_em is null and lida_em is null;--> statement-breakpoint
CREATE INDEX "ix_criadores_membros_notificacoes_retencao" ON "criadores_membros_notificacoes" USING btree ("evento_em") WHERE arquivada_em is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_membros_silenciamentos_vivo" ON "criadores_membros_silenciamentos" USING btree ("membro_id") WHERE is_deleted = false;--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "ck_arquivos_finalidade" CHECK (finalidade in ('IMAGEM', 'MATERIAL', 'COMUNIDADE_IMAGEM', 'COMUNIDADE_PDF', 'CERTIFICADO'));--> statement-breakpoint
-- Canal "Geral" (padrão, de todos os membros) para cada criador que já existe (RN-130). O mesmo
-- canal nasce com o criador novo (garantirCanalGeral). Idempotente pelo índice único parcial.
INSERT INTO "criadores_canais" ("criador_id", "nome", "descricao", "ordem", "padrao", "modified_by")
SELECT c."id", 'Geral', 'Conversas gerais da comunidade', 1, true, c."modified_by" FROM "criadores" c WHERE c."is_deleted" = false
ON CONFLICT DO NOTHING;
