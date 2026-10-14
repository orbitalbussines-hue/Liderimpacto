CREATE TABLE "produtos_modulos_aulas_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"aula_id" uuid NOT NULL,
	"situacao" text DEFAULT 'ENVIANDO' NOT NULL,
	"nome_original" text NOT NULL,
	"mime" text NOT NULL,
	"tamanho_bytes" bigint NOT NULL,
	"chave_origem" text NOT NULL,
	"upload_id" text,
	"prefixo_hls" text,
	"chave_cifrada" text NOT NULL,
	"duracao_seg" integer,
	"resolucoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"thumb_chave" text,
	"erro" text,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"processado_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_produtos_modulos_aulas_videos_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_produtos_modulos_aulas_videos_origem" CHECK (chave_origem like 'criadores/' || criador_id::text || '/videos/%'),
	CONSTRAINT "ck_produtos_modulos_aulas_videos_hls" CHECK (prefixo_hls is null or prefixo_hls like 'criadores/' || criador_id::text || '/videos/%'),
	CONSTRAINT "ck_produtos_modulos_aulas_videos_tamanho" CHECK (tamanho_bytes > 0),
	CONSTRAINT "ck_produtos_modulos_aulas_videos_duracao" CHECK (duracao_seg is null or duracao_seg >= 0),
	CONSTRAINT "ck_produtos_modulos_aulas_videos_resolucoes" CHECK (jsonb_typeof(resolucoes) = 'array'),
	CONSTRAINT "ck_produtos_modulos_aulas_videos_situacao" CHECK (situacao in ('ENVIANDO', 'PROCESSANDO', 'PRONTO', 'FALHOU'))
);
--> statement-breakpoint
CREATE TABLE "produtos_modulos_aulas_videos_processamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"tentativa" integer NOT NULL,
	"situacao" text DEFAULT 'PROCESSANDO' NOT NULL,
	"iniciado_em" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"terminado_em" timestamp (3) with time zone,
	"cpu_seg" integer,
	"log" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_produtos_modulos_aulas_videos_processamentos_tentativa" CHECK (tentativa >= 1),
	CONSTRAINT "ck_produtos_modulos_aulas_videos_processamentos_log" CHECK (log is null or length(log) <= 4000),
	CONSTRAINT "ck_produtos_modulos_aulas_videos_processamentos_situacao" CHECK (situacao in ('PROCESSANDO', 'PRONTO', 'FALHOU'))
);
--> statement-breakpoint
CREATE TABLE "produtos_modulos_aulas_videos_sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"sessao_login_id" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"ultimo_sinal_em" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp (3) with time zone,
	"motivo_encerramento" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_videos" ADD CONSTRAINT "produtos_modulos_aulas_videos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_videos" ADD CONSTRAINT "fk_produtos_modulos_aulas_videos_aula" FOREIGN KEY ("aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_videos_processamentos" ADD CONSTRAINT "fk_produtos_modulos_aulas_videos_processamentos_video" FOREIGN KEY ("video_id","criador_id") REFERENCES "public"."produtos_modulos_aulas_videos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_videos_processamentos" ADD CONSTRAINT "fk_produtos_modulos_aulas_videos_processamentos_criador" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_videos_sessoes" ADD CONSTRAINT "fk_produtos_modulos_aulas_videos_sessoes_video" FOREIGN KEY ("video_id","criador_id") REFERENCES "public"."produtos_modulos_aulas_videos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_videos_sessoes" ADD CONSTRAINT "fk_produtos_modulos_aulas_videos_sessoes_criador" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_videos_sessoes" ADD CONSTRAINT "fk_produtos_modulos_aulas_videos_sessoes_usuario" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_produtos_modulos_aulas_videos_aula_vivo" ON "produtos_modulos_aulas_videos" USING btree ("aula_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_videos_processamentos_video" ON "produtos_modulos_aulas_videos_processamentos" USING btree ("video_id","tentativa");--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_videos_sessoes_usuario" ON "produtos_modulos_aulas_videos_sessoes" USING btree ("usuario_id","ultimo_sinal_em") WHERE encerrada_em is null and is_deleted = false;