#!/usr/bin/env node
/**
 * Markdown -> static HTML pages on the landing-page shell.
 *
 * This file is the assembly: it walks PAGES, renders each source through the
 * right template, and writes (or checks) the result. Everything it assembles
 * lives in bin/pages/ --
 *
 *   constants.mjs    origin, repo, site name, ROOT
 *   locales.mjs      the languages the site ships, and the menu order
 *   ui.mjs           per-locale chrome strings
 *   pages.mjs        the page inventory: slugs and their markdown sources
 *   entities.mjs     the JSON-LD entity graph
 *   markdown.mjs     frontmatter, the renderer, the extractors
 *   chrome.mjs       language switcher, GitHub mark, route helper
 *   workspace-home.mjs  aliases of the authored document-library homepage
 *   render-page.mjs  the template for everything else
 *
 * Model: PAGES is a list of { slug, sources: { <locale>: <md file> } }. Every
 * locale renders to public/<localePrefix><slug>.html; the shell links all
 * locales of the same slug to each other (hreflang + language switcher).
 * Adding a locale to LOCALES is enough for the shell; content is per file.
 *
 * The public surface is re-exported below, so vite.config.ts, the bin scripts
 * and the tests import from this path exactly as before.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './pages/constants.mjs';
import { LOCALES } from './pages/locales.mjs';
import { PAGES } from './pages/pages.mjs';
import { extractFaq, extractSteps, parseFrontmatter, renderMarkdown, wrapFaqSection } from './pages/markdown.mjs';
import { routeFor } from './pages/chrome.mjs';
import { workspaceHomes } from './pages/workspace-home.mjs';
import { renderPage } from './pages/render-page.mjs';

export { LOCALES, MENU_ORDER } from './pages/locales.mjs';
export { LANDING_SLUGS, PAGES } from './pages/pages.mjs';

function pathFor(output, dir) {
  return resolve(dir, output.rel);
}

export function generate({ outDir = resolve(ROOT, 'public') } = {}) {
  const outputs = workspaceHomes();
  for (const page of PAGES) {
    for (const locale of Object.keys(LOCALES)) {
      const src = page.sources[locale];
      if (!src) continue;
      const raw = readFileSync(resolve(ROOT, src), 'utf8');
      const { data, body: mdBody } = parseFrontmatter(raw);
      const meta = { ...data, ...page.meta?.[locale] };
      if (!meta.title || !meta.description) {
        throw new Error(`${src}: missing title/description (frontmatter or PAGES.meta.${locale})`);
      }
      const { html, headings } = renderMarkdown(mdBody, { stripFirstHeading: page.stripFirstHeading });
      const faq = extractFaq(html);
      const steps = extractSteps(html);
      const body = page.kind === 'landing' ? wrapFaqSection(html) : html;
      const out = renderPage({ page, locale, meta, body, headings, faq, steps, source: src });
      const rel = `${LOCALES[locale].prefix}/${page.slug}.html`.replace(/^\//, '');
      outputs.push({
        rel,
        route: routeFor(locale, page.slug),
        html: out,
        source: src,
        locale,
        kind: page.kind ?? 'doc',
      });
    }
  }
  if (outDir) {
    for (const o of outputs) {
      const target = pathFor(o, outDir);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, o.html);
    }
  }
  return outputs;
}

/**
 * The compatibility alias stays committed; the root index.html is authored
 * source, not generated output. Locale aliases and help pages are generated.
 */
const COMMITTED = new Set(['library.html']);

/** The committed outputs a fresh render would change (empty when all current). */
export function check({ publicDir = resolve(ROOT, 'public') } = {}) {
  const stale = [];
  for (const o of generate({ outDir: null })) {
    if (!COMMITTED.has(o.rel)) continue;
    const target = pathFor(o, publicDir);
    if (!existsSync(target) || readFileSync(target, 'utf8') !== o.html) stale.push(o.rel);
  }
  return stale;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const stale = check();
    if (stale.length) {
      console.error(`Generated pages out of date: ${stale.join(', ')}\nRun: node bin/build-pages.mjs`);
      process.exit(1);
    }
    console.log('Generated pages are up to date.');
  } else {
    const i = args.indexOf('--out');
    const outDir = i >= 0 ? resolve(process.cwd(), args[i + 1]) : resolve(ROOT, 'public');
    const outputs = generate({ outDir });
    for (const o of outputs) console.log(`  ${o.route}  <-  ${o.source}`);
    console.log(`Generated ${outputs.length} pages -> ${outDir}`);
  }
}
