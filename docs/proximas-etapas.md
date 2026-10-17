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

## 2. E-mail marketing (Campanhas e Automações)

Telas já previstas no menu ("Em breve"). Antes de construir, decidir o provedor de envio em massa: o
SMTP da Hostinger tem limite diário de envio e não é feito para disparo em massa (risco de bloquear
também os e-mails de senha). Candidatos: Brevo, Amazon SES, Resend (domínio próprio com SPF/DKIM).

- Modelos visuais com a marca (mesma base do item 1), editor simples de blocos.
- Público por grupo, curso, matrícula, progresso, inatividade.
- Automações: boas-vindas, aluno parado há N dias, curso concluído, evento ao vivo.
- LGPD: consentimento registrado, descadastro em um clique em todo e-mail, lista de supressão.
- Fila BullMQ com ritmo de envio, métricas (entregue, aberto, clique, descadastro) e trilha.

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

- Gateway de pagamento (libera Vendas e financeiro, Páginas e Funis).
- Página de vendas do livro do Valmer de volta ao ar (projeto `Desktop\Valmer\Pagina de vendas
  mulher`, em projeto próprio do Easypanel).
