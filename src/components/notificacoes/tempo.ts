/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", depois "dd/mm" (puro: `agora` injetável). */
export function tempoRelativo(em: Date | string, agora: Date = new Date()): string {
  const data = new Date(em);
  const seg = Math.max(0, Math.round((agora.getTime() - data.getTime()) / 1000));
  if (seg < 60) return "agora";
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(data);
}
