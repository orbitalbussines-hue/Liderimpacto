import { registrarDisparo } from "@/lib/email/disparos";
import type { Email } from "@/lib/email/enviar";
import type { ProvedorEmail } from "./provedor";

/**
 * Provedor de e-mail FALSO (só testes e scripts de dev): guarda as mensagens em memória e registra o
 * disparo como o SMTP faria. `falharCom` simula erro do provedor. Nunca sai nada para a rede.
 */
export class ProvedorFalso implements ProvedorEmail {
  enviados: Email[] = [];
  falharCom: string | null = null;
  ligado = true;

  configurado(): boolean {
    return this.ligado;
  }

  async enviar(e: Email): Promise<boolean> {
    if (!this.ligado) return false;
    if (this.falharCom) {
      await registrarDisparo({ criadorId: e.criadorId, tipo: e.tipo, para: e.para, assunto: e.assunto, situacao: "FALHOU", erro: this.falharCom });
      throw Object.assign(new Error("falha simulada"), { code: this.falharCom });
    }
    this.enviados.push(e);
    await registrarDisparo({ criadorId: e.criadorId, tipo: e.tipo, para: e.para, assunto: e.assunto, situacao: "ENVIADO" });
    return true;
  }

  /** Mensagens enviadas para um endereço. */
  para(email: string): Email[] {
    return this.enviados.filter((e) => e.para === email);
  }
}
