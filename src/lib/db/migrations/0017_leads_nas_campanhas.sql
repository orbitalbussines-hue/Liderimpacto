ALTER TABLE "criadores_leads" ADD CONSTRAINT "uq_criadores_leads_id_criador" UNIQUE("id","criador_id");--> statement-breakpoint
ALTER TABLE "criadores_automacoes" DROP CONSTRAINT "ck_criadores_automacoes_gatilho";--> statement-breakpoint
ALTER TABLE "criadores_automacoes_execucoes" ALTER COLUMN "membro_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "criadores_emails_envios" ALTER COLUMN "membro_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "criadores_automacoes" ADD COLUMN "pagina_id" uuid;--> statement-breakpoint
ALTER TABLE "criadores_automacoes" ADD COLUMN "funil_id" uuid;--> statement-breakpoint
ALTER TABLE "criadores_automacoes_execucoes" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "criadores_emails_envios" ADD COLUMN "lead_id" uuid;--> statement-breakpoint
ALTER TABLE "criadores_automacoes" ADD CONSTRAINT "fk_criadores_automacoes_pagina" FOREIGN KEY ("pagina_id","criador_id") REFERENCES "public"."criadores_paginas"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_automacoes" ADD CONSTRAINT "fk_criadores_automacoes_funil" FOREIGN KEY ("funil_id","criador_id") REFERENCES "public"."criadores_funis"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_automacoes_execucoes" ADD CONSTRAINT "fk_criadores_automacoes_execucoes_lead" FOREIGN KEY ("lead_id","criador_id") REFERENCES "public"."criadores_leads"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "criadores_emails_envios" ADD CONSTRAINT "fk_criadores_emails_envios_lead" FOREIGN KEY ("lead_id","criador_id") REFERENCES "public"."criadores_leads"("id","criador_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_criadores_automacoes_execucoes_ref_lead" ON "criadores_automacoes_execucoes" USING btree ("automacao_id","lead_id","referencia") WHERE lead_id is not null;--> statement-breakpoint
ALTER TABLE "criadores_automacoes" ADD CONSTRAINT "ck_criadores_automacoes_origem_lead" CHECK ((pagina_id is null and funil_id is null) or gatilho = 'LEAD_CAPTURADO');--> statement-breakpoint
ALTER TABLE "criadores_automacoes" ADD CONSTRAINT "ck_criadores_automacoes_gatilho" CHECK (gatilho in ('MEMBRO_CADASTRADO', 'MATRICULA_CRIADA', 'AULA_CONCLUIDA', 'CURSO_CONCLUIDO', 'CERTIFICADO_EMITIDO', 'VOUCHER_RESGATADO', 'INATIVIDADE', 'NUNCA_ACESSOU', 'LEAD_CAPTURADO'));--> statement-breakpoint
ALTER TABLE "criadores_automacoes_execucoes" ADD CONSTRAINT "ck_criadores_automacoes_execucoes_destinatario" CHECK ((membro_id is null) <> (lead_id is null));--> statement-breakpoint
ALTER TABLE "criadores_emails_envios" ADD CONSTRAINT "ck_criadores_emails_envios_destinatario" CHECK ((membro_id is null) <> (lead_id is null) and (lead_id is null or origem <> 'PRIMEIRO_ACESSO'));