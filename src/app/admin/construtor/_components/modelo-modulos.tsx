"use client";

import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Selecao } from "@/components/ui/selecao";
import { MAX_FILEIRAS, type FileiraVitrine } from "@/lib/vitrine/config";
import { AvisoCursoRascunho, type CursoDoConstrutor } from "./propriedades-fileira";

export interface ModeloModulosProps {
  cursos: readonly CursoDoConstrutor[];
  fileiras: readonly FileiraVitrine[];
  /** Pede a confirmação (modal block no construtor); nada muda antes dela. */
  onAplicar: (curso: CursoDoConstrutor) => void;
}

/**
 * "Usar modelo: Módulos do curso (estilo Netflix)" (RN-272): escolhe o curso e pede a confirmação.
 * O modelo vai para o RASCUNHO (destaque do curso + fileira de módulos no topo); publicar é à parte.
 */
export function ModeloModulos({ cursos, fileiras, onAplicar }: ModeloModulosProps) {
  const [aberto, setAberto] = useState(false);
  const [cursoId, setCursoId] = useState(() => cursos.find((c) => c.status !== "RASCUNHO")?.id ?? cursos[0]?.id ?? "");
  const curso = cursos.find((c) => c.id === cursoId);
  const jaTem = fileiras.some((f) => f.tipo === "MODULOS" && f.cursoId === cursoId);
  const cheio = !jaTem && fileiras.length >= MAX_FILEIRAS;

  if (!aberto) {
    return (
      <Button type="button" variant="fantasma" className="h-auto justify-start py-2 text-left whitespace-normal text-accent" onClick={() => setAberto(true)} disabled={cursos.length === 0}>
        <LayoutTemplate aria-hidden />
        Usar modelo: Módulos do curso (estilo Netflix)
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-accent p-3" role="group" aria-label="Modelo Módulos do curso">
      <div>
        <div className="text-[13px] font-bold">Modelo: Módulos do curso</div>
        <p className="m-0 text-[11px] text-muted">Destaque do curso com &quot;Continuar assistindo&quot; e as capinhas dos módulos logo abaixo. Vai para o rascunho; publique quando quiser.</p>
      </div>
      <Selecao
        rotulo="Curso"
        estiloRotulo="discreto"
        fundo="bg"
        value={cursoId}
        opcoes={cursos.map((c) => ({ valor: c.id, rotulo: c.status === "RASCUNHO" ? `${c.titulo} (rascunho)` : c.titulo }))}
        onChange={(e) => setCursoId(e.target.value)}
      />
      <AvisoCursoRascunho curso={curso} />
      {cheio && <p className="m-0 text-[11px] font-semibold text-warn">A vitrine já tem {MAX_FILEIRAS} fileiras. Remova uma para usar o modelo.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="36" disabled={!curso || cheio} onClick={() => curso && onAplicar(curso)}>
          Aplicar ao rascunho
        </Button>
        <Button type="button" variant="fantasma" size="36" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
