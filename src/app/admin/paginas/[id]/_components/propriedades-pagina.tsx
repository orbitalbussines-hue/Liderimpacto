"use client";

import { GrupoChips } from "@/components/ui/grupo-chips";
import type { ConfigPagina, TemaPagina } from "@/lib/paginas/config";
import { LinhaInterruptor } from "@/app/admin/construtor/_components/propriedades-destaque";
import { ImagemDoStorage, Texto, TextoLongo, Titulo } from "./campos";

export interface DadosGerais {
  titulo: string;
  slug: string;
  config: ConfigPagina;
}

/** "Página": nome interno, endereço, tema e SEO (título, descrição, imagem de compartilhamento, noindex). */
export function PropriedadesPagina({ dados, endereco, imagens, lembrarImagem, onMudar }: { dados: DadosGerais; endereco: string; imagens: Record<string, string | null>; lembrarImagem: (id: string, url: string | null) => void; onMudar: (d: DadosGerais) => void }) {
  const { config } = dados;
  const seo = (x: Partial<ConfigPagina["seo"]>) => onMudar({ ...dados, config: { ...config, seo: { ...config.seo, ...x } } });
  return (
    <div className="flex flex-col gap-3.5">
      <Titulo>Página</Titulo>
      <Texto rotulo="Nome (só a equipe vê)" valor={dados.titulo} max={80} onMudar={(titulo) => onMudar({ ...dados, titulo })} />
      <Texto
        rotulo="Endereço"
        valor={dados.slug}
        max={60}
        ajuda={`${endereco}/p/${dados.slug} · mudar o endereço vale na hora, mesmo publicada.`}
        onMudar={(slug) => onMudar({ ...dados, slug: slug.toLowerCase() })}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Tema</span>
        <GrupoChips
          aria-label="Tema da página"
          opcoes={[
            { valor: "ESCURO", rotulo: "Escuro" },
            { valor: "CLARO", rotulo: "Claro" },
          ]}
          valor={config.tema}
          onMudar={(v) => onMudar({ ...dados, config: { ...config, tema: v as TemaPagina } })}
        />
        <span className="text-[11px] text-muted">A cor de destaque é a da marca da área (Aparência).</span>
      </div>
      <h3 className="m-0 mt-2 text-[13px] font-extrabold">Buscadores e compartilhamento</h3>
      <Texto rotulo="Título" valor={config.seo.titulo} max={70} ajuda="Vazio = título da capa." onMudar={(titulo) => seo({ titulo })} />
      <TextoLongo rotulo="Descrição" valor={config.seo.descricao} max={160} linhas={3} ajuda="Até 160 caracteres. Vazio = subtítulo da capa." onMudar={(descricao) => seo({ descricao })} />
      <ImagemDoStorage
        rotulo="Imagem de compartilhamento (1200×630)"
        proporcao="16/9"
        arquivoId={config.seo.imagemArquivoId}
        url={config.seo.imagemArquivoId ? (imagens[config.seo.imagemArquivoId] ?? null) : null}
        onMudar={(id, url) => {
          if (id) lembrarImagem(id, url);
          seo({ imagemArquivoId: id });
        }}
      />
      <LinhaInterruptor titulo="Esconder dos buscadores" descricao="Pede ao Google para não indexar (noindex)" ligado={config.seo.noindex} onAlternar={(noindex) => seo({ noindex })} />
    </div>
  );
}
