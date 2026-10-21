import { apply } from './engine.js';
import { safeFetch } from './security.js';

export function createEngine() {
  const tools = new Map();
  const cache = new Map();

  const ctx = {
    effect(fn) {
      const dispose = fn();
      return typeof dispose === 'function' ? dispose : () => {};
    },
    systemPrompt: { section: () => () => {} },
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
      },
    },
    web: {
      fetch({ url }, signal) {
        const key = String(url);
        if (!cache.has(key)) {
          cache.set(key, safeFetch(key, { signal }));
        }
        return cache.get(key);
      },
      async search() {
        return { sources: [] };
      },
    },
    webServer: { register: () => () => {} },
  };

  apply(ctx);
  return { tools };
}

export async function runTool(engine, name, args, signal) {
  const tool = engine.tools.get(name);
  if (!tool) throw new Error(`Ferramenta ${name} indisponível.`);

  const result = await tool.execute(args, { signal });
  const data =
    result && result.data && typeof result.data === 'object' ? result.data : {};

  return { ...data, markdown: result?.markdown ?? data.markdown };
}
