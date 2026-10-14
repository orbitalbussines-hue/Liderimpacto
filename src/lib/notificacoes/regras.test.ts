import { describe, expect, it } from "vitest";
import { linkDaNotificacao, rotuloDoContador, textoDaNotificacao } from "./regras";

describe("texto e link das notificações", () => {
  it("curtidas agregadas: 'Ana e mais 3'", () => {
    expect(textoDaNotificacao({ tipo: "CURTIDAS_NO_POST", dados: { atorNome: "Ana", postId: "p" }, total: 1 })).toBe("Ana curtiu sua publicação.");
    expect(textoDaNotificacao({ tipo: "CURTIDAS_NO_POST", dados: { atorNome: "Ana", postId: "p" }, total: 4 })).toBe("Ana e mais 3 curtiram sua publicação.");
  });

  it("cada tipo tem link; resposta em aula abre a aba de comentários", () => {
    expect(linkDaNotificacao({ tipo: "RESPOSTA_AO_COMENTARIO", dados: { aulaId: "a1" } })).toBe("/aula/a1?aba=comentarios");
    expect(linkDaNotificacao({ tipo: "COMENTARIO_NO_POST", dados: { postId: "p1" } })).toBe("/comunidade?post=p1");
    expect(linkDaNotificacao({ tipo: "MATRICULA_NOVA", dados: { produtoSlug: "lider" } })).toBe("/cursos/lider");
    expect(linkDaNotificacao({ tipo: "DENUNCIA_NOVA", dados: {} })).toBe("/admin/comunidade?aba=denuncias");
    expect(textoDaNotificacao({ tipo: "AULA_NOVA", dados: { produtoTitulo: "Curso", aulaTitulo: "Aula 1" }, total: 1 })).toBe('Nova aula em "Curso": "Aula 1".');
  });

  it("contador com teto", () => {
    expect(rotuloDoContador(5)).toBe("5");
    expect(rotuloDoContador(100)).toBe("99+");
  });
});
