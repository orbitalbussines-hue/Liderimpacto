import { beforeEach, describe, expect, it, vi } from "vitest";
import { contraste } from "@/lib/marca/paleta";
import { emailAvisoSeguranca, emailDefinirSenha, emailPrimeiroAcesso } from "./mensagens";
import { coresDoBotao, marcaDaArea, montarEmail, urlSegura, type ConteudoEmail } from "./modelo";

const PLATAFORMA = "https://lideresdeimpacto.com.br";
const LINK = "https://aurora.lideresdeimpacto.com.br/primeiro-acesso#token=abc123";
const base = (extra: Partial<ConteudoEmail> = {}): ConteudoEmail => ({
  marca: marcaDaArea(null, PLATAFORMA),
  titulo: "Defina sua senha",
  previa: "Seu link vale 30 minutos.",
  nome: "Ana Maria",
  paragrafos: ["Um parágrafo."],
  botao: { texto: "Definir minha senha", url: LINK },
  motivo: "Você recebeu porque pediu.",
  ...extra,
});

describe("modelo de e-mail", () => {
  it("escapa nome da pessoa e nome da área no HTML", () => {
    const marca = marcaDaArea({ nome: `Área "X" <script>alert(1)</script>`, slug: "x", cor_marca: null }, PLATAFORMA);
    const { html, texto } = montarEmail(base({ marca, nome: `<script>alert('oi')</script> Silva` }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&#39;oi&#39;)&lt;/script&gt;,");
    expect(html).toContain("Área &quot;X&quot; &lt;script&gt;");
    // a versao texto nao e HTML: vai como esta
    expect(texto).toContain(`Área "X" <script>`);
  });

  it("recusa URL que não seja https (http só em localhost)", () => {
    expect(() => urlSegura("javascript:alert(1)")).toThrow();
    expect(() => urlSegura("http://lideresdeimpacto.com.br/x")).toThrow();
    expect(() => urlSegura("https://user:senha@lideresdeimpacto.com.br")).toThrow();
    expect(() => urlSegura("não é url")).toThrow();
    expect(urlSegura("http://aurora.localhost:3011/primeiro-acesso#token=t")).toBe("http://aurora.localhost:3011/primeiro-acesso#token=t");
    expect(() => montarEmail(base({ botao: { texto: "x", url: "data:text/html,oi" } }))).toThrow();
  });

  it("html e texto trazem o mesmo link (botão e endereço por extenso), token no fragmento", () => {
    const { html, texto } = montarEmail(base());
    expect(html.split(`href="${LINK}"`).length - 1).toBe(2);
    expect(html).toContain(`>${LINK}</a>`);
    expect(texto).toContain(LINK);
    expect(texto).not.toContain("<");
  });

  it("saúda pelo primeiro nome e traz a prévia escondida", () => {
    const { html, texto } = montarEmail(base({ nome: "  Ana   Maria Souza " }));
    expect(texto).toContain("Olá, Ana,");
    expect(html).toContain("Olá, Ana,");
    expect(html).toMatch(/<div style="display:none;[^"]*">Seu link vale 30 minutos\./);
    expect(montarEmail(base({ nome: "" })).texto).toContain("Olá,\n");
  });

  it("botão legível com cor clara e escura do criador (e no dourado padrão)", () => {
    // inclui tons medios (#2e9e8f, #c0504d, #7a7a7a): nem tinta escura nem branca dao 4.5:1 sem ajuste
    for (const cor of ["#f2d16b", "#fffbe6", "#5b1a2e", "#0a0a0a", "#2e9e8f", "#c0504d", "#7a7a7a", "#3b82f6", null]) {
      const { fundo, tinta } = coresDoBotao(cor);
      expect(contraste(fundo, tinta)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(fundo, "#ffffff")).toBeGreaterThanOrEqual(3); // o botão aparece sobre o cartão branco
    }
    expect(coresDoBotao("#5b1a2e").tinta).toBe("#ffffff");
    expect(coresDoBotao("#f2d16b").tinta).toBe("#1a1205");
    expect(coresDoBotao("lixo")).toEqual(coresDoBotao(null));
  });

  it("marca: sem criador = plataforma no dourado; com criador = nome e endereço da área", () => {
    expect(marcaDaArea(null, PLATAFORMA)).toMatchObject({ nome: "Líder de Impacto", url: PLATAFORMA });
    const m = marcaDaArea({ nome: "Ateliê", slug: "atelie", cor_marca: "#5b1a2e" }, PLATAFORMA);
    expect(m).toMatchObject({ nome: "Ateliê", cor: "#5b1a2e", url: "https://atelie.lideresdeimpacto.com.br" });
    const { html, texto } = montarEmail(base({ marca: m }));
    expect(html).toContain("atelie.lideresdeimpacto.com.br</a>");
    expect(texto).toContain("Ateliê · atelie.lideresdeimpacto.com.br");
  });

  it("logo opcional só com https", () => {
    expect(montarEmail(base({ marca: { ...marcaDaArea(null, PLATAFORMA), logoUrl: "https://cdn.x/logo.png" } })).html).toContain('<img src="https://cdn.x/logo.png" alt="Líder de Impacto"');
    expect(() => montarEmail(base({ marca: { ...marcaDaArea(null, PLATAFORMA), logoUrl: "http://cdn.x/logo.png" } }))).toThrow();
  });
});

describe("mensagens do sistema", () => {
  const marca = marcaDaArea({ nome: "Ateliê Aurora", slug: "aurora", cor_marca: "#f2d16b" }, PLATAFORMA);

  it("definir senha: remetente, assunto e validade", () => {
    const m = emailDefinirSenha(marca, "Ana Souza", LINK, 30);
    expect(m.remetente).toBe("Ateliê Aurora");
    expect(m.assunto).toBe("Ateliê Aurora · definir senha");
    expect(m.texto).toContain("30 minutos");
    expect(m.texto).toContain(LINK);
  });

  it("primeiro acesso: validade no horário de Brasília", () => {
    const m = emailPrimeiroAcesso(marca, "Ana", LINK, new Date("2026-10-19T17:30:00Z"));
    expect(m.assunto).toBe("Ateliê Aurora · seu primeiro acesso");
    expect(m.texto).toContain("19/10/2026, 14:30");
  });

  it("aviso de segurança: botão para a segurança da conta na área", () => {
    const m = emailAvisoSeguranca(marca, "Ana", "A senha da sua conta foi trocada", new Date("2026-10-18T17:30:00Z"));
    expect(m.texto).toContain("https://aurora.lideresdeimpacto.com.br/conta/seguranca");
    expect(m.texto).toContain("A senha da sua conta foi trocada em 18/10/2026, 14:30");
  });
});

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn().mockResolvedValue({}) }));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));

describe("enviarEmail (transporte falso)", () => {
  beforeEach(() => {
    sendMail.mockClear();
    vi.stubEnv("SMTP_HOST", "smtp.exemplo");
    vi.stubEnv("SMTP_USUARIO", "u");
    vi.stubEnv("SMTP_SENHA", "s");
  });

  it("manda multipart com o nome da área no remetente e o endereço da env", async () => {
    vi.stubEnv("EMAIL_REMETENTE", "Plataforma <nao-responda@lideresdeimpacto.com.br>");
    const { enviarEmail } = await import("./enviar");
    const m = emailDefinirSenha(marcaDaArea({ nome: 'Ateliê "A"\r\nBcc: x', slug: "a", cor_marca: null }, PLATAFORMA), "Ana", LINK, 30);
    expect(await enviarEmail({ para: "ana@exemplo.com", ...m })).toBe(true);
    const [arg] = sendMail.mock.calls[0];
    expect(arg.from).toEqual({ name: "Ateliê ABcc: x", address: "nao-responda@lideresdeimpacto.com.br" });
    expect(arg).toMatchObject({ to: "ana@exemplo.com", subject: m.assunto, text: m.texto, html: m.html });
  });
});
