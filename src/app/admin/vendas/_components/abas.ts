import type { AbaTabela } from "@/components/admin/pagina-tabela";

/** Abas das telas de Vendas e financeiro (hub em /admin/vendas-e-financeiro). */
export const ABAS_VENDAS: AbaTabela[] = [
  { rotulo: "Vendas", href: "/admin/vendas" },
  { rotulo: "Assinaturas", href: "/admin/vendas/assinaturas" },
  { rotulo: "Financeiro", href: "/admin/vendas/financeiro" },
  { rotulo: "Ofertas", href: "/admin/vendas/ofertas" },
  { rotulo: "Cupons", href: "/admin/vendas/cupons" },
  { rotulo: "Afiliados", href: "/admin/vendas/afiliados" },
];
