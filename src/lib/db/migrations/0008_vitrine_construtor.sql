CREATE TABLE "criadores_vitrines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"rascunho" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_vitrines_id_criador" UNIQUE("id","criador_id")
);
--> statement-breakpoint
CREATE TABLE "criadores_vitrines_versoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"vitrine_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"config" jsonb NOT NULL,
	"publicada_em" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"publicada_por" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_vitrines_versoes_numero" CHECK (numero >= 1)
);
--> statement-breakpoint
ALTER TABLE "criadores_vitrines" ADD CONSTRAINT "criadores_vitrines_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vitrines_versoes" ADD CONSTRAINT "criadores_vitrines_versoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vitrines_versoes" ADD CONSTRAINT "criadores_vitrines_versoes_publicada_por_usuarios_id_fk" FOREIGN KEY ("publicada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_vitrines_versoes" ADD CONSTRAINT "fk_criadores_vitrines_versoes_vitrine" FOREIGN KEY ("vitrine_id","criador_id") REFERENCES "public"."criadores_vitrines"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_vitrines_criador_vivo" ON "criadores_vitrines" USING btree ("criador_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_vitrines_versoes_numero" ON "criadores_vitrines_versoes" USING btree ("vitrine_id","numero");