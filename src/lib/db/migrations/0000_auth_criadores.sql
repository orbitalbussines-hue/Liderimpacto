CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"email_verificado" boolean DEFAULT false NOT NULL,
	"imagem" text,
	"papel_plataforma" text DEFAULT 'NENHUM' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"tema" text DEFAULT 'dark' NOT NULL,
	"whatsapp" text,
	"empresa_cargo" text,
	"ultimo_acesso_em" timestamp (3) with time zone,
	"falhas_login" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp (3) with time zone,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_usuarios_papel_plataforma" CHECK (papel_plataforma in ('NENHUM', 'SUPER_ADMIN')),
	CONSTRAINT "ck_usuarios_tema" CHECK (tema in ('dark', 'light'))
);
--> statement-breakpoint
CREATE TABLE "usuarios_contas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"conta_id" text NOT NULL,
	"provedor_id" text NOT NULL,
	"senha_hash" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expira_em" timestamp (3) with time zone,
	"refresh_token_expira_em" timestamp (3) with time zone,
	"escopo" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios_limites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" text NOT NULL,
	"contagem" integer NOT NULL,
	"ultima_requisicao" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios_sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"criador_id" uuid,
	"expira_em" timestamp (3) with time zone NOT NULL,
	"ip" text,
	"agente" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios_verificacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identificador" text NOT NULL,
	"valor" text NOT NULL,
	"expira_em" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios_totp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"segredo" text NOT NULL,
	"codigos_recuperacao" text NOT NULL,
	"verificado" boolean DEFAULT false NOT NULL,
	"falhas_verificacao" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp (3) with time zone,
	"ultimo_passo_totp" bigint,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios_senhas_anteriores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"senha_hash" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"cor_marca" text,
	"status" text DEFAULT 'ATIVO' NOT NULL,
	"dominio_proprio" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "ck_criadores_slug" CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' and slug <> 'www'),
	CONSTRAINT "ck_criadores_cor_marca" CHECK (cor_marca is null or cor_marca ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'),
	CONSTRAINT "ck_criadores_status" CHECK (status in ('ATIVO', 'SUSPENSO'))
);
--> statement-breakpoint
CREATE TABLE "criadores_membros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" text DEFAULT 'ALUNO' NOT NULL,
	"status" text DEFAULT 'ATIVO' NOT NULL,
	"ultimo_acesso_em" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_membros_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_membros_papel" CHECK (papel in ('DONO', 'ADMIN', 'ALUNO')),
	CONSTRAINT "ck_criadores_membros_status" CHECK (status in ('ATIVO', 'INATIVO'))
);
--> statement-breakpoint
CREATE TABLE "criadores_grupos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'TURMA' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL,
	CONSTRAINT "uq_criadores_grupos_id_criador" UNIQUE("id","criador_id"),
	CONSTRAINT "ck_criadores_grupos_tipo" CHECK (tipo in ('TURMA', 'ACESSO'))
);
--> statement-breakpoint
CREATE TABLE "criadores_grupos_membros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criador_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"membro_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"modified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"criador_id" uuid,
	"acao" text NOT NULL,
	"tabela" text NOT NULL,
	"registro_id" uuid,
	"detalhes" text NOT NULL,
	"dados_anteriores" jsonb,
	"dados_novos" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios_contas" ADD CONSTRAINT "usuarios_contas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "usuarios_sessoes" ADD CONSTRAINT "usuarios_sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "usuarios_sessoes" ADD CONSTRAINT "usuarios_sessoes_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "usuarios_totp" ADD CONSTRAINT "usuarios_totp_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "usuarios_senhas_anteriores" ADD CONSTRAINT "usuarios_senhas_anteriores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros" ADD CONSTRAINT "criadores_membros_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_membros" ADD CONSTRAINT "criadores_membros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_grupos" ADD CONSTRAINT "criadores_grupos_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_grupos_membros" ADD CONSTRAINT "criadores_grupos_membros_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_grupos_membros" ADD CONSTRAINT "fk_criadores_grupos_membros_grupo" FOREIGN KEY ("grupo_id","criador_id") REFERENCES "public"."criadores_grupos"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_grupos_membros" ADD CONSTRAINT "fk_criadores_grupos_membros_membro" FOREIGN KEY ("membro_id","criador_id") REFERENCES "public"."criadores_membros"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_criador_id_criadores_id_fk" FOREIGN KEY ("criador_id") REFERENCES "public"."criadores"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_usuarios_email_vivo" ON "usuarios" USING btree (lower("email")) WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_usuarios_contas_provedor" ON "usuarios_contas" USING btree ("provedor_id","conta_id");--> statement-breakpoint
CREATE INDEX "ix_usuarios_contas_usuario" ON "usuarios_contas" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_usuarios_limites_chave" ON "usuarios_limites" USING btree ("chave");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_usuarios_sessoes_token" ON "usuarios_sessoes" USING btree ("token");--> statement-breakpoint
CREATE INDEX "ix_usuarios_sessoes_usuario" ON "usuarios_sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "ix_usuarios_verificacoes_identificador" ON "usuarios_verificacoes" USING btree ("identificador");--> statement-breakpoint
CREATE INDEX "ix_usuarios_verificacoes_valor" ON "usuarios_verificacoes" USING btree ("valor");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_usuarios_totp_usuario" ON "usuarios_totp" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "ix_usuarios_senhas_anteriores_usuario" ON "usuarios_senhas_anteriores" USING btree ("usuario_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_slug_vivo" ON "criadores" USING btree ("slug") WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_dominio_proprio_vivo" ON "criadores" USING btree (lower("dominio_proprio")) WHERE is_deleted = false and dominio_proprio is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_membros_vivo" ON "criadores_membros" USING btree ("criador_id","usuario_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_membros_usuario" ON "criadores_membros" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_grupos_nome_vivo" ON "criadores_grupos" USING btree ("criador_id",lower("nome")) WHERE is_deleted = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_grupos_membros_vivo" ON "criadores_grupos_membros" USING btree ("grupo_id","membro_id") WHERE is_deleted = false;--> statement-breakpoint
CREATE INDEX "ix_criadores_grupos_membros_membro" ON "criadores_grupos_membros" USING btree ("membro_id");--> statement-breakpoint
CREATE INDEX "idx_auditoria_registro" ON "auditoria" USING btree ("tabela","registro_id");--> statement-breakpoint
CREATE INDEX "idx_auditoria_usuario" ON "auditoria" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_auditoria_criador" ON "auditoria" USING btree ("criador_id","created_at");