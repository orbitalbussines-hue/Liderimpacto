---
name: criar-componente
description: Cria tela ou componente React no padrao do projeto (colocation, Server Component por padrao, props tipadas, 4 estados, shadcn/ui, ModalConfirmacaoBlock para acao critica, teste do caminho critico). Use quando pedirem tela, pagina, componente, formulario, lista ou UI.
---

# Criar componente

Padrao completo em `docs/components.md`. Arquivos-ouro: `templates/component.tsx` e
`templates/component.test.tsx`.

## Decisao 1 — Server ou Client?

- **Server** (padrao): busca dados, resolve RBAC, repassa props. Sem `"use client"`.
- **Client**: so com `useState`/`useEffect`/evento/API de navegador.

`page.tsx` (server) busca e passa para um client component pequeno.

## Decisao 2 — Onde mora?

- Usado por uma rota → `src/app/(app)/<rota>/_components/`
- Primitivo generico → `src/components/ui/` (instalado por `npx shadcn@latest add`; nao editar)
- Compartilhado entre features → `src/components/`

## Passos

1. Copie `templates/component.tsx`. Arquivo kebab-case, componente PascalCase,
   export nomeado, um componente por arquivo.
2. `interface <Nome>Props` explicita; reuse tipos do schema (`$inferSelect`). Nunca `any`.
3. Trate os 4 estados: carregando (`loading.tsx`), vazio, erro (`role="alert"` ou
   `error.tsx`), sucesso.
4. Action que muta devolve `Resultado`: mostre `r.erro` na tela. Nunca `alert()`.
5. Acao critica → `<ModalConfirmacaoBlock>` com resumo claro do que vai acontecer.
6. Esconder botao por permissao e conforto, nao defesa: a action confere de novo.
7. Acessibilidade minima: `<label>` em todo input, texto ou `aria-label` em todo botao,
   foco visivel, contraste AA.
8. Copie `templates/component.test.tsx` para o lado do componente e cubra o caminho critico.
9. `npm run verificar`.

## Checklist

- [ ] Server por padrao; client so quando precisa
- [ ] Props tipadas, tipos do schema reaproveitados
- [ ] 4 estados tratados
- [ ] Erro da action exibido na tela
- [ ] Acao critica com modal de 3 s
- [ ] Local certo (`_components` / `ui` / `components`)
- [ ] Teste do caminho critico passando
