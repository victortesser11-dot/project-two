// Quando tirar cada foto. Puro (sem relógio nem disco) para testar.

/** Data (AAAA-MM-DD) e minutos do dia no fuso da obra. */
export function agoraNoFuso(fuso, agora = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(agora)
      .map((x) => [x.type, x.value]),
  );
  return { data: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

const minutos = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Depois do horário, quanto tempo ainda vale tentar a foto (queda de energia, câmera reiniciando). */
export const JANELA_MIN = 60;
/** Intervalo entre tentativas dentro da janela. */
export const ESPERA_ENTRE_TENTATIVAS_MIN = 5;

/**
 * Horários da câmera que precisam de foto agora.
 * `estado` guarda, por "<camera>|<data>|<HH:MM>", { feito: boolean, tentativa: minutos da última tentativa }.
 */
export function horariosDevidos(camera, { data, minutos: agora }, estado) {
  return (camera.horarios ?? []).filter((h) => {
    const inicio = minutos(h);
    if (agora < inicio || agora > inicio + JANELA_MIN) return false;
    const e = estado[`${camera.id}|${data}|${h}`];
    if (!e) return true;
    if (e.feito) return false;
    return agora - e.tentativa >= ESPERA_ENTRE_TENTATIVAS_MIN;
  });
}

/** Tira do estado o que tem mais de 3 dias (o arquivo não cresce para sempre). */
export function limparEstado(estado, dataHoje) {
  const limite = new Date(`${dataHoje}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - 3);
  const corte = limite.toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(estado).filter(([chave]) => chave.split('|')[1] >= corte));
}
