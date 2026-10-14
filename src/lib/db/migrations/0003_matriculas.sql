CREATE TABLE "produtos_matriculas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"status" text DEFAULT 'ATIVA' NOT NULL,
	"iniciada_em" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"concluida_em" timestamp (3) with time zone,
	"expira_em" timestamp (3) with time zone,
	"referencia_externa" text,
	"motivo_cancelamento" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_matriculas_origem" CHECK (origem in ('MANUAL', 'IMPORTACAO', 'COMPRA')),
	CONSTRAINT "ck_produtos_matriculas_status" CHECK (status in ('ATIVA', 'PENDENTE', 'CANCELADA')),
	CONSTRAINT "ck_produtos_matriculas_referencia" CHECK (referencia_externa is null or referencia_externa ~ '^[a-z0-9-]{2,30}:[^[:space:]]{1,200}$'),
	CONSTRAINT "ck_produtos_matriculas_motivo" CHECK (status <> 'CANCELADA' or length(trim(motivo_cancelamento)) >= 3)
);
--> statement-breakpoint
ALTER TABLE "produtos_matriculas" ADD CONSTRAINT "produtos_matriculas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_matriculas" ADD CONSTRAINT "fk_produtos_matriculas_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_matriculas" ADD CONSTRAINT "fk_produtos_matriculas_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_matriculas_par_vivo" ON "produtos_matriculas" USING btree ("membro_id","produto_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_matriculas_referencia" ON "produtos_matriculas" USING btree ("criador_id","referencia_externa") WHERE referencia_externa is not null;--> statement-breakpoint
CREATE INDEX "ix_produtos_matriculas_produto" ON "produtos_matriculas" USING btree ("criador_id","produto_id") WHERE is_deleted = false;