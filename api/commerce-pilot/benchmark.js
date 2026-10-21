import { requireUser } from './auth.js';
import { createEngine, runTool } from './context.js';
import { fail, readJson, send, setNoStore } from './http.js';
import { HttpError, normalizeTarget } from './security.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function buildMarkdown(own, competitors, failures) {
  const lines = [
    `# Benchmark — ${hostOf(own.url)} vs. ${competitors.length} concorrente(s)`,
    '',
    '| Site | Nota |',
    '|---|---:|',
    `| **${hostOf(own.url)} (você)** | **${own.total.toFixed(1)}** |`,
  ];

  for (const competitor of competitors) {
    lines.push(`| ${hostOf(competitor.url)} | ${competitor.total.toFixed(1)} |`);
  }

  if (failures.length) {
    lines.push('', '## Falhas');
    for (const failure of failures) {
      lines.push(`- ${hostOf(failure.url)}: ${failure.error}`);
    }
  }

  lines.push(
    '',
    '> Benchmark heurístico, calculado a partir de sinais públicos das páginas. Não estima tráfego nem receita.',
  );

  return lines.join('\n');
}

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

    const own = normalizeTarget(body?.url).toString();
    const rawCompetitors = Array.isArray(body?.competitors) ? body.competitors : [];
    const competitors = [];
    const seen = new Set([own]);

    for (const raw of rawCompetitors) {
      const value = String(raw ?? '').trim();
      if (!value) continue;
      const target = normalizeTarget(value).toString();
      if (seen.has(target)) continue;
      seen.add(target);
      competitors.push(target);
      if (competitors.length === 3) break;
    }

    const targets = [own, ...competitors];
    const engine = createEngine();
    const signal = AbortSignal.timeout(55000);

    const results = await Promise.all(
      targets.map(async (url) => {
        try {
          const data = await runTool(
            engine,
            'commerce_site_audit',
            { url },
            signal,
          );
          return { url, data };
        } catch (error) {
          return {
            url,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    const ownResult = results.find((result) => result.url === own);
    if (!ownResult?.data) {
      throw new HttpError(
        502,
        ownResult?.error ?? 'Não foi possível auditar a URL principal.',
      );
    }

    const competitorResults = results.filter((result) => result.url !== own);
    const valid = competitorResults.filter((result) => result.data);
    const failures = competitorResults
      .filter((result) => result.error)
      .map((result) => ({ url: result.url, error: result.error }));

    const ownOut = {
      url: ownResult.data.url || own,
      total: ownResult.data.total,
      scores: ownResult.data.scores,
    };
    const competitorsOut = valid.map((result) => ({
      url: result.data.url || result.url,
      total: result.data.total,
      scores: result.data.scores,
    }));

    send(res, 200, {
      ok: true,
      own: ownOut,
      competitors: competitorsOut,
      failures,
      warning:
        competitorsOut.length === 0
          ? 'A descoberta automática de concorrentes está desativada. Informe até 3 URLs.'
          : undefined,
      markdown: buildMarkdown(ownOut, competitorsOut, failures),
    });
  } catch (error) {
    fail(res, error);
  }
}
