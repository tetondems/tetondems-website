import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Menu sections. "Voter Info" is shown with the election year from site settings.
const SECTIONS = ['Get Involved', 'Who We Are', 'Voter Info', 'Support Us'] as const;

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    navTitle: z.string().optional(),
    description: z.string().optional(),
    section: z.enum(SECTIONS).optional(),
    order: z.number().optional(),
    hidden: z.boolean().default(false),
    embeds: z.array(z.enum(['mailchimp', 'donate'])).default([]),
    hero: z.string().optional(),
    squarespacePath: z.string().optional(),
    updated: z.coerce.date().optional(),
    imported: z.boolean().optional(),
  }),
});

// Retired pages (mostly from the Squarespace era). Kept for reference and for
// redirects; never built. To bring one back, move the file into src/content/pages.
const archive = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/archive' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    squarespacePath: z.string().optional(),
    updated: z.coerce.date().optional(),
    imported: z.boolean().optional(),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    excerpt: z.string().optional(),
    squarespacePath: z.string().optional(),
    imported: z.boolean().optional(),
  }),
});

const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: z.object({
    title: z.string(),
    start: z.coerce.date(),
    end: z.coerce.date().optional(),
    location: z
      .object({ name: z.string().optional(), address: z.string().optional(), url: z.string().optional() })
      .optional(),
    image: z.string().optional(),
    excerpt: z.string().optional(),
    categories: z.array(z.string()).default([]),
    link: z.string().optional(),
    squarespacePath: z.string().optional(),
    imported: z.boolean().optional(),
  }),
});

const candidates = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/candidates' }),
  schema: z.object({
    name: z.string(),
    office: z.string(),
    level: z.enum(['Town of Jackson', 'Teton County', 'Wyoming Legislature', 'Statewide']),
    order: z.number().default(50),
    photo: z.string().optional(),
    website: z.string().optional(),
    facebook: z.string().optional(),
    instagram: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    incumbent: z.boolean().default(false),
    election: z.string().default('2026 General'),
    active: z.boolean().default(true),
  }),
});

const officials = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/officials' }),
  schema: z.object({
    name: z.string(),
    office: z.string(),
    level: z.enum(['Wyoming Legislature', 'Teton County', 'Town of Jackson']),
    order: z.number().default(50),
    photo: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    contactUrl: z.string().optional(),
    website: z.string().optional(),
    active: z.boolean().default(true),
  }),
});

export const collections = { pages, archive, news, events, candidates, officials };
