CREATE TABLE "arquivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"finalidade" text NOT NULL,
	"nome_original" text NOT NULL,
	"mime" text NOT NULL,
	"tamanho_bytes" bigint NOT NULL,
	"status" text DEFAULT 'ENVIADO_PENDENTE' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_arquivos_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_arquivos_chave" CHECK (chave like 'criadores/' || criador_id::text || '/%'),
	CONSTRAINT "ck_arquivos_tamanho" CHECK (tamanho_bytes > 0),
	CONSTRAINT "ck_arquivos_finalidade" CHECK (finalidade in ('IMAGEM', 'MATERIAL')),
	CONSTRAINT "ck_arquivos_status" CHECK (status in ('ENVIADO_PENDENTE', 'DISPONIVEL'))
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"codigo" integer NOT NULL,
	"titulo" text NOT NULL,
	"slug" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"tipo" text DEFAULT 'CURSO' NOT NULL,
	"capa_3x4_arquivo_id" uuid,
	"capa_16x9_arquivo_id" uuid,
	"status" text DEFAULT 'RASCUNHO' NOT NULL,
	"professor_membro_id" uuid,
	"cor_marca" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_produtos_criador_codigo" UNIQUE("criador_id","codigo"),
	CONSTRAINT "uq_produtos_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_produtos_codigo" CHECK (codigo >= 1),
	CONSTRAINT "ck_produtos_slug" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
	CONSTRAINT "ck_produtos_cor_marca" CHECK (cor_marca is null or cor_marca ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'),
	CONSTRAINT "ck_produtos_tipo" CHECK (tipo in ('CURSO', 'MENTORIA', 'EVENTO')),
	CONSTRAINT "ck_produtos_status" CHECK (status in ('RASCUNHO', 'PUBLICADO', 'NAO_LISTADO'))
);
--> statement-breakpoint
CREATE TABLE "produtos_modulos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"titulo" text NOT NULL,
	"status" text DEFAULT 'PUBLICADO' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_produtos_modulos_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_produtos_modulos_ordem" CHECK (ordem >= 1),
	CONSTRAINT "ck_produtos_modulos_status" CHECK (status in ('PUBLICADO', 'RASCUNHO'))
);
--> statement-breakpoint
CREATE TABLE "produtos_modulos_aulas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"modulo_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"duracao_seg" integer,
	"thumb_arquivo_id" uuid,
	"capitulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"libera_em" timestamp (3) with time zone,
	"pre_requisito_aula_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_produtos_modulos_aulas_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_produtos_modulos_aulas_ordem" CHECK (ordem >= 1),
	CONSTRAINT "ck_produtos_modulos_aulas_duracao" CHECK (duracao_seg is null or duracao_seg >= 0),
	CONSTRAINT "ck_produtos_modulos_aulas_pre_requisito" CHECK (pre_requisito_aula_id is null or pre_requisito_aula_id <> id),
	CONSTRAINT "ck_produtos_modulos_aulas_capitulos" CHECK (jsonb_typeof(capitulos) = 'array')
);
--> statement-breakpoint
CREATE TABLE "produtos_modulos_aulas_materiais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"aula_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"arquivo_id" uuid,
	"url" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_modulos_aulas_materiais_origem" CHECK ((tipo = 'LINK' and url is not null and arquivo_id is null) or (tipo <> 'LINK' and arquivo_id is not null and url is null)),
	CONSTRAINT "ck_produtos_modulos_aulas_materiais_url" CHECK (url is null or url ~ '^https://'),
	CONSTRAINT "ck_produtos_modulos_aulas_materiais_tipo" CHECK (tipo in ('PDF', 'DOC', 'LINK'))
);
--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "fk_produtos_capa_3x4" FOREIGN KEY ("capa_3x4_arquivo_id","criador_id") REFERENCES "public"."arquivos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "fk_produtos_capa_16x9" FOREIGN KEY ("capa_16x9_arquivo_id","criador_id") REFERENCES "public"."arquivos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "fk_produtos_professor" FOREIGN KEY ("professor_membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos" ADD CONSTRAINT "produtos_modulos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos" ADD CONSTRAINT "fk_produtos_modulos_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas" ADD CONSTRAINT "produtos_modulos_aulas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas" ADD CONSTRAINT "fk_produtos_modulos_aulas_modulo" FOREIGN KEY ("modulo_id","criador_id") REFERENCES "public"."produtos_modulos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas" ADD CONSTRAINT "fk_produtos_modulos_aulas_thumb" FOREIGN KEY ("thumb_arquivo_id","criador_id") REFERENCES "public"."arquivos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas" ADD CONSTRAINT "fk_produtos_modulos_aulas_pre_requisito" FOREIGN KEY ("pre_requisito_aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_materiais" ADD CONSTRAINT "produtos_modulos_aulas_materiais_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_materiais" ADD CONSTRAINT "fk_produtos_modulos_aulas_materiais_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_materiais" ADD CONSTRAINT "fk_produtos_modulos_aulas_materiais_arquivo" FOREIGN KEY ("arquivo_id","criador_id") REFERENCES "public"."arquivos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_arquivos_chave" ON "arquivos" USING btree ("chave");--> statement-breakpoint
CREATE INDEX "ix_arquivos_criador_status" ON "arquivos" USING btree ("criador_id","status") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_slug_vivo" ON "produtos" USING btree ("criador_id","slug") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_criador_atualizado" ON "produtos" USING btree ("criador_id","updated_at") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_modulos_ordem_vivo" ON "produtos_modulos" USING btree ("produto_id","ordem") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_modulos_aulas_ordem_vivo" ON "produtos_modulos_aulas" USING btree ("modulo_id","ordem") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_pre_requisito" ON "produtos_modulos_aulas" USING btree ("pre_requisito_aula_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_materiais_aula" ON "produtos_modulos_aulas_materiais" USING btree ("aula_id") WHERE is_deleted = false;