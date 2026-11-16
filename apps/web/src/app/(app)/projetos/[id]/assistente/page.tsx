import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buscarProjeto } from '@/lib/dados';
import { iaConfigurada } from '@/lib/ia';
import { Assistente } from './Assistente';

export const metadata: Metadata = { title: 'Assistente' };
// O modelo pode demorar (e o app tenta outro modelo quando um está sobrecarregado).
export const maxDuration = 120;

export default async function PaginaAssistente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Assistente da obra</h2>
        <p className="mt-1 text-regua">
          Perguntas sobre esta obra respondidas com os dados dela. Ele só sugere: para mudar avanço, datas ou material, use as telas da obra.
        </p>
      </div>
      {iaConfigurada() ? (
        <Assistente projetoId={id} nomeObra={dados.projeto.nome} />
      ) : (
        <p className="cartao p-4 text-regua">
          A IA ainda não está ligada. Cadastre a chave do Gemini (IA_CHAVE) ou do OpenRouter (API_OPENROUTER) nas variáveis da Vercel.
        </p>
      )}
    </div>
  );
}
