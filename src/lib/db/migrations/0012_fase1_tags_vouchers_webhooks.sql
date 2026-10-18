CREATE TABLE "criadores_membros_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criadores_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"cor" text DEFAULT '#c9a227' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_tags_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_tags_nome" CHECK (length(trim(nome)) between 1 and 40),
	CONSTRAINT "ck_criadores_tags_cor" CHECK (cor ~ '^#[0-9a-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "criadores_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"situacao" text DEFAULT 'ATIVO' NOT NULL,
	"valido_ate" timestamp (3) with time zone,
	"limite_usos" integer,
	"limite_por_pessoa" integer DEFAULT 1 NOT NULL,
	"dias_acesso" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_vouchers_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_vouchers_codigo" CHECK (codigo ~ '^[A-HJ-NP-Z2-9]{6,16}$'),
	CONSTRAINT "ck_criadores_vouchers_descricao" CHECK (length(descricao) <= 200),
	CONSTRAINT "ck_criadores_vouchers_situacao" CHECK (situacao in ('ATIVO', 'PAUSADO', 'ENCERRADO')),
	CONSTRAINT "ck_criadores_vouchers_limite_usos" CHECK (limite_usos is null or limite_usos between 1 and 100000),
	CONSTRAINT "ck_criadores_vouchers_limite_por_pessoa" CHECK (limite_por_pessoa between 1 and 100),
	CONSTRAINT "ck_criadores_vouchers_dias_acesso" CHECK (dias_acesso is null or dias_acesso between 1 and 3650)
);
--> statement-breakpoint
CREATE TABLE "criadores_vouchers_produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"voucher_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criadores_vouchers_resgates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"voucher_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"matriculas" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_vouchers_resgates_matriculas" CHECK (jsonb_typeof(matriculas) = 'array' and jsonb_array_length(matriculas) >= 1)
);
--> statement-breakpoint
CREATE TABLE "produtos_modulos_aulas_feedbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"aula_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"util" boolean NOT NULL,
	"comentario" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_modulos_aulas_feedbacks_comentario" CHECK (comentario is null or length(trim(comentario)) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "emails_disparos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid,
	"tipo" text NOT NULL,
	"destinatario_mascarado" text NOT NULL,
	"destinatario_hash" text NOT NULL,
	"assunto" text NOT NULL,
	"situacao" text NOT NULL,
	"erro" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_emails_disparos_tipo" CHECK (tipo in ('DEFINIR_SENHA', 'PRIMEIRO_ACESSO', 'AVISO_SEGURANCA')),
	CONSTRAINT "ck_emails_disparos_situacao" CHECK (situacao in ('ENVIADO', 'FALHOU', 'NAO_CONFIGURADO')),
	CONSTRAINT "ck_emails_disparos_hash" CHECK (destinatario_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ck_emails_disparos_tamanhos" CHECK (length(destinatario_mascarado) <= 120 and length(assunto) <= 300 and (erro is null or length(erro) <= 200))
);
--> statement-breakpoint
CREATE TABLE "criadores_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"url" text NOT NULL,
	"eventos" text[] NOT NULL,
	"situacao" text DEFAULT 'ATIVO' NOT NULL,
	"segredo_cifrado" text NOT NULL,
	"segredo_final" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_webhooks_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_webhooks_nome" CHECK (length(trim(nome)) between 2 and 60),
	CONSTRAINT "ck_criadores_webhooks_url" CHECK (url ~ '^https://[^[:space:]]+$' and length(url) <= 500),
	CONSTRAINT "ck_criadores_webhooks_eventos" CHECK (cardinality(eventos) >= 1 and eventos <@ array['MATRICULA_CRIADA', 'MATRICULA_CANCELADA', 'AULA_CONCLUIDA', 'CURSO_CONCLUIDO', 'CERTIFICADO_EMITIDO', 'AVALIACAO_APROVADA', 'MEMBRO_CADASTRADO']::text[]),
	CONSTRAINT "ck_criadores_webhooks_situacao" CHECK (situacao in ('ATIVO', 'PAUSADO')),
	CONSTRAINT "ck_criadores_webhooks_segredo_final" CHECK (length(segredo_final) = 4)
);
--> statement-breakpoint
CREATE TABLE "criadores_webhooks_entregas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"evento" text NOT NULL,
	"payload" jsonb NOT NULL,
	"situacao" text DEFAULT 'PENDENTE' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"status_http" integer,
	"erro" text,
	"proxima_tentativa_em" timestamp (3) with time zone,
	"entregue_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_webhooks_entregas_evento" CHECK (evento in ('MATRICULA_CRIADA', 'MATRICULA_CANCELADA', 'AULA_CONCLUIDA', 'CURSO_CONCLUIDO', 'CERTIFICADO_EMITIDO', 'AVALIACAO_APROVADA', 'MEMBRO_CADASTRADO')),
	CONSTRAINT "ck_criadores_webhooks_entregas_situacao" CHECK (situacao in ('PENDENTE', 'ENTREGUE', 'FALHOU')),
	CONSTRAINT "ck_criadores_webhooks_entregas_tentativas" CHECK (tentativas >= 0),
	CONSTRAINT "ck_criadores_webhooks_entregas_status" CHECK (status_http is null or status_http between 100 and 599),
	CONSTRAINT "ck_criadores_webhooks_entregas_erro" CHECK (erro is null or length(erro) <= 300)
);
--> statement-breakpoint
CREATE TABLE "produtos_modulos_aulas_sugestoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"aula_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"capitulos" jsonb NOT NULL,
	"perguntas" jsonb NOT NULL,
	"modelo" text NOT NULL,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_saida" integer DEFAULT 0 NOT NULL,
	"tokens_cache_leitura" integer DEFAULT 0 NOT NULL,
	"tokens_cache_escrita" integer DEFAULT 0 NOT NULL,
	"descricao_aplicada_em" timestamp (3) with time zone,
	"capitulos_aplicados_em" timestamp (3) with time zone,
	"perguntas_aplicadas_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_modulos_aulas_sugestoes_descricao" CHECK (length(descricao) <= 4000),
	CONSTRAINT "ck_produtos_modulos_aulas_sugestoes_json" CHECK (jsonb_typeof(capitulos) = 'array' and jsonb_typeof(perguntas) = 'array'),
	CONSTRAINT "ck_produtos_modulos_aulas_sugestoes_tokens" CHECK (tokens_entrada >= 0 and tokens_saida >= 0 and tokens_cache_leitura >= 0 and tokens_cache_escrita >= 0)
);
--> statement-breakpoint
ALTER TABLE "produtos_matriculas" DROP CONSTRAINT "ck_produtos_matriculas_origem";--> statement-breakpoint
ALTER TABLE "criadores_membros_tags" ADD CONSTRAINT "criadores_membros_tags_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_tags" ADD CONSTRAINT "fk_criadores_membros_tags_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_tags" ADD CONSTRAINT "fk_criadores_membros_tags_tag" FOREIGN KEY ("tag_id","criador_id") REFERENCES "public"."criadores_tags"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_tags" ADD CONSTRAINT "criadores_tags_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vouchers" ADD CONSTRAINT "criadores_vouchers_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vouchers_produtos" ADD CONSTRAINT "criadores_vouchers_produtos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vouchers_produtos" ADD CONSTRAINT "fk_criadores_vouchers_produtos_voucher" FOREIGN KEY ("voucher_id","criador_id") REFERENCES "public"."criadores_vouchers"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vouchers_produtos" ADD CONSTRAINT "fk_criadores_vouchers_produtos_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vouchers_resgates" ADD CONSTRAINT "criadores_vouchers_resgates_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vouchers_resgates" ADD CONSTRAINT "fk_criadores_vouchers_resgates_voucher" FOREIGN KEY ("voucher_id","criador_id") REFERENCES "public"."criadores_vouchers"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vouchers_resgates" ADD CONSTRAINT "fk_criadores_vouchers_resgates_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_feedbacks" ADD CONSTRAINT "produtos_modulos_aulas_feedbacks_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_feedbacks" ADD CONSTRAINT "fk_produtos_modulos_aulas_feedbacks_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_feedbacks" ADD CONSTRAINT "fk_produtos_modulos_aulas_feedbacks_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "emails_disparos" ADD CONSTRAINT "emails_disparos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_webhooks" ADD CONSTRAINT "criadores_webhooks_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_webhooks_entregas" ADD CONSTRAINT "criadores_webhooks_entregas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_webhooks_entregas" ADD CONSTRAINT "fk_criadores_webhooks_entregas_webhook" FOREIGN KEY ("webhook_id","criador_id") REFERENCES "public"."criadores_webhooks"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_sugestoes" ADD CONSTRAINT "produtos_modulos_aulas_sugestoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_sugestoes" ADD CONSTRAINT "fk_produtos_modulos_aulas_sugestoes_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_membros_tags_vivo" ON "criadores_membros_tags" USING btree ("membro_id","tag_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_membros_tags_tag" ON "criadores_membros_tags" USING btree ("tag_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_tags_nome_vivo" ON "criadores_tags" USING btree ("criador_id",lower("nome")) WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_vouchers_codigo_vivo" ON "criadores_vouchers" USING btree ("criador_id","codigo") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_vouchers_produtos_vivo" ON "criadores_vouchers_produtos" USING btree ("voucher_id","produto_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_vouchers_resgates_voucher" ON "criadores_vouchers_resgates" USING btree ("voucher_id","created_at") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_vouchers_resgates_membro" ON "criadores_vouchers_resgates" USING btree ("membro_id","voucher_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_modulos_aulas_feedbacks_vivo" ON "produtos_modulos_aulas_feedbacks" USING btree ("membro_id","aula_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_feedbacks_criador" ON "produtos_modulos_aulas_feedbacks" USING btree ("criador_id","updated_at") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_feedbacks_aula" ON "produtos_modulos_aulas_feedbacks" USING btree ("aula_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_emails_disparos_criador" ON "emails_disparos" USING btree ("criador_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_emails_disparos_destinatario" ON "emails_disparos" USING btree ("destinatario_hash");--> statement-breakpoint
CREATE INDEX "ix_criadores_webhooks_criador" ON "criadores_webhooks" USING btree ("criador_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_webhooks_entregas_webhook" ON "criadores_webhooks_entregas" USING btree ("webhook_id","created_at") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_webhooks_entregas_pendentes" ON "criadores_webhooks_entregas" USING btree ("created_at") WHERE situacao = 'PENDENTE' and is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_sugestoes_aula" ON "produtos_modulos_aulas_sugestoes" USING btree ("aula_id","created_at") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_sugestoes_criador_dia" ON "produtos_modulos_aulas_sugestoes" USING btree ("criador_id","created_at");--> statement-breakpoint
ALTER TABLE "produtos_matriculas" ADD CONSTRAINT "ck_produtos_matriculas_origem" CHECK (origem in ('MANUAL', 'IMPORTACAO', 'COMPRA', 'VOUCHER'));