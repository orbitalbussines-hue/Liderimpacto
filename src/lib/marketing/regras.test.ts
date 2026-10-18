import { describe, expect, it } from "vitest";
import { emailMarketing } from "@/lib/email/mensagens";
import { marcaDaArea } from "@/lib/email/modelo";
import { conteudoSchema, criarAutomacaoSchema } from "@/lib/validators/marketing";
import { esperaDoTeto, extrairUrls, limitesDeEnvio, paragrafosDoCorpo, segmentosComLinks, urlsDoConteudo } from "./regras";

const conteudo = {
  assunto: "Aula nova",
  previa: "",
  titulo: "Tem aula nova",
  corpo: "Oi!\nVeja https://exemplo.com/aula?x=1&y=2.\n<script>alert(1)</script> e https://exemplo.com/b",
  botao: { texto: "Abrir", url: "https://exemplo.com/botao" },
};

describe("conteúdo de marketing", () => {
  it("extrai as URLs sem a pontuação final e corta o texto em parágrafos e links", () => {
    expect(extrairUrls(conteudo.corpo)).toEqual(["https://exemplo.com/aula?x=1&y=2", "https://exemplo.com/b"]);
    expect(paragrafosDoCorpo(" a \n\n b ")).toEqual(["a", "b"]);
    expect(segmentosComLinks("veja https://a.com/x. fim")).toEqual([{ texto: "veja " }, { url: "https://a.com/x" }, { texto: ". fim" }]);
    expect(urlsDoConteudo(conteudo)).toEqual(["https://exemplo.com/aula?x=1&y=2", "https://exemplo.com/b", "https://exemplo.com/botao"]);
  });

  it("monta o e-mail com tudo escapado, links rastreados, pixel e descadastro", () => {
    const marca = marcaDaArea({ nome: "Área <X>", slug: "x", cor_marca: null }, "https://lideresdeimpacto.com.br");
    const m = emailMarketing(marca, conteudo, "Ana", {
      descadastro: "https://x.lideresdeimpacto.com.br/api/email/descadastro?t=abc",
      linkar: (u) => `https://x.lideresdeimpacto.com.br/api/email/clique?u=${encodeURIComponent(u)}`,
      pixel: "https://x.lideresdeimpacto.com.br/api/email/abertura?e=1",
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(m.html).toContain(`href="https://x.lideresdeimpacto.com.br/api/email/clique?u=${encodeURIComponent("https://exemplo.com/aula?x=1&y=2")}"`);
    expect(m.html).toContain("api/email/abertura?e=1");
    expect(m.html).toContain("Descadastrar");
    expect(m.texto).toContain("Para não receber mais: https://x.lideresdeimpacto.com.br/api/email/descadastro?t=abc");
    expect(m.assunto).toBe("Aula nova");
  });

  it("o validador recusa link http, HTML não vira nada especial e o botão precisa de https", () => {
    expect(conteudoSchema.safeParse({ ...conteudo, corpo: "veja http://exemplo.com" }).success).toBe(false);
    expect(conteudoSchema.safeParse({ ...conteudo, botao: { texto: "x", url: "javascript:alert(1)" } }).success).toBe(false);
    expect(conteudoSchema.safeParse({ ...conteudo, assunto: "linha\nquebrada" }).success).toBe(false);
    expect(conteudoSchema.parse(conteudo).corpo).toContain("<script>");
  });

  it("automação: dias só na varredura, curso só nos gatilhos de curso, ao menos uma ação", () => {
    const base = { nome: "Boas-vindas", conteudo };
    expect(criarAutomacaoSchema.safeParse({ ...base, gatilho: "MEMBRO_CADASTRADO" }).success).toBe(true);
    expect(criarAutomacaoSchema.safeParse({ ...base, gatilho: "INATIVIDADE" }).success).toBe(false);
    expect(criarAutomacaoSchema.safeParse({ ...base, gatilho: "INATIVIDADE", dias: 7 }).success).toBe(true);
    expect(criarAutomacaoSchema.safeParse({ ...base, gatilho: "MEMBRO_CADASTRADO", produtoId: crypto.randomUUID() }).success).toBe(false);
    expect(criarAutomacaoSchema.safeParse({ nome: "Nada", gatilho: "MEMBRO_CADASTRADO" }).success).toBe(false);
  });
});

describe("teto de envio", () => {
  it("lê o teto do ambiente (inválido = padrão conservador)", () => {
    expect(limitesDeEnvio({})).toEqual({ hora: 100, dia: 1000 });
    expect(limitesDeEnvio({ EMAIL_LIMITE_HORA: "20", EMAIL_LIMITE_DIA: "abc" })).toEqual({ hora: 20, dia: 1000 });
    expect(limitesDeEnvio({ EMAIL_LIMITE_HORA: "-1", EMAIL_LIMITE_DIA: "0" })).toEqual({ hora: 100, dia: 1000 });
  });

  it("espera a maior das duas janelas; janela livre = 0", () => {
    const agora = new Date("2026-10-18T12:00:00Z");
    expect(esperaDoTeto(agora, null, null)).toBe(0);
    expect(esperaDoTeto(agora, new Date("2026-10-18T12:10:00Z"), new Date("2026-10-18T15:00:00Z"))).toBe(3 * 3_600_000);
    expect(esperaDoTeto(agora, new Date("2026-10-18T12:00:00.200Z"), null)).toBe(1000);
  });
});
