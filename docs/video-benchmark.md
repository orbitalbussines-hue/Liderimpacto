# Benchmark do pipeline de vídeo (HLS AES-128)

Medido em 14/10/2026 com `scripts/video-benchmark.ts` sobre vídeos gerados por
`scripts/video-gerar-teste.ts`. Especificação em `docs/ARQUITETURA_VPS.md`. Tudo que está
em **Medido** saiu da execução; tudo em **Estimativa** é conta em cima disso e está marcado.

## Máquina e método

| Item | Valor |
|---|---|
| CPU | Intel Xeon E5-2650 v4 @ 2,20 GHz (Broadwell, 2016), 24 núcleos lógicos |
| RAM | 32 GB |
| SO / runtime | Windows 10 Pro, Node 24.12, FFmpeg 9.0.1 (gyan.dev, libx264) |
| Vídeos de origem | sintéticos: `testsrc2` + seno 440 Hz + relógio queimado, H.264 CRF 20, 30 fps, AAC 192k |
| Comando | `montarArgumentosHls` (libx264 `veryfast`, GOP 2 s, segmentos 6 s, AES-128) + thumbnail |
| CPU do FFmpeg | `-benchmark` do próprio FFmpeg (utime + stime do processo filho) |
| Simulação de 4 vCPU | afinidade `0xF` (4 núcleos lógicos = 2 físicos com HT), herdada pelo FFmpeg |

Limitações: a máquina estava compartilhada com outros processos (build/testes de outros
agentes), por isso a "CPU média da máquina" é só indicativa; o tempo de CPU do FFmpeg não é
afetado por isso. Conteúdo sintético tem movimento constante; aula real (pessoa falando)
costuma custar igual ou menos CPU. O tamanho de saída depende do bitrate configurado, não
do conteúdo.

## Medido — escada padrão (720p 2800k + 480p 1400k)

| Vídeo | Núcleos | Parede total | Parede ÷ duração | CPU do FFmpeg | CPU ÷ duração | Núcleos ocupados | 720p | 480p |
|---|---|---|---|---|---|---|---|---|
| 1 min 720p | 24 | 7,7 s | 0,128 | 104,6 s | 1,74 | 14,5 | 1,343 GB/h | 0,718 GB/h |
| 1 min 1080p | 24 | 9,6 s | 0,161 | 135,4 s | 2,26 | 15,5 | 1,336 GB/h | 0,718 GB/h |
| 10 min 1080p | 24 | 94,1 s | 0,157 | 1.380,7 s | 2,30 | 14,8 | 1,358 GB/h | 0,721 GB/h |
| 1 min 1080p | 4 (afinidade) | 36,0 s | 0,599 | 130,8 s | 2,18 | 3,8 | 1,367 GB/h | 0,723 GB/h |
| 10 min 1080p | 4 (afinidade) | 330,9 s | 0,551 | 1.279,0 s | 2,13 | 3,9 | 1,367 GB/h | 0,723 GB/h |

## Medido — escada com 1080p (5000k + 720p + 480p)

| Vídeo | Núcleos | Parede total | Parede ÷ duração | CPU ÷ duração | 1080p | 720p | 480p |
|---|---|---|---|---|---|---|---|
| 1 min 1080p | 24 | 17,2 s | 0,287 | 4,43 | 2,288 GB/h | 1,334 GB/h | 0,718 GB/h |
| 10 min 1080p | 24 | 156,9 s | 0,261 | 4,43 | 2,348 GB/h | 1,356 GB/h | 0,721 GB/h |

O degrau de 1080p **dobra** a CPU (2,3 → 4,4 s de CPU por segundo de vídeo).

## Medido — conferência da saída (em todas as execuções)

- `ffprobe` no `master.m3u8` (com a chave no lugar do `URI`) lê todas as variantes e a
  duração exata (60,0 s / 600,0 s).
- Segmento `.ts` cifrado: não tem o byte de sincronia do MPEG-TS e o `ffprobe` **não abre**.
- Decifrado com a chave e o IV da playlist (AES-128-CBC): volta a ser MPEG-TS (h264 + aac).
- O worker faz a mesma conferência antes de aceitar a saída (`processarVideo` recusa
  segmento em claro).
