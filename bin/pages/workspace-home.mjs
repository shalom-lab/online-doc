import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './constants.mjs';
import { LOCALES } from './locales.mjs';

// index.html is the authored product homepage, never a generated marketing page.
export function workspaceHomes() {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  return [
    { rel: 'library.html', route: '/library.html', locale: 'zh-CN' },
    ...Object.entries(LOCALES)
      .filter(([, config]) => config.prefix)
      .map(([locale, config]) => ({ rel: `${config.prefix.slice(1)}/index.html`, route: config.home, locale })),
  ].map(output => ({ ...output, html, source: 'index.html', kind: 'home' }));
}
