/**
 * Commerce Pilot — commercial CEO for mobile-app landing pages.
 *
 * Host-only bundle. Exposes five Agent tools (`commerce_*`) plus one system-prompt
 * section that turns commercial questions into the operating routine of a CEO/CRO:
 * audit the site, discover three competitors, benchmark, plan growth, decide.
 *
 * Everything is derived from observable page signals and public search results.
 * No network credentials are required: the plugin reuses the Host `web` service.
 */

const name = 'commerce-pilot';
const inject = ['tools', 'systemPrompt', 'web'];

const SECTION_NAME = 'commerce-director';

const DIRECTOR_TEXT = `
## Commercial leadership (Commerce Pilot)

When the user asks about marketing, growth, pricing, positioning, competitors, conversion, UX/UI, go-to-market or the commercial performance of their sites and mobile apps, act as their **Commercial CEO and CRO**, not as a generic assistant.

Operating rules:
- Ground every claim in observed evidence: page signals, benchmark scores, or public sources. Label hypotheses as hypotheses. Never invent metrics, competitor facts, prices, download numbers or revenue.
- Start from the site URL. Run \`commerce_site_audit\` before recommending anything; if no URL is available, ask for it (plus app name, category and country) in one short question.
- Discover competitors with \`commerce_competitors\`, then quantify with \`commerce_benchmark\` before proposing moves. Use three competitors unless the user asks otherwise.
- Every recommendation states: expected impact, effort, cost range in BRL, and the KPI that proves it worked. Separate online and offline actions and keep offline plans realistic for the informed budget and region.
- For "what should I do next" or portfolio questions, run \`commerce_board_memo\` and lead with the decision, not the analysis.
- Distinguish what the site promises from what the business actually sells; flag the gap when they diverge.
- Close commercial answers with the next decision the founder must make, not with a summary of what you just wrote.

Ignore this section when the task is unrelated to the commercial performance of these products.
`.trim();

/* ------------------------------------------------------------------ *
 * Small text utilities
 * ------------------------------------------------------------------ */

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', reg: '®', copy: '©', trade: '™', deg: '°',
};

