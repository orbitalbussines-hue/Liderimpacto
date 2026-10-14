import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EstadoVazio } from "@/components/ui/estado-vazio";

/** 403 (forbidden() das guardas de pagina). A recusa ja foi registrada na trilha. */
export default function Proibido() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-5 text-text">
      <EstadoVazio
        comMoldura
        icone={<ShieldAlert />}
        titulo="Você não tem acesso a esta área"
        descricao="Se acha que deveria ter, fale com a equipe responsável."
        acao={
          <Link href="/" className={buttonVariants({ variant: "contorno" })}>
            Voltar ao início
          </Link>
        }
      />
    </main>
  );
}
