"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { DialogoMatricular, type DialogoMatricularProps } from "@/components/matriculas/dialogo-matricular";
import { Button, buttonVariants } from "@/components/ui/button";

/** Cabeçalho da lista: "Importar CSV" (rota própria) e "Matricular" (diálogo). */
export function BotoesMatriculas({ produtos, grupos }: Pick<DialogoMatricularProps, "produtos" | "grupos">) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Link href="/admin/matriculas/importar" className={buttonVariants({ variant: "contorno", size: "36" })}>
        <Upload className="size-3.5" aria-hidden />
        Importar CSV
      </Link>
      <Button size="36" onClick={() => setAberto(true)}>
        <Plus className="size-3.5" aria-hidden />
        Matricular
      </Button>
      {aberto && <DialogoMatricular aberto onFechar={() => setAberto(false)} produtos={produtos} grupos={grupos} />}
    </>
  );
}
