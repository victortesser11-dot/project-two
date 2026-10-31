import type { ComponentProps, ReactNode } from 'react';
import { ROTULO_STATUS, type StatusProjeto } from '@obras/shared';

type Variante = 'primario' | 'secundario' | 'discreto';

const ESTILO_BOTAO: Record<Variante, string> = {
  primario:
    'bg-cianotipia text-white hover:bg-cianotipia-escuro disabled:bg-regua/50',
  secundario: 'bg-papel text-grafite border border-campo/60 hover:border-grafite hover:bg-concreto/50 disabled:text-regua',
  discreto: 'text-cianotipia hover:underline underline-offset-4 disabled:text-regua',
};

export function classeBotao(variante: Variante = 'primario', extra = '') {
  const base =
    variante === 'discreto'
      ? 'inline-flex items-center gap-2 font-medium'
      : 'inline-flex min-h-11 items-center justify-center gap-2 rounded-medio px-4 py-2 font-semibold transition-colors';
  return `${base} ${ESTILO_BOTAO[variante]} disabled:cursor-not-allowed ${extra}`;
}

export function Botao({
  variante = 'primario',
  className = '',
  ...props
}: ComponentProps<'button'> & { variante?: Variante }) {
  return <button className={classeBotao(variante, className)} {...props} />;
}

export function Campo({
  rotulo,
  nome,
  erro,
  dica,
  children,
}: {
  rotulo: string;
  nome: string;
  erro?: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nome} className="text-sm font-semibold">
        {rotulo}
      </label>
      {children}
      {erro ? (
        <p id={`${nome}-erro`} className="text-sm text-marcador">
          {erro}
        </p>
      ) : dica ? (
        <p id={`${nome}-dica`} className="text-sm text-regua">
          {dica}
        </p>
      ) : null}
    </div>
  );
}

export const classeEntrada =
  'w-full min-h-11 rounded-pequeno border border-campo bg-white px-3 py-2 text-base text-grafite placeholder:text-regua/70 ' +
  'focus:border-cianotipia focus:outline-none focus:ring-2 focus:ring-cianotipia/25 aria-invalid:border-marcador';

const COR_STATUS: Record<StatusProjeto, string> = {
  planejamento: 'bg-concreto text-regua',
  em_andamento: 'bg-cianotipia-claro text-cianotipia',
  pausado: 'bg-marcador-claro text-marcador',
  concluido: 'bg-obra-ok/10 text-obra-ok',
};

export function SeloStatus({ status }: { status: StatusProjeto }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${COR_STATUS[status]}`}
    >
      {ROTULO_STATUS[status]}
    </span>
  );
}

export function AvisoErro({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-medio bg-marcador-claro px-4 py-3 text-sm text-marcador">
      {children}
    </div>
  );
}
