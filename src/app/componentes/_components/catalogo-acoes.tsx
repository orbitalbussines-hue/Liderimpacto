import {
  Bell,
  Check,
  ChevronLeft,
  Download,
  Megaphone,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { Amostra, Secao } from "./secao";

export function CatalogoBotoes() {
  return (
    <Secao id="botao" titulo="Botão" arquivo="ui/button.tsx">
      <Amostra rotulo="Variantes (40px)">
        <Button>Publicar</Button>
        <Button variant="secundario">Anterior</Button>
        <Button variant="contorno">Ver como aluno</Button>
        <Button variant="fantasma">Cancelar</Button>
        <Button variant="perigo">
          <Trash2 aria-hidden />
          Remover fileira
        </Button>
        <Button variant="link">Esqueci minha senha</Button>
      </Amostra>
      <Amostra rotulo="Tamanhos: 36 · 40 · 42 · 46 · 50">
        <Button size="36">
          <Plus aria-hidden />
          Cadastrar
        </Button>
        <Button size="40" variant="contorno">
          Ver resultado
        </Button>
        <Button size="42">Acessar</Button>
        <Button size="46" variant="secundario">
          <ChevronLeft aria-hidden />
          Anterior
        </Button>
        <Button size="46">
          <Check aria-hidden />
          Concluir e avançar
        </Button>
        <Button size="50" className="w-60">
          Entrar
        </Button>
      </Amostra>
      <Amostra rotulo="Ícone (36 · 44), pílula, carregando e desabilitado">
        <Button size="icone36" variant="contorno" aria-label="Exportar">
          <Download aria-hidden />
        </Button>
        <Button size="icone44" variant="fantasma" aria-label="Buscar">
          <Search aria-hidden />
        </Button>
        <Button size="icone44" variant="fantasma" aria-label="Notificações">
          <Bell aria-hidden />
        </Button>
        <Button size="36" variant="contorno" pilula>
          Pílula
        </Button>
        <Button carregando>Salvando</Button>
        <Button disabled variant="contorno">
          Bloqueada
        </Button>
      </Amostra>
      <Amostra rotulo="Hero (sempre escuro, 48px pílula)" escura>
        <Button variant="heroPrimario" size="48">
          <Play aria-hidden className="fill-current" />
          Assistir
        </Button>
        <Button variant="heroSecundario" size="48">
          Mais informações
        </Button>
      </Amostra>
    </Secao>
  );
}

export function CatalogoSelos() {
  return (
    <Secao id="selo" titulo="Selo" arquivo="ui/selo.tsx">
      <Amostra rotulo="Pílula (status de tabela e avaliações)">
        <Selo tom="ok">Publicado</Selo>
        <Selo tom="warn">Não listado</Selo>
        <Selo tom="ok">Concluída · 92%</Selo>
        <Selo tom="accent">Disponível</Selo>
        <Selo tom="neutro">Bloqueada</Selo>
      </Amostra>
      <Amostra rotulo="Etiqueta e rótulo">
        <Selo tom="accent" forma="etiqueta" className="tracking-[.12em]">
          Top 10
        </Selo>
        <Selo tom="accent" forma="etiqueta">
          Admin
        </Selo>
        <Selo tom="accent" forma="etiqueta">
          Novo
        </Selo>
        <Selo tom="transparente" forma="etiqueta">
          Em breve
        </Selo>
        <Selo tom="solido" forma="etiqueta">
          Novo
        </Selo>
        <Selo tom="neutro" forma="rotulo">
          Autores · Signature
        </Selo>
      </Amostra>
      <Amostra rotulo="Fixo (hero e capa de card)" escura>
        <span className="flex items-center gap-2.5 text-[15px] font-bold text-fixo-text">
          Curso • Liderança • 2026 • 9h 25
          <Selo tom="fixo" forma="etiqueta" className="text-xs">
            28 aulas
          </Selo>
        </span>
        <span className="flex items-center gap-2 text-xs font-bold text-fixo-text">
          <Selo tom="fixo" forma="etiqueta">
            Top 1
          </Selo>
          Cursos da plataforma
        </span>
        <span className="flex items-center gap-2 text-xs font-bold text-fixo-text">
          <Megaphone className="size-4 text-fixo-accent" aria-hidden />
          Novo: módulo Cultura organizacional disponível
        </span>
        <span className="relative h-20 w-36 overflow-hidden rounded-lg bg-surface-2">
          <Selo tom="fixo" forma="canto" className="absolute bottom-0 left-0">
            Novo
          </Selo>
        </span>
      </Amostra>
    </Secao>
  );
}
