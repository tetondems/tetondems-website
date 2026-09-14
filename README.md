# tetondems.org

The website of the Teton County Democratic Party, Jackson Hole, Wyoming.

It is a static site: every page, news post, event, and candidate is a small
Markdown file in this repository. [Astro](https://astro.build) turns those files
into plain HTML, [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/) serves them for
free, and [Sveltia CMS](https://github.com/sveltia/sveltia-cms) gives officers a
browser-based editor at `/admin` that saves straight to this repository.

## Editing the site (no code required)

1. Go to <https://www.tetondems.org/admin> and sign in with GitHub.
2. Pick **Events**, **News**, **Candidates**, **Elected officials**, or **Pages** in the left sidebar.
3. Make your change and click **Save**. The site rebuilds and publishes itself
   within about a minute.

Things to know:

- **Events** need a name, a start time (Mountain time), and a place. The
  homepage shows the next three; `/events` shows all upcoming ones and the last
  two years of past ones.
- **Candidates** appear on `/candidates`, grouped by level. Untick *Show on
  site* to hide someone without deleting them. Ask candidates to confirm they
  own the rights to any photo before uploading it.
- **Pages** live in the navigation according to their *Menu section* and *Order
  in menu*. Tick *Archived* to keep a page in the repository but off the site.
  The Squarespace-era pages that were retired (2016 caucus, 2020 candidates,
  the store, and so on) are archived this way.
- **Site settings** holds the contact details, social links, the ActBlue
  donate link, and the Mailchimp form settings used across the site.
- The editor's media library shows everything under `public/images`. Put new
  uploads in the `uploads` subfolder and keep them under about 1 MB.

## Adding an editor

1. Ask them to create a free account at <https://github.com/signup> (any email
   works; they never need to touch GitHub itself after this).
2. In the `tetondems` organization, **People → Invite member**, enter their
   GitHub username, role **Member**. They accept the emailed invitation.
3. Members get write access to the site repository through the org's base
   permission, so nothing else to grant. To remove an editor later, remove them
   from the org.
4. Send them <https://www.tetondems.org/admin>. The first sign-in asks them to
   authorize the "Teton Dems site editor" app; that is expected.

Recommended: in the org's **Settings → Authentication security**, require
two-factor authentication. It adds one setup step for editors and keeps a
volunteer's stolen password from becoming a defaced party website.

## Working on the code

```bash
npm install
npm run dev        # http://localhost:4321, live reload
npm run build      # writes the site to dist/ (also regenerates public/_redirects)
npm run preview    # serves dist/ locally
```

Layout:

```
src/content/          Markdown content (pages, news, events, candidates, officials)
src/content.config.ts Schemas for each collection
src/data/site.json    Contact info, links, Mailchimp settings
src/pages/            Routes: index, [...slug] (pages), events/, news/, candidates, elected-officials
src/components/       Header, Footer, EventCard, MailchimpForm
src/styles/global.css Brand tokens and shared styles
public/admin/         Sveltia CMS (index.html + config.yml)
public/images/brand/  Logo package (SVG/PNG) from the 2018 brand guide
public/images/archive/ Every image from the Squarespace site, by content hash
public/files/         PDFs and the logo zip that were downloadable on the old site
scripts/              Importer and redirect generator (see below)
```

Brand: colors and type follow the 2018 Sharp Eye Deer brand style guide
(`public/files/180417-sed-tetondems-brand-style-guide-003.pdf`). Korolev and
Sutro are Adobe fonts, so the site uses Barlow Condensed and Zilla Slab from
Google Fonts in their place, with Georgia for body text as the guide specifies.

## One-time setup (do these before the domain moves)

### 1. GitHub

Create a GitHub organization for the party (for example `tetondems`) so the
repository is not tied to one volunteer's personal account, push this
repository there as `tetondems/tetondems-website`, and invite each editor as a
member with write access. Update `repo:` in `public/admin/config.yml` if you
pick a different name.

### 2. Cloudflare Workers (static assets)

1. In the Cloudflare dashboard, **Workers & Pages → Create → Import a
   repository**, choose `tetondems/tetondems-website`.
2. Build settings: build command `npm run build`, deploy command
   `npm run deploy`, root directory `/`. `wrangler.jsonc` in the repo tells
   Cloudflare to serve the `dist` folder as a static site; `.node-version`
   pins Node.
3. Every push to `main` deploys to the `*.workers.dev` address. Non-production
   branches get preview builds.

### 3. Editor sign-in (Sveltia CMS auth)

Sveltia needs a tiny OAuth relay so GitHub can sign editors in. Deploy
[sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) as a
Cloudflare Worker (free tier is fine):

1. Create a GitHub OAuth App under the organization's settings. Homepage URL
   `https://www.tetondems.org`, callback URL
   `https://sveltia-cms-auth.<your-account>.workers.dev/callback`.
2. Deploy the worker with the app's client id and secret as its
   `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` variables, and
   `ALLOWED_DOMAINS` set to `www.tetondems.org`.
3. Put the worker URL in `base_url:` in `public/admin/config.yml`.

Done September 2026: worker at `sveltia-cms-auth.crimson-mouse-af47.workers.dev`,
OAuth app "Teton Dems site editor" owned by the `tetondems` org.

### 4. Domain cutover (after the November 3, 2026 election)

Workers custom domains require the domain's DNS to be hosted at Cloudflare, so
the cutover moves DNS from GoDaddy to Cloudflare (free). The domain itself
stays registered at GoDaddy.

1. Cloudflare (party account) → **Add a domain** → `tetondems.org` → Free plan.
   Cloudflare scans the existing records. Check that these came across:
   the five Google `MX` records, the `TXT` SPF record (`v=spf1 …`), and the
   `google-site-verification` TXT. The four Squarespace `A` records and the
   `www` CNAME to `ext-sq.squarespace.com` can stay for now.
2. GoDaddy → the domain → **Nameservers → Change → Enter my own**, paste the
   two nameservers Cloudflare shows. Cloudflare emails when the zone is active
   (usually within an hour).
3. Cloudflare → DNS → delete the four Squarespace `A` records for
   `tetondems.org` and the `www` CNAME.
4. Cloudflare → Workers & Pages → `tetondems-website` → **Settings → Domains &
   Routes → Add → Custom domain**: add `tetondems.org`, then `www.tetondems.org`.
   Cloudflare creates the records and certificates itself.
5. Check `https://tetondems.org`, `https://www.tetondems.org`, an old
   Squarespace URL such as `/how-to-vote-teton-county-wy`, mail delivery to
   info@, and editor sign-in at `/admin`.
6. Before the March 8, 2027 renewal, turn off auto-renew in Squarespace and
   cancel the plan.

Optional afterwards: add DKIM (Google Admin → Apps → Gmail → Authenticate
email) and a DMARC record; neither existed on the old DNS.

## Scripts

- `scripts/import-squarespace.mjs <export-dir>` converted the Squarespace JSON
  export into `src/content/`. It skips any file whose front matter says
  `imported: false`, so hand-edited pages survive a re-run. The export itself
  came from the site's `?format=json` endpoints; re-run the export and importer
  right before cutover to pick up any last Squarespace edits.
- `scripts/build-redirects.mjs` regenerates `public/_redirects` from the
  `squarespacePath` front matter. It runs automatically before each build.
- `scripts/gallery-images.json` lists the candidate photos that were in
  Squarespace gallery blocks, for reference.