function safeCodePoint(code, fallback) {
  if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

function decodeEntities(input) {
  return String(input)
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => safeCodePoint(parseInt(hex, 16), m))
    .replace(/&#(\d+);/g, (m, dec) => safeCodePoint(Number(dec), m))
    .replace(/&([a-zA-Z]+);/g, (m, key) => {
      const hit = ENTITIES[key.toLowerCase()];
      return hit === undefined ? m : hit;
    });
}

function squash(input) {
  return decodeEntities(String(input).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function cut(value, max) {
  const text = String(value || '');
  return text.length <= max ? text : text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function matchOne(re, text) {
  const m = re.exec(String(text || ''));
  return m && m[1] ? m[1] : '';
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactSignals(sig) {
  return {
    title: sig.title,
    description: sig.description,
    lang: sig.lang,
    viewport: sig.viewport,
    h1: sig.h1.slice(0, 3),
    h2: sig.h2.slice(0, 5),
    cta: sig.anchors.cta,
    store: sig.store,
    links: sig.links,
    counts: sig.counts,
    analytics: sig.analytics,
    jsonLd: sig.jsonLd,
    flags: sig.flags,
    words: sig.words,
    textSample: cut(sig.text, 1200),
  };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function brl(value) {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `R$ ${Math.round(value)}`;
  }
}

function totalScore(scores) {
  const weighted = scores.reduce((acc, d) => acc + (d.score / 10) * d.weight, 0);
  return Math.round(weighted * 10) / 10;
}

/* ------------------------------------------------------------------ *
 * Page extraction
 * ------------------------------------------------------------------ */

const CTA_RE = /(come[cç]ar|baixar|instalar|experimentar|testar gr[aá]tis|testar|assinar|comprar|contratar|solicitar|agendar|quero|garantir|acessar|abrir conta|download|install|get started|start free|start now|try (it )?free|try now|buy now|subscribe|book (a )?(call|demo)|request (a )?demo|join)/i;

const PRICING_RE = /(R\$|US\$|\$\s?\d|pre[cç]o|planos?|pricing|assinatura|subscription|\/\s*m[eê]s|per month|por m[eê]s|mensalidade|anual|annual|freemium|gr[aá]tis|free plan|teste gr[aá]tis|free trial)/i;

const SOCIAL_RE = /(avalia[cç][oõ]es|avaliado|depoimentos?|testimonials?|★★★★|★|\bnota\s*\d|\d[,.]\d\s*estrelas|\d+\s*(mil|milh[aã]o|milh[oõ]es|k|m)\s*(usu[aá]rios|downloads|clientes|alunos|empresas)|confiado por|trusted by|usado por|used by|recomendado por|as seen (in|on)|na m[ií]dia)/i;

const RATING_RE = /(★|\bnota\s*\d[,.]?\d?|\d[,.]\d\s*(de\s*5|estrelas|stars)|\b4[,.]\d\s*\/\s*5|\b5\s*estrelas)/i;

const GUARANTEE_RE = /(garantia|reembolso|devolu[cç][aã]o|money[- ]back|refund|cancele quando quiser|cancel anytime|sem fidelidade|no commitment)/i;

const ANALYTICS_RE = [
  ['Google Analytics / GTM', /(googletagmanager|gtag\(|gtag\/js|google-analytics)/i],
  ['Meta Pixel', /(connect\.facebook\.net|fbq\()/i],
  ['TikTok Pixel', /(analytics\.tiktok\.com|ttq\.)/i],
  ['Hotjar', /hotjar/i],
  ['Microsoft Clarity', /clarity\.ms/i],
  ['Mixpanel', /mixpanel/i],
  ['Amplitude', /amplitude/i],
  ['Segment', /segment\.(com|io)/i],
  ['PostHog', /posthog/i],
  ['LinkedIn Insight', /snap\.licdn\.com/i],
];

const CATEGORIES = [
  { id: 'financas', label: 'Finanças pessoais e investimentos', words: ['financ', 'invest', 'banco', 'cart[aã]o', 'cr[eé]dito', 'or[cç]amento', 'dinheiro', 'cripto', 'bitcoin', 'pagamento', 'pix', 'renda fixa', 'investimento'] },
  { id: 'saude', label: 'Saúde, fitness e bem-estar', words: ['sa[uú]de', 'fitness', 'treino', 'academia', 'nutri', 'dieta', 'emagrec', 'sono', 'medita', 'terapia', 'm[eé]dico', 'bem-estar', 'bem estar'] },
  { id: 'educacao', label: 'Educação e aprendizado', words: ['educa', 'curso', 'aprend', 'idioma', 'ingl[eê]s', 'escola', 'faculdade', 'ensino', 'estudo', 'aula', 'certifica'] },
  { id: 'produtividade', label: 'Produtividade e trabalho', words: ['produtiv', 'tarefa', 'projeto', 'nota', 'agenda', 'equipe', 'gest[aã]o', 'organiza', 'foco', 'h[aá]bito', 'rotina'] },
  { id: 'delivery', label: 'Delivery, food e conveniência', words: ['delivery', 'comida', 'restaurante', 'mercado', 'pedido', 'entrega', 'lanche', 'pizza', 'refei'] },
  { id: 'viagem', label: 'Viagem e mobilidade', words: ['viagem', 'voo', 'hotel', 'passeio', 'turismo', 'transporte', 'mobilidade', 'carro', 'corrida', 'passagem'] },
  { id: 'beleza', label: 'Beleza, moda e autocuidado', words: ['beleza', 'maquiagem', 'cabelo', 'pele', 'moda', 'roupa', 'estilo', 'unha', 'est[eé]tica', 'skincare'] },
  { id: 'imoveis', label: 'Imóveis e moradia', words: ['im[oó]vel', 'imobili', 'aluguel', 'apartamento', 'casa', 'moradia', 'condom[ií]nio', 'reforma'] },
  { id: 'pets', label: 'Pets e veterinária', words: ['pet', 'cachorro', 'gato', 'veterin', 'ra[cç][aã]o', 'animal'] },
  { id: 'juridico', label: 'Jurídico e serviços', words: ['jur[ií]dic', 'advog', 'contrato', 'processo', 'legal', 'direito'] },
  { id: 'social', label: 'Social, dating e comunidade', words: ['relacionamento', 'dating', 'amizade', 'comunidade', 'social', 'chat', 'match'] },
  { id: 'games', label: 'Jogos e entretenimento', words: ['jogo', 'game', 'entretenimento', 'streaming', 'm[uú]sica', 'filme', 's[eé]rie', 'podcast'] },
  { id: 'b2b', label: 'B2B, SaaS e ferramentas', words: ['saas', 'empresa', 'neg[oó]cio', 'vendas', 'crm', 'erp', 'b2b', 'equipe', 'gest[aã]o'] },
];

function extractPage(htmlRaw, requestedUrl) {
  const html = String(htmlRaw || '');
  const head = html.slice(0, 250000);

  const h1 = [];
  for (const m of html.matchAll(/<h1\b[^>]*>([\s\S]{0,400}?)<\/h1>/gi)) {
    const text = squash(m[1]);
    if (text) h1.push(text);
    if (h1.length >= 5) break;
  }

  const h2 = [];
  for (const m of html.matchAll(/<h2\b[^>]*>([\s\S]{0,400}?)<\/h2>/gi)) {
    const text = squash(m[1]);
    if (text) h2.push(text);
    if (h2.length >= 8) break;
  }

  const anchors = [];
  let anchorCount = 0;
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]{0,400}?)<\/a>/gi)) {
    anchorCount += 1;
    if (anchors.length >= 400) continue;
    const attrs = m[1] || '';
    const href = matchOne(/\bhref\s*=\s*["']([^"']+)["']/i, attrs)
      || matchOne(/\bhref\s*=\s*([^\s>]+)/i, attrs);
    if (!href) continue;
    const label = squash(m[2]).slice(0, 120);
    anchors.push({ href: href.slice(0, 500), label });
  }

  const allHrefs = anchors.map((a) => a.href).join(' ');
  const text = squash(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<template\b[\s\S]*?<\/template>/gi, ' ')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' '),
  ).slice(0, 24000);

  const images = html.match(/<img\b[^>]*>/gi) || [];
  const imagesWithAlt = images.filter((tag) => /\balt\s*=\s*["'][^"']+["']/i.test(tag)).length;

  const store = {
    ios: /apps\.apple\.com|itunes\.apple\.com/i.test(allHrefs) || /apps\.apple\.com|itunes\.apple\.com/i.test(html),
    android: /play\.google\.com\/store\/apps/i.test(allHrefs) || /play\.google\.com\/store\/apps/i.test(html),
  };

  const analytics = [];
  for (const [label, re] of ANALYTICS_RE) {
    if (re.test(html)) analytics.push(label);
  }

  const jsonLd = [];
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1]);
      const types = [];
      const walk = (node, depth) => {
        if (!node || depth > 3) return;
        if (Array.isArray(node)) {
          for (const item of node) walk(item, depth + 1);
          return;
        }
        if (typeof node === 'object') {
          const type = node['@type'];
          if (typeof type === 'string') types.push(type);
          else if (Array.isArray(type)) types.push(...type.filter((t) => typeof t === 'string'));
          for (const value of Object.values(node)) {
            if (value && typeof value === 'object') walk(value, depth + 1);
          }
        }
      };
      walk(parsed, 0);
      for (const type of types) if (!jsonLd.includes(type)) jsonLd.push(type);
    } catch {
      /* malformed JSON-LD is common; ignore */
    }
  }

  const ctaLabels = [];
  for (const a of anchors) {
    if (!a.label) continue;
    if (CTA_RE.test(a.label)) {
      const key = a.label.toLowerCase();
      if (!ctaLabels.some((x) => x.toLowerCase() === key)) ctaLabels.push(a.label);
    }
  }

  const lower = html.toLowerCase();

  return {
    requestedUrl,
    title: squash(matchOne(/<title[^>]*>([\s\S]*?)<\/title>/i, head)).slice(0, 300),
    description: squash(matchOne(/<meta[^>]+name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i, head)
      || matchOne(/<meta[^>]+content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["']/i, head)).slice(0, 400),
    ogTitle: squash(matchOne(/<meta[^>]+property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']*)["']/i, head)),
    ogDescription: squash(matchOne(/<meta[^>]+property\s*=\s*["']og:description["'][^>]*content\s*=\s*["']([^"']*)["']/i, head)),
    lang: matchOne(/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i, head) || '',
    viewport: /<meta[^>]+name\s*=\s*["']viewport["']/i.test(head),
    canonical: /<link[^>]+rel\s*=\s*["']canonical["']/i.test(head),
    appBanner: /apple-itunes-app/i.test(head),
    appleLinks: /apple-itunes-app|applinks|smart\s?banner/i.test(html),
    h1,
    h2,
    titleH1: h1.length === 1,
    anchors: {
      total: anchorCount,
      cta: ctaLabels.slice(0, 10),
      external: anchors.filter((a) => /^https?:\/\//i.test(a.href) && hostOf(a.href) && hostOf(a.href) !== hostOf(requestedUrl)).length,
    },
    store,
    links: {
      pricing: /(pre[cç]o|planos?|pricing|assinatura)/i.test(allHrefs),
      privacy: /(privacidade|privacy|termos|terms)/i.test(allHrefs),
      contact: /(contato|contact|suporte|support|fale conosco)/i.test(allHrefs),
      faq: /(faq|perguntas frequentes|d[uú]vidas)/i.test(allHrefs),
      login: /(login|entrar|sign in|acessar)/i.test(allHrefs),
    },
    counts: {
      scripts: (html.match(/<script\b/gi) || []).length,
      images: images.length,
      imagesWithAlt,
      forms: (html.match(/<form\b/gi) || []).length,
      inputs: (html.match(/<input\b/gi) || []).length,
      videos: (html.match(/<video\b|youtube\.com\/embed|vimeo\.com\/video/gi) || []).length,
    },
    analytics,
    jsonLd: jsonLd.slice(0, 12),
    text,
    words: text ? text.split(/\s+/).length : 0,
    flags: {
      pricing: PRICING_RE.test(text) || /(pre[cç]o|planos?|pricing)/i.test(allHrefs),
      socialProof: SOCIAL_RE.test(text),
      rating: RATING_RE.test(text),
      testimonial: /(depoimento|testimonial|o que (nossos|as) (clientes|usu[aá]rios)|hist[oó]rias? de (clientes|sucesso))/i.test(text),
      guarantee: GUARANTEE_RE.test(text),
      freeTrial: /(teste gr[aá]tis|free trial|7 dias gr[aá]tis|14 dias|30 dias gr[aá]tis|comece gr[aá]tis|comece de gra[cç]a|start free)/i.test(text),
      faq: /(perguntas frequentes|faq|d[uú]vidas frequentes)/i.test(text),
      press: /(como visto|na m[ií]dia|press|imprensa|techcrunch|forbes|exame|valor)/i.test(text),
      pricingAnchor: /(planos?|pricing|pre[cç]os?)/i.test(h2.join(' ')),
      screenshot: /(screenshot|captura de tela|telas? do app|preview)/i.test(text)
        || /<img\b[^>]*alt\s*=\s*["'][^"']*(tela|captura|screenshot|app)[^"']*["']/i.test(html),
    },
    htmlBytes: lower.length,
  };
}

/* ------------------------------------------------------------------ *
 * Business inference
 * ------------------------------------------------------------------ */

function inferBusiness(sig) {
  const haystack = [
    sig.title,
    sig.description,
    sig.h1.join(' '),
    sig.h2.join(' '),
    sig.text.slice(0, 12000),
  ].join(' ').toLowerCase();

  let best = null;
  for (const category of CATEGORIES) {
    let hits = 0;
    for (const word of category.words) {
      const re = new RegExp(word, 'gi');
      hits += (haystack.match(re) || []).length;
    }
    if (!best || hits > best.hits) best = { ...category, hits };
  }

  const category = best && best.hits >= 2
    ? best.label
    : 'não identificada com segurança — confirme a categoria com o fundador';

  let model = 'não publicado na página';
  if (sig.flags.freeTrial) model = 'freemium com teste grátis';
  else if (sig.flags.pricing && /(assinatura|subscription|\/\s*m[eê]s|per month|mensalidade|anual)/i.test(haystack)) model = 'assinatura recorrente';
  else if (sig.flags.pricing) model = 'plano pago / compra única';
  else if (/(gr[aá]tis|free|gratuito)/i.test(haystack)) model = 'gratuito (monetização não declarada)';

  const platforms = [];
  if (sig.store.ios) platforms.push('iOS (App Store)');
  if (sig.store.android) platforms.push('Android (Google Play)');

  return {
    category,
    categoryConfidence: best && best.hits >= 2 ? Math.min(0.9, 0.45 + best.hits * 0.05) : 0.2,
    model,
    platforms,
    type: platforms.length ? 'landing de app mobile' : 'site/landing (app não detectado)',
  };
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

function mk(id, label, weight, score, evidence, checks) {
  return {
    id,
    label,
    weight,
    score: Math.max(0, Math.min(10, Math.round(score * 10) / 10)),
    evidence: evidence.slice(0, 8),
    checks: checks || [],
  };
}

function scoreClarity(sig) {
  const ev = [];
  const h1 = sig.h1[0] || '';
  let s = 0;
  if (h1) {
    s += 2;
    ev.push(`H1: “${cut(h1, 100)}”`);
  } else {
    ev.push('Sem H1: o visitante não recebe uma promessa principal.');
  }
  if (h1 && h1.length >= 15 && h1.length <= 90) s += 2;
  else if (h1) ev.push(`H1 tem ${h1.length} caracteres; o ideal é 15–90.`);
  if (sig.description) {
    s += 2;
    ev.push(`Meta description com ${sig.description.length} caracteres.`);
  } else {
    ev.push('Sem meta description (perde clareza no Google e em compartilhamentos).');
  }
  if (sig.ogTitle || sig.ogDescription) s += 1;
  else ev.push('Sem Open Graph: o link fica pobre quando compartilhado.');
  if (/\d/.test(`${h1} ${sig.description}`)) s += 1;
  else ev.push('Nenhum número concreto na promessa (prazo, preço ou resultado).');
  if (sig.h2.length >= 2) s += 1;
  else ev.push('Poucas seções de apoio (H2) para sustentar a promessa.');
  if (sig.title && sig.title.length >= 30 && sig.title.length <= 65) s += 1;
  else if (sig.title) ev.push(`Title com ${sig.title.length} caracteres; o ideal é 30–65.`);
  return mk('clarity', 'Clareza da proposta de valor', 20, s, ev);
}

function scoreCta(sig) {
  const ev = [];
  let s = 0;
  const cta = sig.anchors.cta;
  if (cta.length >= 1) s += 2;
  else ev.push('Nenhum CTA reconhecível na página.');
  if (cta.length >= 2) s += 1;
  if (sig.store.ios && sig.store.android) {
    s += 2;
    ev.push('Badges/links das duas lojas presentes.');
  } else if (sig.store.ios || sig.store.android) {
    s += 1;
    ev.push(`Só há link para ${sig.store.ios ? 'App Store' : 'Google Play'}.`);
  } else {
    ev.push('Sem link para App Store/Google Play: a instalação depende de busca manual.');
  }
  if (sig.appBanner || sig.appleLinks) s += 1;
  else ev.push('Sem smart banner/App Links: quem abre no celular não é levado ao app.');
  if (sig.counts.inputs >= 1 && sig.counts.inputs <= 5) s += 1.5;
  else if (sig.counts.inputs > 5) {
    s += 0.5;
    ev.push(`Formulário com ${sig.counts.inputs} campos: fricção alta no primeiro passo.`);
  }
  if (sig.anchors.total <= 80) s += 1;
  else ev.push(`Muitos links no caminho (${sig.anchors.total}): competem com o CTA.`);
  if (sig.store.ios || sig.store.android || sig.links.contact) s += 1.5;
  else ev.push('Nenhum caminho de conversão claro (loja ou contato).');
  return mk('cta', 'CTA, instalação e caminho de conversão', 20, s, ev);
}

function scoreTrust(sig) {
  const ev = [];
  let s = 0;
  if (sig.flags.socialProof) {
    s += 2.5;
    ev.push('Prova social textual presente.');
  } else {
    ev.push('Sem prova social visível (clientes, avaliações, números).');
  }
  if (sig.flags.rating) s += 1.5;
  else ev.push('Nenhuma nota/estrela exibida.');
  if (sig.flags.testimonial) s += 1.5;
  else ev.push('Sem depoimentos ou histórias de clientes.');
  if (sig.links.privacy) s += 1.5;
  else ev.push('Sem link de privacidade/termos: quebra confiança e exigências de loja.');
  if (sig.links.contact) s += 1.5;
  else ev.push('Sem canal de contato/suporte visível.');
  if (sig.flags.press) s += 1;
  if (sig.flags.guarantee) s += 0.5;
  return mk('trust', 'Confiança e prova social', 15, s, ev);
}

function scoreOffer(sig) {
  const ev = [];
  let s = 0;
  if (sig.flags.pricing) {
    s += 3;
    ev.push('Preço/planos mencionados na página.');
  } else {
    ev.push('Preço não aparece: o visitante precisa pedir/descobrir para avaliar.');
  }
  if (sig.flags.pricingAnchor || sig.links.pricing) s += 2;
  else ev.push('Sem comparação de planos.');
  if (sig.flags.freeTrial) {
    s += 2;
    ev.push('Teste grátis/freemium declarado.');
  } else {
    ev.push('Sem teste grátis explícito.');
  }
  if (sig.flags.guarantee) s += 1.5;
  else ev.push('Sem garantia/cancelamento fácil visível.');
  if (/(anual|annual|economize|save \d+%|2 meses gr[aá]tis)/i.test(sig.text)) s += 1.5;
  return mk('offer', 'Oferta e transparência de preço', 12, s, ev);
}

function scoreUx(sig) {
  const ev = [];
  let s = 0;
  if (sig.viewport) s += 2;
  else ev.push('Sem viewport: layout móvel provavelmente quebrado.');
  if (sig.lang) s += 1;
  else ev.push('Idioma da página não declarado.');
  const altRatio = sig.counts.images ? sig.counts.imagesWithAlt / sig.counts.images : 0;
  if (sig.counts.images && altRatio >= 0.6) s += 2;
  else ev.push(`Apenas ${sig.counts.imagesWithAlt} de ${sig.counts.images} imagens têm texto alternativo.`);
  if (sig.counts.scripts <= 12) s += 1.5;
  else if (sig.counts.scripts <= 25) s += 0.75;
  else ev.push(`${sig.counts.scripts} scripts na página: risco de LCP/INP ruim no celular.`);
  if (sig.words >= 250 && sig.words <= 1500) s += 1.5;
  else if (sig.words < 250) ev.push(`Só ${sig.words} palavras: página rasa para decisão.`);
  if (sig.anchors.total <= 80) s += 1;
  if (sig.counts.videos > 0) s += 1;
  return mk('ux', 'UX, mobile e desempenho percebido', 13, s, ev);
}

function scoreSeo(sig) {
  const ev = [];
  let s = 0;
  if (sig.title && sig.title.length >= 30 && sig.title.length <= 65) s += 2;
  else ev.push('Title fora da faixa ideal (30–65 caracteres).');
  if (sig.description && sig.description.length >= 50 && sig.description.length <= 170) s += 2;
  else ev.push('Meta description ausente ou fora de 50–170 caracteres.');
  if (sig.titleH1) s += 1.5;
  else ev.push('H1 ausente ou repetido.');
  if (sig.h2.length >= 2) s += 1;
  if (sig.jsonLd.length) s += 1.5;
  else ev.push('Sem dados estruturados (JSON-LD): sem rich results.');
  if (sig.canonical) s += 1;
  else ev.push('Sem canonical.');
  if (sig.flags.faq) s += 0.5;
  if (sig.counts.images && sig.counts.imagesWithAlt / sig.counts.images >= 0.5) s += 0.5;
  return mk('seo', 'SEO on-page e prontidão de conteúdo', 10, s, ev);
}

function scoreApp(sig) {
  const ev = [];
  let s = 0;
  if (sig.store.ios) s += 2.5;
  else ev.push('Sem link da App Store.');
  if (sig.store.android) s += 2.5;
  else ev.push('Sem link do Google Play.');
  if (sig.appBanner || sig.appleLinks) s += 1;
  else ev.push('Sem deep link/smart banner para abrir o app instalado.');
  if (sig.flags.rating) s += 1.5;
  else ev.push('Nota das lojas não exibida na landing.');
  if (sig.flags.screenshot) s += 1.5;
  else ev.push('Sem prévia visual das telas do app.');
  if (sig.links.login) s += 1;
  return mk('app', 'Integração com as lojas e funil do app', 10, s, ev);
}

function scoreSite(sig) {
  return [
    scoreClarity(sig),
    scoreCta(sig),
    scoreTrust(sig),
    scoreOffer(sig),
    scoreUx(sig),
    scoreSeo(sig),
    scoreApp(sig),
  ];
}

/* ------------------------------------------------------------------ *
 * UX backlog
 * ------------------------------------------------------------------ */

function uxBacklog(sig, scores, inferred) {
  const items = [];
  const add = (priority, action, why, impact, effort) => {
    if (!items.some((item) => item.action === action)) {
      items.push({ priority, action, why, impact, effort });
    }
  };

  if (!sig.store.ios || !sig.store.android) {
    add('P0', 'Colocar badges oficiais da App Store e do Google Play acima da dobra, com QR code ao lado.',
      'Sem link de loja a instalação vira busca manual; é o maior vazamento do funil.', 'alto', 'baixo');
  }
  if (!sig.anchors.cta.length) {
    add('P0', 'Definir um CTA primário único com verbo de ação e benefício (“Baixar grátis e criar conta em 1 min”).',
      'Sem CTA reconhecível o visitante não sabe qual é o próximo passo.', 'alto', 'baixo');
  }
  if (!sig.flags.socialProof) {
    add('P0', 'Adicionar prova social concreta: nota das lojas, nº de downloads e 2–3 depoimentos com nome e resultado.',
      'Prova social é o principal redutor de risco em landing de app.', 'alto', 'médio');
  }
  if (!sig.flags.pricing && inferred.model !== 'gratuito (monetização não declarada)') {
    add('P1', 'Publicar preço ou faixa de preço (e o que é grátis), mesmo que em “planos”.',
      'Preço escondido aumenta abandono e atrai curioso sem intenção de compra.', 'alto', 'baixo');
  }
  if (!sig.description || sig.description.length < 50) {
    add('P1', 'Reescrever title e meta description com promessa + público + categoria (30–65 e 50–170 caracteres).',
      'É o texto que decide o clique no Google e o preview em redes.', 'médio', 'baixo');
  }
  if (!sig.h1.length || sig.h1[0].length > 90) {
    add('P1', 'Reescrever o H1 como promessa específica (quem + resultado + tempo).',
      'O H1 é o teste de 5 segundos da proposta de valor.', 'alto', 'baixo');
  }
  if (!sig.counts.videos && sig.counts.images < 10) {
    add('P2', 'Inserir um vídeo curto (20–40s) ou 3–5 capturas reais do app mostrando o fluxo principal.',
      'Mostrar o produto reduz a imaginação errada e aumenta a instalação qualificada.', 'médio', 'médio');
  }
  if (sig.counts.scripts > 25) {
    add('P2', 'Reduzir scripts de terceiros e carregar pixel/analytics depois da primeira dobra.',
      `A página tem ${sig.counts.scripts} scripts; isso penaliza LCP/INP no celular.`, 'médio', 'médio');
  }
  if (!sig.flags.faq) {
    add('P2', 'Adicionar FAQ de 5–6 objeções reais (preço, cancelamento, dados, compatibilidade).',
      'FAQ captura dúvidas de compra e ganha espaço no Google.', 'médio', 'baixo');
  }
  if (!sig.appBanner) {
    add('P2', 'Configurar smart banner (iOS) e App Links/Play Install Referrer para abrir o app instalado.',
      'Quem já tem o app não deveria passar pelo funil da loja.', 'baixo', 'médio');
  }
  if (sig.counts.images && sig.counts.imagesWithAlt / Math.max(1, sig.counts.images) < 0.6) {
    add('P3', 'Preencher alt text descritivo em todas as imagens de produto.',
      'Acessibilidade e SEO de imagem, com custo quase zero.', 'baixo', 'baixo');
  }
  if (!sig.links.privacy) {
    add('P3', 'Adicionar links de privacidade e termos no rodapé.',
      'Exigência das lojas e sinal de confiança para o usuário.', 'baixo', 'baixo');
  }

  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return items.sort((a, b) => order[a.priority] - order[b.priority]);
}

/* ------------------------------------------------------------------ *
 * Audit rendering
 * ------------------------------------------------------------------ */

function scoreBar(score) {
  const filled = Math.round(score);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, 10 - filled));
}

function renderAudit({ sig, scores, total, inferred, backlog, url, status }) {
  const lines = [];
  lines.push(`# Auditoria comercial — ${sig.title ? cut(sig.title, 80) : hostOf(url)}`);
  lines.push('');
  lines.push(`**URL:** ${url} · **HTTP:** ${status} · **Idioma:** ${sig.lang || 'não declarado'} · **Palavras:** ${sig.words}`);
  lines.push('');
  lines.push('## Negócio inferido');
  lines.push(`- **Tipo:** ${inferred.type}`);
  lines.push(`- **Categoria provável:** ${inferred.category} (confiança ${Math.round(inferred.categoryConfidence * 100)}%)`);
  lines.push(`- **Modelo de receita provável:** ${inferred.model}`);
  lines.push(`- **Plataformas detectadas:** ${inferred.platforms.length ? inferred.platforms.join(', ') : 'nenhuma loja linkada'}`);
  lines.push('');
  lines.push('## Scorecard (0–10, ponderado)');
  lines.push('');
  lines.push('| Dimensão | Peso | Nota | Barra |');
  lines.push('|---|---:|---:|---|');
  for (const dim of scores) {
    lines.push(`| ${dim.label} | ${dim.weight} | ${dim.score.toFixed(1)} | \`${scoreBar(dim.score)}\` |`);
  }
  lines.push(`| **Total ponderado** | 100 | **${total.toFixed(1)}** | |`);
  lines.push('');
  lines.push('## Evidências');
  for (const dim of scores) {
    const relevant = dim.evidence.filter((e) => e);
    if (!relevant.length) continue;
    lines.push(`- **${dim.label}:** ${relevant.slice(0, 4).join(' ')}`);
  }
  lines.push('');
  lines.push('## Backlog UX/UI priorizado');
  lines.push('');
  lines.push('| Prio | Ação | Por quê | Impacto | Esforço |');
  lines.push('|---|---|---|---|---|');
  for (const item of backlog.slice(0, 10)) {
    lines.push(`| ${item.priority} | ${item.action} | ${item.why} | ${item.impact} | ${item.effort} |`);
  }
  lines.push('');
  const weakest = [...scores].sort((a, b) => a.score - b.score).slice(0, 3);
  lines.push('## Leitura do CEO');
  lines.push(`O maior vazamento está em **${weakest[0].label}** (${weakest[0].score.toFixed(1)}/10), seguido de ${weakest[1].label} (${weakest[1].score.toFixed(1)}) e ${weakest[2].label} (${weakest[2].score.toFixed(1)}).`);
  lines.push('Antes de comprar mídia, feche os P0 do backlog: corrigir a promessa, o caminho de instalação e a prova social costuma subir conversão sem aumentar o CAC.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Fetching helpers
 * ------------------------------------------------------------------ */

function timeoutSignal(ms, outer) {
  const timer = AbortSignal.timeout(ms);
  if (!outer) return timer;
  try {
    return AbortSignal.any([outer, timer]);
  } catch {
    return outer;
  }
}

function normalizeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('Informe uma URL válida (ex.: https://seusite.com).');
  if (!/^https?:\/\//i.test(value)) return `https://${value}`;
  return value;
}

async function fetchPage(ctx, url, signal, budgetMs) {
  const target = normalizeUrl(url);
  const res = await ctx.web.fetch({ url: target }, timeoutSignal(budgetMs || 15000, signal));
  const body = res.body || {};
  const content = typeof body.content === 'string' ? body.content : '';
  return {
    url: res.url || target,
    status: res.statusCode,
    kind: body.kind,
    html: content.slice(0, 600000),
    truncated: Boolean(res.truncated),
  };
}

async function auditSite(ctx, url, signal) {
  const page = await fetchPage(ctx, url, signal);
  if (page.status >= 400) {
    throw new Error(`O site respondeu HTTP ${page.status} em ${page.url}. Confira a URL e tente novamente.`);
  }
  const sig = extractPage(page.html, page.url);
  const scores = scoreSite(sig);
  const total = totalScore(scores);
  const inferred = inferBusiness(sig);
  const backlog = uxBacklog(sig, scores, inferred);
  const markdown = renderAudit({ sig, scores, total, inferred, backlog, url: page.url, status: page.status });
  return { url: page.url, status: page.status, sig, scores, total, inferred, backlog, markdown };
}

/* ------------------------------------------------------------------ *
 * Competitor discovery
 * ------------------------------------------------------------------ */

const EXCLUDED_HOSTS = new Set([
  'apps.apple.com', 'play.google.com', 'itunes.apple.com', 'youtube.com', 'youtu.be',
  'instagram.com', 'facebook.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com',
  'wikipedia.org', 'reddit.com', 'medium.com', 'producthunt.com', 'g2.com', 'capterra.com',
  'trustpilot.com', 'reclameaqui.com.br', 'quora.com', 'pinterest.com', 'github.com',
  'google.com', 'bing.com', 'duckduckgo.com', 'apple.com', 'microsoft.com', 'amazon.com',
]);

function candidateScore(candidate, categoryWords) {
  const text = `${candidate.title || ''} ${candidate.snippet || ''}`.toLowerCase();
  let score = candidate.hits * 2;
  if (/app|aplicativo|download|baixar/i.test(text)) score += 1;
  for (const word of categoryWords.slice(0, 6)) {
    if (new RegExp(escapeRe(word), 'i').test(text)) {
      score += 1;
      break;
    }
  }
  return score;
}

async function discoverCompetitors(ctx, args, signal) {
  const ownUrl = args.url ? normalizeUrl(args.url) : '';
  const ownHost = ownUrl ? hostOf(ownUrl) : '';
  const appName = String(args.appName || '').trim();
  const category = String(args.category || '').trim();
  const keywords = String(args.keywords || '').trim();
  const region = String(args.region || 'Brasil').trim();
  const limit = Math.max(1, Math.min(5, Number(args.count) || 3));

  const categoryWords = (keywords || category).split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
  const queries = [];
  if (appName) queries.push(`alternativas a ${appName} aplicativo`);
  if (category) queries.push(`melhores apps de ${category} ${region}`);
  if (appName && category) queries.push(`${appName} concorrentes ${category}`);
  if (keywords) queries.push(`${keywords} aplicativo ${region}`);
  if (!queries.length) queries.push(`${appName || category || 'aplicativo'} app ${region}`);

  const found = new Map();
  for (const query of queries.slice(0, 4)) {
    let result;
    try {
      result = await ctx.web.search({ query, maxResults: 8 }, timeoutSignal(20000, signal));
    } catch {
      continue;
    }
    for (const source of result.sources || []) {
      const host = hostOf(source.url);
      if (!host || host === ownHost || EXCLUDED_HOSTS.has(host)) continue;
      if (host.endsWith('.gov.br') || host.endsWith('.edu.br')) continue;
      const current = found.get(host) || { host, url: source.url, title: source.title || '', snippet: source.snippet || '', hits: 0 };
      current.hits += 1;
      if (!current.title && source.title) current.title = source.title;
      if (!current.snippet && source.snippet) current.snippet = source.snippet;
      current.url = current.url || source.url;
      found.set(host, current);
    }
  }

  const ranked = [...found.values()]
    .map((candidate) => ({ ...candidate, rank: candidateScore(candidate, categoryWords) }))
    .sort((a, b) => b.rank - a.rank || a.host.localeCompare(b.host))
    .slice(0, 7);

  const enriched = await Promise.all(ranked.map(async (candidate) => {
    try {
      const page = await fetchPage(ctx, candidate.url, signal, 9000);
      const sig = extractPage(page.html, candidate.url);
      const stores = [sig.store.ios ? 'iOS' : '', sig.store.android ? 'Android' : ''].filter(Boolean);
      let extra = 0;
      if (sig.store.ios) extra += 1.5;
      if (sig.store.android) extra += 1.5;
      if (sig.flags.pricing) extra += 1;
      if (sig.flags.socialProof) extra += 1;
      const why = [
        stores.length ? `presença nas lojas (${stores.join(' + ')})` : 'sem link de loja',
        sig.flags.pricing ? 'preço público' : 'preço não público',
        sig.flags.socialProof ? 'prova social visível' : 'sem prova social evidente',
        sig.flags.freeTrial ? 'teste grátis' : 'sem teste grátis declarado',
      ].join(' · ');
      return {
        ...candidate,
        reachable: page.status < 400,
        status: page.status,
        title: sig.title || candidate.title,
        description: sig.description,
        score: candidate.rank + extra,
        why,
        stores,
        url: page.url || candidate.url,
      };
    } catch {
      return { ...candidate, reachable: false, status: 0, why: 'site não respondeu à inspeção', score: candidate.rank };
    }
  }));

  const chosen = enriched
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const markdown = [];
  markdown.push('# Concorrentes diretos encontrados');
  markdown.push('');
  markdown.push(`Critério: buscas públicas por categoria e alternativas, filtrando portais, lojas e mídia. ${ownHost ? `Seu domínio (${ownHost}) foi excluído.` : ''}`);
  markdown.push('');
  chosen.forEach((c, index) => {
    markdown.push(`## ${index + 1}. ${c.title ? cut(c.title, 90) : c.host}`);
    markdown.push(`- **Site:** ${c.url}`);
    markdown.push(`- **Por que é concorrente:** ${c.why}`);
    markdown.push(`- **Evidências:** ${c.stores.length ? c.stores.join(' + ') : 'loja não linkada'}; HTTP ${c.status || 'sem resposta'}; ${c.description ? cut(c.description, 160) : 'sem meta description'}`);
  });
  if (chosen.length < limit) {
    markdown.push('');
    markdown.push(`> Só foram confirmados ${chosen.length} concorrentes. Rode novamente com \`category\` e \`keywords\` mais específicos para completar ${limit}.`);
  }
  markdown.push('');
  markdown.push('**Próximo passo:** rodar `commerce_benchmark` com essas três URLs para quantificar onde cada um ganha.');

  return {
    competitors: chosen.map((c) => ({ name: c.title || c.host, url: c.url, why: c.why, stores: c.stores })),
    markdown: markdown.join('\n'),
  };
}

/* ------------------------------------------------------------------ *
 * Benchmark
 * ------------------------------------------------------------------ */

const DIMENSION_ACTIONS = {
  clarity: 'Reescrever H1/meta com promessa específica e número concreto.',
  cta: 'Unificar CTA primário e colocar badges das duas lojas + QR acima da dobra.',
  trust: 'Subir nota das lojas, nº de downloads e 2 depoimentos com resultado.',
  offer: 'Publicar planos e o que é grátis; incluir teste e cancelamento.',
  ux: 'Enxugar scripts, mostrar o app em vídeo e revisar o layout no celular.',
  seo: 'Corrigir title/description, H1 único e adicionar JSON-LD de SoftwareApplication.',
  app: 'Adicionar smart banner, deep links e avaliações das lojas na landing.',
};

async function runBenchmark(ctx, args, signal) {
  const own = await auditSite(ctx, args.url, signal);
  let competitorUrls = Array.isArray(args.competitors) ? args.competitors.filter(Boolean).map(String) : [];

  if (competitorUrls.length < 1) {
    const discovered = await discoverCompetitors(ctx, {
      url: args.url,
      appName: args.appName,
      category: own.inferred.category.startsWith('não identificada') ? args.category : (args.category || own.inferred.category),
      keywords: args.keywords,
      count: 3,
    }, signal);
    competitorUrls = discovered.competitors.map((c) => c.url).filter((u) => u && hostOf(u) !== hostOf(own.url));
  }

  const competitorUrlsLimited = competitorUrls.slice(0, 3);
  const competitorAudits = [];
  for (const url of competitorUrlsLimited) {
    try {
      competitorAudits.push(await auditSite(ctx, url, signal));
    } catch (error) {
      competitorAudits.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const valid = competitorAudits.filter((audit) => !audit.error);

  const dims = own.scores.map((dim) => {
    const rivalScores = valid.map((audit) => {
      const match = audit.scores.find((d) => d.id === dim.id);
      return match ? match.score : 0;
    });
    const bestRival = rivalScores.length ? Math.max(...rivalScores) : 0;
    return { ...dim, bestRival, gap: bestRival - dim.score };
  });

  const gaps = dims
    .filter((dim) => dim.gap > 0.3)
    .sort((a, b) => b.gap * b.weight - a.gap * a.weight)
    .slice(0, 4);

  const headers = ['Dimensão', 'Peso', 'Você', ...valid.map((audit) => hostOf(audit.url) || 'concorrente')];
  const rows = dims.map((dim) => {
    const cells = valid.map((audit) => {
      const match = audit.scores.find((d) => d.id === dim.id);
      return match ? match.score.toFixed(1) : '—';
    });
    return `| ${dim.label} | ${dim.weight} | ${dim.score.toFixed(1)} | ${cells.join(' | ')} |`;
  });

  const markdown = [];
  markdown.push(`# Benchmark — ${hostOf(own.url)} vs. ${valid.length} concorrente(s)`);
  markdown.push('');
  markdown.push('| ' + headers.join(' | ') + ' |');
  markdown.push('|' + headers.map((_, index) => (index === 0 ? '---' : '---:')).join('|') + '|');
  markdown.push(...rows);
  markdown.push(`| **Total ponderado** | 100 | **${own.total.toFixed(1)}** | ${valid.map((audit) => `**${audit.total.toFixed(1)}**`).join(' | ')} |`);
  markdown.push('');
  if (valid.length) {
    const bestTotal = Math.max(...valid.map((audit) => audit.total));
    if (own.total >= bestTotal) {
      markdown.push(`**Posição:** você lidera o conjunto (${own.total.toFixed(1)} vs. melhor concorrente ${bestTotal.toFixed(1)}). O risco agora é de execução, não de posicionamento.`);
    } else {
      markdown.push(`**Posição:** você está ${(bestTotal - own.total).toFixed(1)} pontos atrás do melhor concorrente (${bestTotal.toFixed(1)}).`);
    }
    const dimWinners = dims.filter((dim) => dim.gap > 0.3).map((dim) => dim.label);
    markdown.push('');
    markdown.push(`**Onde os concorrentes ganham:** ${dimWinners.length ? dimWinners.join(' · ') : 'em nenhuma dimensão relevante'}.`);
  }
  markdown.push('');
  markdown.push('## Lacunas prioritárias');
  if (!gaps.length) {
    markdown.push('Nenhuma lacuna acima de 0,3 ponto: a disputa está em preço, mídia e distribuição.');
  } else {
    for (const gap of gaps) {
      markdown.push(`- **${gap.label}:** você ${gap.score.toFixed(1)} vs. melhor concorrente ${gap.bestRival.toFixed(1)} (gap ${gap.gap.toFixed(1)}). ${DIMENSION_ACTIONS[gap.id] || ''}`);
    }
  }
  markdown.push('');
  markdown.push('## Cinco movimentos para fechar o gap');
  const moves = gaps.length ? gaps : dims.slice().sort((a, b) => a.score - b.score).slice(0, 4).map((dim) => ({ ...dim, gap: 0 }));
  moves.slice(0, 4).forEach((gap, index) => {
    markdown.push(`${index + 1}. ${DIMENSION_ACTIONS[gap.id] || gap.label}`);
  });
  markdown.push('5. Escolher **um** concorrente como referência de execução e copiar apenas o que serve ao seu posicionamento — nunca os dois.');
  markdown.push('');
  markdown.push('> Benchmark heurístico, calculado a partir de sinais públicos da página. Não estima tráfego nem receita.');

  return {
    own: { url: own.url, total: own.total, scores: own.scores },
    competitors: valid.map((audit) => ({ url: audit.url, total: audit.total, scores: audit.scores })),
    failures: competitorAudits.filter((audit) => audit.error).map((audit) => ({ url: audit.url, error: audit.error })),
    markdown: markdown.join('\n'),
  };
}

/* ------------------------------------------------------------------ *
 * Growth plan
 * ------------------------------------------------------------------ */

const CHANNELS = [
  {
    id: 'aso',
    label: 'ASO — App Store + Google Play',
    type: 'online',
    min: 0,
    max: 1500,
    horizon: '30–60 dias',
    kpi: 'impressões da ficha, taxa de conversão da ficha → instalação',
    actions: [
      'Reescrever título/subtítulo com a keyword primária e 2 secundárias.',
      'Produzir 6 screenshots com legenda de benefício e vídeo de 20s.',
      'Rodar teste A/B de ícone e primeira screenshot (Product Page Optimization / Play experiments).',
    ],
  },
  {
    id: 'appleSearchAds',
    label: 'Apple Search Ads (ASA)',
    type: 'online',
    min: 1500,
    max: 8000,
    horizon: '30–90 dias',
    kpi: 'CPA, TTR da ficha, receita por instalação',
    actions: [
      'Subir campanha Brand e Categoria com lance manual.',
      'Separar grupos por intenção (marca, concorrente, categoria).',
      'Cortar termos com CPA acima de 1,5× a meta semanalmente.',
    ],
  },
  {
    id: 'googleUac',
    label: 'Google App Campaigns (UAC)',
    type: 'online',
    min: 2000,
    max: 15000,
    horizon: '30–90 dias',
    kpi: 'CPI, instalações qualificadas, ROAS se houver receita',
    actions: [
      'Publicar 5 assets de texto e 5 visuais por campanha.',
      'Rodar evento de conversão in-app como objetivo (não instalação).',
      'Separar campanha de escala e campanha de teste de criativo.',
    ],
  },
  {
    id: 'meta',
    label: 'Meta Ads (Instagram/Facebook)',
    type: 'online',
    min: 1500,
    max: 12000,
    horizon: '30–90 dias',
    kpi: 'CPL, custo por instalação, retenção D7 por origem',
    actions: [
      'Testar 3 ângulos: dor, resultado e prova (depoimento).',
      'Criativos verticalizados com legenda queimada e CTA nativo.',
      'Rodar remarketing para quem visitou a landing e não instalou.',
    ],
  },
  {
    id: 'tiktok',
    label: 'TikTok Ads + criadores',
    type: 'online',
    min: 1500,
    max: 10000,
    horizon: '30–60 dias',
    kpi: 'CPM, CPI, taxa de retenção D1',
    actions: [
      'Gravar 6 variações de vídeo UGC de 15s com gancho nos 2 primeiros segundos.',
      'Usar Spark Ads em posts de criadores já validados.',
      'Medir só criativo com retenção D1 acima da média do app.',
    ],
  },
  {
    id: 'influencers',
    label: 'Influenciadores nano/micro',
    type: 'online',
    min: 1000,
    max: 15000,
    horizon: '45–90 dias',
    kpi: 'instalações por cupom/link, CPA por criador',
    actions: [
      'Selecionar 8–10 criadores de nicho com 10k–100k seguidores.',
      'Negociar permuta + fixo por entregável e uso de link rastreável.',
      'Renovar só quem entrega CPA abaixo da meta em 30 dias.',
    ],
  },
  {
    id: 'seo',
    label: 'SEO e conteúdo',
    type: 'online',
    min: 0,
    max: 4000,
    horizon: '60–120 dias',
    kpi: 'sessões orgânicas, cadastros assistidos, posição das keywords',
    actions: [
      'Criar hub de conteúdo com as 10 dúvidas reais de quem busca a categoria.',
      'Publicar comparativos “X vs. Y” e “melhores apps de [categoria]”.',
      'Marcar SoftwareApplication + FAQPage com JSON-LD.',
    ],
  },
  {
    id: 'email',
    label: 'E-mail/CRM e ciclo de vida',
    type: 'online',
    min: 0,
    max: 800,
    horizon: '30–90 dias',
    kpi: 'ativação, retenção D7/D30, receita por coorte',
    actions: [
      'Sequência de 4 e-mails: boas-vindas, caso de uso, objeção, oferta.',
      'Recuperar quem baixou e não ativou com push + e-mail.',
      'Pedir avaliação na loja no momento de maior sucesso no app.',
    ],
  },
  {
    id: 'pr',
    label: 'PR e lançamento em mídia',
    type: 'online',
    min: 0,
    max: 5000,
    horizon: '45–90 dias',
    kpi: 'menções qualificadas, tráfego de referral, autoridade de domínio',
    actions: [
      'Montar kit de imprensa com dados próprios do mercado.',
      'Oferecer pauta com número exclusivo (ex.: pesquisa com base de usuários).',
      'Mirar 5 veículos de nicho antes de tentar grande mídia.',
    ],
  },
  {
    id: 'partnerships',
    label: 'Parcerias locais e co-marketing',
    type: 'offline',
    min: 0,
    max: 3000,
    horizon: '30–90 dias',
    kpi: 'instalações por parceiro, receita compartilhada',
    actions: [
      'Fechar 3 parcerias com negócios que atendem o mesmo público (não concorrentes).',
      'Criar cupom/QR exclusivo por parceiro para medir origem.',
      'Rodar ação conjunta mensal em vez de patrocínio pontual.',
    ],
  },
  {
    id: 'events',
    label: 'Eventos, meetups e ativação presencial',
    type: 'offline',
    min: 500,
    max: 8000,
    horizon: '45–90 dias',
    kpi: 'leads qualificados por evento, custo por instalação presencial',
    actions: [
      'Escolher 2 eventos de nicho em vez de 1 grande generalista.',
      'Levar demonstração de 60s e QR de instalação assistida.',
      'Capturar contato com consentimento e nutrir em 48h.',
    ],
  },
  {
    id: 'ooh',
    label: 'Mídia exterior local (OOH)',
    type: 'offline',
    min: 3000,
    max: 20000,
    horizon: '60–90 dias',
    kpi: 'instalações por QR, uplift de buscas pela marca',
    actions: [
      'Concentrar em 1 região com alta densidade do público, não espalhar.',
      'Usar QR + URL curta com UTM para atribuição.',
      'Negociar 2 meses com veiculação e troca de criativo no meio.',
    ],
  },
];

const STAGE_PROFILES = {
  'pre-lancamento': { label: 'Pré-lançamento', weights: { aso: 3, pr: 2, partnerships: 2, events: 2, email: 2, seo: 2, influencers: 1 } },
  lancamento: { label: 'Lançamento', weights: { aso: 3, appleSearchAds: 2, meta: 2, influencers: 2, pr: 2, events: 2, partnerships: 1 } },
  crescimento: { label: 'Crescimento', weights: { aso: 2, appleSearchAds: 2, googleUac: 3, meta: 3, tiktok: 2, influencers: 2, seo: 2, email: 2, partnerships: 1, events: 1 } },
  escala: { label: 'Escala', weights: { googleUac: 4, meta: 3, tiktok: 2, appleSearchAds: 2, influencers: 2, seo: 2, email: 2, pr: 1, ooh: 1, events: 1, partnerships: 1 } },
};

function normalizeStage(raw) {
  const value = String(raw || '').toLowerCase();
  if (/pr[eé]|pre/.test(value)) return 'pre-lancamento';
  if (/lan[cç]|launch/.test(value)) return 'lancamento';
  if (/escala|scale/.test(value)) return 'escala';
  return 'crescimento';
}

function buildGrowthPlan(args) {
  const stageKey = normalizeStage(args.stage);
  const stage = STAGE_PROFILES[stageKey];
  const budget = Math.max(0, Number(args.monthlyBudgetBrl) || 6000);
  const region = String(args.region || 'Brasil');
  const horizonDays = Math.max(30, Math.min(180, Number(args.horizonDays) || 90));

  const weighted = CHANNELS
    .filter((channel) => stage.weights[channel.id])
    .map((channel) => {
      const weight = stage.weights[channel.id];
      const share = budget * (weight / Object.values(stage.weights).reduce((a, b) => a + b, 0));
      return { channel, weight, share };
    })
    .sort((a, b) => b.weight - a.weight || a.channel.label.localeCompare(b.channel.label));

  const stageTotal = Object.values(stage.weights).reduce((a, b) => a + b, 0);
  const allocationRows = weighted.map(({ channel, weight, share }) => {
    const lo = Math.max(channel.min, Math.round(share * 0.6));
    const hi = Math.max(lo, Math.min(channel.max, Math.round(share * 1.4)));
    return { channel, weight, share, lo, hi, pct: (weight / stageTotal) * 100 };
  });

  const lines = [];
  lines.push(`# Plano de growth — ${stage.label} · ${region} · ${horizonDays} dias`);
  lines.push('');
  lines.push(`**Premissa de verba:** ${brl(budget)}/mês (mídia + produção). Faixas de custo são referências de mercado para validar com fornecedores — não cotações.`);
  lines.push('');
  lines.push('## Alocação recomendada');
  lines.push('');
  lines.push('| Canal | Tipo | % da verba | Faixa mensal | KPI |');
  lines.push('|---|---|---:|---|---|');
  for (const row of allocationRows) {
    lines.push(`| ${row.channel.label} | ${row.channel.type === 'online' ? 'online' : 'offline'} | ${row.pct.toFixed(0)}% | ${brl(row.lo)}–${brl(row.hi)} | ${row.channel.kpi} |`);
  }
  lines.push('');
  lines.push('## Fases');
  const phases = [
    { name: '0–30 dias — consertar e medir', focus: 'Fundação: conversão da landing, tracking e ASO. Nada de escala antes disso.' },
    { name: '31–60 dias — testar canais', focus: 'Dois canais pagos em paralelo, criativo semanal, corte por CPA.' },
    { name: '61–90 dias — dobrar no que funciona', focus: 'Escalar o canal vencedor, manter 20% da verba em teste.' },
  ];
  phases.forEach((phase, index) => {
    lines.push('');
    lines.push(`### ${phase.name}`);
    lines.push(phase.focus);
    lines.push('');
    const picks = allocationRows.slice(0, 4);
    for (const { channel } of picks) {
      const action = channel.actions[index] || channel.actions[channel.actions.length - 1];
      lines.push(`- **${channel.label}:** ${action}`);
    }
  });
  lines.push('');
  lines.push('## Metas e cadência');
  lines.push('- Semana 1: dashboard com instalação, ativação D1/D7 e custo por instalação por canal.');
  lines.push('- Semanal: revisar CPA por canal e pausar o que estiver 1,5× acima da meta.');
  lines.push('- Mensal: decidir realocação de verba com base em retenção, não em CPI.');
  lines.push('');
  lines.push('## Riscos');
  lines.push('- Escalar com landing fraca multiplica desperdício: os P0 da auditoria vêm antes da mídia.');
  lines.push('- Atribuição em mobile é parcial: combine link rastreável, cupom e pergunta no onboarding.');
  lines.push('- Offline sem QR/URL dedicada vira custo sem aprendizado.');

  return {
    stage: stage.label,
    budget,
    allocation: allocationRows.map(({ channel, share, lo, hi }) => ({ id: channel.id, label: channel.label, type: channel.type, share: Math.round(share), min: lo, max: hi, kpi: channel.kpi })),
    markdown: lines.join('\n'),
  };
}

/* ------------------------------------------------------------------ *
 * Board memo (CEO mode)
 * ------------------------------------------------------------------ */

async function buildBoardMemo(ctx, args, signal) {
  const urls = Array.isArray(args.urls) ? args.urls.filter(Boolean).map(String).slice(0, 3) : [];
  const audits = [];
  for (const url of urls) {
    try {
      audits.push(await auditSite(ctx, url, signal));
    } catch (error) {
      audits.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const valid = audits.filter((audit) => !audit.error);
  const plan = buildGrowthPlan({ stage: args.stage, monthlyBudgetBrl: args.monthlyBudgetBrl, region: args.region, horizonDays: args.horizonDays });

  const lines = [];
  lines.push('# Memo do CEO comercial');
  lines.push('');
  lines.push(`**Data:** ${new Date().toISOString().slice(0, 10)} · **Cenário:** ${plan.stage} · **Verba:** ${brl(plan.budget)}/mês`);
  lines.push('');
  lines.push('## Diagnóstico');
  if (valid.length) {
    for (const audit of valid) {
      const weakest = [...audit.scores].sort((a, b) => a.score - b.score)[0];
      lines.push(`- **${hostOf(audit.url)}** — nota ${audit.total.toFixed(1)}/100; pior dimensão: ${weakest.label} (${weakest.score.toFixed(1)}/10). Categoria inferida: ${audit.inferred.category}.`);
    }
    const avg = valid.reduce((acc, audit) => acc + audit.total, 0) / valid.length;
    const read = avg < 50
      ? 'A base de conversão ainda não sustenta escala de mídia.'
      : avg < 75
        ? 'A base permite testar canais, mas o ganho barato está em fechar os P0.'
        : 'A base está saudável: o ganho agora vem de distribuição, oferta e do funil pós-instalação.';
    lines.push(`- **Média do portfólio:** ${avg.toFixed(1)}/100. ${read}`);
  } else {
    lines.push(`- Sem URL analisada nesta chamada. Contexto informado: ${args.context ? cut(String(args.context), 400) : 'nenhum'}.`);
    lines.push('- Decisão recomendada: rodar `commerce_site_audit` na landing principal antes de aprovar verba.');
  }
  lines.push('');
  lines.push('## Três apostas do trimestre');
  const bets = valid.length
    ? [...valid[0].scores].sort((a, b) => a.score - b.score || b.weight - a.weight).slice(0, 3)
    : [];
  if (bets.length) {
    bets.forEach((bet, index) => {
      const target = bet.score < 7.5
        ? 'Meta: +2,0 pontos em 60 dias.'
        : bet.score < 9.5
          ? 'Meta: +1,0 ponto em 60 dias; hoje já está no padrão aceitável.'
          : 'Manter acima de 9,5 e usar como referência de execução para as outras dimensões.';
      lines.push(`${index + 1}. **${bet.label}** — hoje em ${bet.score.toFixed(1)}/10 (peso ${bet.weight}). ${target} ${DIMENSION_ACTIONS[bet.id] || ''}`);
    });
  } else {
    lines.push('1. **Conversão da landing** — fechar P0 de proposta, instalação e prova social.');
    lines.push('2. **Aquisição paga com atribuição** — dois canais, CPA meta definido antes de subir.');
    lines.push('3. **Retenção como métrica de marketing** — D7 vira critério de verba, não o CPI.');
  }
  lines.push('');
  lines.push('## Alocação de verba');
  const top = plan.allocation.slice(0, 5);
  lines.push('| Canal | Faixa mensal | KPI |');
  lines.push('|---|---:|---|');
  for (const item of top) {
    lines.push(`| ${item.label} | ${brl(item.min)}–${brl(item.max)} | ${item.kpi} |`);
  }
  lines.push('');
  lines.push('## Calendário de decisões');
  lines.push('- **Dia 15:** aprovar backlog P0 e responsável por implementação.');
  lines.push('- **Dia 30:** decidir canais pagos com base em CPA e ativação D1, não em volume.');
  lines.push('- **Dia 60:** realocar verba para o canal com melhor retenção D7.');
  lines.push('- **Dia 90:** decidir expansão (novo canal, novo país ou novo produto) ou foco.');
  lines.push('');
  lines.push('## Riscos e mitigação');
  lines.push('- **Landing fraca + mídia:** queima verba; mitigar com gate de conversão antes de escalar.');
  lines.push('- **CPI barato com retenção ruim:** corrigir meta para instalação qualificada/ativação.');
  lines.push('- **Dependência de um canal:** manter 20% da verba em teste permanente.');
  lines.push('');
  lines.push('## O que preciso de você');
  lines.push('- Aprovar a verba e o dono de cada P0 da landing.');
  lines.push('- Dar acesso às lojas (App Store Connect / Play Console) para ASO e leitura de conversão.');
  lines.push('- Definir a meta de CPA e a definição de “instalação qualificada”.');
  lines.push('');
  lines.push('## Cadência');
  lines.push('Reunião semanal de 30 min com 3 números: custo por instalação qualificada, ativação D1 e receita por coorte. Sem esses três, a decisão vira opinião.');

  return {
    portfolio: valid.map((audit) => ({ url: audit.url, total: audit.total })),
    plan,
    markdown: lines.join('\n'),
  };
}

/* ------------------------------------------------------------------ *
 * Tool registration
 * ------------------------------------------------------------------ */

function toolResult(markdown, data) {
  return { markdown, data };
}

function renderText(_args, value) {
  const text = value && typeof value.markdown === 'string' ? value.markdown : JSON.stringify(value ?? null, null, 2);
  return [{ type: 'text', text }];
}

function defineTool(ctx, definition) {
  const wrapped = {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    output: {
      schema: {},
      render: renderText,
    },
    async execute(args, exec) {
      const result = await definition.run(args || {}, exec);
      return { markdown: result.markdown, data: result.data ?? null };
    },
    presentCall(args) {
      return { card: 'generic', kind: definition.kind || 'read', title: definition.title(args || {}) };
    },
  };
  ctx.tools.register(wrapped);
}

/* ------------------------------------------------------------------ *
 * HTTP surface for the Commerce Pilot panel
 *
 * The browser half (client.js) is a plain form: type a URL, press a
 * button, read the result. These routes call the same functions the
 * Agent tools call, so the panel and the assistant can never disagree
 * about a score.
 * ------------------------------------------------------------------ */

const API_PREFIX = '/commerce-pilot/api';
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('corpo da requisição acima do limite'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      } catch {
        reject(new Error('JSON inválido no corpo da requisição'));
      }
    });
    req.on('error', reject);
  });
}

function panelSignal() {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(120000)
    : undefined;
}

function registerPanelRoutes(ctx) {
  const server = ctx.webServer;
  if (!server || typeof server.register !== 'function') {
    console.warn('[commerce-pilot] webServer indisponível: o painel HTTP não foi registrado.');
    return;
  }

  const route = (path, run) => {
    ctx.effect(() => server.register({
      kind: 'exact',
      path,
      handler: (req, res) => {
        if (req.method !== 'POST' && req.method !== 'GET') {
          sendJson(res, 405, { ok: false, error: 'método não permitido' });
          return;
        }
        (async () => run(req))()
          .then((payload) => sendJson(res, 200, { ok: true, ...payload }))
          .catch((error) => {
            const message = error && error.message ? String(error.message) : 'falha inesperada';
            sendJson(res, 400, { ok: false, error: message });
          });
      },
    }), `commerce-pilot: rota ${path}`);
  };

  const urlOf = async (req) => {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const url = String(body.url || '').trim();
    if (!url) throw new Error('informe a URL do site');
    return { body, url };
  };

  route(`${API_PREFIX}/health`, async () => ({ service: 'commerce-pilot', version: 2 }));

  route(`${API_PREFIX}/audit`, async (req) => {
    const { url } = await urlOf(req);
    const audit = await auditSite(ctx, url, panelSignal());
    return {
      url: audit.url,
      status: audit.status,
      total: audit.total,
      scores: audit.scores,
      inferred: audit.inferred,
      backlog: audit.backlog,
      markdown: audit.markdown,
      ranAt: new Date().toISOString(),
    };
  });

  route(`${API_PREFIX}/scan`, async (req) => {
    const { body, url } = await urlOf(req);
    const audit = await auditSite(ctx, url, panelSignal());
    const payload = {
      url: audit.url,
      status: audit.status,
      total: audit.total,
      scores: audit.scores,
      inferred: audit.inferred,
      backlog: audit.backlog,
      markdown: audit.markdown,
      competitors: [],
      benchmark: null,
      notes: [],
      ranAt: new Date().toISOString(),
    };

    const supplied = Array.isArray(body.competitors)
      ? body.competitors.filter(Boolean).map((item) => String(item)).slice(0, 3)
      : [];

    if (supplied.length) {
      payload.competitors = supplied.map((item) => ({
        name: hostOf(item),
        url: item,
        why: 'informado no painel',
        stores: { ios: null, android: null },
      }));
    } else {
      try {
        const found = await discoverCompetitors(ctx, {
          url,
          appName: body.appName,
          category: body.category || (String(audit.inferred.category).startsWith('não identificada') ? '' : audit.inferred.category),
          keywords: body.keywords,
          region: body.region,
          count: 3,
        }, panelSignal());
        payload.competitors = found.competitors || [];
      } catch (error) {
        payload.notes.push(`Concorrentes: ${error.message}`);
      }
    }

    if (payload.competitors.length) {
      try {
        const benchmark = await runBenchmark(ctx, {
          url,
          appName: body.appName,
          category: body.category,
          keywords: body.keywords,
          competitors: payload.competitors.map((item) => item.url).filter(Boolean),
        }, panelSignal());
        payload.benchmark = {
          markdown: benchmark.markdown,
          own: benchmark.own,
          competitors: benchmark.competitors,
        };
      } catch (error) {
        payload.notes.push(`Benchmark: ${error.message}`);
      }
    }

    return payload;
  });

  route(`${API_PREFIX}/memo`, async (req) => {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const urls = Array.isArray(body.urls)
      ? body.urls.filter(Boolean).map((item) => String(item)).slice(0, 3)
      : [];
    if (!urls.length) throw new Error('informe ao menos uma URL');
    const memo = await buildBoardMemo(ctx, {
      urls,
      stage: body.stage,
      monthlyBudgetBrl: body.monthlyBudgetBrl,
      region: body.region,
      horizonDays: body.horizonDays,
      context: body.context,
    }, panelSignal());
    return { urls, markdown: memo.markdown, ranAt: new Date().toISOString() };
  });
}

function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: 6,
    text: DIRECTOR_TEXT,
  }), 'commerce-pilot.director');

  try {
    registerPanelRoutes(ctx);
  } catch (error) {
    console.warn('[commerce-pilot] falha ao registrar o painel HTTP:', error && error.message);
  }

  defineTool(ctx, {
    name: 'commerce_site_audit',
    kind: 'fetch',
    title: (args) => `Auditar ${hostOf(args.url) || 'site'}`,
    description: 'Audit a mobile-app landing page or product site by URL and infer the business behind it: extracts positioning, offer, pricing, social proof, store links, SEO/ASO and conversion signals, scores seven commercial dimensions from 0 to 10, and returns a prioritized UX/UI backlog. Call it first whenever the user provides a site URL or asks for a commercial diagnosis of an app landing page. It fetches the page through the Host web service and needs no further input.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute or bare URL of the landing/product site to audit.' },
        appName: { type: 'string', description: 'App or product name, when the page does not state it clearly.' },
        category: { type: 'string', description: 'Business category, e.g. "finanças pessoais" or "fitness".' },
        notes: { type: 'string', description: 'Founder context, constraints or hypotheses to keep in mind.' },
      },
      required: ['url'],
    },
    async run(args, exec) {
      const audit = await auditSite(ctx, args.url, exec.signal);
      return { markdown: audit.markdown, data: { url: audit.url, total: audit.total, scores: audit.scores, inferred: audit.inferred, backlog: audit.backlog, signals: compactSignals(audit.sig) } };
    },
  });

  defineTool(ctx, {
    name: 'commerce_competitors',
    kind: 'search',
    title: (args) => `Descobrir concorrentes de ${args.appName || hostOf(args.url) || 'app'}`,
    description: 'Discover three direct competitors for a mobile-app business from its site URL, app name, category and keywords. Runs public web searches, filters app stores, media and review portals, fetches candidate sites and ranks them by store presence, pricing disclosure and social proof. Returns the three strongest with evidence and rationale. Use it after commerce_site_audit and before commerce_benchmark.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Your site URL, used to exclude your own domain.' },
        appName: { type: 'string', description: 'Your app/product name.' },
        category: { type: 'string', description: 'Category used to search the market, e.g. "app de investimentos".' },
        keywords: { type: 'string', description: 'Comma-separated keywords that describe the problem you solve.' },
        region: { type: 'string', description: 'Country/region for the search, default "Brasil".' },
        count: { type: 'number', description: 'How many competitors to return (default 3, max 5).' },
      },
    },
    async run(args, exec) {
      const result = await discoverCompetitors(ctx, args, exec.signal);
      return { markdown: result.markdown, data: result };
    },
  });

  defineTool(ctx, {
    name: 'commerce_benchmark',
    kind: 'fetch',
    title: (args) => `Benchmark ${hostOf(args.url) || ''} vs concorrentes`,
    description: 'Run a classic benchmark between your landing page and up to three competitors. Audits every URL, compares the seven weighted commercial dimensions, shows who leads each dimension, the largest weighted gaps and five grounded moves to close them. If competitors are omitted it discovers them automatically. Use it only after the site audit, and cite the resulting table in recommendations.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Your site URL.' },
        competitors: { type: 'array', items: { type: 'string' }, description: 'Up to three competitor URLs. Omit to auto-discover.' },
        appName: { type: 'string', description: 'Your app name, used if competitors must be discovered.' },
        category: { type: 'string', description: 'Category used if competitors must be discovered.' },
        keywords: { type: 'string', description: 'Keywords used if competitors must be discovered.' },
      },
      required: ['url'],
    },
    async run(args, exec) {
      const result = await runBenchmark(ctx, args, exec.signal);
      return { markdown: result.markdown, data: result };
    },
  });

  defineTool(ctx, {
    name: 'commerce_growth_plan',
    kind: 'other',
    title: () => 'Planejar growth online + offline',
    description: 'Build a 90-day (or informed horizon) marketing plan for a mobile app, mixing online and offline actions with realistic BRL cost ranges, expected impact and KPIs, phased in three horizons and allocated against the monthly budget and company stage. Use it when the user asks how to grow, where to invest, or for a marketing plan; pass the stage and budget instead of guessing them.',
    parameters: {
      type: 'object',
      properties: {
        stage: { type: 'string', enum: ['pre-lancamento', 'lancamento', 'crescimento', 'escala'], description: 'Company stage; default "crescimento".' },
        monthlyBudgetBrl: { type: 'number', description: 'Monthly budget in BRL for media plus production.' },
        region: { type: 'string', description: 'City/country for offline actions, default "Brasil".' },
        horizonDays: { type: 'number', description: 'Planning horizon in days, default 90.' },
      },
    },
    async run(args) {
      const plan = buildGrowthPlan(args);
      return { markdown: plan.markdown, data: plan };
    },
  });

  defineTool(ctx, {
    name: 'commerce_board_memo',
    kind: 'read',
    title: () => 'Memo do CEO comercial',
    description: 'Act as the commercial CEO: synthesize one to three product URLs, the stage and the budget into an executive memo — diagnosis with scores, three quarterly bets, budget allocation, a 90-day decision calendar, risks and the decisions requested from the founder. Use it for portfolio questions, "what should I do next", board updates or when the user asks you to act as their CEO/CRO.',
    parameters: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: 'Up to three product/landing URLs in the portfolio.' },
        stage: { type: 'string', enum: ['pre-lancamento', 'lancamento', 'crescimento', 'escala'], description: 'Company stage.' },
        monthlyBudgetBrl: { type: 'number', description: 'Monthly commercial budget in BRL.' },
        region: { type: 'string', description: 'Region for offline actions.' },
        horizonDays: { type: 'number', description: 'Decision horizon in days, default 90.' },
        context: { type: 'string', description: 'Constraints, team size, goals or anything the memo must respect.' },
      },
    },
    async run(args, exec) {
      const memo = await buildBoardMemo(ctx, args, exec.signal);
      return { markdown: memo.markdown, data: memo };
    },
  });
}

export { apply, inject, name };
