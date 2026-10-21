import { HttpError } from './security.js';

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

export async function requireUser(req) {
  const header = req.headers?.authorization ?? req.headers?.Authorization ?? '';
  const match = typeof header === 'string' ? header.match(/^Bearer\s+(.+)$/i) : null;
  const token = match?.[1]?.trim();

  if (!token) {
    throw new HttpError(401, 'Faça login para usar o Commerce Pilot.');
  }

  const url = envValue('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = envValue(
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_ANON_KEY',
  );

  if (!url || !key) {
    throw new HttpError(500, 'Autenticação não configurada no servidor.');
  }

  let response;
  try {
    response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new HttpError(503, 'Não foi possível validar a sessão agora.');
  }

  if (response.status === 401 || response.status === 403) {
    throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  }
  if (!response.ok) {
    throw new HttpError(503, 'Não foi possível validar a sessão agora.');
  }

  return response.json();
}
