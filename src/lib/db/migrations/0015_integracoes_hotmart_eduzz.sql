CREATE TABLE "criadores_integracoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"plataforma" text NOT NULL,
	"segredo_cifrado" text NOT NULL,
	"segredo_final" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_integracoes_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_integracoes_plataforma" CHECK (plataforma in ('HOTMART', 'EDUZZ')),
	CONSTRAINT "ck_criadores_integracoes_segredo_final" CHECK (length(segredo_final) = 4)
);
--> statement-breakpoint
CREATE TABLE "criadores_integracoes_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"recibo_id" uuid NOT NULL,
	"situacao" text DEFAULT 'PENDENTE' NOT NULL,
	"erro" text,
	"comprador_email" text,
	"comprador_nome" text,
	"proxima_cobranca" timestamp (3) with time zone,
	"membro_id" uuid,
	"matriculas" jsonb,
	"processado_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_integracoes_eventos_situacao" CHECK (situacao in ('PENDENTE', 'PROCESSADO', 'SEM_MAPEAMENTO', 'IGNORADO', 'ERRO')),
	CONSTRAINT "ck_criadores_integracoes_eventos_erro" CHECK (erro is null or length(erro) <= 300),
	CONSTRAINT "ck_criadores_integracoes_eventos_email" CHECK (comprador_email is null or (length(comprador_email) <= 254 and comprador_email ~ '^[^[:space:]@]+@[^[:space:]@]+$')),
	CONSTRAINT "ck_criadores_integracoes_eventos_nome" CHECK (comprador_nome is null or length(comprador_nome) <= 120)
);
--> statement-breakpoint
CREATE TABLE "criadores_integracoes_produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"integracao_id" uuid NOT NULL,
	"produto_externo" text NOT NULL,
	"nome_externo" text,
	"produto_id" uuid NOT NULL,
	"dias_acesso" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_integracoes_produtos_externo" CHECK (produto_externo ~ '^[A-Za-z0-9_-]{1,64}$'),
	CONSTRAINT "ck_criadores_integracoes_produtos_nome" CHECK (nome_externo is null or length(trim(nome_externo)) between 1 and 120),
	CONSTRAINT "ck_criadores_integracoes_produtos_dias" CHECK (dias_acesso is null or dias_acesso between 1 and 3650)
);
--> statement-breakpoint
CREATE TABLE "integracoes_recibos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"integracao_id" uuid NOT NULL,
	"plataforma" text NOT NULL,
	"evento_id" text,
	"evento" text,
	"tipo" text,
	"transacao" text,
	"assinatura" text,
	"produto_externo" text,
	"recusa" text,
	"ocorrido_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_integracoes_recibos_plataforma" CHECK (plataforma in ('HOTMART', 'EDUZZ')),
	CONSTRAINT "ck_integracoes_recibos_tipo" CHECK (tipo is null or tipo in ('COMPRA_APROVADA', 'REEMBOLSO', 'CHARGEBACK', 'CANCELAMENTO', 'ASSINATURA_CANCELADA', 'ASSINATURA_ATRASADA', 'OUTRO')),
	CONSTRAINT "ck_integracoes_recibos_recusa" CHECK (recusa is null or recusa in ('TOKEN_INVALIDO', 'FORMATO_INVALIDO')),
	CONSTRAINT "ck_integracoes_recibos_forma" CHECK ((recusa is null) = (evento_id is not null and tipo is not null)),
	CONSTRAINT "ck_integracoes_recibos_ids" CHECK ((evento_id is null or evento_id ~ '^[A-Za-z0-9_-]{1,100}$') and (transacao is null or transacao ~ '^[A-Za-z0-9_-]{1,100}$') and (assinatura is null or assinatura ~ '^[A-Za-z0-9_-]{1,100}$') and (produto_externo is null or produto_externo ~ '^[A-Za-z0-9_-]{1,64}$') and (evento is null or length(evento) <= 60))
);
--> statement-breakpoint
ALTER TABLE "criadores_integracoes" ADD CONSTRAINT "criadores_integracoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_eventos" ADD CONSTRAINT "criadores_integracoes_eventos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_eventos" ADD CONSTRAINT "criadores_integracoes_eventos_recibo_id_integracoes_recibos_id_fk" FOREIGN KEY ("recibo_id") REFERENCES "public"."integracoes_recibos"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_eventos" ADD CONSTRAINT "fk_criadores_integracoes_eventos_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_produtos" ADD CONSTRAINT "criadores_integracoes_produtos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_produtos" ADD CONSTRAINT "fk_criadores_integracoes_produtos_integracao" FOREIGN KEY ("integracao_id","criador_id") REFERENCES "public"."criadores_integracoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_produtos" ADD CONSTRAINT "fk_criadores_integracoes_produtos_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "integracoes_recibos" ADD CONSTRAINT "integracoes_recibos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "integracoes_recibos" ADD CONSTRAINT "fk_integracoes_recibos_integracao" FOREIGN KEY ("integracao_id","criador_id") REFERENCES "public"."criadores_integracoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_integracoes_plataforma_viva" ON "criadores_integracoes" USING btree ("criador_id","plataforma") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_integracoes_eventos_recibo" ON "criadores_integracoes_eventos" USING btree ("recibo_id");--> statement-breakpoint
CREATE INDEX "ix_criadores_integracoes_eventos_pendentes" ON "criadores_integracoes_eventos" USING btree ("created_at") WHERE situacao = 'PENDENTE' and is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_integracoes_produtos_vivo" ON "criadores_integracoes_produtos" USING btree ("integracao_id","produto_externo","produto_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_integracoes_recibos_evento" ON "integracoes_recibos" USING btree ("integracao_id","evento_id") WHERE evento_id is not null;--> statement-breakpoint
CREATE INDEX "ix_integracoes_recibos_criador" ON "integracoes_recibos" USING btree ("criador_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_integracoes_recibos_transacao" ON "integracoes_recibos" USING btree ("integracao_id","transacao") WHERE transacao is not null;--> statement-breakpoint
CREATE INDEX "ix_integracoes_recibos_assinatura" ON "integracoes_recibos" USING btree ("integracao_id","assinatura") WHERE assinatura is not null;