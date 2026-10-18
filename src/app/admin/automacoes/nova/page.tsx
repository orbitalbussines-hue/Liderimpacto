import type { Metadata } from "next";
import { Suspense } from "react";
import { PaginaFormAutomacao } from "../_components/pagina-form";

export const metadata: Metadata = { title: "Nova automação" };

export default function PaginaNovaAutomacao() {
  return (
    <Suspense fallback={null}>
      <PaginaFormAutomacao />
    </Suspense>
  );
}
