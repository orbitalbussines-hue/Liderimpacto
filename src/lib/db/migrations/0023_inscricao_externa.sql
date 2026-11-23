ALTER TABLE "criadores_leads" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "criadores_leads" ADD COLUMN "perfil" text;--> statement-breakpoint
ALTER TABLE "criadores_leads" ADD COLUMN "aceita_novidades" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "criadores_leads" ADD CONSTRAINT "ck_criadores_leads_telefone" CHECK (telefone is null or telefone ~ '^[1-9][0-9]{9,10}$');--> statement-breakpoint
ALTER TABLE "criadores_leads" ADD CONSTRAINT "ck_criadores_leads_perfil" CHECK (perfil is null or length(perfil) between 1 and 60);