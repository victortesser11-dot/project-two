// Arquivos de um arraste, abrindo as pastas soltas na tela (o navegador entrega a pasta como um item só).

const LIMITE_ARQUIVOS = 500;

type Entrada = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (ok: (f: File) => void, erro: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (lista: Entrada[]) => void, erro: (e: unknown) => void) => void };
};

function arquivoDaEntrada(entrada: Entrada): Promise<File | null> {
  return new Promise((resolver) => (entrada.file ? entrada.file(resolver, () => resolver(null)) : resolver(null)));
}

/** readEntries devolve em lotes (até 100 por vez): repete até vir vazio. */
async function filhosDaPasta(entrada: Entrada): Promise<Entrada[]> {
  const leitor = entrada.createReader?.();
  if (!leitor) return [];
  const todos: Entrada[] = [];
  for (;;) {
    const lote = await new Promise<Entrada[]>((resolver) => leitor.readEntries(resolver, () => resolver([])));
    if (lote.length === 0) return todos;
    todos.push(...lote);
  }
}

async function percorrer(entrada: Entrada, saida: File[]): Promise<void> {
  if (saida.length >= LIMITE_ARQUIVOS) return;
  if (entrada.isFile) {
    const arquivo = await arquivoDaEntrada(entrada);
    if (arquivo) saida.push(arquivo);
    return;
  }
  if (!entrada.isDirectory) return;
  for (const filho of await filhosDaPasta(entrada)) await percorrer(filho, saida);
}

/**
 * Arquivos soltos e os de dentro das pastas arrastadas (até 500). Chame dentro do evento `drop`: as entradas
 * são lidas antes da primeira espera, porque o navegador esvazia `dataTransfer` quando o evento termina.
 */
export async function arquivosDoArraste(dados: DataTransfer): Promise<File[]> {
  const soltos = Array.from(dados.files);
  const entradas = Array.from(dados.items ?? [])
    .filter((i) => i.kind === 'file')
    .map((i) => (typeof i.webkitGetAsEntry === 'function' ? (i.webkitGetAsEntry() as Entrada | null) : null));
  // Navegador sem leitura de pastas, ou arraste só de arquivos: a lista simples já serve.
  if (entradas.length === 0 || entradas.some((e) => e === null) || entradas.every((e) => e!.isFile)) return soltos;
  const saida: File[] = [];
  for (const entrada of entradas) await percorrer(entrada!, saida);
  return saida;
}
