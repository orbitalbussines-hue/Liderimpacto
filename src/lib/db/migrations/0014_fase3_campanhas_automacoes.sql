CREATE TABLE "criadores_automacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"gatilho" text NOT NULL,
	"produto_id" uuid,
	"dias" integer,
	"atraso_minutos" integer DEFAULT 0 NOT NULL,
	"conteudo" jsonb,
	"tag_id" uuid,
	"situacao" text DEFAULT 'PAUSADA' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_automacoes_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_automacoes_nome" CHECK (length(trim(nome)) between 2 and 80),
	CONSTRAINT "ck_criadores_automacoes_gatilho" CHECK (gatilho in ('MEMBRO_CADASTRADO', 'MATRICULA_CRIADA', 'AULA_CONCLUIDA', 'CURSO_CONCLUIDO', 'CERTIFICADO_EMITIDO', 'VOUCHER_RESGATADO', 'INATIVIDADE', 'NUNCA_ACESSOU')),
	CONSTRAINT "ck_criadores_automacoes_situacao" CHECK (situacao in ('ATIVA', 'PAUSADA')),
	CONSTRAINT "ck_criadores_automacoes_curso" CHECK (produto_id is null or gatilho in ('MATRICULA_CRIADA', 'AULA_CONCLUIDA', 'CURSO_CONCLUIDO', 'CERTIFICADO_EMITIDO')),
	CONSTRAINT "ck_criadores_automacoes_dias" CHECK ((gatilho in ('INATIVIDADE', 'NUNCA_ACESSOU')) = (dias is not null) and (dias is null or dias between 1 and 365)),
	CONSTRAINT "ck_criadores_automacoes_atraso" CHECK (atraso_minutos between 0 and 43200),
	CONSTRAINT "ck_criadores_automacoes_acao" CHECK (conteudo is not null or tag_id is not null),
	CONSTRAINT "ck_criadores_automacoes_conteudo" CHECK (conteudo is null or jsonb_typeof(conteudo) = 'object')
);
--> statement-breakpoint
CREATE TABLE "criadores_automacoes_execucoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"automacao_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"referencia" text NOT NULL,
	"situacao" text DEFAULT 'AGENDADA' NOT NULL,
	"executar_em" timestamp (3) with time zone NOT NULL,
	"executada_em" timestamp (3) with time zone,
	"tag_aplicada" boolean DEFAULT false NOT NULL,
	"envio_id" uuid,
	"motivo" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_automacoes_execucoes_situacao" CHECK (situacao in ('AGENDADA', 'CONCLUIDA', 'IGNORADA', 'FALHOU')),
	CONSTRAINT "ck_criadores_automacoes_execucoes_tamanhos" CHECK (length(referencia) between 1 and 200 and (motivo is null or length(motivo) <= 120))
);
--> statement-breakpoint
CREATE TABLE "criadores_campanhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"conteudo" jsonb NOT NULL,
	"publico" jsonb NOT NULL,
	"situacao" text DEFAULT 'RASCUNHO' NOT NULL,
	"agendada_para" timestamp (3) with time zone,
	"iniciada_em" timestamp (3) with time zone,
	"concluida_em" timestamp (3) with time zone,
	"cancelada_em" timestamp (3) with time zone,
	"total_destinatarios" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_campanhas_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_campanhas_nome" CHECK (length(trim(nome)) between 2 and 80),
	CONSTRAINT "ck_criadores_campanhas_situacao" CHECK (situacao in ('RASCUNHO', 'AGENDADA', 'ENVIANDO', 'CONCLUIDA', 'CANCELADA')),
	CONSTRAINT "ck_criadores_campanhas_agendada" CHECK (situacao <> 'AGENDADA' or agendada_para is not null),
	CONSTRAINT "ck_criadores_campanhas_json" CHECK (jsonb_typeof(conteudo) = 'object' and jsonb_typeof(publico) = 'object'),
	CONSTRAINT "ck_criadores_campanhas_total" CHECK (total_destinatarios >= 0)
);
--> statement-breakpoint
CREATE TABLE "criadores_emails_descadastros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"destinatario_hash" text NOT NULL,
	"destinatario_mascarado" text NOT NULL,
	"origem" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_emails_descadastros_hash" CHECK (destinatario_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ck_criadores_emails_descadastros_mascara" CHECK (length(destinatario_mascarado) <= 120),
	CONSTRAINT "ck_criadores_emails_descadastros_origem" CHECK (origem in ('LINK', 'UM_CLIQUE'))
);
--> statement-breakpoint
CREATE TABLE "criadores_emails_envios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"campanha_id" uuid,
	"automacao_id" uuid,
	"chave" text NOT NULL,
	"situacao" text DEFAULT 'PENDENTE' NOT NULL,
	"motivo" text,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"enviado_em" timestamp (3) with time zone,
	"aberto_em" timestamp (3) with time zone,
	"aberturas" integer DEFAULT 0 NOT NULL,
	"clicado_em" timestamp (3) with time zone,
	"cliques" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_emails_envios_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_emails_envios_origem" CHECK (origem in ('CAMPANHA', 'AUTOMACAO', 'PRIMEIRO_ACESSO')),
	CONSTRAINT "ck_criadores_emails_envios_situacao" CHECK (situacao in ('PENDENTE', 'ENVIADO', 'FALHOU', 'IGNORADO')),
	CONSTRAINT "ck_criadores_emails_envios_vinculo" CHECK ((origem = 'CAMPANHA') = (campanha_id is not null) and (origem = 'AUTOMACAO') = (automacao_id is not null)),
	CONSTRAINT "ck_criadores_emails_envios_chave" CHECK (length(chave) <= 200),
	CONSTRAINT "ck_criadores_emails_envios_motivo" CHECK (motivo is null or length(motivo) <= 120),
	CONSTRAINT "ck_criadores_emails_envios_contadores" CHECK (tentativas >= 0 and aberturas >= 0 and cliques >= 0)
);
--> statement-breakpoint
CREATE TABLE "criadores_emails_modelos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"conteudo" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_emails_modelos_nome" CHECK (length(trim(nome)) between 2 and 80),
	CONSTRAINT "ck_criadores_emails_modelos_conteudo" CHECK (jsonb_typeof(conteudo) = 'object')
);
--> statement-breakpoint
ALTER TABLE "emails_disparos" DROP CONSTRAINT "ck_emails_disparos_tipo";--> statement-breakpoint
ALTER TABLE "criadores_automacoes" ADD CONSTRAINT "criadores_automacoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_automacoes" ADD CONSTRAINT "fk_criadores_automacoes_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_automacoes" ADD CONSTRAINT "fk_criadores_automacoes_tag" FOREIGN KEY ("tag_id","criador_id") REFERENCES "public"."criadores_tags"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_automacoes_execucoes" ADD CONSTRAINT "criadores_automacoes_execucoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_automacoes_execucoes" ADD CONSTRAINT "fk_criadores_automacoes_execucoes_automacao" FOREIGN KEY ("automacao_id","criador_id") REFERENCES "public"."criadores_automacoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_automacoes_execucoes" ADD CONSTRAINT "fk_criadores_automacoes_execucoes_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_automacoes_execucoes" ADD CONSTRAINT "fk_criadores_automacoes_execucoes_envio" FOREIGN KEY ("envio_id","criador_id") REFERENCES "public"."criadores_emails_envios"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_campanhas" ADD CONSTRAINT "criadores_campanhas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_emails_descadastros" ADD CONSTRAINT "criadores_emails_descadastros_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_emails_envios" ADD CONSTRAINT "criadores_emails_envios_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_emails_envios" ADD CONSTRAINT "fk_criadores_emails_envios_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_emails_envios" ADD CONSTRAINT "fk_criadores_emails_envios_campanha" FOREIGN KEY ("campanha_id","criador_id") REFERENCES "public"."criadores_campanhas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_emails_envios" ADD CONSTRAINT "fk_criadores_emails_envios_automacao" FOREIGN KEY ("automacao_id","criador_id") REFERENCES "public"."criadores_automacoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_emails_modelos" ADD CONSTRAINT "criadores_emails_modelos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_criadores_automacoes_gatilho" ON "criadores_automacoes" USING btree ("criador_id","gatilho") WHERE situacao = 'ATIVA' and is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_automacoes_execucoes_ref" ON "criadores_automacoes_execucoes" USING btree ("automacao_id","membro_id","referencia");--> statement-breakpoint
CREATE INDEX "ix_criadores_automacoes_execucoes_automacao" ON "criadores_automacoes_execucoes" USING btree ("automacao_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_criadores_automacoes_execucoes_agendadas" ON "criadores_automacoes_execucoes" USING btree ("executar_em") WHERE situacao = 'AGENDADA' and is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_campanhas_criador" ON "criadores_campanhas" USING btree ("criador_id","created_at") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_campanhas_agendadas" ON "criadores_campanhas" USING btree ("agendada_para") WHERE situacao = 'AGENDADA' and is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_emails_descadastros_vivo" ON "criadores_emails_descadastros" USING btree ("criador_id","destinatario_hash") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_emails_envios_chave" ON "criadores_emails_envios" USING btree ("criador_id","chave");--> statement-breakpoint
CREATE INDEX "ix_criadores_emails_envios_campanha" ON "criadores_emails_envios" USING btree ("campanha_id","situacao") WHERE campanha_id is not null;--> statement-breakpoint
CREATE INDEX "ix_criadores_emails_envios_automacao" ON "criadores_emails_envios" USING btree ("automacao_id") WHERE automacao_id is not null;--> statement-breakpoint
CREATE INDEX "ix_criadores_emails_envios_pendentes" ON "criadores_emails_envios" USING btree ("created_at") WHERE situacao = 'PENDENTE' and is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_emails_modelos_nome_vivo" ON "criadores_emails_modelos" USING btree ("criador_id",lower("nome")) WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_emails_disparos_quando" ON "emails_disparos" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "emails_disparos" ADD CONSTRAINT "ck_emails_disparos_tipo" CHECK (tipo in ('DEFINIR_SENHA', 'PRIMEIRO_ACESSO', 'AVISO_SEGURANCA', 'CAMPANHA', 'AUTOMACAO'));