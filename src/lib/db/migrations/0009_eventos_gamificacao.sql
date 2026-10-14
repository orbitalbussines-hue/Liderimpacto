CREATE TABLE "criadores_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"inicio_em" timestamp (3) with time zone NOT NULL,
	"duracao_min" integer NOT NULL,
	"link_acesso" text,
	"situacao" text DEFAULT 'RASCUNHO' NOT NULL,
	"publico" text DEFAULT 'TODOS' NOT NULL,
	"produto_id" uuid,
	"gravacao_aula_id" uuid,
	"publicado_em" timestamp (3) with time zone,
	"cancelado_em" timestamp (3) with time zone,
	"criado_por" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_eventos_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_eventos_situacao" CHECK (situacao in ('RASCUNHO', 'PUBLICADO', 'CANCELADO')),
	CONSTRAINT "ck_criadores_eventos_publico" CHECK (publico in ('TODOS', 'PRODUTO', 'GRUPOS')),
	CONSTRAINT "ck_criadores_eventos_produto" CHECK ((publico = 'PRODUTO') = (produto_id is not null)),
	CONSTRAINT "ck_criadores_eventos_titulo" CHECK (char_length(trim(titulo)) between 3 and 120),
	CONSTRAINT "ck_criadores_eventos_descricao" CHECK (char_length(descricao) <= 2000),
	CONSTRAINT "ck_criadores_eventos_duracao" CHECK (duracao_min between 5 and 720),
	CONSTRAINT "ck_criadores_eventos_link" CHECK (link_acesso is null or (char_length(link_acesso) <= 500 and link_acesso ~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$')),
	CONSTRAINT "ck_criadores_eventos_link_publicado" CHECK (situacao = 'RASCUNHO' or link_acesso is not null),
	CONSTRAINT "ck_criadores_eventos_publicado_em" CHECK (situacao <> 'PUBLICADO' or publicado_em is not null),
	CONSTRAINT "ck_criadores_eventos_cancelado_em" CHECK ((situacao = 'CANCELADO') = (cancelado_em is not null))
);
--> statement-breakpoint
CREATE TABLE "criadores_eventos_grupos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criadores_eventos_inscricoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criadores_desafios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"inicio_em" timestamp (3) with time zone NOT NULL,
	"fim_em" timestamp (3) with time zone NOT NULL,
	"meta_tipo" text NOT NULL,
	"meta_quantidade" integer,
	"meta_produto_id" uuid,
	"meta_avaliacao_id" uuid,
	"pontos_bonus" integer DEFAULT 0 NOT NULL,
	"recompensa" text,
	"situacao" text DEFAULT 'RASCUNHO' NOT NULL,
	"publico" text DEFAULT 'TODOS' NOT NULL,
	"criado_por" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_desafios_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_desafios_situacao" CHECK (situacao in ('RASCUNHO', 'PUBLICADO', 'ENCERRADO')),
	CONSTRAINT "ck_criadores_desafios_publico" CHECK (publico in ('TODOS', 'GRUPOS')),
	CONSTRAINT "ck_criadores_desafios_meta_tipo" CHECK (meta_tipo in ('AULAS_CONCLUIDAS', 'CURSO_CONCLUIDO', 'AVALIACAO_APROVADA', 'PUBLICACOES_COMUNIDADE')),
	CONSTRAINT "ck_criadores_desafios_meta" CHECK ((meta_tipo in ('AULAS_CONCLUIDAS', 'PUBLICACOES_COMUNIDADE')) = (meta_quantidade is not null)
        and (meta_tipo = 'CURSO_CONCLUIDO') = (meta_produto_id is not null)
        and (meta_tipo = 'AVALIACAO_APROVADA') = (meta_avaliacao_id is not null)
        and (meta_quantidade is null or meta_quantidade between 1 and 1000)),
	CONSTRAINT "ck_criadores_desafios_janela" CHECK (fim_em > inicio_em),
	CONSTRAINT "ck_criadores_desafios_bonus" CHECK (pontos_bonus between 0 and 10000),
	CONSTRAINT "ck_criadores_desafios_titulo" CHECK (char_length(trim(titulo)) between 3 and 120),
	CONSTRAINT "ck_criadores_desafios_descricao" CHECK (char_length(descricao) <= 2000),
	CONSTRAINT "ck_criadores_desafios_recompensa" CHECK (recompensa is null or char_length(trim(recompensa)) between 3 and 200)
);
--> statement-breakpoint
CREATE TABLE "criadores_desafios_grupos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"desafio_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criadores_desafios_participacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"desafio_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"concluido_em" timestamp (3) with time zone,
	"recompensa_entregue_em" timestamp (3) with time zone,
	"recompensa_entregue_por" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_desafios_participacoes_entrega" CHECK ((recompensa_entregue_em is null) = (recompensa_entregue_por is null)),
	CONSTRAINT "ck_criadores_desafios_participacoes_entrega_concluido" CHECK (recompensa_entregue_em is null or concluido_em is not null)
);
--> statement-breakpoint
CREATE TABLE "criadores_gamificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"ligada" boolean DEFAULT false NOT NULL,
	"pontos_aula_concluida" integer DEFAULT 10 NOT NULL,
	"pontos_curso_concluido" integer DEFAULT 100 NOT NULL,
	"pontos_avaliacao_aprovada" integer DEFAULT 30 NOT NULL,
	"pontos_publicacao_comunidade" integer DEFAULT 2 NOT NULL,
	"niveis" jsonb DEFAULT '[{"nome":"Iniciante","minimo":0},{"nome":"Aprendiz","minimo":100},{"nome":"Praticante","minimo":300},{"nome":"Líder","minimo":700},{"nome":"Referência","minimo":1500}]'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_gamificacao_pontos" CHECK (pontos_aula_concluida between 0 and 10000 and pontos_curso_concluido between 0 and 10000
        and pontos_avaliacao_aprovada between 0 and 10000 and pontos_publicacao_comunidade between 0 and 10000),
	CONSTRAINT "ck_criadores_gamificacao_niveis" CHECK (jsonb_typeof(niveis) = 'array' and jsonb_array_length(niveis) between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "criadores_membros_pontos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"pontos" integer NOT NULL,
	"referencia" text NOT NULL,
	"ocorrido_em" timestamp (3) with time zone NOT NULL,
	"justificativa" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_membros_pontos_motivo" CHECK (motivo in ('AULA_CONCLUIDA', 'CURSO_CONCLUIDO', 'AVALIACAO_APROVADA', 'PUBLICACAO_COMUNIDADE', 'DESAFIO_CONCLUIDO', 'AJUSTE_MANUAL')),
	CONSTRAINT "ck_criadores_membros_pontos_valor" CHECK ((motivo = 'AJUSTE_MANUAL' and pontos <> 0 and pontos between -100000 and 100000 and char_length(trim(coalesce(justificativa, ''))) between 5 and 500)
        or (motivo <> 'AJUSTE_MANUAL' and pontos between 1 and 100000 and justificativa is null)),
	CONSTRAINT "ck_criadores_membros_pontos_referencia" CHECK (referencia ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (motivo = 'PUBLICACAO_COMUNIDADE' and referencia ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
);
--> statement-breakpoint
ALTER TABLE "criadores_membros_notificacoes" DROP CONSTRAINT "ck_criadores_membros_notificacoes_tipo";--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "aparecer_no_ranking" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "criadores_membros_atividades" ADD COLUMN "segundos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos_modulos_aulas_progressos" ADD COLUMN "segundos_novos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "criadores_eventos" ADD CONSTRAINT "criadores_eventos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_eventos" ADD CONSTRAINT "criadores_eventos_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_eventos" ADD CONSTRAINT "fk_criadores_eventos_produto" FOREIGN KEY ("produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_eventos" ADD CONSTRAINT "fk_criadores_eventos_gravacao" FOREIGN KEY ("gravacao_aula_id","criador_id") REFERENCES "public"."produtos_modulos_aulas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_eventos_grupos" ADD CONSTRAINT "criadores_eventos_grupos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_eventos_grupos" ADD CONSTRAINT "fk_criadores_eventos_grupos_evento" FOREIGN KEY ("evento_id","criador_id") REFERENCES "public"."criadores_eventos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_eventos_grupos" ADD CONSTRAINT "fk_criadores_eventos_grupos_grupo" FOREIGN KEY ("grupo_id","criador_id") REFERENCES "public"."criadores_grupos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_eventos_inscricoes" ADD CONSTRAINT "criadores_eventos_inscricoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_eventos_inscricoes" ADD CONSTRAINT "fk_criadores_eventos_inscricoes_evento" FOREIGN KEY ("evento_id","criador_id") REFERENCES "public"."criadores_eventos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_eventos_inscricoes" ADD CONSTRAINT "fk_criadores_eventos_inscricoes_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios" ADD CONSTRAINT "criadores_desafios_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios" ADD CONSTRAINT "criadores_desafios_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios" ADD CONSTRAINT "fk_criadores_desafios_produto" FOREIGN KEY ("meta_produto_id","criador_id") REFERENCES "public"."produtos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios" ADD CONSTRAINT "fk_criadores_desafios_avaliacao" FOREIGN KEY ("meta_avaliacao_id","criador_id") REFERENCES "public"."produtos_avaliacoes"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios_grupos" ADD CONSTRAINT "criadores_desafios_grupos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios_grupos" ADD CONSTRAINT "fk_criadores_desafios_grupos_desafio" FOREIGN KEY ("desafio_id","criador_id") REFERENCES "public"."criadores_desafios"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios_grupos" ADD CONSTRAINT "fk_criadores_desafios_grupos_grupo" FOREIGN KEY ("grupo_id","criador_id") REFERENCES "public"."criadores_grupos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios_participacoes" ADD CONSTRAINT "criadores_desafios_participacoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios_participacoes" ADD CONSTRAINT "criadores_desafios_participacoes_recompensa_entregue_por_usuarios_id_fk" FOREIGN KEY ("recompensa_entregue_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios_participacoes" ADD CONSTRAINT "fk_criadores_desafios_participacoes_desafio" FOREIGN KEY ("desafio_id","criador_id") REFERENCES "public"."criadores_desafios"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_desafios_participacoes" ADD CONSTRAINT "fk_criadores_desafios_participacoes_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_gamificacao" ADD CONSTRAINT "criadores_gamificacao_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_pontos" ADD CONSTRAINT "criadores_membros_pontos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_pontos" ADD CONSTRAINT "criadores_membros_pontos_modified_by_usuarios_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros_pontos" ADD CONSTRAINT "fk_criadores_membros_pontos_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "ix_criadores_eventos_agenda" ON "criadores_eventos" USING btree ("criador_id","inicio_em") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_eventos_grupos_vivo" ON "criadores_eventos_grupos" USING btree ("evento_id","grupo_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_eventos_inscricoes_vivo" ON "criadores_eventos_inscricoes" USING btree ("evento_id","membro_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_eventos_inscricoes_membro" ON "criadores_eventos_inscricoes" USING btree ("membro_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_desafios_janela" ON "criadores_desafios" USING btree ("criador_id","fim_em") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_desafios_grupos_vivo" ON "criadores_desafios_grupos" USING btree ("desafio_id","grupo_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_desafios_participacoes_vivo" ON "criadores_desafios_participacoes" USING btree ("desafio_id","membro_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_desafios_participacoes_membro" ON "criadores_desafios_participacoes" USING btree ("membro_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_gamificacao_vivo" ON "criadores_gamificacao" USING btree ("criador_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_membros_pontos_fato" ON "criadores_membros_pontos" USING btree ("membro_id","motivo","referencia");--> statement-breakpoint
CREATE INDEX "ix_criadores_membros_pontos_ranking" ON "criadores_membros_pontos" USING btree ("criador_id","ocorrido_em","membro_id","pontos");--> statement-breakpoint
CREATE INDEX "ix_produtos_modulos_aulas_progressos_criador_aula" ON "produtos_modulos_aulas_progressos" USING btree ("criador_id","aula_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_produtos_avaliacoes_tentativas_finalizadas" ON "produtos_avaliacoes_tentativas" USING btree ("criador_id","finalizada_em") WHERE finalizada_em is not null and is_deleted = false;--> statement-breakpoint
ALTER TABLE "criadores_membros_notificacoes" ADD CONSTRAINT "ck_criadores_membros_notificacoes_tipo" CHECK (tipo in ('COMENTARIO_NO_POST', 'RESPOSTA_AO_COMENTARIO', 'CURTIDAS_NO_POST', 'POST_FIXADO', 'AVISO', 'AULA_NOVA', 'CERTIFICADO_EMITIDO', 'MATRICULA_NOVA', 'DENUNCIA_NOVA', 'EVENTO_PUBLICADO', 'EVENTO_LEMBRETE', 'EVENTO_CANCELADO'));