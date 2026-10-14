import Link from "next/link";
import { Aviso } from "@/components/ui/aviso";

/** Gamificação desligada: as telas da equipe funcionam, mas o aluno não vê nada (RN-144). */
export function AvisoDesligada({ dono }: { dono: boolean }) {
  return (
    <Aviso tom="info">
      A gamificação está desligada nesta área: os alunos não veem pontos, ranking nem desafios e nenhum ponto novo é lançado.{" "}
      {dono ? (
        <Link href="/admin/configuracoes/gamificacao" className="font-semibold text-accent hover:underline">
          Ligar em Configurações
        </Link>
      ) : (
        "Só o dono da área pode ligar."
      )}
    </Aviso>
  );
}
