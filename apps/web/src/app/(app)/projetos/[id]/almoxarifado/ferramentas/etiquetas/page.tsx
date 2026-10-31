import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { linkQrFerramenta } from '@obras/shared';
import { buscarProjeto, empresaAtual, listarItensEstoque } from '@/lib/dados';
import { BotaoImprimir } from '../../../diario/AcoesDiario';
import { NavAlmoxarifado } from '../../NavAlmoxarifado';

export const metadata: Metadata = { title: 'Etiquetas das ferramentas' };

/** Endereço público do app (o QR precisa abrir no celular de quem lê). */
async function origem() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocolo}://${host}`;
}

export default async function PaginaEtiquetas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const [itens, empresa, base] = await Promise.all([listarItensEstoque(dados.projeto.empresa_id), empresaAtual(), origem()]);
  const ferramentas = itens.filter((i) => i.tipo === 'ferramenta' && i.ativo);
  const etiquetas = await Promise.all(
    ferramentas.map(async (f) => ({
      ...f,
      svg: await QRCode.toString(linkQrFerramenta(base, f.id), { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1a1d21', light: '#ffffff' } }),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 print:hidden">
        <NavAlmoxarifado projetoId={id} ativa="ferramentas" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold sm:text-2xl">Etiquetas das ferramentas</h2>
            <p className="mt-1 max-w-2xl text-regua">
              Imprima em papel adesivo (ou cole com fita transparente). O QR abre a ferramenta no app: dá para emprestar e receber direto dele.
            </p>
          </div>
          {etiquetas.length > 0 && <BotaoImprimir />}
        </div>
      </div>
      {etiquetas.length === 0 ? (
        <p className="text-regua">Nenhuma ferramenta ativa no catálogo.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-2">
          {etiquetas.map((f) => (
            <li key={f.id} className="flex break-inside-avoid flex-col items-center gap-2 rounded-medio border border-linha bg-papel p-3 text-center print:rounded-none print:border-grafite">
              <div className="aspect-square w-full max-w-36 [&_svg]:h-full [&_svg]:w-full" role="img" aria-label={`QR de ${f.nome}`} dangerouslySetInnerHTML={{ __html: f.svg }} />
              <p className="line-clamp-2 text-sm leading-tight font-semibold">{f.nome}</p>
              <p className="numeros text-sm font-semibold">{f.codigo}</p>
              {(f.patrimonio || empresa?.nome) && (
                <p className="numeros text-xs text-regua">{[f.patrimonio && `Patrimônio ${f.patrimonio}`, empresa?.nome].filter(Boolean).join(' · ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
