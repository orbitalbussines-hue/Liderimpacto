# Próximas etapas

Lista viva do que falta depois da entrada em produção (17/10/2026, `https://lideresdeimpacto.com.br`).
Concluiu um item? Risque aqui e registre a decisão no ADR/RN correspondente.

## 1. ~~E-mails com a marca (transacionais)~~ (feito em 17/10/2026)

~~Modelo HTML único com a marca da área, multipart html + texto, saudação pelo primeiro nome e
prévia em `/componentes/emails`.~~ Como ficou: `docs/back.md` (E-mails do sistema) e
`docs/components.md` (E-mails do sistema).

Falta, fora do código:

- Teste de renderização real (Gmail web e app, Outlook desktop, Apple Mail/iPhone) com um envio
  pelo SMTP de produção para caixas da equipe.
- Conta do SUPER_ADMIN ainda se chama "Equipe da plataforma" (a saudação sai "Olá, Equipe,"):
  trocar o nome no perfil.
- Logo oficial: quando chegar, hospedar em https e passar `logoUrl` na marca.

## 2. E-mail marketing (Campanhas e Automações) — camada de dados feita em 18/10/2026

ADR-0020, RN-220 a RN-227, `docs/back.md` ("Fase 3"), migração `0014`. Provedor atrás da interface
`ProvedorEmail` (hoje o SMTP da Hostinger) com teto `EMAIL_LIMITE_HORA`/`EMAIL_LIMITE_DIA` (100/1000).

- **URGENTE (Valmer, 138 importados)**: tela "Reenviar acesso" em Membros (filtro grupo + "nunca
  acessou", contagem, `ModalConfirmacaoBlock`) chamando `acaoContarReenvioPrimeiroAcesso` e
  `acaoReenviarPrimeiroAcesso`. Antes de usar em produção: SMTP preenchido também no
  `li-worker-certificados` (é ele que envia agora), conferir no hPanel o limite do plano e ajustar o teto.
- Telas: Campanhas (lista com métricas, editor com prévia e "Enviar teste", público com contagem,
  agendar/enviar agora, destinatários), Modelos, Automações (+ aba "Histórico") e Descadastros.
- Provedor de envio em massa (Brevo, Amazon SES, Resend) com domínio próprio (SPF/DKIM/DMARC) e webhook
  de bounce/reclamação → supressão automática; trocar = nova implementação de `ProvedorEmail`.
- Depois: editor de blocos, variáveis no texto (`{nome}`), reinscrição pelo aluno, retenção dos envios antigos.

## 3. Pendências da produção

- `ANTHROPIC_API_KEY` no `li-app` (assistente do professor) — o `ANTHROPIC_WORKSPACE_ID` já está lá.
- Teste de ponta a ponta na área `lider-de-impacto`: curso, capa, vídeo processando e tocando,
  matrícula, conclusão, certificado.
- Teste no iPhone/Safari (player HLS, legenda, tela cheia).
- Segundo fator no Easypanel e acesso ao painel só pelo endereço com HTTPS (nunca pelo IP:3000).
- Conta GitHub `orbitalbussines-hue` (dona do repositório e das imagens): e-mail de recuperação novo
  (o Google dela foi suspenso) e `PauloMelo-code` como Admin do repositório.
- Trocar `liderdeimpacto` por `lideresdeimpacto` no `.env.example`.
- Teste de restauração todo dia 1º: `li-backup` > Shell > `backup restaurar-teste`.
- Trocar o token de implantação de cada serviço sempre que o link aparecer em print ou chat.

## 4. Produto

### Fase 1 dos "Em breve" (sem gateway e sem e-mail em massa) — camada de dados feita em 17/10/2026

ADR-0018, RN-200 a RN-206, `docs/back.md` ("Fase 1"), migração `0012`. Faltam as TELAS (e as páginas
das Configurações com `papelMinimo: "DONO"` para Disparos e Webhooks):

- ~~Dados~~ Membros › **Tags** e **Vouchers** (+ resgate pelo aluno).
- ~~Dados~~ Matrículas › **Feedbacks de conteúdo**, **Progresso**, **Avaliações** e **Tentativas extras**
  (no lugar de "Correção"; questão discursiva com nota manual fica para uma fase própria com ADR).
- ~~Dados~~ Botão de feedback na aula do aluno; Continuar › **Anotações** e **Turmas**.
- ~~Dados~~ Configurações › **Disparos de e-mails** (registro ligado no `enviarEmail`) e **Integrações e
  webhooks** (4º Worker de `worker:certificados`: a imagem do worker não muda, só o código).
- ~~Dados~~ Estúdio › **Estatísticas** e **IA** (precisa da `ANTHROPIC_API_KEY` do item 3).
- Depois: "Enviar teste" do webhook, retenção das entregas antigas, questão discursiva.

### Fase 2

- Gateway de pagamento (libera Vendas e financeiro, Páginas e Funis).
- Página de vendas do livro do Valmer de volta ao ar (projeto `Desktop\Valmer\Pagina de vendas
  mulher`, em projeto próprio do Easypanel).
