import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { Destaque } from "@/components/vitrine/destaque";
import { Fileira } from "@/components/vitrine/fileira";

/**
 * Amostra da área do aluno com os componentes REAIS (Destaque reduzido, botões, selos e uma
 * fileira com 2 cartões). `inert`: é só para olhar — nada é clicável nem recebe foco.
 */
export function PreviaMarca() {
  return (
    <div inert className="flex flex-col gap-4">
      {/* Destaque tem 520px+ de altura: reduzido a 40% sem mudar o componente. */}
      <div className="overflow-hidden rounded-xl">
        <div className="[zoom:.4]">
          <Destaque
            titulo="Líder de impacto"
            descricao="Prévia da vitrine com a cor da marca."
            meta={["Curso", "Liderança", "2026"]}
            badge="28 aulas"
            botaoPrincipal={{ texto: "Assistir", href: "/" }}
            botaoSecundario={{ texto: "Mais informações", href: "/" }}
            mostrarAvisos={false}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="36">Continuar</Button>
        <Button size="36" variant="contorno">
          Ver curso
        </Button>
        <Button size="36" variant="link">
          Ver todos
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Selo tom="accent" forma="pilula">
          Em andamento
        </Selo>
        <Selo tom="solido" forma="etiqueta">
          Top 1
        </Selo>
        <Selo tom="ok" forma="pilula">
          Concluído
        </Selo>
      </div>
      <Fileira
        titulo="Continuar assistindo"
        variante="progresso"
        itens={[
          { id: "a", titulo: "Comunicação que inspira", href: "/", progresso: 64 },
          { id: "b", titulo: "Gestão de equipes", href: "/", progresso: 20 },
        ]}
      />
    </div>
  );
}
