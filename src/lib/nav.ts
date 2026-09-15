import { getCollection } from 'astro:content';
import site from '../data/site.json';

export interface NavItem { title: string; href: string; order: number }
export interface NavGroup { label: string; href?: string; items?: NavItem[] }

/** Display label for a menu section; "Voter Info" carries the election year. */
export const sectionLabel = (name: string) => (name === 'Voter Info' ? `${site.election.year} Voter Info` : name);

/** The main menu, built from CMS pages plus the built-in pages, honoring site settings. */
export async function buildNav(): Promise<NavGroup[]> {
  const pages = (await getCollection('pages', ({ data }) => !data.hidden && data.section))
    .sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99));

  const builtIn: Record<string, NavItem[]> = {
    'Who We Are': [{ title: 'Elected Officials', href: '/elected-officials', order: 2 }],
    'Voter Info': site.election.showCandidates ? [{ title: 'Candidates & Campaigns', href: '/candidates', order: 1 }] : [],
  };
  const section = (name: string): NavItem[] =>
    [...pages.filter((p) => p.data.section === name).map((p) => ({ title: p.data.navTitle ?? p.data.title, href: `/${p.id}`, order: p.data.order ?? 99 })), ...(builtIn[name] ?? [])]
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  const groups: NavGroup[] = [
    { label: 'Upcoming Events', href: '/events' },
    { label: 'Get Involved', items: section('Get Involved') },
    { label: 'Who We Are', items: section('Who We Are') },
    { label: sectionLabel('Voter Info'), items: section('Voter Info') },
  ];
  if (site.news.show) groups.push({ label: 'News', href: '/news' });
  return groups.filter((g) => g.href || (g.items && g.items.length));
}
