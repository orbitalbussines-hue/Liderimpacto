CREATE TABLE "criadores_integracoes_oauth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"integracao_id" uuid NOT NULL,
	"cliente_id" text NOT NULL,
	"tokens_cifrados" text,
	"token_expira_em" timestamp (3) with time zone,
	"renovado_em" timestamp (3) with time zone,
	"situacao" text DEFAULT 'AGUARDANDO' NOT NULL,
	"erro" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_integracoes_oauth_situacao" CHECK (situacao in ('AGUARDANDO', 'AUTORIZADA', 'REAUTORIZAR')),
	CONSTRAINT "ck_criadores_integracoes_oauth_cliente" CHECK (cliente_id ~ '^[A-Za-z0-9_-]{8,100}$'),
	CONSTRAINT "ck_criadores_integracoes_oauth_erro" CHECK (erro is null or length(erro) <= 300)
);
--> statement-breakpoint
CREATE TABLE "criadores_integracoes_pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"integracao_id" uuid NOT NULL,
	"pedido_id" text NOT NULL,
	"numero_loja" text,
	"numero" text,
	"loja_id" text,
	"cpf_hmac" text,
	"skus" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"situacao" text NOT NULL,
	"situacao_bling" integer,
	"sincronizado_em" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_integracoes_pedidos_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_integracoes_pedidos_situacao" CHECK (situacao in ('VALIDO', 'CANCELADO')),
	CONSTRAINT "ck_criadores_integracoes_pedidos_campos" CHECK (pedido_id ~ '^[0-9]{1,20}$' and (numero_loja is null or length(numero_loja) between 1 and 60) and (numero is null or length(numero) <= 20) and (loja_id is null or loja_id ~ '^[0-9]{1,20}$') and (cpf_hmac is null or cpf_hmac ~ '^[0-9a-f]{64}$') and jsonb_typeof(skus) = 'array')
);
--> statement-breakpoint
CREATE TABLE "criadores_integracoes_pedidos_resgates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"matriculas" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_integracoes_pedidos_resgates_matriculas" CHECK (jsonb_typeof(matriculas) = 'array' and jsonb_array_length(matriculas) >= 1)
);
--> statement-breakpoint
ALTER TABLE "criadores_integracoes" DROP CONSTRAINT "ck_criadores_integracoes_plataforma";--> statement-breakpoint
ALTER TABLE "integracoes_recibos" DROP CONSTRAINT "ck_integracoes_recibos_plataforma";--> statement-breakpoint
ALTER TABLE "integracoes_recibos" DROP CONSTRAINT "ck_integracoes_recibos_tipo";--> statement-breakpoint
ALTER TABLE "criadores_integracoes_oauth" ADD CONSTRAINT "criadores_integracoes_oauth_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_oauth" ADD CONSTRAINT "fk_criadores_integracoes_oauth_integracao" FOREIGN KEY ("integracao_id","criador_id") REFERENCES "public"."criadores_integracoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_pedidos" ADD CONSTRAINT "criadores_integracoes_pedidos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_pedidos" ADD CONSTRAINT "fk_criadores_integracoes_pedidos_integracao" FOREIGN KEY ("integracao_id","criador_id") REFERENCES "public"."criadores_integracoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_pedidos_resgates" ADD CONSTRAINT "criadores_integracoes_pedidos_resgates_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_pedidos_resgates" ADD CONSTRAINT "fk_criadores_integracoes_pedidos_resgates_pedido" FOREIGN KEY ("pedido_id","criador_id") REFERENCES "public"."criadores_integracoes_pedidos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_integracoes_pedidos_resgates" ADD CONSTRAINT "fk_criadores_integracoes_pedidos_resgates_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_integracoes_oauth_viva" ON "criadores_integracoes_oauth" USING btree ("integracao_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_integracoes_pedidos_pedido" ON "criadores_integracoes_pedidos" USING btree ("integracao_id","pedido_id");--> statement-breakpoint
CREATE INDEX "ix_criadores_integracoes_pedidos_numero" ON "criadores_integracoes_pedidos" USING btree ("integracao_id",lower("numero_loja"));--> statement-breakpoint
CREATE INDEX "ix_criadores_integracoes_pedidos_criador" ON "criadores_integracoes_pedidos" USING btree ("criador_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_integracoes_pedidos_resgates_pedido" ON "criadores_integracoes_pedidos_resgates" USING btree ("pedido_id");--> statement-breakpoint
ALTER TABLE "criadores_integracoes" ADD CONSTRAINT "ck_criadores_integracoes_plataforma" CHECK (plataforma in ('HOTMART', 'EDUZZ', 'BLING'));--> statement-breakpoint
ALTER TABLE "integracoes_recibos" ADD CONSTRAINT "ck_integracoes_recibos_plataforma" CHECK (plataforma in ('HOTMART', 'EDUZZ', 'BLING'));--> statement-breakpoint
ALTER TABLE "integracoes_recibos" ADD CONSTRAINT "ck_integracoes_recibos_tipo" CHECK (tipo is null or tipo in ('COMPRA_APROVADA', 'REEMBOLSO', 'CHARGEBACK', 'CANCELAMENTO', 'ASSINATURA_CANCELADA', 'ASSINATURA_ATRASADA', 'PEDIDO_ATUALIZADO', 'PEDIDO_EXCLUIDO', 'OUTRO'));