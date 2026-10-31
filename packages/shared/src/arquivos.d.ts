// Vite/Vitest: `import texto from './arquivo.xml?raw'` traz o arquivo como texto (só nos testes).
declare module '*?raw' {
  const conteudo: string;
  export default conteudo;
}
