import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PaginaTabela } from "@/components/admin/pagina-tabela";
import type { Linha } from "@/components/admin/tabela-tipos";
import { URL_PLATAFORMA } from "@/lib/auth/auth";
import { superAdminDaPagina } from "@/lib/auth/guarda";
import { listarCriadores } from "@/lib/criador/consultas";
import { urlDaArea } from "@/lib/criador/host";
import { AcoesCriador } from "./_components/acoes-criador";

const COLUNAS = [
  { titulo: "Criador" },
  { titulo: "Endereço", largura: 260 },
  { titulo: "Dono", largura: 240 },
  { titulo: "Membros", largura: 100 },
  { titulo: "Status", largura: 110 },
  { titulo: "Criado em", largura: 110 },
  { titulo: "Ações", largura: 56 },
];

const data = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });

/** Area da plataforma (so no apex, so SUPER_ADMIN): criadores, com criar e suspender/reativar. */
async function Criadores() {
  const s = await superAdminDaPagina();
  if (s.alvo.tipo !== "plataforma") notFound();
  const lista = await listarCriadores();
  const ativos = lista.filter((c) => c.status === "ATIVO").length;
  const linhas: Linha[] = lista.map((c) => {
    const url = urlDaArea(URL_PLATAFORMA, c.slug);
    return [
      { tipo: "texto", texto: c.nome, sub: c.slug },
      { tipo: "texto", texto: url.replace(/^https?:\/\//, "") },
      c.donoNome ? { tipo: "membro", nome: c.donoNome, email: c.donoEmail ?? "" } : { tipo: "texto", texto: "—" },
      { tipo: "numeroDestaque", texto: String(c.membros) },
      { tipo: "selo", texto: c.status === "ATIVO" ? "Ativo" : "Suspenso", tom: c.status === "ATIVO" ? "ok" : "warn" },
      { tipo: "data", texto: data(c.criadoEm) },
      { tipo: "no", conteudo: <AcoesCriador criador={{ id: c.id, nome: c.nome, status: c.status, versao: c.versao.toISOString(), url }} /> },
    ];
  });
  return (
    <PaginaTabela
      titulo="Criadores"
      estatistica={
        <>
          {lista.length} no total · <b className="text-ok">{ativos} ativos</b> · {lista.length - ativos} suspensos
        </>
      }
      abas={[{ rotulo: "Criadores", href: "/plataforma" }]}
      acaoPrincipal={{ rotulo: "Novo criador", icone: Plus, href: "/plataforma/novo" }}
      colunas={COLUNAS}
      linhas={linhas}
      chaves={lista.map((c) => c.id)}
      vazio={{ titulo: "Nenhum criador ainda", descricao: "Cadastre o primeiro em “Novo criador”." }}
    />
  );
}

export default function PaginaPlataforma() {
  return (
    <Suspense fallback={null}>
      <Criadores />
    </Suspense>
  );
}
