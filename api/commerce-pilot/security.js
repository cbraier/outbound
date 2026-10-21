import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const MAX_BYTES = 1_200_000;
const MAX_REDIRECTS = 5;

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(ip) {
  const value = ip.toLowerCase().split('%')[0];
  if (value === '::' || value === '::1') return true;

  if (value.startsWith('::ffff:')) {
    const mapped = value.slice(7);
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
    const hex = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateIpv4([hi >> 8, hi & 255, lo >> 8, lo & 255].join('.'));
    }
    return true;
  }

  if (/^f[cd]/.test(value)) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (/^fe[c-f]/.test(value)) return true;
  if (value.startsWith('ff')) return true;
  if (value.startsWith('2001:db8')) return true;
  if (value.startsWith('2001:0:')) return true;
  if (value.startsWith('2002:')) return true;
  if (value.startsWith('64:ff9b:')) return true;
  return false;
}

function isPrivateIp(ip) {
  const family = isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true;
}

export function normalizeTarget(raw) {
  let value = String(raw ?? '').trim();
  if (!value) throw new HttpError(400, 'Informe a URL do site.');
  if (/\s/.test(value)) throw new HttpError(400, 'A URL não pode conter espaços.');
  if (value.startsWith('//')) value = `https:${value}`;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    if (!/^https?:\/\//i.test(value)) {
      throw new HttpError(400, 'Use apenas URLs http:// ou https://.');
    }
  } else {
    value = `https://${value}`;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, 'URL inválida. Exemplo: https://seusite.com.');
  }

  if (!/^https?:$/.test(url.protocol)) {
    throw new HttpError(400, 'Use apenas URLs http:// ou https://.');
  }
  if (!url.hostname) throw new HttpError(400, 'URL inválida. Exemplo: https://seusite.com.');
  if (url.username || url.password) {
    throw new HttpError(400, 'A URL não pode conter usuário ou senha.');
  }

  url.hash = '';
  return url;
}

export async function assertPublicUrl(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  if (!/^https?:$/.test(url.protocol)) {
    throw new HttpError(400, 'Use apenas URLs http:// ou https://.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host) throw new HttpError(400, 'URL inválida.');
  if (BLOCKED_HOSTS.has(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new HttpError(400, 'A URL aponta para um host interno e foi bloqueada.');
  }

  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new HttpError(400, 'A URL aponta para um endereço privado ou reservado e foi bloqueada.');
    }
    return url;
  }

  let addresses;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new HttpError(400, 'Não foi possível resolver o domínio da URL.');
  }

  if (!addresses.length) {
    throw new HttpError(400, 'Não foi possível resolver o domínio da URL.');
  }
  for (const address of addresses) {
    if (isPrivateIp(address.address)) {
      throw new HttpError(400, 'A URL aponta para um endereço privado ou reservado e foi bloqueada.');
    }
  }

  return url;
}

async function readBody(response, maxBytes) {
  if (!response.body) return { content: '', truncated: false };

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (total + value.byteLength > maxBytes) {
        const remaining = maxBytes - total;
        if (remaining > 0) chunks.push(value.subarray(0, remaining));
        total = maxBytes;
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }

  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { content: buffer.toString('utf8'), truncated };
}

export async function safeFetch(input, { signal, timeoutMs = 15000, maxBytes = MAX_BYTES } = {}) {
  let current = input instanceof URL ? input : new URL(String(input));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('fetch timeout')), timeoutMs);

  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertPublicUrl(current);

      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': UA,
          'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          const body = await readBody(response, maxBytes);
          return {
            url: current.toString(),
            statusCode: response.status,
            body: { kind: 'html', content: body.content },
            truncated: body.truncated,
          };
        }

        const next = new URL(location, current);
        if (!/^https?:$/.test(next.protocol)) {
          throw new HttpError(400, 'O site redirecionou para um protocolo não permitido.');
        }
        current = next;
        continue;
      }

      const body = await readBody(response, maxBytes);
      return {
        url: current.toString(),
        statusCode: response.status,
        body: { kind: 'html', content: body.content },
        truncated: body.truncated,
      };
    }

    throw new HttpError(400, 'O site redirecionou vezes demais.');
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, 'O site demorou mais de 15 segundos para responder.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}
