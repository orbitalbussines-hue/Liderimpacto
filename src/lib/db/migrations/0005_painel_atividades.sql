CREATE TABLE "criadores_membros_atividades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"dia" date NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "criadores_membros_atividades" ADD CONSTRAINT "criadores_membros_atividades_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_atividades" ADD CONSTRAINT "fk_criadores_membros_atividades_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_membros_atividades_dia_vivo" ON "criadores_membros_atividades" USING btree ("membro_id","dia") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_membros_atividades_criador_dia" ON "criadores_membros_atividades" USING btree ("criador_id","dia") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_progressos_concluidas" ON "produtos_modulos_aulas_progressos" USING btree ("criador_id","concluida_em" DESC NULLS LAST) WHERE concluida and is_deleted = false;--> statement-breakpoint
-- Carga inicial (escrita a mao): o que o progresso ja sabe. A linha do progresso so guarda o
-- ULTIMO dia assistido e o dia da conclusao; o historico completo comeca a partir daqui.
INSERT INTO "criadores_membros_atividades" ("criador_id", "membro_id", "dia", "modified_by")
SELECT DISTINCT p.criador_id, p.membro_id, d.dia, p.modified_by
FROM "produtos_modulos_aulas_progressos" p
CROSS JOIN LATERAL (VALUES (p.ultima_visualizacao_dia), ((p.concluida_em AT TIME ZONE 'America/Sao_Paulo')::date)) AS d(dia)
WHERE p.is_deleted = false AND d.dia IS NOT NULL
ON CONFLICT ("membro_id", "dia") WHERE is_deleted = false DO NOTHING;
