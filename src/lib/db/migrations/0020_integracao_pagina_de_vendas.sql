ALTER TABLE "criadores_integracoes" DROP CONSTRAINT "ck_criadores_integracoes_plataforma";--> statement-breakpoint
ALTER TABLE "integracoes_recibos" DROP CONSTRAINT "ck_integracoes_recibos_plataforma";--> statement-breakpoint
ALTER TABLE "criadores_integracoes" ADD CONSTRAINT "ck_criadores_integracoes_plataforma" CHECK (plataforma in ('HOTMART', 'EDUZZ', 'BLING', 'PAGINA'));--> statement-breakpoint
ALTER TABLE "integracoes_recibos" ADD CONSTRAINT "ck_integracoes_recibos_plataforma" CHECK (plataforma in ('HOTMART', 'EDUZZ', 'BLING', 'PAGINA'));