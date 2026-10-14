# Frontend

Padrao de componentes em `docs/components.md`. Aqui: rotas e protecao.

## Rotas

```
src/app/
  layout.tsx
  (publico)/
    entrar/page.tsx          # login
  (app)/                     # area autenticada
    layout.tsx               # confere a sessao e redireciona
    painel/page.tsx
    lancamentos/
      page.tsx
      loading.tsx
      error.tsx
      _components/
  api/                       # so webhook/integracao/cron — nunca CRUD da tela
```

O nome entre parenteses e **grupo de rotas**: some da URL. `/(app)/painel` responde em
`/painel`. Por isso nenhum codigo pode testar `pathname.startsWith("/(app)")` — isso
nunca e verdade.

## Protecao — tres camadas, nenhuma sozinha

1. **Layout da area** (`src/app/(aluno)/layout.tsx`, `src/app/admin/layout.tsx`): dentro de
   `<Suspense>` (cacheComponents), chama `membroDaPagina(papeis)` (`src/lib/auth/guarda.ts`):
   sem sessao -> `/login`; sem vinculo/papel neste criador -> 403. Da conforto de navegacao.
2. **Pagina e action**: cada `page.tsx` (`membroDaPagina`) e cada Server Action (`exigirMembro`)
   conferem sessao, criador do host e papel por conta propria. Esta e a defesa real — Server
   Action nao passa por layout nem por proxy.
3. **Proxy** (`src/proxy.ts`): so para o HTTP sair certo antes do streaming (404 para host que nao
   e area, 307 para `/login` sem cookie). Conferir se o cookie *existe* nao e checagem de sessao.

```tsx
// src/app/(aluno)/layout.tsx (resumo)
async function ShellComSessao({ children }: { children: ReactNode }) {
  const { usuario, criador } = await membroDaPagina(TODOS_OS_MEMBROS);
  return <ShellAluno usuario={...} corMarca={criador.cor_marca ?? undefined}>{children}</ShellAluno>;
}
export default function LayoutAluno({ children }: LayoutProps<"/">) {
  return <Suspense fallback={null}><ShellComSessao>{children}</ShellComSessao></Suspense>;
}
```

## Regras

- Server Component por padrao; `"use client"` so com estado ou evento.
- Mutacao por Server Action, nunca por `fetch` para rota propria.
- Toda acao assincrona: botao desabilitado enquanto processa, erro visivel na tela.
- Acao critica: `ModalConfirmacaoBlock` (3 s).
- Mobile-first; tabela com rolagem horizontal no celular.
- Mensagens em PT-BR, claras, sem detalhe tecnico.
