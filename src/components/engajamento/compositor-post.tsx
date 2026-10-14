import { FileText, Image as ImagemIcone, List } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Campo } from "@/components/ui/campo";
import { Cartao } from "@/components/ui/cartao";

const ANEXOS = [
  { rotulo: "Imagem", icone: ImagemIcone },
  { rotulo: "Enquete", icone: List },
  { rotulo: "Anexo", icone: FileText },
];

/** Compositor da comunidade. Visual apenas: sem lógica de envio (Fase 2). */
export function CompositorPost({ nomeUsuario }: { nomeUsuario: string }) {
  return (
    <Cartao padding={16} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar nome={nomeUsuario} tamanho={40} tom="accent" />
        <Campo
          rotulo="Nova publicação"
          rotuloOculto
          placeholder="Compartilhe algo com a comunidade..."
          classNameMoldura="flex-1"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="m-0 flex list-none gap-3.5 p-0 text-[13px] text-muted">
          {ANEXOS.map(({ rotulo, icone: Icone }) => (
            <li key={rotulo} className="flex items-center gap-[5px]">
              <Icone aria-hidden className="size-[15px]" />
              {rotulo}
            </li>
          ))}
        </ul>
        <Button size="36" className="px-4">
          Publicar
        </Button>
      </div>
    </Cartao>
  );
}
