import { describe, expect, it } from "vitest";
import { lerCsvDeMembros, MAX_LINHAS_CSV } from "./csv";

const ler = (texto: string) => {
  const r = lerCsvDeMembros(texto);
  if (!r.ok) throw new Error(r.erro);
  return r;
};

describe("lerCsvDeMembros", () => {
  it("le virgula ou ponto e virgula, aspas, BOM, CRLF e cabecalho em qualquer ordem", () => {
    const r = ler('﻿email,Nome,grupo\r\nana@x.com.br,"Ana Lima","Turma 1, manhã"\r\n\r\nbia@x.com,Bia Souza,\r\n');
    expect(r.erros).toEqual([]);
    expect(r.validas).toEqual([
      { numero: 2, dados: { nome: "Ana Lima", email: "ana@x.com.br", grupo: "Turma 1, manhã" } },
      { numero: 4, dados: { nome: "Bia Souza", email: "bia@x.com", grupo: "" } },
    ]);
    expect(ler("nome;E-mail\nJoão D'Ávila;JOAO@X.COM").validas[0].dados).toEqual({ nome: "João D'Ávila", email: "joao@x.com", grupo: "" });
  });

  it("linha invalida vira erro com o numero da linha; as validas seguem", () => {
    const r = ler(["nome,email,grupo", "Ana,ana@x.com,", "B,b@x.com,", "Caio,caio@,", "Ana de Novo,ANA@x.com,", "Duda,duda@x.com,G,extra", 'Eva,eva@x.com,<script>'].join("\n"));
    expect(r.validas.map((v) => v.numero)).toEqual([2]);
    expect(r.erros.map((e) => e.numero)).toEqual([3, 4, 5, 6, 7]);
    expect(r.erros.find((e) => e.numero === 5)?.mensagem).toMatch(/repetido/);
  });

  it("recusa o arquivo inteiro: cabecalho errado, vazio, sem linhas, grande demais", () => {
    expect(lerCsvDeMembros("")).toMatchObject({ ok: false });
    expect(lerCsvDeMembros("name,email\nA,a@x.com")).toMatchObject({ ok: false, erro: expect.stringMatching(/Cabeçalho/) });
    expect(lerCsvDeMembros("nome,email,email\nA,a@x.com,a@x.com")).toMatchObject({ ok: false });
    expect(lerCsvDeMembros("nome,email\n\n")).toMatchObject({ ok: false, erro: expect.stringMatching(/nenhuma linha/) });
    const muitas = ["nome,email", ...Array.from({ length: MAX_LINHAS_CSV + 1 }, (_, i) => `Pessoa,p${i}@x.com`)].join("\n");
    expect(lerCsvDeMembros(muitas)).toMatchObject({ ok: false, erro: expect.stringMatching(/limite/) });
    expect(lerCsvDeMembros(`nome,email\n${"á".repeat(600 * 1024)}`)).toMatchObject({ ok: false, erro: expect.stringMatching(/1 MB/) });
  });
});
