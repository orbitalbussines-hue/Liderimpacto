"use client";

import { useState } from "react";
import { AnexoMaterial } from "@/components/curso/anexo-material";
import { Aviso } from "@/components/ui/aviso";
import { acaoLinkDoMaterial } from "@/lib/actions/aulas";
import { formatarTamanho } from "@/lib/armazenamento/regras";
import type { TipoMaterial } from "@/lib/db/schema/_enums";

export interface MaterialAula {
  id: string;
  nome: string;
  tipo: TipoMaterial;
  url: string | null;
  tamanhoBytes: number | null;
}

/** Link externo só http(s): o resto (javascript:, data:) não vira href. */
const linkSeguro = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : undefined);

/**
 * Anexos da aula. LINK abre o endereço; PDF/DOC pedem o link curto de 5 min
 * (`acaoLinkDoMaterial`, que confere o acesso de novo) e baixam sem sair do player.
 */
export function MateriaisAula({ materiais }: { materiais: readonly MaterialAula[] }) {
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const abrir = async (m: MaterialAula) => {
    setErro(null);
    setAbrindo(m.id);
    const r = await acaoLinkDoMaterial({ materialId: m.id }).catch(() => null);
    setAbrindo(null);
    if (!r) return setErro("Sem conexão com o servidor. Tente de novo.");
    if (!r.ok) return setErro(r.erro);
    window.location.assign(r.dados.url); // o storage responde "attachment": baixa e o player continua aqui
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2.5">
        {materiais.map((m) =>
          m.tipo === "LINK" ? (
            <AnexoMaterial key={m.id} tipo="LINK" nome={m.nome} href={linkSeguro(m.url)} detalhe="Link externo" />
          ) : (
            <AnexoMaterial
              key={m.id}
              tipo={m.tipo}
              nome={m.nome}
              detalhe={m.tamanhoBytes ? formatarTamanho(m.tamanhoBytes) : undefined}
              onAbrir={() => void abrir(m)}
              carregando={abrindo === m.id}
            />
          ),
        )}
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}
