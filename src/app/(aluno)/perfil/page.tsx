import Link from "next/link";
import { LogOut } from "lucide-react";
import { LinhaPreferencia } from "@/components/engajamento/linha-preferencia";
import { Button, buttonVariants } from "@/components/ui/button";
import { CabecalhoPagina } from "@/components/ui/cabecalho-pagina";
import { Cartao } from "@/components/ui/cartao";
import { sair } from "@/lib/actions/auth";

/** Meu perfil (minimo do passo 2): caminho para Conta > Seguranca e Sair. O perfil completo vem depois. */
export default function Perfil() {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <CabecalhoPagina titulo="Meu perfil" />
      <Cartao padding={20}>
        <LinhaPreferencia
          titulo="Segurança da conta"
          descricao="Trocar a senha e ver as sessões abertas"
          controle={
            <Link href="/conta/seguranca" className={buttonVariants({ variant: "contorno", size: "40" })}>
              Abrir
            </Link>
          }
        />
        <LinhaPreferencia
          titulo="Sair"
          descricao="Encerrar a sessão neste aparelho"
          controle={
            <form action={sair}>
              <Button type="submit" variant="contorno" size="40">
                <LogOut aria-hidden />
                Sair
              </Button>
            </form>
          }
        />
      </Cartao>
    </div>
  );
}
