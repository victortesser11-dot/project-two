import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';
import { Avisos } from '@/components/Avisos';
import { ProvedorConfirmacao } from '@/components/Confirmar';

const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Controle de Obras', template: '%s · Controle de Obras' },
  description: 'Prazo, custo, equipe e materiais da obra num só lugar.',
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={archivo.variable}>
      <body>
        <ProvedorConfirmacao>{children}</ProvedorConfirmacao>
        <Avisos />
      </body>
    </html>
  );
}
