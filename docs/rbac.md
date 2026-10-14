# RBAC — controle de acesso

Plataforma com vários criadores (ADR-0002) e autenticação do ADR-0003. Papéis em dois níveis.

## Papéis

| Nível | Papel | Quem | Onde mora |
|-------|-------|------|-----------|
| Plataforma | `SUPER_ADMIN` | Bah! Tech / operação da plataforma. 2FA obrigatório. Entra em qualquer criador como DONO (auditado como "acesso de suporte") | `usuarios.papel_plataforma` |
| Plataforma | `NENHUM` | Todo o resto (default da coluna = menor privilégio) | `usuarios.papel_plataforma` |
| Criador | `DONO` | Responsável pelo criador: tudo, incluindo financeiro e configurações | `criadores_membros.papel` |
| Criador | `ADMIN` | Equipe: conteúdo, membros, comunidade, vitrine | `criadores_membros.papel` |
| Criador | `ALUNO` | Só a área do aluno do criador (default da coluna) | `criadores_membros.papel` |

A lista mora em `src/lib/db/schema/_enums.ts` (`PAPEIS_PLATAFORMA`, `PAPEIS_CRIADOR`, do maior
para o menor). Vínculo `INATIVO`, conta inativa ou criador `SUSPENSO` = sem acesso na próxima
requisição.

## Uma checagem só

```ts
// Server Action (lança ErroDeNegocio; executar() vira mensagem):
const { usuario, criador, membro } = await exigirMembro(EQUIPE); // src/lib/auth/autorizacao.ts
const sessao = await exigirSuperAdmin();                          // área da plataforma
// Página (dentro de <Suspense>; sem sessão -> /login, recusa -> 403):
const { usuario, criador } = await membroDaPagina(TODOS_OS_MEMBROS); // src/lib/auth/guarda.ts
```

O **criador vem sempre do host** da requisição (`src/lib/criador/`), nunca do corpo. A regra
pura é `papelEfetivo`/`papelAceito` (`src/lib/auth/permissoes.ts`, com teste).

## Matriz — quem entra onde

| Área | Quem |
|------|------|
| Apex (`liderdeimpacto.com.br`): `/login`, `/plataforma` | só `SUPER_ADMIN` |
| Criador: área do aluno (`/`, `/continuar`…) | `DONO`, `ADMIN`, `ALUNO` (vínculo ativo) e `SUPER_ADMIN` |
| Criador: `/admin` | `DONO`, `ADMIN` e `SUPER_ADMIN` (seções financeiras/configuração: `papelMinimo: "DONO"` em `navegacao.ts`) |
| Membros e grupos (`/admin/membros`) | `DONO` e `ADMIN`; ADMIN só mexe em `ALUNO`; papel e equipe só `DONO` (RN-104) |
| Aparência (`/admin/configuracoes/aparencia`) | só `DONO` (RN-107) |
| Criadores (`/plataforma`, `/plataforma/novo`) | só `SUPER_ADMIN` no apex (RN-108) |
| `/conta/seguranca` | qualquer sessão, inclusive a provisória do SUPER_ADMIN sem TOTP |
| Link de senha para outra pessoa | ver RN-102 em `docs/regras-negocio.md` |

## Regras

- Papel, `ativo`, vínculo e status do criador são lidos do banco a cada requisição, nunca do token.
- Esconder botão é conforto; a action confere de novo.
- Recusa por permissão (403) vai para a trilha (`acesso_negado`, com `criador_id`).
- Nenhum dado de um criador aparece em outro: toda consulta de negócio filtra `criador_id`
  (e `criadores_grupos_membros` tem FK composta que o banco usa para recusar mistura).
