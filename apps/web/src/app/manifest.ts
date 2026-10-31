import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Controle de Obras',
    short_name: 'Obras',
    description: 'Cronograma, avanço e diário da obra no celular.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2346a0',
    lang: 'pt-BR',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
