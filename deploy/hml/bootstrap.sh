#!/usr/bin/env bash
# Prepara uma VPS Ubuntu 24.04 NOVA para a HML (ADR-0015). Rodar UMA vez, como root, pelo Paulo
# (docs/deploy-hml.md, passo 6). Idempotente: rodar de novo não estraga nada.
#
#   bash bootstrap.sh "ssh-ed25519 AAAA... paulo@windows" "ssh-ed25519 AAAA... ci-hml"
#
# Argumentos = chaves PÚBLICAS que entram no usuário `deploy` (a sua e a do GitHub Actions). Sem
# argumento, copia as do root (/root/.ssh/authorized_keys, a que a Hostinger instalou).
#
# Faz: atualiza o sistema; usuário `deploy` (chave SSH, grupo docker, sudo sem senha); SSH só por
# chave, sem senha e sem root; firewall UFW (22, 80, 443); fail2ban no SSH; atualizações
# automáticas de segurança; Docker Engine + compose plugin do repositório OFICIAL; swap de 4 GB;
# pasta /opt/lider-impacto. NÃO faz login em registro nem grava segredo nenhum.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Rode como root." >&2; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
[[ "$ID" == "ubuntu" && "$VERSION_ID" == "24.04" ]] || echo "AVISO: feito para Ubuntu 24.04 (este é $PRETTY_NAME)."

USUARIO=deploy
PASTA=/opt/lider-impacto
export DEBIAN_FRONTEND=noninteractive

echo "==> pacotes do sistema"
apt-get update -q
apt-get -y -q upgrade
apt-get install -y -q ca-certificates curl gnupg ufw fail2ban python3-systemd unattended-upgrades bsdextrautils openssl

echo "==> usuário $USUARIO"
id "$USUARIO" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$USUARIO"
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.ssh"
chaves="/home/$USUARIO/.ssh/authorized_keys"
touch "$chaves"
if [[ $# -gt 0 ]]; then
  for chave in "$@"; do
    [[ "$chave" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256)\  ]] || { echo "Não parece chave pública: ${chave:0:20}..." >&2; exit 1; }
    grep -qxF "$chave" "$chaves" || echo "$chave" >> "$chaves"
  done
elif [[ -s /root/.ssh/authorized_keys ]]; then
  while IFS= read -r chave; do
    [[ -z "$chave" ]] || grep -qxF "$chave" "$chaves" || echo "$chave" >> "$chaves"
  done < /root/.ssh/authorized_keys
fi
chown "$USUARIO:$USUARIO" "$chaves"
chmod 600 "$chaves"
# Trava de segurança: sem chave no deploy, desligar senha/root trancaria você fora.
grep -qE '^(ssh-|ecdsa-)' "$chaves" || { echo "Nenhuma chave SSH para $USUARIO: abortando antes de fechar o SSH." >&2; exit 1; }
# sudo sem senha: o usuário não tem senha (só chave) e o grupo docker já equivale a root.
echo "$USUARIO ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-$USUARIO
chmod 440 /etc/sudoers.d/90-$USUARIO
visudo -cq

echo "==> SSH só por chave, sem root"
# Nome começando com 00: no sshd vale o PRIMEIRO valor lido, e a Hostinger/cloud-init costuma
# deixar um 50-cloud-init.conf com PasswordAuthentication yes.
cat > /etc/ssh/sshd_config.d/00-lider-impacto.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
X11Forwarding no
AllowUsers deploy
CONF
sshd -t
systemctl restart ssh

echo "==> firewall"
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
# Docker publica porta por iptables próprio (passa por fora do UFW). Por isso o compose só publica
# 80/443 (Caddy); banco, Redis e storage não têm porta no host.

echo "==> fail2ban"
cat > /etc/fail2ban/jail.d/lider-impacto.local <<'CONF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
CONF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> atualizações automáticas de segurança"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
systemctl enable --now unattended-upgrades

echo "==> Docker Engine + compose (repositório oficial)"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
usermod -aG docker "$USUARIO"

echo "==> swap de 4 GB"
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-lider-impacto.conf
sysctl -q --system

echo "==> pasta $PASTA"
install -d -m 750 -o "$USUARIO" -g "$USUARIO" "$PASTA"

cat <<FIM

Pronto. Próximos passos (docs/deploy-hml.md):
  1. Teste em OUTRA janela, antes de fechar esta:   ssh $USUARIO@<ip-da-vps>
     (root e senha não entram mais).
  2. Crie $PASTA/.env a partir de deploy/hml/env.exemplo (passo 7) e rode:  chmod 600 $PASTA/.env
  3. O primeiro deploy é feito pelo GitHub Actions (push na develop). Login no GHCR NÃO é
     necessário: o CI entra com um token temporário a cada deploy e sai no fim. Só se quiser
     baixar imagem à mão (como $USUARIO):
       docker login ghcr.io -u <seu-usuario-github>   (senha = token "read:packages"; depois: docker logout ghcr.io)
FIM
