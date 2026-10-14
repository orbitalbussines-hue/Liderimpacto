-- ADR-0014: busca full-text em português SEM acento. `unaccent` não é IMMUTABLE (depende do
-- dicionário/search_path), e coluna gerada e índice exigem função imutável: o invólucro fixa o
-- dicionário pelo nome qualificado. Escrito à mão (o drizzle-kit não gera extensão nem função).
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE OR REPLACE FUNCTION li_sem_acento(text) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
	AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;--> statement-breakpoint
CREATE TABLE "criadores_conhecimento_documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"fonte" text NOT NULL,
	"aula_id" uuid,
	"produto_id" uuid,
	"titulo" text NOT NULL,
	"texto" text DEFAULT '' NOT NULL,
	"incluir" boolean DEFAULT true NOT NULL,
	"assinatura" text DEFAULT '' NOT NULL,
	"trechos" integer DEFAULT 0 NOT NULL,
	"indexado_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_conhecimento_documentos_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_conhecimento_documentos_fonte" CHECK (fonte in ('AULA_TRANSCRICAO', 'AULA_DESCRICAO', 'PRODUTO_DESCRICAO', 'TEXTO')),
	CONSTRAINT "ck_criadores_conhecimento_documentos_alvo" CHECK ((fonte in ('AULA_TRANSCRICAO', 'AULA_DESCRICAO') and aula_id is not null and produto_id is null)
        or (fonte = 'PRODUTO_DESCRICAO' and produto_id is not null and aula_id is null)
        or (fonte = 'TEXTO' and aula_id is null)),
	CONSTRAINT "ck_criadores_conhecimento_documentos_titulo" CHECK (length(titulo) between 1 and 160),
	CONSTRAINT "ck_criadores_conhecimento_documentos_texto" CHECK (length(texto) <= 200000),
	CONSTRAINT "ck_criadores_conhecimento_documentos_trechos" CHECK (trechos >= 0)
);
--> statement-breakpoint
CREATE TABLE "criadores_conhecimento_documentos_trechos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"documento_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"texto" text NOT NULL,
	"inicio_seg" integer,
	"busca" "tsvector" GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig, li_sem_acento(texto))) STORED NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_conhecimento_documentos_trechos_texto" CHECK (length(texto) between 1 and 2000),
	CONSTRAINT "ck_criadores_conhecimento_documentos_trechos_inicio" CHECK (inicio_seg is null or inicio_seg >= 0),
	CONSTRAINT "ck_criadores_conhecimento_documentos_trechos_ordem" CHECK (ordem >= 0)
);
--> statement-breakpoint
CREATE TABLE "criadores_assistentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"ligado" boolean DEFAULT false NOT NULL,
	"nome" text DEFAULT 'Assistente do professor' NOT NULL,
	"instrucoes" text DEFAULT '' NOT NULL,
	"limite_diario" integer DEFAULT 20 NOT NULL,
	"todos_os_cursos" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_assistentes_nome" CHECK (length(nome) between 2 and 60),
	CONSTRAINT "ck_criadores_assistentes_instrucoes" CHECK (length(instrucoes) <= 800),
	CONSTRAINT "ck_criadores_assistentes_limite" CHECK (limite_diario between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "criadores_assistentes_conversas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"aula_id" uuid,
	"titulo" text NOT NULL,
	"teste" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_assistentes_conversas_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_assistentes_conversas_titulo" CHECK (length(titulo) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "criadores_assistentes_conversas_mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"conversa_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"papel" text NOT NULL,
	"texto" text NOT NULL,
	"fontes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_saida" integer DEFAULT 0 NOT NULL,
	"tokens_cache_leitura" integer DEFAULT 0 NOT NULL,
	"tokens_cache_escrita" integer DEFAULT 0 NOT NULL,
	"modelo" text,
	"sem_resposta" boolean DEFAULT false NOT NULL,
	"interrompida" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_assistentes_conversas_mensagens_papel" CHECK (papel in ('USUARIO', 'ASSISTENTE')),
	CONSTRAINT "ck_criadores_assistentes_conversas_mensagens_texto" CHECK (length(texto) <= 20000),
	CONSTRAINT "ck_criadores_assistentes_conversas_mensagens_tokens" CHECK (tokens_entrada >= 0 and tokens_saida >= 0 and tokens_cache_leitura >= 0 and tokens_cache_escrita >= 0)
);
--> statement-breakpoint
CREATE TABLE "criadores_assistentes_produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "criadores_conhecimento_documentos" ADD CONSTRAINT "criadores_conhecimento_documentos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_conhecimento_documentos" ADD CONSTRAINT "fk_criadores_conhecimento_documentos_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_conhecimento_documentos" ADD CONSTRAINT "fk_criadores_conhecimento_documentos_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_conhecimento_documentos_trechos" ADD CONSTRAINT "criadores_conhecimento_documentos_trechos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_conhecimento_documentos_trechos" ADD CONSTRAINT "fk_criadores_conhecimento_documentos_trechos_documento" FOREIGN KEY ("documento_id","criador_id") REFERENCES "public"."criadores_conhecimento_documentos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assistentes" ADD CONSTRAINT "criadores_assistentes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assistentes_conversas" ADD CONSTRAINT "criadores_assistentes_conversas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assistentes_conversas" ADD CONSTRAINT "fk_criadores_assistentes_conversas_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assistentes_conversas" ADD CONSTRAINT "fk_criadores_assistentes_conversas_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assistentes_conversas_mensagens" ADD CONSTRAINT "criadores_assistentes_conversas_mensagens_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assistentes_conversas_mensagens" ADD CONSTRAINT "fk_criadores_assistentes_conversas_mensagens_conversa" FOREIGN KEY ("conversa_id","criador_id") REFERENCES "public"."criadores_assistentes_conversas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assistentes_conversas_mensagens" ADD CONSTRAINT "fk_criadores_assistentes_conversas_mensagens_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assistentes_produtos" ADD CONSTRAINT "criadores_assistentes_produtos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assistentes_produtos" ADD CONSTRAINT "fk_criadores_assistentes_produtos_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_conhecimento_documentos_aula_vivo" ON "criadores_conhecimento_documentos" USING btree ("fonte","aula_id") WHERE is_deleted = false and aula_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_conhecimento_documentos_produto_vivo" ON "criadores_conhecimento_documentos" USING btree ("fonte","produto_id") WHERE is_deleted = false and fonte = 'PRODUTO_DESCRICAO';--> statement-breakpoint
CREATE INDEX "ix_criadores_conhecimento_documentos_lista" ON "criadores_conhecimento_documentos" USING btree ("criador_id","fonte") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_conhecimento_documentos_trechos_busca" ON "criadores_conhecimento_documentos_trechos" USING gin ("busca") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_conhecimento_documentos_trechos_documento" ON "criadores_conhecimento_documentos_trechos" USING btree ("documento_id","ordem") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_assistentes_vivo" ON "criadores_assistentes" USING btree ("criador_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_assistentes_conversas_membro" ON "criadores_assistentes_conversas" USING btree ("criador_id","membro_id","updated_at") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_assistentes_conversas_mensagens_conversa" ON "criadores_assistentes_conversas_mensagens" USING btree ("conversa_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_criadores_assistentes_conversas_mensagens_membro_dia" ON "criadores_assistentes_conversas_mensagens" USING btree ("membro_id","created_at") WHERE papel = 'USUARIO';--> statement-breakpoint
CREATE INDEX "ix_criadores_assistentes_conversas_mensagens_criador_dia" ON "criadores_assistentes_conversas_mensagens" USING btree ("criador_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_assistentes_produtos_vivo" ON "criadores_assistentes_produtos" USING btree ("criador_id","produto_id") WHERE is_deleted = false;