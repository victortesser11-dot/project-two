'use client';

import { useState, useTransition } from 'react';
import { AvisoErro, Botao } from '@/components/ui';
import { apagarObraExemplo, criarObraExemplo } from './acoes';

/** Criar ou apagar a obra de exemplo (só aparece para o admin). */
export function ObraExemplo({ existe }: { existe: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, iniciar] = useTransition();

  function executar(acao: () => Promise<{ erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (r?.erro) setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-regua">
        {existe
          ? 'A obra de exemplo tem dados fictícios: cronograma, três meses de avanço, equipe, almoxarifado e financeiro. Apague quando não precisar mais; as obras reais não são tocadas.'
          : 'Monta uma obra fictícia de 4 pavimentos com cerca de 140 tarefas e três meses de andamento (avanço, chamada, diários, almoxarifado, contratos e despesas) para você ver o app funcionando. Não cria conta de login para ninguém e pode ser apagada depois.'}
      </p>
      <div>
        {existe ? (
          <Botao
            type="button"
            variante="secundario"
            disabled={rodando}
            onClick={() => {
              if (window.confirm('Apagar a obra de exemplo com todos os dados dela? Não dá para desfazer.')) executar(apagarObraExemplo);
            }}
          >
            {rodando ? 'Apagando…' : 'Apagar obra de exemplo'}
          </Botao>
        ) : (
          <Botao type="button" disabled={rodando} onClick={() => executar(criarObraExemplo)}>
            {rodando ? 'Montando a obra… (alguns segundos)' : 'Criar obra de exemplo'}
          </Botao>
        )}
      </div>
      {erro && <AvisoErro>{erro}</AvisoErro>}
    </div>
  );
}