- Prioridade: o FFmpeg roda com classe `Idle` no Windows (`PRIORITY_LOW`; 19 no Linux).
- Banda média publicada na master (vídeo de 1 min 720p): 720p ≈ 3,0 Mbps, 480p ≈ 1,6 Mbps.

## Estimativa — VPS do ARQUITETURA_VPS.md §4

Premissas: worker de 4 vCPU; vCPU de VPS atual (AMD EPYC) entre 1,0× e 1,6× um núcleo lógico
deste Xeon (não medido); limite `cpus: "3"` do docker-compose de produção; origem 1080p 30 fps.

| Pergunta | Escada padrão (720p+480p) | Com 1080p |
|---|---|---|
| Horas de CPU por hora de vídeo | **2,1–2,3 h** (medido, núcleo lógico Broadwell) | **4,4 h** (medido) |
| 1 h de vídeo em 4 vCPU | 33 min medido com 4 lógicos deste Xeon; estimativa 21–33 min na VPS | 42–66 min (estimativa) |
| 1 h de vídeo com limite de 3 CPUs | 28–44 min (estimativa) | 56–88 min (estimativa) |
| Vazão do worker (1 job por vez, 24 h) | ~33–50 h de conteúdo por dia (estimativa) | ~16–25 h por dia (estimativa) |
| Armazenamento HLS por hora | **2,08 GB/h** (medido: 1,36 + 0,72) | **4,43 GB/h** (medido) |
| Armazenamento HLS para 100 h | **≈ 208 GB** | **≈ 443 GB** |
| Originais (`uploads-raw`, 30–90 dias) | 3,5 GB/h no vídeo de teste (7,8 Mbps); celular 1080p grava ~15–20 Mbps ≈ 7–9 GB/h | igual |
| Tráfego por hora assistida | ≈ 1,34 GB a 720p (bate com o 1,3 GB/h do §4) | ≈ 2,3 GB a 1080p |

Conclusões:
1. 720p + 480p cabe com folga numa VPS de 4 vCPU: uma aula de 1 h fica pronta em menos de
   uma hora mesmo com o limite de 3 CPUs. Concorrência 1 está certa; 2 só com 8 vCPU.
2. Ligar 1080p dobra CPU e armazenamento (e o tráfego de quem assiste em tela grande).
   Deixar desligado até alguém pedir.
3. Para 100 h de conteúdo, reservar ~210 GB de HLS + os originais do período de retenção,
   e aplicar a folga de 3× do §4 (~700 GB–1 TB de disco no nó de storage).

## Decisões

- **Sprite de pré-visualização: adiado.** Só serve quando o player mostrar a miniatura ao
  passar o mouse na barra (hls.js + VTT de thumbnails), o que ainda não existe. Quando o
  player ganhar isso: um passo extra de FFmpeg (`fps=1/10,scale=160:-2,tile=10x10`) + VTT,
  custo de segundos por vídeo. A thumbnail (10% da duração) já é gerada para o card da aula.
- **IV fixo por vídeo:** sem IV no key info, o FFmpeg grava `IV=0x0…0` para todos os
  segmentos de VOD. Só revela que cabeçalhos TS iguais são iguais; o conteúdo segue cifrado.

## Como reproduzir

```bash
npx tsx scripts/video-gerar-teste.ts <pasta-fora-do-repo>
npx tsx scripts/video-benchmark.ts <pasta-fora-do-repo> maquina-inteira
BENCH_COM_1080P=1 npx tsx scripts/video-benchmark.ts <pasta-fora-do-repo> com-1080p 1min-1080p.mp4 10min-1080p.mp4
# 4 vCPU no Windows (o FFmpeg herda a afinidade):
cmd /c "start /affinity F /wait /b node --import tsx scripts/video-benchmark.ts <pasta> 4vcpu 1min-1080p.mp4 10min-1080p.mp4"
```
