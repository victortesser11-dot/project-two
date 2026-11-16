import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@obras/shared', '@obras/emails'],
  poweredByHeader: false,
  // Leitura de PDF para a IA (lib/anexosIa.ts): binário nativo do canvas e os decodificadores do PDF.js ficam fora do
  // empacotamento e vão inteiros para a função.
  serverExternalPackages: ['@napi-rs/canvas', 'unpdf'],
};

export default nextConfig;
