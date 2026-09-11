#!/usr/bin/env node
/**
 * One-time importer: converts the Squarespace JSON export (pages, news, events)
 * into Markdown content collections under src/content/.
 *
 * Usage:  node scripts/import-squarespace.mjs <export-dir>
 * where <export-dir> contains json/pages.json, json/news.json, json/events.json,
 * json/store.json and image-map.json (remote URL -> /images/archive/... path).
 *
 * Safe to re-run: it overwrites the generated files but never touches files
 * that carry `imported: false` in their front matter (hand-edited pages).
 */
import fs from 'node:fs';
import path from 'node:path';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import yaml from 'js-yaml';

const exportDir = process.argv[2];
if (!exportDir) {
  console.error('usage: node scripts/import-squarespace.mjs <export-dir>');
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(exportDir, f), 'utf8'));
const pages = read('json/pages.json');
const news = read('json/news.json');
const events = read('json/events.json');
const store = read('json/store.json');
const imageMap = read('image-map.json');

// ---------- HTML pre-processing ----------
function localImage(url) {
  if (!url) return url;
  const clean = url.split('?')[0].replace(/^\/\//, 'https://');
  return imageMap[clean] || url;
}

function preprocess(html) {
  if (!html) return '';
  let h = html;
  // Squarespace lazy images: keep the noscript fallback, drop the lazy <img>.
  h = h.replace(/<img[^>]*data-src="[^"]*"[^>]*>(?![^<]*<\/noscript>)/g, '');
  h = h.replace(/<noscript>(<img[^>]*>)<\/noscript>/g, '$1');
  // Video blocks carry the embed in data-html; surface the YouTube/Vimeo URL.
  h = h.replace(/<div class="sqs-block video-block[^"]*"[^>]*data-block-json="([^"]*)"[^>]*>[\s\S]*?<\/div><\/div>/g, (m, json) => {
    try {
      const j = JSON.parse(json.replace(/&quot;/g, '"').replace(/&#123;/g, '{').replace(/&#125;/g, '}').replace(/&amp;/g, '&'));
      if (j.url) return `<p><a href="${j.url}">Watch the video: ${j.url}</a></p>`;
    } catch {}
    return '';
  });
  // Form blocks cannot be migrated; leave a visible note for the editor.
  h = h.replace(/<div class="sqs-block form-block[^"]*"[^>]*>[\s\S]*?<\/form>[\s\S]*?<\/div><\/div><\/div>/g,
    '<p><em>[A Squarespace form was here. Replace with a Google Form link.]</em></p>');
  // Map blocks: just the address is in the page text already.
  h = h.replace(/<div class="sqs-block map-block[^"]*"[^>]*>[\s\S]*?<\/div><\/div>/g, '');
  // Code blocks (Mailchimp, ActBlue embeds) are dropped here; the site renders those
  // from components, switched on by the `embeds` front matter set below.
  h = h.replace(/class="[^"]*sqs-block-code[^"]*"/g, 'class="raw-embed"');
  // Gallery blocks reference a separate collection; leave a marker for the editor.
  h = h.replace(/<div class="sqs-block gallery-block[^"]*"[^>]*>[\s\S]*?<\/div><\/div>/g,
    '<p><em>[A photo gallery was here. See public/images/archive and scripts/gallery-images.json.]</em></p>');
  // Button blocks -> plain links.
  h = h.replace(/<a[^>]*class="sqs-block-button-element[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '<p><a class="button" href="$1">$2</a></p>');
  // Strip layout wrappers so turndown sees clean flow.
  h = h.replace(/<div class="sqs-layout[^"]*"[^>]*>/g, '<div>');
  h = h.replace(/<div class="(row sqs-row|col sqs-col-\d+ span-\d+|sqs-block [^"]*|sqs-block-content|image-block-outer-wrapper[^"]*|image-block-wrapper[^"]*|intrinsic|sqs-image-shape-container-element[^"]*|image-caption-wrapper|image-caption)"[^>]*>/g, '<div>');
  h = h.replace(/<span class="sqs-html-content">/g, '<span>');
  h = h.replace(/\sstyle="[^"]*"/g, '');
  h = h.replace(/\sdata-[a-z-]+="[^"]*"/g, '');
  h = h.replace(/&nbsp;/g, ' ');
  return h;
}

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*' });
td.use(gfm);
td.keep(['iframe']);
td.addRule('rawEmbed', {
  filter: (node) => node.nodeName === 'DIV' && node.classList.contains('raw-embed'),
  replacement: () => '',
});
td.remove(['style', 'script', 'noscript']);
td.addRule('images', {
  filter: 'img',
  replacement: (content, node) => {
    const src = localImage(node.getAttribute('src') || node.getAttribute('data-src') || '');
    const alt = (node.getAttribute('alt') || '').replace(/"/g, '');
    return src ? `\n\n![${alt}](${src})\n\n` : '';
  },
});
td.addRule('links', {
  filter: (node) => node.nodeName === 'A' && node.getAttribute('href'),
  replacement: (content, node) => {
    let href = node.getAttribute('href');
    href = href.replace(/^https?:\/\/(www\.)?tetondems\.org/, '');
    href = localImage(href);
    if (href.startsWith('/s/')) href = '/files/' + href.slice(3);
    const text = content.trim() || href;
    return `[${text}](${href})`;
  },
});

function toMarkdown(html) {
  let md = td.turndown(preprocess(html));
  md = md.replace(/^#{1,6}\s*$/gm, '');            // empty headings from <h3><br></h3>
  md = md.replace(/^(#{1,6}) \*\*(.+?)\*\*\s*$/gm, '$1 $2'); // bold inside headings
  if (/^# /m.test(md)) md = md.replace(/^(#{1,5}) /gm, '#$1 '); // page title is the h1; demote body headings
  return md.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim() + '\n';
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function isoDate(ms) {
  return new Date(ms).toISOString();
}
function write(dir, name, frontmatter, body) {
  const file = path.join(root, 'src/content', dir, `${name}.md`);
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, 'utf8');
    if (/^imported:\s*false/m.test(existing)) { console.log('skip (hand-edited)', file); return; }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fm = yaml.dump(frontmatter, { lineWidth: 1000, quotingType: '"' });
  fs.writeFileSync(file, `---\n${fm}---\n\n${body}`);
}

// ---------- Pages ----------
// Pages that are current and belong in the navigation. Everything else is archived
// (kept in git, not built) so nothing is lost.
const LIVE = new Set([
  '/home', '/who-we-are', '/elected-officials', '/2026-platform', '/logos-style-guide',
  '/local-action', '/state-action', '/national-action', '/apply-for-pco', '/sign-up', '/contact',
  '/how-to-vote-teton-county-wy', '/registration-dates-cutoffs-1',
  '/primary-election', '/general-election-info', '/voter-regulations-updates-3', '/links-and-resources',
  '/support-us', '/priorities',
]);
const SECTION = {
  '/local-action': 'Get Involved', '/state-action': 'Get Involved', '/national-action': 'Get Involved',
  '/apply-for-pco': 'Get Involved', '/sign-up': 'Get Involved', '/contact': 'Get Involved',
  '/who-we-are': 'Who We Are', '/elected-officials': 'Who We Are', '/2026-platform': 'Who We Are',
  '/logos-style-guide': 'Who We Are', '/priorities': 'Who We Are',
  '/candidates-campaigns': '2026 Voter Info', '/how-to-vote-teton-county-wy': '2026 Voter Info',
  '/registration-dates-cutoffs-1': '2026 Voter Info', '/primary-election': '2026 Voter Info',
  '/general-election-info': '2026 Voter Info', '/voter-regulations-updates-3': '2026 Voter Info',
  '/links-and-resources': '2026 Voter Info', '/support-us': 'Support Us',
};
// Clean slugs for the new site; old paths become redirects.
const SLUG = {
  '/home': 'about-teton-dems', '/how-to-vote-teton-county-wy': 'how-to-vote',
  '/registration-dates-cutoffs-1': 'registration-dates', '/general-election-info': 'general-election',
  '/voter-regulations-updates-3': 'voter-regulations', '/county-elections-1': 'county-elections-2020',
  '/town-council': 'town-council-2020', '/statewide-and-national-elections': 'statewide-national-2020',
  '/2024-teton-county-candidates': 'candidates-2022', '/platform': 'platform-2018',
  '/candidates-campaigns': 'candidates-campaigns-2026-prose',
  '/2022-teton-county-democratic-convention': 'convention-2022-info', '/2016caucus': 'caucus-2016-faq',
  '/surrogate': 'caucus-2016-surrogate-form', '/2016-party-platform': 'platform-2016',
  '/2020-teton-county-democratic-caucus': 'convention-2020',
};
const NAV_ORDER = {
  'Get Involved': ['/local-action', '/state-action', '/national-action', '/apply-for-pco', '/sign-up', '/contact'],
  'Who We Are': ['/who-we-are', '/elected-officials', '/2026-platform', '/priorities', '/logos-style-guide'],
  '2026 Voter Info': ['/candidates-campaigns', '/how-to-vote-teton-county-wy', '/registration-dates-cutoffs-1', '/primary-election', '/general-election-info', '/voter-regulations-updates-3', '/links-and-resources'],
  'Support Us': ['/support-us'],
};
const orderOf = (p) => {
  for (const [sec, list] of Object.entries(NAV_ORDER)) { const i = list.indexOf(p); if (i >= 0) return i + 1; }
  return 99;
};

let pageCount = 0;
for (const [oldPath, data] of Object.entries(pages)) {
  const col = data.collection || {};
  if (col.typeName === 'events' || col.typeName === 'products') continue;
  const slug = SLUG[oldPath] || oldPath.replace(/^\//, '');
  const live = LIVE.has(oldPath);
  const fm = {
    title: (col.title || slug).trim(),
    navTitle: (col.navigationTitle || col.title || slug).trim(),
    description: (col.description || '').replace(/<[^>]+>/g, '').trim() || undefined,
    section: SECTION[oldPath] || undefined,
    order: live ? orderOf(oldPath) : undefined,
    archived: !live,
    embeds: /list-manage\.com/.test(data.mainContent || '') ? ['mailchimp'] : undefined,
    squarespacePath: oldPath,
    updated: col.updatedOn ? isoDate(col.updatedOn).slice(0, 10) : undefined,
    imported: true,
  };
  Object.keys(fm).forEach((k) => fm[k] === undefined && delete fm[k]);
  write('pages', slug, fm, toMarkdown(data.mainContent));
  pageCount++;
}

// ---------- News ----------
for (const post of news) {
  const date = isoDate(post.publishOn || post.addedOn);
  const slug = `${date.slice(0, 10)}-${slugify(post.title).slice(0, 60)}`;
  const fm = {
    title: post.title.trim(),
    date: date.slice(0, 10),
    categories: post.categories || [],
    tags: post.tags || [],
    image: post.assetUrl ? localImage(post.assetUrl) : undefined,
    excerpt: post.excerpt ? post.excerpt.replace(/<[^>]+>/g, '').trim() || undefined : undefined,
    squarespacePath: `/news-1/${post.urlId}`,
    imported: true,
  };
  Object.keys(fm).forEach((k) => fm[k] === undefined && delete fm[k]);
  write('news', slug, fm, toMarkdown(post.body));
}

// ---------- Events ----------
const allEvents = [...events.upcoming, ...events.past];
for (const ev of allEvents) {
  const start = isoDate(ev.startDate);
  const slug = `${start.slice(0, 10)}-${slugify(ev.title).slice(0, 50)}`;
  const loc = ev.location || {};
  const fm = {
    title: ev.title.trim(),
    start,
    end: ev.endDate ? isoDate(ev.endDate) : undefined,
    location: loc.addressTitle || loc.addressLine1 ? {
      name: loc.addressTitle || undefined,
      address: [loc.addressLine1, loc.addressLine2].filter(Boolean).join(', ') || undefined,
    } : undefined,
    image: ev.assetUrl ? localImage(ev.assetUrl) : undefined,
    excerpt: ev.excerpt ? ev.excerpt.replace(/<[^>]+>/g, '').trim() || undefined : undefined,
    categories: ev.categories || [],
    squarespacePath: `/events/${ev.urlId}`,
    imported: true,
  };
  if (fm.location) Object.keys(fm.location).forEach((k) => fm.location[k] === undefined && delete fm.location[k]);
  Object.keys(fm).forEach((k) => fm[k] === undefined && delete fm[k]);
  write('events', slug, fm, toMarkdown(ev.body));
}

// ---------- Store (archived as a page) ----------
for (const item of store.items || []) {
  const fm = {
    title: item.title.trim(),
    navTitle: item.title.trim(),
    archived: true,
    squarespacePath: `/new-products/${item.urlId}`,
    imported: true,
  };
  const price = item.priceMoney ? `$${item.priceMoney.value}` : '';
  const body = `${toMarkdown(item.excerpt)}\n**Price:** ${price}\n\n${item.assetUrl ? `![${item.title}](${localImage(item.assetUrl)})\n` : ''}`;
  write('pages', 'shop-' + slugify(item.title).slice(0, 40), fm, body);
}

console.log(`pages: ${pageCount}, news: ${news.length}, events: ${allEvents.length}, store: ${(store.items || []).length}`);
