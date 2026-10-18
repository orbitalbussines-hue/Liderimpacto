CREATE TABLE "criadores_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"codigo" text NOT NULL,
	"comissao_bps" integer NOT NULL,
	"situacao" text DEFAULT 'ATIVO' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_afiliados_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_afiliados_nome" CHECK (length(trim(nome)) between 2 and 120),
	CONSTRAINT "ck_criadores_afiliados_email" CHECK (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
	CONSTRAINT "ck_criadores_afiliados_codigo" CHECK (codigo ~ '^[A-Z0-9]{4,20}$'),
	CONSTRAINT "ck_criadores_afiliados_comissao" CHECK (comissao_bps between 0 and 9000),
	CONSTRAINT "ck_criadores_afiliados_situacao" CHECK (situacao in ('ATIVO', 'PAUSADO'))
);
--> statement-breakpoint
CREATE TABLE "criadores_cupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"tipo" text NOT NULL,
	"percentual_bps" integer,
	"valor_centavos" integer,
	"oferta_id" uuid,
	"valido_ate" timestamp (3) with time zone,
	"limite_usos" integer,
	"situacao" text DEFAULT 'ATIVO' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_cupons_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_cupons_codigo" CHECK (codigo ~ '^[A-Z0-9]{3,20}$'),
	CONSTRAINT "ck_criadores_cupons_tipo" CHECK (tipo in ('PERCENTUAL', 'VALOR')),
	CONSTRAINT "ck_criadores_cupons_desconto" CHECK ((tipo = 'PERCENTUAL' and percentual_bps between 1 and 10000 and valor_centavos is null) or (tipo = 'VALOR' and valor_centavos between 1 and 100000000 and percentual_bps is null)),
	CONSTRAINT "ck_criadores_cupons_limite" CHECK (limite_usos is null or limite_usos between 1 and 100000),
	CONSTRAINT "ck_criadores_cupons_situacao" CHECK (situacao in ('ATIVO', 'PAUSADO'))
);
--> statement-breakpoint
CREATE TABLE "criadores_ofertas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"preco_centavos" integer NOT NULL,
	"moeda" text DEFAULT 'BRL' NOT NULL,
	"intervalo" text,
	"dias_acesso" integer,
	"situacao" text DEFAULT 'ATIVA' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_ofertas_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_ofertas_nome" CHECK (length(trim(nome)) between 2 and 80),
	CONSTRAINT "ck_criadores_ofertas_tipo" CHECK (tipo in ('AVULSO', 'ASSINATURA')),
	CONSTRAINT "ck_criadores_ofertas_preco" CHECK (preco_centavos between 100 and 100000000),
	CONSTRAINT "ck_criadores_ofertas_moeda" CHECK (moeda = 'BRL'),
	CONSTRAINT "ck_criadores_ofertas_intervalo" CHECK ((tipo = 'ASSINATURA') = (intervalo is not null) and (intervalo is null or intervalo in ('MES', 'ANO'))),
	CONSTRAINT "ck_criadores_ofertas_dias" CHECK (dias_acesso is null or (tipo = 'AVULSO' and dias_acesso between 1 and 3650)),
	CONSTRAINT "ck_criadores_ofertas_situacao" CHECK (situacao in ('ATIVA', 'PAUSADA'))
);
--> statement-breakpoint
CREATE TABLE "criadores_ofertas_produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"oferta_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criadores_stripe_contas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"conta_id" text NOT NULL,
	"cobrancas_ativas" boolean DEFAULT false NOT NULL,
	"repasses_ativos" boolean DEFAULT false NOT NULL,
	"dados_enviados" boolean DEFAULT false NOT NULL,
	"status_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_stripe_contas_conta" CHECK (conta_id ~ '^acct_[A-Za-z0-9]{1,100}$')
);
--> statement-breakpoint
CREATE TABLE "criadores_assinaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"oferta_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"stripe_assinatura_id" text NOT NULL,
	"situacao" text DEFAULT 'ATIVA' NOT NULL,
	"taxa_bps" integer NOT NULL,
	"periodo_fim" timestamp (3) with time zone,
	"cancelar_no_fim" boolean DEFAULT false NOT NULL,
	"encerrada_em" timestamp (3) with time zone,
	"evento_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_assinaturas_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_assinaturas_stripe" CHECK (stripe_assinatura_id ~ '^sub_[A-Za-z0-9]{1,100}$'),
	CONSTRAINT "ck_criadores_assinaturas_situacao" CHECK (situacao in ('ATIVA', 'ATRASADA', 'PAUSADA', 'INCOMPLETA', 'CANCELADA')),
	CONSTRAINT "ck_criadores_assinaturas_taxa" CHECK (taxa_bps between 0 and 5000)
);
--> statement-breakpoint
CREATE TABLE "criadores_vendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"oferta_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"membro_id" uuid,
	"comprador_email" text,
	"afiliado_id" uuid,
	"cupom_id" uuid,
	"assinatura_id" uuid,
	"checkout_sessao_id" text,
	"fatura_id" text,
	"payment_intent_id" text,
	"situacao" text DEFAULT 'PENDENTE' NOT NULL,
	"valor_centavos" integer NOT NULL,
	"desconto_centavos" integer DEFAULT 0 NOT NULL,
	"taxa_bps" integer NOT NULL,
	"taxa_centavos" integer NOT NULL,
	"comissao_centavos" integer DEFAULT 0 NOT NULL,
	"reembolsado_centavos" integer DEFAULT 0 NOT NULL,
	"taxa_devolvida_centavos" integer DEFAULT 0 NOT NULL,
	"pago_em" timestamp (3) with time zone,
	"matriculas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_vendas_origem" CHECK (checkout_sessao_id is not null or fatura_id is not null),
	CONSTRAINT "ck_criadores_vendas_tipo" CHECK (tipo in ('AVULSO', 'ASSINATURA')),
	CONSTRAINT "ck_criadores_vendas_situacao" CHECK (situacao in ('PENDENTE', 'AGUARDANDO_PAGAMENTO', 'PAGA', 'FALHOU', 'EXPIRADA', 'REEMBOLSADA')),
	CONSTRAINT "ck_criadores_vendas_valores" CHECK (valor_centavos >= 0 and desconto_centavos >= 0 and taxa_centavos between 0 and valor_centavos and comissao_centavos >= 0 and reembolsado_centavos between 0 and valor_centavos and taxa_devolvida_centavos between 0 and taxa_centavos),
	CONSTRAINT "ck_criadores_vendas_taxa_bps" CHECK (taxa_bps between 0 and 5000),
	CONSTRAINT "ck_criadores_vendas_email" CHECK (comprador_email is null or length(comprador_email) <= 254),
	CONSTRAINT "ck_criadores_vendas_matriculas" CHECK (jsonb_typeof(matriculas) = 'array')
);
--> statement-breakpoint
CREATE TABLE "stripe_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evento_id" text NOT NULL,
	"tipo" text NOT NULL,
	"conta_id" text,
	"criador_id" uuid,
	"objeto_id" text,
	"livemode" boolean NOT NULL,
	"ocorrido_em" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_stripe_eventos_evento" CHECK (evento_id ~ '^evt_[A-Za-z0-9]{1,100}$'),
	CONSTRAINT "ck_stripe_eventos_tamanhos" CHECK (length(tipo) <= 100 and (conta_id is null or length(conta_id) <= 110) and (objeto_id is null or length(objeto_id) <= 255))
);
--> statement-breakpoint
ALTER TABLE "criadores" ADD COLUMN "taxa_plataforma_bps" integer DEFAULT 800 NOT NULL;--> statement-breakpoint
ALTER TABLE "criadores_afiliados" ADD CONSTRAINT "criadores_afiliados_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_cupons" ADD CONSTRAINT "criadores_cupons_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_cupons" ADD CONSTRAINT "fk_criadores_cupons_oferta" FOREIGN KEY ("oferta_id","criador_id") REFERENCES "public"."criadores_ofertas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_ofertas" ADD CONSTRAINT "criadores_ofertas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_ofertas_produtos" ADD CONSTRAINT "criadores_ofertas_produtos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_ofertas_produtos" ADD CONSTRAINT "fk_criadores_ofertas_produtos_oferta" FOREIGN KEY ("oferta_id","criador_id") REFERENCES "public"."criadores_ofertas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_ofertas_produtos" ADD CONSTRAINT "fk_criadores_ofertas_produtos_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_stripe_contas" ADD CONSTRAINT "criadores_stripe_contas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assinaturas" ADD CONSTRAINT "criadores_assinaturas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assinaturas" ADD CONSTRAINT "fk_criadores_assinaturas_oferta" FOREIGN KEY ("oferta_id","criador_id") REFERENCES "public"."criadores_ofertas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_assinaturas" ADD CONSTRAINT "fk_criadores_assinaturas_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vendas" ADD CONSTRAINT "criadores_vendas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vendas" ADD CONSTRAINT "fk_criadores_vendas_oferta" FOREIGN KEY ("oferta_id","criador_id") REFERENCES "public"."criadores_ofertas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vendas" ADD CONSTRAINT "fk_criadores_vendas_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vendas" ADD CONSTRAINT "fk_criadores_vendas_afiliado" FOREIGN KEY ("afiliado_id","criador_id") REFERENCES "public"."criadores_afiliados"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vendas" ADD CONSTRAINT "fk_criadores_vendas_cupom" FOREIGN KEY ("cupom_id","criador_id") REFERENCES "public"."criadores_cupons"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vendas" ADD CONSTRAINT "fk_criadores_vendas_assinatura" FOREIGN KEY ("assinatura_id","criador_id") REFERENCES "public"."criadores_assinaturas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "stripe_eventos" ADD CONSTRAINT "stripe_eventos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_afiliados_codigo_vivo" ON "criadores_afiliados" USING btree ("criador_id","codigo") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_cupons_codigo_vivo" ON "criadores_cupons" USING btree ("criador_id","codigo") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_ofertas_produtos_vivo" ON "criadores_ofertas_produtos" USING btree ("oferta_id","produto_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_stripe_contas_criador_vivo" ON "criadores_stripe_contas" USING btree ("criador_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_stripe_contas_conta" ON "criadores_stripe_contas" USING btree ("conta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_assinaturas_stripe" ON "criadores_assinaturas" USING btree ("stripe_assinatura_id");--> statement-breakpoint
CREATE INDEX "ix_criadores_assinaturas_criador" ON "criadores_assinaturas" USING btree ("criador_id","situacao") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_vendas_sessao" ON "criadores_vendas" USING btree ("checkout_sessao_id") WHERE checkout_sessao_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_vendas_fatura" ON "criadores_vendas" USING btree ("fatura_id") WHERE fatura_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_vendas_payment_intent" ON "criadores_vendas" USING btree ("payment_intent_id") WHERE payment_intent_id is not null;--> statement-breakpoint
CREATE INDEX "ix_criadores_vendas_criador" ON "criadores_vendas" USING btree ("criador_id","created_at") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_vendas_afiliado" ON "criadores_vendas" USING btree ("afiliado_id") WHERE afiliado_id is not null and is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_vendas_cupom" ON "criadores_vendas" USING btree ("cupom_id") WHERE cupom_id is not null and is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stripe_eventos_evento" ON "stripe_eventos" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "ix_stripe_eventos_criador" ON "stripe_eventos" USING btree ("criador_id","created_at");--> statement-breakpoint
ALTER TABLE "criadores" ADD CONSTRAINT "ck_criadores_taxa_plataforma" CHECK (taxa_plataforma_bps between 0 and 5000);