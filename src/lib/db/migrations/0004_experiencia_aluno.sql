CREATE TABLE "produtos_modulos_aulas_anotacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"aula_id" uuid NOT NULL,
	"tempo_seg" integer NOT NULL,
	"texto" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_modulos_aulas_anotacoes_tempo" CHECK (tempo_seg >= 0),
	CONSTRAINT "ck_produtos_modulos_aulas_anotacoes_texto" CHECK (length(trim(texto)) between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "produtos_modulos_aulas_progressos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"aula_id" uuid NOT NULL,
	"segundos_bitmap" bit varying NOT NULL,
	"segundos_assistidos" integer DEFAULT 0 NOT NULL,
	"max_posicao_seg" integer DEFAULT 0 NOT NULL,
	"ultima_posicao_seg" integer DEFAULT 0 NOT NULL,
	"percentual" smallint DEFAULT 0 NOT NULL,
	"concluida" boolean DEFAULT false NOT NULL,
	"concluida_em" timestamp (3) with time zone,
	"concluida_por" text,
	"ultima_visualizacao_dia" date,
	"visualizacao_nova" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_modulos_aulas_progressos_bitmap" CHECK (length(segundos_bitmap) <= 43200),
	CONSTRAINT "ck_produtos_modulos_aulas_progressos_numeros" CHECK (segundos_assistidos >= 0 and max_posicao_seg >= 0 and ultima_posicao_seg >= 0 and percentual between 0 and 100),
	CONSTRAINT "ck_produtos_modulos_aulas_progressos_conclusao" CHECK ((concluida and concluida_em is not null and concluida_por is not null) or (not concluida and concluida_em is null and concluida_por is null)),
	CONSTRAINT "ck_produtos_modulos_aulas_progressos_concluida_por" CHECK (concluida_por is null or concluida_por in ('ASSISTIU', 'MANUAL'))
);
--> statement-breakpoint
CREATE TABLE "produtos_modulos_aulas_visualizacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"aula_id" uuid NOT NULL,
	"dia" date NOT NULL,
	"visualizacoes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_modulos_aulas_visualizacoes_numero" CHECK (visualizacoes >= 0)
);
--> statement-breakpoint
CREATE TABLE "criadores_membros_favoritos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"produto_id" uuid,
	"aula_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_membros_favoritos_alvo" CHECK (num_nonnulls(produto_id, aula_id) = 1)
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "reproducao_automatica" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "lembretes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "publicado_em" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_anotacoes" ADD CONSTRAINT "produtos_modulos_aulas_anotacoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_anotacoes" ADD CONSTRAINT "fk_produtos_modulos_aulas_anotacoes_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_anotacoes" ADD CONSTRAINT "fk_produtos_modulos_aulas_anotacoes_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_progressos" ADD CONSTRAINT "produtos_modulos_aulas_progressos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_progressos" ADD CONSTRAINT "fk_produtos_modulos_aulas_progressos_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_progressos" ADD CONSTRAINT "fk_produtos_modulos_aulas_progressos_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_visualizacoes" ADD CONSTRAINT "produtos_modulos_aulas_visualizacoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_visualizacoes" ADD CONSTRAINT "fk_produtos_modulos_aulas_visualizacoes_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_favoritos" ADD CONSTRAINT "criadores_membros_favoritos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_favoritos" ADD CONSTRAINT "fk_criadores_membros_favoritos_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_favoritos" ADD CONSTRAINT "fk_criadores_membros_favoritos_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_favoritos" ADD CONSTRAINT "fk_criadores_membros_favoritos_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_anotacoes_membro_aula" ON "produtos_modulos_aulas_anotacoes" USING btree ("membro_id","aula_id","tempo_seg") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_modulos_aulas_progressos_vivo" ON "produtos_modulos_aulas_progressos" USING btree ("membro_id","aula_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_progressos_recentes" ON "produtos_modulos_aulas_progressos" USING btree ("membro_id","updated_at" DESC NULLS LAST) WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_modulos_aulas_visualizacoes_dia_vivo" ON "produtos_modulos_aulas_visualizacoes" USING btree ("aula_id","dia") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_visualizacoes_criador_dia" ON "produtos_modulos_aulas_visualizacoes" USING btree ("criador_id","dia") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_membros_favoritos_produto_vivo" ON "criadores_membros_favoritos" USING btree ("membro_id","produto_id") WHERE is_deleted = false and produto_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_membros_favoritos_aula_vivo" ON "criadores_membros_favoritos" USING btree ("membro_id","aula_id") WHERE is_deleted = false and aula_id is not null;--> statement-breakpoint
CREATE INDEX "ix_criadores_membros_favoritos_membro" ON "criadores_membros_favoritos" USING btree ("membro_id","updated_at" DESC NULLS LAST) WHERE is_deleted = false;--> statement-breakpoint
-- Backfill (escrito a mao): produto ja fora de rascunho conta como publicado na ultima alteracao.
UPDATE "produtos" SET "publicado_em" = "updated_at" WHERE "status" <> 'RASCUNHO' AND "publicado_em" IS NULL;
