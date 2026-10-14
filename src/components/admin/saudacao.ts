/** "Bom dia" até 11h59, "Boa tarde" até 17h59, "Boa noite" depois — sempre no horário de São Paulo. */
export function saudacaoPorHorario(agora: Date): "Bom dia" | "Boa tarde" | "Boa noite" {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(agora)
  );
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}
