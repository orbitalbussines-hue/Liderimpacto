# ADR-0002: Plataforma com vários criadores, Drizzle e cor da marca em cascata

- **Status**: Aceito
- **Data**: 2026-10-13
- **Decisores**: Paulo (Bah! Tech)

## Contexto

O handoff (`README.md`, `docs/SISTEMA.md`) descreve a área de membros de um cliente só (Valmer,
Líder de Impacto) e sugere Prisma. Em 13/10/2026 o Paulo definiu que o produto é uma
**plataforma**: vários criadores (responsáveis), cada um com equipe, alunos, cursos e cor
próprios; cada curso também pode ter cor própria. O Líder de Impacto é o primeiro criador.

## Decisão

1. **Área própria por criador (white-label).** Toda entidade de negócio (curso, matrícula, grupo,
   vitrine, comunidade…) pertence a um criador (`criador_id` com FK RESTRICT) e toda consulta
   filtra por ele. O aluno só vê os cursos do criador em cuja área está.
2. **Acesso por subdomínio** (`<criador>.<plataforma>`), resolvido no servidor pelo host. Domínio
   próprio do criador fica preparado (tabela de domínios), ligado depois.
3. **Um login para tudo.** Identidade global (e-mail único); o vínculo com cada criador
   (papel DONO/ADMIN/ALUNO no criador), matrículas e progresso são por criador.
4. **Papéis em dois níveis.** Plataforma: `SUPER_ADMIN` (Bah! Tech/operação da plataforma), único
   com 2FA obrigatório nesta fase (pedido do Paulo; desvio temporário de `docs/seguranca-login.md`,
   que pede 2FA para todos — rever antes de produção). Criador: `DONO` (responsável, financeiro e
   configurações), `ADMIN` (equipe), `ALUNO`.
5. **Cor da marca em cascata:** padrão da plataforma (`globals.css`, dourado) → cor do criador (área
   do aluno inteira, `<EstiloMarca cor>` no shell) → cor do curso (só dentro do curso: página do
   curso, player, certificado; `<EstiloMarca cor escopo>` + `data-marca`). A vitrine e o menu ficam
   com a cor do criador. O painel admin fica no padrão. `gerarPaleta` garante contraste ≥ 3:1 nos
   dois temas.
6. **Drizzle ORM, não Prisma.** A estrutura base bloqueia Prisma (hook, auditor, templates, skills);
   os caminhos quentes (heartbeat de progresso com `GREATEST`, Top 10, fileiras da vitrine, trava
   otimista) pedem SQL direto; Better Auth + Drizzle e o 2FA já estão provados no Espaço 7.
7. **Design system próprio** em `src/components/ui` com os tokens do README; shadcn/Base UI só como
   base acessível (dialog). Tela nova = montar com as peças de `docs/components.md`.

## Alternativas Consideradas

- **Vitrine única (marketplace)**: não é o produto pedido; cada criador quer marca própria.
- **Caminho na URL (`/valmer`)**: mais simples de hospedar, mas sem cara de marca própria e sem
  caminho natural para domínio próprio.
- **Conta separada por criador**: duplica cadastro e senha para quem estuda com dois criadores.
- **Banco por criador**: isolamento forte, mas migração e operação multiplicadas; desnecessário no
  volume previsto. Isolamento por `criador_id` + testes de vazamento entre criadores.
- **Prisma**: ver item 6.

## Consequencias

### Positivas
- Um criador novo é um registro, não um deploy.
- A cor muda sem tocar em componente: só tokens.

### Negativas / Trade-offs
- Toda query precisa do filtro de criador: esquecer vaza dados entre criadores. Mitigação: acesso a
  dados sempre por funções que recebem o criador da requisição + teste de vazamento por módulo.
- Subdomínio exige DNS curinga e certificado curinga na VPS/CDN.
- ~~Sessão por cookie precisa valer nos subdomínios (domínio do cookie = domínio da plataforma)~~
  **Revisto no ADR-0003:** cookie POR HOST (sem SSO entre criadores); o papel continua lido do
  banco por criador a cada requisição, nunca do cookie.

### Neutras
- O handoff (`docs/SISTEMA.md` §4) continua valendo como modelo de dados, acrescido de `criador_id`.
