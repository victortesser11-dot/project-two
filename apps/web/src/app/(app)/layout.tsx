import { supabaseConfigurado } from '@/lib/env';
import { ConfiguracaoPendente } from '@/components/ConfiguracaoPendente';
import { Casca } from '@/components/Casca';
import { empresaAtual, exigirUsuario, listarProjetos } from '@/lib/dados';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigurado) return <ConfiguracaoPendente />;
  const { usuario } = await exigirUsuario();
  const [empresa, projetos] = await Promise.all([empresaAtual(), listarProjetos().catch(() => [])]);
  const obras = [...projetos]
    .sort((a, b) => Number(a.status === 'concluido') - Number(b.status === 'concluido') || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((p) => ({ id: p.id, nome: p.nome }));

  return (
    <Casca empresa={empresa?.nome ?? null} email={usuario.email ?? ''} obras={obras}>
      {children}
    </Casca>
  );
}
