import { Suspense, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Esqueleto } from "@/components/ui/esqueleto";
import { Destaque } from "@/components/vitrine/destaque";
import { EsqueletoFileira } from "@/components/vitrine/esqueleto-fileira";
import { Fileira } from "@/components/vitrine/fileira";
import { cursosDoAluno } from "@/lib/matriculas/consultas";
import type { ConfigVitrine, FileiraVitrine } from "@/lib/vitrine/config";
import { fileirasVisiveis, resolverDestaque, resolverFileira, type QuemVe } from "@/lib/vitrine/resolver";

/**
 * A vitrine montada no servidor (README tela 2), usada pela página `/` (config PUBLICADA ou
 * padrão) e pela prévia do construtor (`/previa-vitrine`, RASCUNHO). Cada bloco num <Suspense>
 * com o próprio esqueleto. Na prévia cada bloco ganha `data-bloco` (clique seleciona no construtor)
 * e a fileira vazia aparece como aviso tracejado (para o aluno ela some: RN-136).
 */

export interface VitrineMontadaProps {
  q: QuemVe & { criador: { id: string; nome: string } };
  config: ConfigVitrine | null;
  previa?: boolean;
}

const esqueletoDestaque = <Esqueleto className="min-h-[520px] rounded-3xl desk:min-h-[600px]" />;

function Bloco({ id, previa, children }: { id: string; previa: boolean; children: ReactNode }) {
  return previa ? (
    <div data-bloco={id} className="cursor-pointer rounded-3xl outline-offset-4 transition-[outline-color] data-[selecionado]:outline-2 data-[selecionado]:outline-accent">
      {children}
    </div>
  ) : (
    children
  );
}

async function BlocoDestaque({ q, config }: { q: QuemVe; config: ConfigVitrine | null }) {
  const d = await resolverDestaque(q, config?.destaque ?? null);
  return d ? <Destaque {...d} /> : null;
}

async function BlocoFileira({ q, f, previa }: { q: QuemVe; f: FileiraVitrine; previa: boolean }) {
  const r = await resolverFileira(q, f);
  if (r.itens.length === 0) {
    if (!previa) return null;
    return (
      <div className="flex flex-col gap-1 rounded-[14px] border border-dashed border-border px-4 py-3.5">
        <h3 className="m-0 text-[17px] font-bold desk:text-[21px]">{r.titulo}</h3>
        <p className="m-0 text-[13px] text-muted">Sem itens para você agora: quem não tiver itens nesta fileira não a vê.</p>
      </div>
    );
  }
  return <Fileira titulo={r.titulo} tag={r.tag} variante={r.variante} itens={r.itens} />;
}

async function Conteudo({ q, config, previa = false }: VitrineMontadaProps) {
  const [cursos, fileiras] = await Promise.all([
    q.membro.papel === "ALUNO" && q.membro.id ? cursosDoAluno(q.criador.id, q.membro.id, new Date()) : null,
    fileirasVisiveis(q, config),
  ]);
  const semCursos = cursos !== null && cursos.length === 0;
  return (
    <>
      {semCursos ? (
        <>
          <h1 className="sr-only">Início</h1>
          <EstadoVazio
            comMoldura
            icone={<BookOpen />}
            titulo="Você ainda não tem cursos"
            descricao={`Assim que a equipe da ${q.criador.nome} liberar o seu acesso, seus cursos aparecem aqui. Se você já fez a compra, fale com a equipe.`}
            className="py-16"
          />
        </>
      ) : (
        // O Destaque traz o <h1> da página.
        <Bloco id="destaque" previa={previa}>
          <Suspense fallback={esqueletoDestaque}>
            <BlocoDestaque q={q} config={config} />
          </Suspense>
        </Bloco>
      )}
      {fileiras.map((f) => (
        <Bloco key={f.id} id={f.id} previa={previa}>
          <Suspense fallback={<EsqueletoFileira estreito={f.tipo === "TOP10"} rotulo={`Carregando ${f.titulo.replace("{nome}", "").replace(/,\s*$/, "")}`} />}>
            <BlocoFileira q={q} f={f} previa={previa} />
          </Suspense>
        </Bloco>
      ))}
    </>
  );
}

export function VitrineMontada(props: VitrineMontadaProps) {
  return (
    <div data-vitrine className="mx-auto flex max-w-[1600px] flex-col gap-[22px] desk:gap-[34px]">
      <Conteudo {...props} />
    </div>
  );
}

/** Esqueleto da página inteira (enquanto a sessão e a config chegam). */
export function EsqueletoVitrine() {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-[22px] desk:gap-[34px]">
      {esqueletoDestaque}
      <EsqueletoFileira />
      <EsqueletoFileira estreito />
    </div>
  );
}
