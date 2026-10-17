# Próximas etapas

Lista viva do que falta depois da entrada em produção (17/10/2026, `https://lideresdeimpacto.com.br`).
Concluiu um item? Risque aqui e registre a decisão no ADR/RN correspondente.

## 1. E-mails com a marca (transacionais)

Hoje os e-mails do sistema (definir senha, primeiro acesso, avisos de segurança) saem em texto puro
pelo SMTP da Hostinger (`nao-responda@lideresdeimpacto.com.br`). Chegam na caixa de entrada, mas sem
identidade visual.

- Modelo HTML responsivo único (`src/lib/email/`), com logo, cor da marca do criador do host
  (cascata plataforma → criador, a mesma da área do aluno), botão de ação e rodapé com endereço da área.
- Sempre com a versão em texto junto (multipart): cliente de e-mail que bloqueia HTML e filtro de spam.
- Tabelas e CSS inline (Gmail/Outlook ignoram `<style>` e flexbox); imagens com `alt`; nada de link
  encurtado; link do botão = o mesmo endereço escrito por extenso.
- Saudação pelo primeiro nome (hoje a conta do SUPER_ADMIN se chama "Equipe da plataforma": trocar o
  nome no perfil).
- Prévia em `/componentes` e teste de renderização (Gmail, Outlook, celular) antes de publicar.

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
