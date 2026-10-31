import { notFound } from 'next/navigation';
import {
  listarCameras,
  ultimasFotos,
  listarItensEstoque,
  listarMovimentos,
  listarSaldos,
  buscarApontamentos,
  buscarEap,
  buscarLinhaBase,
  buscarProjeto,
  custoMaoObra,
  empresaAtual,
  listarMembrosProjeto,
  podeEditarProjeto,
  podeVerCustos,
} from '@/lib/dados';
import { itensComSaldo, resumoMaterial, totalMaoObra } from '@obras/shared';
import { PainelObra } from './PainelObra';

export default async function PainelProjeto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dados, empresa] = await Promise.all([buscarProjeto(id), empresaAtual()]);
  if (!dados) notFound();
  const { projeto, papel } = dados;

  const [itens, membros, podeEditar, linhaBase, apontamentos, verCustos, catalogo, saldos, movimentos, cameras, fotos] = await Promise.all([
    buscarEap(id),
    listarMembrosProjeto(id),
    podeEditarProjeto(projeto, papel),
    buscarLinhaBase(id),
    buscarApontamentos(id),
    podeVerCustos(projeto, papel),
    listarItensEstoque(projeto.empresa_id),
    listarSaldos(id),
    listarMovimentos(id),
    // O painel não cai se o módulo de câmeras falhar.
    listarCameras(id).catch(() => []),
    ultimasFotos(id).catch(() => new Map()),
  ]);
  const maisRecente = [...fotos.values()].filter((f) => f.url).sort((a, b) => b.capturada_em.localeCompare(a.capturada_em))[0];
  const ultimaFoto = maisRecente
    ? {
        url: maisRecente.url!,
        camera: cameras.find((c) => c.id === maisRecente.camera_id)?.nome ?? 'Câmera',
        quando: maisRecente.capturada_em,
        cameras: cameras.length,
      }
    : null;
  const linhasMaoObra = verCustos ? await custoMaoObra(id) : null;
  const material =
    catalogo.length > 0
      ? {
          aplicado: verCustos && movimentos.length > 0 ? resumoMaterial(movimentos).aplicado : null,
          itens: catalogo.length,
          abaixoDoMinimo: itensComSaldo(catalogo, saldos).filter((i) => i.abaixoDoMinimo).length,
        }
      : null;

  return (
    <PainelObra
      projeto={projeto}
      papel={papel}
      papelEmpresa={empresa?.papel ?? null}
      itens={itens}
      membros={membros}
      podeEditar={podeEditar}
      linhaBase={linhaBase}
      apontamentos={apontamentos}
      maoDeObra={linhasMaoObra && linhasMaoObra.length > 0 ? totalMaoObra(linhasMaoObra) : null}
      material={material}
      ultimaFoto={ultimaFoto}
    />
  );
}
