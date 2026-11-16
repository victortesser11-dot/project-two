'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react';
import { excluirProjeto } from '@/app/(app)/acoes';
import { useConfirmar } from '@/components/Confirmar';
import { Menu, MenuConteudo, MenuGatilho, MenuOpcao, MenuSeparador } from '@/components/MenuSuspenso';
import { avisar } from '@/lib/avisos';

/**
 * Três pontinhos da obra: editar os dados (endereço, CEP, datas, situação) e, para o admin da empresa, excluir a obra.
 * Fica fora do link da linha, para o toque não abrir a obra.
 */
export function MenuObra({
  projetoId,
  nome,
  podeEditar,
  podeExcluir,
  exemplo = false,
}: {
  projetoId: string;
  nome: string;
  podeEditar: boolean;
  podeExcluir: boolean;
  exemplo?: boolean;
}) {
  const confirmar = useConfirmar();
  const [excluindo, iniciar] = useTransition();
  if (!podeEditar && !podeExcluir) return null;

  async function excluir() {
    const sim = await confirmar({
      titulo: `Excluir a obra ${nome}?`,
      texto: exemplo
        ? 'A obra de exemplo e os cadastros fictícios dela saem. Dá para criar de novo depois.'
        : 'Sai tudo o que é dela: cronograma, avanços, diários, almoxarifado, equipe da obra, medições e arquivos. Não dá para desfazer.',
      confirmar: 'Excluir a obra',
      perigo: true,
    });
    if (!sim) return;
    iniciar(async () => {
      const r = await excluirProjeto(projetoId);
      if (r?.erro) avisar.erro(r.erro);
    });
  }

  return (
    <Menu>
      <MenuGatilho
        aria-label={`Opções da obra ${nome}`}
        disabled={excluindo}
        className="flex size-11 shrink-0 items-center justify-center rounded-medio text-regua hover:bg-concreto hover:text-grafite disabled:opacity-50"
      >
        <EllipsisVertical aria-hidden className="size-5" />
      </MenuGatilho>
      <MenuConteudo>
        {podeEditar && (
          <MenuOpcao asChild>
            <Link href={`/projetos/${projetoId}/editar`}>
              <Pencil aria-hidden className="size-4" />
              Editar dados da obra
            </Link>
          </MenuOpcao>
        )}
        {podeEditar && podeExcluir && <MenuSeparador />}
        {podeExcluir && (
          <MenuOpcao perigo onSelect={() => void excluir()}>
            <Trash2 aria-hidden className="size-4" />
            Excluir a obra
          </MenuOpcao>
        )}
      </MenuConteudo>
    </Menu>
  );
}
