'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import {
  CircleAlert,
  CircleCheck,
  CloudUpload,
  Download,
  Ellipsis,
  ExternalLink,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  LoaderCircle,
  PencilRuler,
  Pencil,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  abreNoNavegador,
  ACEITA_ARQUIVO,
  CATEGORIAS_ARQUIVO,
  dataDoInstante,
  extensaoDoArquivo,
  formatarData,
  formatarTamanho,
  nomeSeguroArquivo,
  problemaDoArquivo,
  ROTULO_CATEGORIA_ARQUIVO,
  tipoDoArquivo,
  type ArquivoObra,
  type CategoriaArquivo,
  type TipoArquivo,
} from '@obras/shared';
import { Botao, Campo, classeBotao, classeEntrada } from '@/components/ui';
import { useConfirmar } from '@/components/Confirmar';
import { Menu, MenuConteudo, MenuGatilho, MenuOpcao, MenuSeparador } from '@/components/MenuSuspenso';
import { avisar } from '@/lib/avisos';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { editarArquivo, excluirArquivo, linkDoArquivo, registrarArquivo } from './acoes';

const ICONE_TIPO: Record<TipoArquivo, { icone: LucideIcon; cor: string }> = {
  cad: { icone: PencilRuler, cor: 'bg-cianotipia-claro text-cianotipia' },
  pdf: { icone: FileText, cor: 'bg-marcador-claro text-marcador' },
  imagem: { icone: FileImage, cor: 'bg-obra-ok/10 text-obra-ok' },
  planilha: { icone: FileSpreadsheet, cor: 'bg-obra-ok/10 text-obra-ok' },
  documento: { icone: FileText, cor: 'bg-concreto text-grafite' },
  compactado: { icone: FileArchive, cor: 'bg-atencao-claro text-atencao' },
  outro: { icone: File, cor: 'bg-concreto text-grafite' },
};

type Envio = { chave: string; nome: string; tamanho: number; situacao: 'enviando' | 'feito' | 'erro'; erro?: string };

