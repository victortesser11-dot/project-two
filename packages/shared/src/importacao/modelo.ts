// Planilha-modelo para download: abre direto no Excel em português
// (";" como separador, vírgula decimal e BOM para manter os acentos).

const LINHAS_MODELO: string[][] = [
  ['Item', 'Descrição', 'Unidade', 'Quantidade', 'Preço unitário', 'Total', 'Início', 'Término'],
  ['1', 'Serviços preliminares', '', '', '', '', '', ''],
  ['1.1', 'Tapume de chapa compensada', 'm²', '180', '62,40', '11.232,00', '03/11/2026', '07/11/2026'],
  ['1.2', 'Locação da obra', 'm²', '640', '4,80', '3.072,00', '05/11/2026', '06/11/2026'],
  ['2', 'Fundações', '', '', '', '', '', ''],
  ['2.1', 'Estacas', '', '', '', '', '', ''],
  ['2.1.1', 'Estaca hélice contínua Ø40 cm', 'm', '320', '150,00', '48.000,00', '09/11/2026', '20/11/2026'],
  ['2.2', 'Blocos de coroamento', 'm³', '42,5', '1.447,07', '61.500,50', '18/11/2026', '10/12/2026'],
];

function celulaCsv(valor: string): string {
  return /[;"\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export function planilhaModeloCsv(): string {
  return '﻿' + LINHAS_MODELO.map((l) => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n';
}
