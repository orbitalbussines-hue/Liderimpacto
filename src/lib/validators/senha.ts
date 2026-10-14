/**
 * POLITICA DE SENHA — um lugar so (auditoria REQ-B3/B6/B9). Todo caminho que
 * GRAVA senha passa por `recusaDaPolitica` (auth/politica-senha.ts):
 * definir pelo link e trocar em Conta > Seguranca. Nenhum outro caminho grava senha.
 *
 * NIST SP 800-63B-4: tamanho manda, regra de composicao nao. Por isso aqui so
 * entram tamanho, termos do contexto (e-mail, nome, marca), sequencias obvias e
 * a checagem de vazamento — nada de "precisa de um simbolo".
 */

/**
 * 8, decisao do Paulo em 13/10/2026 (igual ao handoff, docs/SISTEMA.md), contra a regua
 * (docs/seguranca-login.md pede 15 quando a senha e fator unico — aluno, dono e admin nao tem
 * 2FA nesta fase). Desvio registrado no ADR-0003. O que segura senha curta: checagem de
 * vazamento (HIBP), bloqueio por conta e teto por IP. Voltar a 15 ou ligar 2FA para todos
 * antes de escalar.
 */
export const MIN_SENHA = 8;
export const MAX_SENHA = 128;

/** Termos da casa que nao servem de senha, nem dentro de uma frase maior. */
const TERMOS_DA_CASA = ["liderdeimpacto", "lider de impacto", "lider-de-impacto", "bahtech"];
/**
 * Lista curta das mais tentadas, por IGUALDADE (sem acento e sem espacos). Com minimo de 8
 * ela pega as obvias offline; o controle de verdade e o `senhaVazada` (HIBP) abaixo.
 */
const COMUNS = [
  "12345678", "123456789", "senha123", "senha1234", "password", "password1", "qwerty123", "abc12345",
  "mudar123", "brasil123", "iloveyou", "11111111", "00000000",
  "senha123456", "senha12345678", "password1234", "123456789012", "1234567890", "qwertyuiop123",
  "mudar123456", "trocar123456", "primeiroacesso", "administrador", "senhasenha", "minhasenha123",
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const FILEIRAS_DO_TECLADO = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

/** A senha e SO sequencia/repeticao? (abcdefghijkl, 111111111111, qwertyuiopas) */
function soSequencia(s: string): boolean {
  if (/^(.)\1+$/.test(s)) return true;
  const passo = s.charCodeAt(1) - s.charCodeAt(0);
  if ((passo === 1 || passo === -1) && [...s].every((_, i) => i === 0 || s.charCodeAt(i) - s.charCodeAt(i - 1) === passo)) return true;
  return FILEIRAS_DO_TECLADO.some((f) => f.includes(s) || [...f].reverse().join("").includes(s));
}

/** Pedacos do e-mail e do nome com 4+ letras (joao.silva@... -> joao, silva). */
function termosDaPessoa(contexto: { email?: string; nome?: string }): string[] {
  return [...(contexto.email ?? "").split(/[@._\-+]/), ...(contexto.nome ?? "").split(/\s+/)]
    .map(semAcento)
    .filter((t) => t.length >= 4);
}

/**
 * Motivo da recusa, ou `null` se passa. Funcao PURA: a tela usa a mesma para
 * mostrar o requisito ao vivo, o servidor usa para recusar.
 */
export function problemaNaSenha(senha: string, contexto: { email?: string; nome?: string } = {}): string | null {
  if (senha.length < MIN_SENHA) return `A senha precisa de pelo menos ${MIN_SENHA} caracteres.`;
  if (senha.length > MAX_SENHA) return `A senha pode ter no máximo ${MAX_SENHA} caracteres.`;
  const s = semAcento(senha);
  if (contexto.email && s === semAcento(contexto.email)) return "A senha não pode ser igual ao e-mail.";
  for (const termo of [...termosDaPessoa(contexto), ...TERMOS_DA_CASA.map(semAcento)]) {
    if (s.includes(termo)) return "A senha não pode conter seu nome, seu e-mail nem o nome da empresa.";
  }
  const semEspaco = s.replace(/\s+/g, "");
  if (COMUNS.includes(semEspaco)) return "Essa senha é fácil de adivinhar. Use uma frase que só você lembre.";
  if (soSequencia(semEspaco)) return "Essa senha é só uma sequência (1234…, abcd…, qwerty…). Use uma frase que só você lembre.";
  return null;
}

/** Tempo maximo esperando o serviço de senhas vazadas antes de seguir sem ele. */
const TETO_VAZADAS_MS = 1500;

/**
 * Senha em vazamento conhecido? k-anonimato do Have I Been Pwned: sai daqui só
 * os 5 primeiros caracteres do SHA-1 — a senha nunca vai para a rede.
 * `null` = não deu para consultar (fail-open: rede fora não impede trocar senha).
 */
export async function senhaVazada(senha: string): Promise<boolean | null> {
  try {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(senha)));
    const sha1 = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const r = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      signal: AbortSignal.timeout(TETO_VAZADAS_MS),
      headers: { "add-padding": "true" },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const sufixo = sha1.slice(5);
    return (await r.text()).split("\n").some((linha) => {
      const [hash, contagem] = linha.trim().split(":");
      return hash === sufixo && Number(contagem) > 0;
    });
  } catch {
    return null;
  }
}

export const MSG_SENHA_VAZADA = "Essa senha aparece em vazamentos públicos. Escolha outra.";
