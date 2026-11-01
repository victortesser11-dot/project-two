// Fila em disco: foto tirada sem internet espera aqui e sobe quando a conexão voltar.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const LIMITE_FILA = 500; // ~250 MB com fotos de 500 KB

export function criarFila(pasta) {
  const dir = join(pasta, 'fila');

  return {
    // A foto vai primeiro; o .json (que põe o item na fila) só depois que ela está inteira no disco.
    async guardar(cameraId, quando, jpeg, id) {
      await mkdir(dir, { recursive: true });
      const nome = `${quando.toISOString().replace(/[:.]/g, '-')}_${cameraId}`;
      await writeFile(join(dir, `${nome}.jpg`), jpeg);
      await writeFile(join(dir, `${nome}.json`), JSON.stringify({ cameraId, quando: quando.toISOString(), id }));
      await this.aparar();
    },

    /** Itens da fila, do mais antigo para o mais novo. */
    async itens() {
      const arquivos = await readdir(dir).catch(() => []);
      return arquivos
        .filter((a) => a.endsWith('.json'))
        .sort()
        .map((a) => a.slice(0, -5));
    },

    async ler(nome) {
      const meta = JSON.parse(await readFile(join(dir, `${nome}.json`), 'utf8'));
      const quando = new Date(meta.quando);
      if (typeof meta.cameraId !== 'string' || Number.isNaN(quando.getTime())) throw new Error('dados da foto incompletos');
      return { cameraId: meta.cameraId, quando, id: meta.id ?? null, jpeg: await readFile(join(dir, `${nome}.jpg`)) };
    },

    // O .json sai primeiro: se cair no meio, sobra só uma foto solta, que o aparar() limpa.
    async tirar(nome) {
      await rm(join(dir, `${nome}.json`), { force: true });
      await rm(join(dir, `${nome}.jpg`), { force: true });
    },

    /** Sem internet por muitos dias: descarta as mais antigas para não lotar o cartão. Limpa fotos soltas. */
    async aparar() {
      const itens = await this.itens();
      for (const nome of itens.slice(0, Math.max(0, itens.length - LIMITE_FILA))) await this.tirar(nome);
      const naFila = new Set(await this.itens());
      for (const a of await readdir(dir).catch(() => [])) {
        if (a.endsWith('.jpg') && !naFila.has(a.slice(0, -4))) await rm(join(dir, a), { force: true });
      }
    },
  };
}
