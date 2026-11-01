// Função de borda que conversa com o agente da obra (apps/agente).
//
// Rotas (todas pedem o cabeçalho x-agente-token; publicar com verify_jwt = false,
// porque o agente não tem login do Supabase, só o token):
//   GET  /agente-cameras/config                         → câmeras do agente, horários, senhas e pedidos de teste
//   POST /agente-cameras/foto?camera=<id>&quando=<ISO>[&id=<uuid>][&teste=1]   corpo: o JPEG
//        o id é gerado pelo agente na captura: reenvio da mesma foto cai no mesmo arquivo e não duplica
//   POST /agente-cameras/falha   {"camera": "<id>", "erro": "...", "teste": false}
//
// Quem confere o token e a permissão é o banco (funções agente_*, só para service_role).
// Aqui só se valida o formato, grava o arquivo no Storage e repassa.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAXIMO = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^obra_[0-9a-f]{48}$/;

/**
 * Erro de regra (o banco recusou: sem acesso, horário inválido...) é 4xx, e o agente não insiste;
 * o resto (banco ou Storage fora do ar) é 500, e o agente guarda na fila e tenta de novo.
 */
function statusDoErro(e: unknown) {
  const codigo = String((e as { code?: unknown })?.code ?? '');
  if (codigo === '42501') return 403;
  if (codigo === 'P0001' || /^2[23]/.test(codigo)) return 422;
  return 500;
}

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/** Dia e hora de Brasília para o nome do arquivo: 2026-10-31 e 070012. */
function diaEHora(instante: Date) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(instante).map((p) => [p.type, p.value]),
  );
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}${partes.minute}${partes.second}` };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const rota = url.pathname.replace(/^.*\/agente-cameras/, '') || '/';
  const token = req.headers.get('x-agente-token') ?? '';
  if (!TOKEN.test(token)) return resposta({ erro: 'Token do agente ausente ou em formato errado' }, 401);

  try {
    if (req.method === 'GET' && rota === '/config') {
      const { data, error } = await db.rpc('agente_config', { p_token: token, p_versao: req.headers.get('x-agente-versao') });
      if (error) throw error;
      if (!data) return resposta({ erro: 'Token inválido ou agente desligado na plataforma' }, 401);
      return resposta(data);
    }

    if (req.method === 'POST' && rota === '/foto') {
      const camera = url.searchParams.get('camera') ?? '';
      const quando = new Date(url.searchParams.get('quando') ?? '');
      const teste = url.searchParams.get('teste') === '1';
      const idCaptura = url.searchParams.get('id') ?? crypto.randomUUID();
      if (!UUID.test(camera) || !UUID.test(idCaptura) || Number.isNaN(quando.getTime())) {
        return resposta({ erro: 'Câmera, id ou horário inválido' }, 400);
      }

      const { data: pasta, error: e1 } = await db.rpc('agente_pasta_camera', { p_token: token, p_camera_id: camera });
      if (e1) throw e1;
      if (!pasta) return resposta({ erro: 'Agente sem acesso a esta câmera' }, 403);

      const foto = new Uint8Array(await req.arrayBuffer());
      if (foto.length === 0 || foto.length > MAXIMO) return resposta({ erro: 'Foto vazia ou maior que 10 MB' }, 413);
      if (foto[0] !== 0xff || foto[1] !== 0xd8) return resposta({ erro: 'A foto precisa ser JPEG' }, 415);

      const { dia, hora } = diaEHora(quando);
      const caminho = teste ? `${pasta}/teste.jpg` : `${pasta}/${dia}/${hora}-${idCaptura.toLowerCase()}.jpg`;
      // upsert: o reenvio da mesma foto (mesmo idCaptura) regrava o mesmo arquivo; o registro não duplica
      // porque foto_camera.caminho é único.
      const { error: e2 } = await db.storage.from('cameras').upload(caminho, foto, { contentType: 'image/jpeg', upsert: true });
      if (e2) throw e2;

      const { data: id, error: e3 } = await db.rpc('agente_registrar_foto', {
        p_token: token, p_camera_id: camera, p_caminho: caminho, p_capturada_em: quando.toISOString(),
        p_tamanho: foto.length, p_teste: teste,
      });
      if (e3) {
        // Recusada pela regra: sem o registro, o arquivo não serve para nada; apaga para não acumular.
        // Falha de infraestrutura: deixa o arquivo, o agente reenvia e o mesmo caminho é aproveitado.
        if (!teste && statusDoErro(e3) !== 500) await db.storage.from('cameras').remove([caminho]);
        throw e3;
      }
      return resposta({ ok: true, id, caminho });
    }

    if (req.method === 'POST' && rota === '/falha') {
      const corpo = await req.json().catch(() => null) as { camera?: string; erro?: string; teste?: boolean } | null;
      if (!corpo || !UUID.test(corpo.camera ?? '')) return resposta({ erro: 'Câmera inválida' }, 400);
      const { data, error } = await db.rpc('agente_registrar_falha', {
        p_token: token, p_camera_id: corpo.camera, p_erro: String(corpo.erro ?? '').slice(0, 500), p_teste: corpo.teste === true,
      });
      if (error) throw error;
      return resposta({ ok: true, falhas_seguidas: data });
    }

    return resposta({ erro: 'Rota não encontrada' }, 404);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return resposta({ erro: mensagem }, statusDoErro(e));
  }
});