export function Arquivos({ projetoId, arquivos, podeEditar }: { projetoId: string; arquivos: ArquivoObra[]; podeEditar: boolean }) {
  const [filtro, setFiltro] = useState<CategoriaArquivo | 'todas'>('todas');
  const [busca, setBusca] = useState('');

  const contagem = useMemo(() => {
    const m = new Map<CategoriaArquivo, number>();
    for (const a of arquivos) m.set(a.categoria, (m.get(a.categoria) ?? 0) + 1);
    return m;
  }, [arquivos]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return arquivos.filter(
      (a) =>
        (filtro === 'todas' || a.categoria === filtro) &&
        (!termo || a.nome.toLocaleLowerCase('pt-BR').includes(termo) || (a.descricao ?? '').toLocaleLowerCase('pt-BR').includes(termo)),
    );
  }, [arquivos, filtro, busca]);

  const grupos = CATEGORIAS_ARQUIVO.map((c) => ({ categoria: c, itens: visiveis.filter((a) => a.categoria === c) })).filter((g) => g.itens.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {podeEditar && <EnviarArquivos projetoId={projetoId} categoriaInicial={filtro === 'todas' ? 'arquitetonico' : filtro} />}

      {arquivos.length > 0 && (
        <div className="flex flex-col gap-3">
          <label className="relative block max-w-md">
            <span className="sr-only">Buscar arquivo</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-regua" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pelo nome ou descrição"
              className={`${classeEntrada} pl-9`}
            />
          </label>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex min-w-max gap-2" aria-label="Pastas">
              <Chip ativo={filtro === 'todas'} onClick={() => setFiltro('todas')} rotulo="Todas" n={arquivos.length} />
              {CATEGORIAS_ARQUIVO.filter((c) => contagem.has(c)).map((c) => (
                <Chip key={c} ativo={filtro === c} onClick={() => setFiltro(c)} rotulo={ROTULO_CATEGORIA_ARQUIVO[c]} n={contagem.get(c) ?? 0} />
              ))}
            </ul>
          </div>
        </div>
      )}

      {arquivos.length === 0 ? (
        <div className="cartao flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span aria-hidden className="flex size-12 items-center justify-center rounded-cartao bg-cianotipia-claro text-cianotipia">
            <FolderOpen className="size-6" />
          </span>
          <p className="font-semibold">Nenhum arquivo na obra ainda</p>
          <p className="max-w-md text-sm text-regua">
            {podeEditar
              ? 'Envie os projetos (DWG, PDF, IFC), o alvará, a ART e os contratos. Todo mundo da obra vê e baixa daqui, no celular ou no computador.'
              : 'Quando o engenheiro enviar os projetos e documentos, eles aparecem aqui para você abrir e baixar.'}
          </p>
        </div>
      ) : grupos.length === 0 ? (
        <p className="cartao p-4 text-regua">Nenhum arquivo com esse nome nesta pasta.</p>
      ) : (
        grupos.map((g) => (
          <section key={g.categoria} className="cartao overflow-hidden" aria-labelledby={`pasta-${g.categoria}`}>
            <h3 id={`pasta-${g.categoria}`} className="flex items-center justify-between border-b border-linha px-4 py-3 font-semibold sm:px-5">
              {ROTULO_CATEGORIA_ARQUIVO[g.categoria]}
              <span className="numeros text-sm font-normal text-regua">
                {g.itens.length} {g.itens.length === 1 ? 'arquivo' : 'arquivos'}
              </span>
            </h3>
            <ul className="divide-y divide-linha">
              {g.itens.map((a) => (
                <LinhaArquivo key={a.id} projetoId={projetoId} arquivo={a} podeEditar={podeEditar} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Chip({ ativo, onClick, rotulo, n }: { ativo: boolean; onClick: () => void; rotulo: string; n: number }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={ativo}
        className={`flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
          ativo ? 'border-cianotipia bg-cianotipia text-white' : 'border-linha bg-papel text-grafite hover:border-campo'
        }`}
      >
        {rotulo}
        <span className={`numeros text-xs ${ativo ? 'text-white/80' : 'text-regua'}`}>{n}</span>
      </button>
    </li>
  );
}

function LinhaArquivo({ projetoId, arquivo: a, podeEditar }: { projetoId: string; arquivo: ArquivoObra; podeEditar: boolean }) {
  const tipo = ICONE_TIPO[tipoDoArquivo(a.nome)];
  const Icone = tipo.icone;
  const [abrindo, iniciar] = useTransition();
  const [editando, setEditando] = useState(false);
  const confirmar = useConfirmar();
  const router = useRouter();

  function abrir(baixar: boolean) {
    // A aba nova abre já no clique: o Safari bloqueia janela aberta depois de esperar o servidor.
    const aba = baixar ? null : window.open('', '_blank');
    iniciar(async () => {
      const r = await linkDoArquivo(a.id, baixar);
      if (!r.ok || !r.valor) {
        aba?.close();
        avisar.erro(r.ok ? 'Não foi possível gerar o link.' : r.erro);
        return;
      }
      if (aba) aba.location.href = r.valor;
      else window.location.href = r.valor;
    });
  }

  async function apagar() {
    const sim = await confirmar({
      titulo: `Excluir ${a.nome}?`,
      texto: 'O arquivo sai da obra para todo mundo. Não dá para desfazer.',
      confirmar: 'Excluir arquivo',
      perigo: true,
    });
    if (!sim) return;
    const r = await excluirArquivo(projetoId, a.id);
    if (r.ok) {
      avisar.ok(`${a.nome} saiu da obra.`);
      router.refresh();
    } else avisar.erro(r.erro);
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-medio ${tipo.cor}`}>
        <Icone className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-semibold break-words" title={a.nome}>
          {a.nome}
        </p>
        <p className="numeros text-sm text-regua">
          {(extensaoDoArquivo(a.nome) ?? '').toUpperCase()} · {formatarTamanho(a.tamanho)} · {formatarData(dataDoInstante(a.criado_em))}
          {a.enviado_nome && <span className="hidden sm:inline"> · {a.enviado_nome}</span>}
        </p>
        {a.descricao && <p className="mt-0.5 line-clamp-2 text-sm">{a.descricao}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {abreNoNavegador(a.nome) && (
          <button
            type="button"
            onClick={() => abrir(false)}
            disabled={abrindo}
            className="hidden min-h-11 items-center gap-1.5 rounded-medio px-3 text-sm font-semibold text-cianotipia hover:bg-cianotipia-claro sm:flex"
          >
            <ExternalLink aria-hidden className="size-4" />
            Abrir
          </button>
        )}
        <button
          type="button"
          onClick={() => abrir(true)}
          disabled={abrindo}
          aria-label={`Baixar ${a.nome}`}
          className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-medio px-3 text-sm font-semibold text-cianotipia hover:bg-cianotipia-claro"
        >
          {abrindo ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" />}
          <span className="hidden sm:inline">Baixar</span>
        </button>
        {(podeEditar || abreNoNavegador(a.nome)) && (
          <Menu>
            <MenuGatilho
              className="flex size-11 items-center justify-center rounded-medio text-regua hover:bg-concreto hover:text-grafite data-[state=open]:bg-concreto"
              aria-label={`Mais ações de ${a.nome}`}
            >
              <Ellipsis aria-hidden className="size-5" />
            </MenuGatilho>
            <MenuConteudo>
              {abreNoNavegador(a.nome) && (
                <MenuOpcao onSelect={() => abrir(false)}>
                  <ExternalLink aria-hidden className="size-4 text-regua" />
                  Abrir no navegador
                </MenuOpcao>
              )}
              {podeEditar && (
                <>
                  <MenuOpcao onSelect={() => setEditando(true)}>
                    <Pencil aria-hidden className="size-4 text-regua" />
                    Renomear ou mudar de pasta
                  </MenuOpcao>
                  <MenuSeparador />
                  <MenuOpcao perigo onSelect={apagar}>
                    <Trash2 aria-hidden className="size-4" />
                    Excluir
                  </MenuOpcao>
                </>
              )}
            </MenuConteudo>
          </Menu>
        )}
      </div>
      {podeEditar && <EditarArquivo projetoId={projetoId} arquivo={a} aberto={editando} onAberto={setEditando} />}
    </li>
  );
}

function EnviarArquivos({ projetoId, categoriaInicial }: { projetoId: string; categoriaInicial: CategoriaArquivo }) {
  const [categoria, setCategoria] = useState<CategoriaArquivo>(categoriaInicial);
  const [descricao, setDescricao] = useState('');
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const enviando = envios.some((e) => e.situacao === 'enviando');

  async function enviar(lista: FileList | File[]) {
    const arquivos = Array.from(lista);
    if (arquivos.length === 0) return;
    const novos: Envio[] = arquivos.map((f) => ({ chave: crypto.randomUUID(), nome: f.name, tamanho: f.size, situacao: 'enviando' }));
    setEnvios((e) => [...novos, ...e.filter((x) => x.situacao !== 'feito')]);
    const supabase = criarClienteNavegador();
    const atualizar = (chave: string, parte: Partial<Envio>) => setEnvios((e) => e.map((x) => (x.chave === chave ? { ...x, ...parte } : x)));

    let feitos = 0;
    for (const [i, f] of arquivos.entries()) {
      const chave = novos[i]!.chave;
      const problema = problemaDoArquivo(f);
      if (problema) {
        atualizar(chave, { situacao: 'erro', erro: problema });
        continue;
      }
      const id = crypto.randomUUID();
      const caminho = `${projetoId}/${id}/${nomeSeguroArquivo(f.name)}`;
      const up = await supabase.storage.from('arquivos').upload(caminho, f, { contentType: f.type || 'application/octet-stream', upsert: false });
      if (up.error) {
        atualizar(chave, { situacao: 'erro', erro: 'Não foi possível enviar. Confira a internet e tente de novo.' });
        continue;
      }
      const r = await registrarArquivo(projetoId, {
        id,
        caminho,
        nome: f.name,
        categoria,
        tamanho: f.size,
        tipoMime: f.type || null,
        descricao: descricao.trim() || null,
      });
      if (r.ok) {
        feitos += 1;
        atualizar(chave, { situacao: 'feito' });
      } else atualizar(chave, { situacao: 'erro', erro: r.erro });
    }
    if (feitos > 0) {
      avisar.ok(feitos === 1 ? 'Arquivo enviado.' : `${feitos} arquivos enviados.`);
      setDescricao('');
      router.refresh();
    }
    if (entrada.current) entrada.current.value = '';
  }

  return (
    <section className="cartao p-4 sm:p-5" aria-labelledby="titulo-enviar">
      <h3 id="titulo-enviar" className="mb-4 font-semibold">
        Enviar arquivos
      </h3>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-4">
          <Campo rotulo="Pasta" nome="arquivo-categoria">
            <select
              id="arquivo-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaArquivo)}
              className={classeEntrada}
              disabled={enviando}
            >
              {CATEGORIAS_ARQUIVO.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CATEGORIA_ARQUIVO[c]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Descrição (opcional)" nome="arquivo-descricao" dica="Vale para os arquivos deste envio. Ex.: Revisão 03, aprovada na prefeitura.">
            <input
              id="arquivo-descricao"
              value={descricao}
              maxLength={500}
              onChange={(e) => setDescricao(e.target.value)}
              className={classeEntrada}
              disabled={enviando}
            />
          </Campo>
        </div>
        <div className="flex flex-col gap-3">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              if (!enviando) void enviar(e.dataTransfer.files);
            }}
            className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-cartao border-2 border-dashed px-4 py-6 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cianotipia ${
              arrastando ? 'border-cianotipia bg-cianotipia-claro' : 'border-campo/50 bg-concreto/50 hover:border-cianotipia'
            } ${enviando ? 'pointer-events-none opacity-70' : ''}`}
          >
            <CloudUpload aria-hidden className="size-8 text-cianotipia" strokeWidth={1.8} />
            <span className="font-semibold">{enviando ? 'Enviando…' : 'Escolher arquivos ou arrastar para cá'}</span>
            <span className="text-sm text-regua">DWG, DXF, PDF, IFC, RVT, SKP, imagens, planilhas, documentos e ZIP. Até 50 MB cada.</span>
            <input
              ref={entrada}
              type="file"
              multiple
              accept={ACEITA_ARQUIVO}
              className="sr-only"
              disabled={enviando}
              onChange={(e) => e.target.files && void enviar(e.target.files)}
            />
          </label>
          {envios.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm" aria-live="polite">
              {envios.map((e) => (
                <li key={e.chave} className="flex items-start gap-2">
                  {e.situacao === 'enviando' ? (
                    <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-cianotipia" />
                  ) : e.situacao === 'feito' ? (
                    <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-obra-ok" />
                  ) : (
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-marcador" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">
                      {e.nome} <span className="numeros text-regua">· {formatarTamanho(e.tamanho)}</span>
                    </span>
                    {e.erro && <span className="block text-marcador">{e.erro}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function EditarArquivo({
  projetoId,
  arquivo,
  aberto,
  onAberto,
}: {
  projetoId: string;
  arquivo: ArquivoObra;
  aberto: boolean;
  onAberto: (a: boolean) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const router = useRouter();

  return (
    <Dialog.Root
      open={aberto}
      onOpenChange={(a) => {
        setErro(null);
        onAberto(a);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-noite/50 data-[state=open]:animate-surgir" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-[20px] bg-papel px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] data-[state=open]:animate-subir sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-cartao sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold">Renomear ou mudar de pasta</Dialog.Title>
            <Dialog.Close className="-mt-2 -mr-2 flex size-11 items-center justify-center rounded-full text-regua hover:bg-concreto" aria-label="Fechar">
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Corrija o nome, a pasta ou a descrição do arquivo.</Dialog.Description>
          <form
            className="flex flex-col gap-4"
            action={(form) =>
              iniciar(async () => {
                const r = await editarArquivo(projetoId, arquivo.id, {
                  nome: String(form.get('nome') ?? ''),
                  categoria: String(form.get('categoria') ?? ''),
                  descricao: String(form.get('descricao') ?? ''),
                });
                if (!r.ok) return setErro(r.erro);
                avisar.ok('Arquivo atualizado.');
                onAberto(false);
                router.refresh();
              })
            }
          >
            <Campo rotulo="Nome" nome={`nome-${arquivo.id}`} dica={`Mantenha o final .${extensaoDoArquivo(arquivo.nome) ?? ''}`}>
              <input id={`nome-${arquivo.id}`} name="nome" defaultValue={arquivo.nome} required maxLength={200} className={classeEntrada} />
            </Campo>
            <Campo rotulo="Pasta" nome={`categoria-${arquivo.id}`}>
              <select id={`categoria-${arquivo.id}`} name="categoria" defaultValue={arquivo.categoria} className={classeEntrada}>
                {CATEGORIAS_ARQUIVO.map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_CATEGORIA_ARQUIVO[c]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Descrição (opcional)" nome={`descricao-${arquivo.id}`}>
              <input id={`descricao-${arquivo.id}`} name="descricao" defaultValue={arquivo.descricao ?? ''} maxLength={500} className={classeEntrada} />
            </Campo>
            {erro && <p className="text-sm text-marcador">{erro}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Dialog.Close className={classeBotao('secundario')}>Cancelar</Dialog.Close>
              <Botao type="submit" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </Botao>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
