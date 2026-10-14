-- Passo 7 (ADR-0008): avaliacoes, certificados (modelos, emissao, versoes do PDF) e trilhas.
-- Revisado a mao: a UNIQUE (id, produto_id, criador_id) de produtos_modulos sobe para ANTES da FK
-- composta de produtos_avaliacoes que a usa; o CHECK de arquivos.finalidade ganha CERTIFICADO.
CREATE TABLE "produtos_avaliacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"modulo_id" uuid,
	"tipo" text DEFAULT 'QUIZ' NOT NULL,
	"titulo" text NOT NULL,
	"instrucoes" text DEFAULT '' NOT NULL,
	"nota_minima" smallint DEFAULT 70 NOT NULL,
	"tentativas_max" smallint DEFAULT 3 NOT NULL,
	"tempo_limite_min" smallint,
	"obrigatoria_para_certificado" boolean DEFAULT false NOT NULL,
	"libera_proximo_modulo" boolean DEFAULT false NOT NULL,
	"embaralhar" boolean DEFAULT false NOT NULL,
	"exige_aulas_concluidas" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'RASCUNHO' NOT NULL,
	"publicada_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_produtos_avaliacoes_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_produtos_avaliacoes_nota_minima" CHECK (nota_minima between 0 and 100),
	CONSTRAINT "ck_produtos_avaliacoes_tentativas" CHECK (tentativas_max between 0 and 50),
	CONSTRAINT "ck_produtos_avaliacoes_tempo" CHECK (tempo_limite_min is null or tempo_limite_min between 1 and 600),
	CONSTRAINT "ck_produtos_avaliacoes_libera" CHECK (not libera_proximo_modulo or modulo_id is not null),
	CONSTRAINT "ck_produtos_avaliacoes_tipo" CHECK (tipo in ('QUIZ', 'PROVA', 'SIMULADO')),
	CONSTRAINT "ck_produtos_avaliacoes_status" CHECK (status in ('RASCUNHO', 'PUBLICADA'))
);
--> statement-breakpoint
CREATE TABLE "produtos_avaliacoes_concessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"quantidade" smallint DEFAULT 1 NOT NULL,
	"motivo" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_avaliacoes_concessoes_quantidade" CHECK (quantidade between 1 and 10),
	CONSTRAINT "ck_produtos_avaliacoes_concessoes_motivo" CHECK (length(trim(motivo)) between 3 and 500)
);
--> statement-breakpoint
CREATE TABLE "produtos_avaliacoes_questoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"tipo" text NOT NULL,
	"enunciado" text NOT NULL,
	"opcoes" jsonb NOT NULL,
	"gabarito" jsonb NOT NULL,
	"peso" smallint DEFAULT 1 NOT NULL,
	"explicacao" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_avaliacoes_questoes_ordem" CHECK (ordem >= 1),
	CONSTRAINT "ck_produtos_avaliacoes_questoes_peso" CHECK (peso between 1 and 100),
	CONSTRAINT "ck_produtos_avaliacoes_questoes_opcoes" CHECK (jsonb_typeof(opcoes) = 'array' and jsonb_array_length(opcoes) between 2 and 8),
	CONSTRAINT "ck_produtos_avaliacoes_questoes_gabarito" CHECK (jsonb_typeof(gabarito) = 'array' and jsonb_array_length(gabarito) >= 1),
	CONSTRAINT "ck_produtos_avaliacoes_questoes_tipo" CHECK (tipo in ('UNICA', 'MULTIPLA', 'VERDADEIRO_FALSO'))
);
--> statement-breakpoint
CREATE TABLE "produtos_avaliacoes_tentativas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"avaliacao_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"iniciada_em" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"prazo_em" timestamp (3) with time zone,
	"finalizada_em" timestamp (3) with time zone,
	"finalizada_por" text,
	"ordem" jsonb NOT NULL,
	"respostas" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"nota" numeric(4, 1),
	"aprovada" boolean,
	"correcao" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_avaliacoes_tentativas_numero" CHECK (numero >= 1),
	CONSTRAINT "ck_produtos_avaliacoes_tentativas_nota" CHECK (nota is null or nota between 0 and 100),
	CONSTRAINT "ck_produtos_avaliacoes_tentativas_fim" CHECK ((finalizada_em is null and finalizada_por is null and nota is null and aprovada is null and correcao is null)
        or (finalizada_em is not null and finalizada_por is not null and nota is not null and aprovada is not null and correcao is not null)),
	CONSTRAINT "ck_produtos_avaliacoes_tentativas_finalizada_por" CHECK (finalizada_por is null or finalizada_por in ('ALUNO', 'TEMPO')),
	CONSTRAINT "ck_produtos_avaliacoes_tentativas_respostas" CHECK (jsonb_typeof(respostas) = 'object')
);
--> statement-breakpoint
CREATE TABLE "criadores_certificados_modelos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"produto_id" uuid,
	"titulo" text NOT NULL,
	"texto" text NOT NULL,
	"assinatura_nome" text NOT NULL,
	"assinatura_cargo" text DEFAULT '' NOT NULL,
	"cor" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_certificados_modelos_cor" CHECK (cor is null or cor ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'),
	CONSTRAINT "ck_criadores_certificados_modelos_texto" CHECK (length(trim(texto)) between 10 and 600)
);
--> statement-breakpoint
CREATE TABLE "produtos_certificados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"matricula_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"situacao" text DEFAULT 'EMITIDO' NOT NULL,
	"emitido_em" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"revogado_em" timestamp (3) with time zone,
	"motivo_revogacao" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_produtos_certificados_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_produtos_certificados_codigo" CHECK (codigo ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$'),
	CONSTRAINT "ck_produtos_certificados_situacao" CHECK (situacao in ('EMITIDO', 'REVOGADO')),
	CONSTRAINT "ck_produtos_certificados_revogacao" CHECK ((situacao = 'EMITIDO' and revogado_em is null) or (situacao = 'REVOGADO' and revogado_em is not null and length(trim(motivo_revogacao)) >= 3))
);
--> statement-breakpoint
CREATE TABLE "produtos_certificados_versoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"certificado_id" uuid NOT NULL,
	"versao" integer NOT NULL,
	"situacao" text DEFAULT 'PENDENTE' NOT NULL,
	"dados" jsonb NOT NULL,
	"arquivo_id" uuid,
	"gerada_em" timestamp (3) with time zone,
	"erro" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_certificados_versoes_numero" CHECK (versao >= 1),
	CONSTRAINT "ck_produtos_certificados_versoes_pronta" CHECK (situacao <> 'PRONTA' or (arquivo_id is not null and gerada_em is not null)),
	CONSTRAINT "ck_produtos_certificados_versoes_situacao" CHECK (situacao in ('PENDENTE', 'PRONTA', 'FALHOU'))
);
--> statement-breakpoint
CREATE TABLE "criadores_trilhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"tag" text DEFAULT '' NOT NULL,
	"capa_arquivo_id" uuid,
	"status" text DEFAULT 'RASCUNHO' NOT NULL,
	"publicada_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_trilhas_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_trilhas_status" CHECK (status in ('RASCUNHO', 'PUBLICADA'))
);
--> statement-breakpoint
CREATE TABLE "criadores_trilhas_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"trilha_id" uuid NOT NULL,
	"ordem" integer NOT NULL,
	"tipo" text NOT NULL,
	"produto_id" uuid,
	"avaliacao_id" uuid,
	"exige_anterior" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_trilhas_itens_ordem" CHECK (ordem >= 1),
	CONSTRAINT "ck_criadores_trilhas_itens_alvo" CHECK ((tipo = 'PRODUTO' and produto_id is not null and avaliacao_id is null) or (tipo = 'AVALIACAO' and avaliacao_id is not null and produto_id is null)),
	CONSTRAINT "ck_criadores_trilhas_itens_tipo" CHECK (tipo in ('PRODUTO', 'AVALIACAO'))
);
--> statement-breakpoint
ALTER TABLE "arquivos" DROP CONSTRAINT "ck_arquivos_finalidade";--> statement-breakpoint
ALTER TABLE "produtos_modulos" ADD CONSTRAINT "uq_produtos_modulos_id_produto_criador" UNIQUE("id","produto_id","criador_id");--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes" ADD CONSTRAINT "produtos_avaliacoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes" ADD CONSTRAINT "fk_produtos_avaliacoes_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes" ADD CONSTRAINT "fk_produtos_avaliacoes_modulo" FOREIGN KEY ("modulo_id","produto_id","criador_id") REFERENCES "public"."produtos_modulos"("id","produto_id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes_concessoes" ADD CONSTRAINT "produtos_avaliacoes_concessoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes_concessoes" ADD CONSTRAINT "fk_produtos_avaliacoes_concessoes_avaliacao" FOREIGN KEY ("avaliacao_id","criador_id") REFERENCES "public"."produtos_avaliacoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes_concessoes" ADD CONSTRAINT "fk_produtos_avaliacoes_concessoes_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes_questoes" ADD CONSTRAINT "produtos_avaliacoes_questoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes_questoes" ADD CONSTRAINT "fk_produtos_avaliacoes_questoes_avaliacao" FOREIGN KEY ("avaliacao_id","criador_id") REFERENCES "public"."produtos_avaliacoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes_tentativas" ADD CONSTRAINT "produtos_avaliacoes_tentativas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes_tentativas" ADD CONSTRAINT "fk_produtos_avaliacoes_tentativas_avaliacao" FOREIGN KEY ("avaliacao_id","criador_id") REFERENCES "public"."produtos_avaliacoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_avaliacoes_tentativas" ADD CONSTRAINT "fk_produtos_avaliacoes_tentativas_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_certificados_modelos" ADD CONSTRAINT "criadores_certificados_modelos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_certificados_modelos" ADD CONSTRAINT "fk_criadores_certificados_modelos_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_certificados" ADD CONSTRAINT "produtos_certificados_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_certificados" ADD CONSTRAINT "fk_produtos_certificados_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_certificados" ADD CONSTRAINT "fk_produtos_certificados_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_certificados" ADD CONSTRAINT "fk_produtos_certificados_matricula" FOREIGN KEY ("matricula_id") REFERENCES "public"."produtos_matriculas"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_certificados_versoes" ADD CONSTRAINT "produtos_certificados_versoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_certificados_versoes" ADD CONSTRAINT "fk_produtos_certificados_versoes_certificado" FOREIGN KEY ("certificado_id","criador_id") REFERENCES "public"."produtos_certificados"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_certificados_versoes" ADD CONSTRAINT "fk_produtos_certificados_versoes_arquivo" FOREIGN KEY ("arquivo_id","criador_id") REFERENCES "public"."arquivos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_trilhas" ADD CONSTRAINT "criadores_trilhas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_trilhas" ADD CONSTRAINT "fk_criadores_trilhas_capa" FOREIGN KEY ("capa_arquivo_id","criador_id") REFERENCES "public"."arquivos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_trilhas_itens" ADD CONSTRAINT "criadores_trilhas_itens_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_trilhas_itens" ADD CONSTRAINT "fk_criadores_trilhas_itens_trilha" FOREIGN KEY ("trilha_id","criador_id") REFERENCES "public"."criadores_trilhas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_trilhas_itens" ADD CONSTRAINT "fk_criadores_trilhas_itens_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_trilhas_itens" ADD CONSTRAINT "fk_criadores_trilhas_itens_avaliacao" FOREIGN KEY ("avaliacao_id","criador_id") REFERENCES "public"."produtos_avaliacoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_produtos_avaliacoes_produto" ON "produtos_avaliacoes" USING btree ("criador_id","produto_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_avaliacoes_concessoes_membro" ON "produtos_avaliacoes_concessoes" USING btree ("membro_id","avaliacao_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_avaliacoes_questoes_ordem_vivo" ON "produtos_avaliacoes_questoes" USING btree ("avaliacao_id","ordem") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_avaliacoes_tentativas_aberta" ON "produtos_avaliacoes_tentativas" USING btree ("membro_id","avaliacao_id") WHERE finalizada_em is null and is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_avaliacoes_tentativas_numero" ON "produtos_avaliacoes_tentativas" USING btree ("membro_id","avaliacao_id","numero") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_avaliacoes_tentativas_avaliacao" ON "produtos_avaliacoes_tentativas" USING btree ("criador_id","avaliacao_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_certificados_modelos_padrao_vivo" ON "criadores_certificados_modelos" USING btree ("criador_id") WHERE is_deleted = false and produto_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_certificados_modelos_produto_vivo" ON "criadores_certificados_modelos" USING btree ("produto_id") WHERE is_deleted = false and produto_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_certificados_par_vivo" ON "produtos_certificados" USING btree ("membro_id","produto_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_certificados_codigo" ON "produtos_certificados" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "ix_produtos_certificados_criador_emitido" ON "produtos_certificados" USING btree ("criador_id","emitido_em" DESC NULLS LAST) WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_certificados_versoes_numero" ON "produtos_certificados_versoes" USING btree ("certificado_id","versao");--> statement-breakpoint
CREATE INDEX "ix_criadores_trilhas_criador" ON "criadores_trilhas" USING btree ("criador_id","status") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_trilhas_itens_ordem_vivo" ON "criadores_trilhas_itens" USING btree ("trilha_id","ordem") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_trilhas_itens_produto_vivo" ON "criadores_trilhas_itens" USING btree ("trilha_id","produto_id") WHERE is_deleted = false and produto_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_trilhas_itens_avaliacao_vivo" ON "criadores_trilhas_itens" USING btree ("trilha_id","avaliacao_id") WHERE is_deleted = false and avaliacao_id is not null;--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "ck_arquivos_finalidade" CHECK (finalidade in ('IMAGEM', 'MATERIAL', 'CERTIFICADO'));