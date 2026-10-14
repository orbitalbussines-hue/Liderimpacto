CREATE TABLE "produtos_modulos_aulas_legendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"aula_id" uuid NOT NULL,
	"idioma" text DEFAULT 'pt-BR' NOT NULL,
	"rotulo" text NOT NULL,
	"nome_original" text NOT NULL,
	"chave" text NOT NULL,
	"texto" text NOT NULL,
	"trechos" integer NOT NULL,
	"duracao_seg" integer NOT NULL,
	"enviado_por" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_modulos_aulas_legendas_idioma" CHECK (idioma ~ '^[a-z]{2,3}(-([A-Z]{2}|[0-9]{3}))?$'),
	CONSTRAINT "ck_produtos_modulos_aulas_legendas_rotulo" CHECK (length(rotulo) between 1 and 40),
	CONSTRAINT "ck_produtos_modulos_aulas_legendas_chave" CHECK (chave like 'criadores/' || criador_id::text || '/legendas/%'),
	CONSTRAINT "ck_produtos_modulos_aulas_legendas_trechos" CHECK (trechos >= 1),
	CONSTRAINT "ck_produtos_modulos_aulas_legendas_duracao" CHECK (duracao_seg >= 0)
);
--> statement-breakpoint
ALTER TABLE "arquivos" DROP CONSTRAINT "ck_arquivos_finalidade";--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_legendas" ADD CONSTRAINT "produtos_modulos_aulas_legendas_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_legendas" ADD CONSTRAINT "fk_produtos_modulos_aulas_legendas_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_legendas" ADD CONSTRAINT "fk_produtos_modulos_aulas_legendas_enviado_por" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_modulos_aulas_legendas_aula_idioma_vivo" ON "produtos_modulos_aulas_legendas" USING btree ("aula_id","idioma") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_modulos_aulas_legendas_chave" ON "produtos_modulos_aulas_legendas" USING btree ("chave");--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "ck_arquivos_finalidade" CHECK (finalidade in ('IMAGEM', 'MATERIAL', 'LEGENDA', 'COMUNIDADE_IMAGEM', 'COMUNIDADE_PDF', 'CERTIFICADO'));