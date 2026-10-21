import { requireUser } from './auth.js';
import { createEngine, runTool } from './context.js';
import { fail, readJson, send, setNoStore } from './http.js';
import { normalizeTarget } from './security.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req, res) {
  setNoStore(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: 'Método não permitido.' });
    return;
  }

  try {
    await requireUser(req);
    const body = await readJson(req);
    const target = normalizeTarget(body?.url);
    const engine = createEngine();
    const signal = AbortSignal.timeout(45000);
    const result = await runTool(
      engine,
      'commerce_site_audit',
      { url: target.toString() },
      signal,
    );

    if (typeof result.total !== 'number' || !Array.isArray(result.scores)) {
      throw new Error('A auditoria não retornou um resultado válido.');
    }

    send(res, 200, { ok: true, ...result });
  } catch (error) {
    fail(res, error);
  }
}
