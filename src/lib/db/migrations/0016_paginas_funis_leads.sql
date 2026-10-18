CREATE TABLE "criadores_funis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"etapas" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_funis_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_funis_nome" CHECK (length(trim(nome)) between 2 and 80),
	CONSTRAINT "ck_criadores_funis_etapas" CHECK (jsonb_typeof(etapas) = 'array' and jsonb_array_length(etapas) between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "criadores_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"pagina_id" uuid NOT NULL,
	"funil_id" uuid,
	"tag_id" uuid,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consentimento_texto" text NOT NULL,
	"consentimento_em" timestamp (3) with time zone NOT NULL,
	"capturas" integer DEFAULT 1 NOT NULL,
	"ultima_captura_em" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_leads_nome" CHECK (length(trim(nome)) between 1 and 120),
	CONSTRAINT "ck_criadores_leads_email" CHECK (email = lower(email) and length(email) between 3 and 254),
	CONSTRAINT "ck_criadores_leads_consentimento" CHECK (length(consentimento_texto) between 10 and 400),
	CONSTRAINT "ck_criadores_leads_utm" CHECK (jsonb_typeof(utm) = 'object'),
	CONSTRAINT "ck_criadores_leads_capturas" CHECK (capturas >= 1)
);
--> statement-breakpoint
CREATE TABLE "criadores_paginas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"titulo" text NOT NULL,
	"modelo" text NOT NULL,
	"situacao" text DEFAULT 'RASCUNHO' NOT NULL,
	"rascunho" jsonb NOT NULL,
	"publicada" jsonb,
	"publicada_em" timestamp (3) with time zone,
	"publicacoes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_paginas_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_paginas_slug" CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])$'),
	CONSTRAINT "ck_criadores_paginas_titulo" CHECK (length(trim(titulo)) between 2 and 80),
	CONSTRAINT "ck_criadores_paginas_modelo" CHECK (modelo in ('VENDA', 'CAPTURA')),
	CONSTRAINT "ck_criadores_paginas_situacao" CHECK (situacao in ('RASCUNHO', 'PUBLICADA')),
	CONSTRAINT "ck_criadores_paginas_publicada" CHECK (situacao <> 'PUBLICADA' or (publicada is not null and publicada_em is not null)),
	CONSTRAINT "ck_criadores_paginas_json" CHECK (jsonb_typeof(rascunho) = 'object' and (publicada is null or jsonb_typeof(publicada) = 'object') and publicacoes >= 0)
);
--> statement-breakpoint
CREATE TABLE "criadores_paginas_checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"pagina_id" uuid NOT NULL,
	"funil_id" uuid,
	"venda_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criadores_paginas_visitas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"pagina_id" uuid NOT NULL,
	"funil_id" uuid,
	"dia" date NOT NULL,
	"visitas" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_paginas_visitas_dia" UNIQUE NULLS NOT DISTINCT("pagina_id","funil_id","dia"),
	CONSTRAINT "ck_criadores_paginas_visitas_contador" CHECK (visitas >= 0)
);
--> statement-breakpoint
ALTER TABLE "criadores_funis" ADD CONSTRAINT "criadores_funis_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_leads" ADD CONSTRAINT "criadores_leads_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_leads" ADD CONSTRAINT "fk_criadores_leads_pagina" FOREIGN KEY ("pagina_id","criador_id") REFERENCES "public"."criadores_paginas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_leads" ADD CONSTRAINT "fk_criadores_leads_funil" FOREIGN KEY ("funil_id","criador_id") REFERENCES "public"."criadores_funis"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_leads" ADD CONSTRAINT "fk_criadores_leads_tag" FOREIGN KEY ("tag_id","criador_id") REFERENCES "public"."criadores_tags"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_paginas" ADD CONSTRAINT "criadores_paginas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_paginas_checkouts" ADD CONSTRAINT "criadores_paginas_checkouts_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_paginas_checkouts" ADD CONSTRAINT "criadores_paginas_checkouts_venda_id_criadores_vendas_id_fk" FOREIGN KEY ("venda_id") REFERENCES "public"."criadores_vendas"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_paginas_checkouts" ADD CONSTRAINT "fk_criadores_paginas_checkouts_pagina" FOREIGN KEY ("pagina_id","criador_id") REFERENCES "public"."criadores_paginas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_paginas_checkouts" ADD CONSTRAINT "fk_criadores_paginas_checkouts_funil" FOREIGN KEY ("funil_id","criador_id") REFERENCES "public"."criadores_funis"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_paginas_visitas" ADD CONSTRAINT "criadores_paginas_visitas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_paginas_visitas" ADD CONSTRAINT "fk_criadores_paginas_visitas_pagina" FOREIGN KEY ("pagina_id","criador_id") REFERENCES "public"."criadores_paginas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_paginas_visitas" ADD CONSTRAINT "fk_criadores_paginas_visitas_funil" FOREIGN KEY ("funil_id","criador_id") REFERENCES "public"."criadores_funis"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_criadores_funis_criador" ON "criadores_funis" USING btree ("criador_id","created_at") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_leads_email_vivo" ON "criadores_leads" USING btree ("criador_id","email") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_leads_criador" ON "criadores_leads" USING btree ("criador_id","ultima_captura_em") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_leads_funil" ON "criadores_leads" USING btree ("funil_id","pagina_id") WHERE funil_id is not null and is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_paginas_slug_vivo" ON "criadores_paginas" USING btree ("criador_id","slug") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_paginas_criador" ON "criadores_paginas" USING btree ("criador_id","updated_at") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_paginas_checkouts_venda" ON "criadores_paginas_checkouts" USING btree ("venda_id");--> statement-breakpoint
CREATE INDEX "ix_criadores_paginas_checkouts_pagina" ON "criadores_paginas_checkouts" USING btree ("pagina_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_criadores_paginas_checkouts_funil" ON "criadores_paginas_checkouts" USING btree ("funil_id","created_at") WHERE funil_id is not null;--> statement-breakpoint
CREATE INDEX "ix_criadores_paginas_visitas_funil" ON "criadores_paginas_visitas" USING btree ("funil_id","dia") WHERE funil_id is not null;