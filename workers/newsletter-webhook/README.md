# Newsletter events → pull request

When the party sends a Mailchimp newsletter, a Claude Code routine reads it and
opens a pull request adding its upcoming events to the site. Someone reviews and
merges that pull request; nothing is published on its own.

```
Mailchimp ── "campaign sent" webhook ──▶ this Worker ── POST /fire + token ──▶ routine ──▶ pull request
```

Mailchimp can't send the routine's token, so this small Cloudflare Worker sits
in between. It checks that the request came from Mailchimp, ignores anything
other than a sent newsletter, and starts the routine.

- `src/index.js`: the Worker
- `routine-prompt.md`: the routine's instructions

## Setup (one time)

### 1. Create the routine

1. Go to <https://claude.ai/code/routines> and click **New routine**. Name it
   "Newsletter events".
2. Paste all of `routine-prompt.md` into the instructions.
3. Repository: `tetondems/tetondems-website`.
4. Environment: **Full Network**. The **Default** environment only reaches an
   allowlist of developer sites and can't read the Mailchimp archive. If you
   would rather keep a restricted environment, set its network access to
   **Custom**, add `us13.campaign-archive.com`, and keep the default package
   managers.
5. Trigger: **API**.
6. Connectors: remove all of them. The routine needs none, and it could use any
   connector you leave in without asking.
7. Click **Create**. Then open the routine, choose **Edit** from the menu next to
   its name, and open the API trigger. Copy the URL, click **Generate token**,
   and copy the token. It's shown only once.

The routine runs as you: its pull requests carry your GitHub name, and each
newsletter uses one of your account's daily routine runs.

### 2. Deploy the Worker

From your clone of this repository, logged in to the party's Cloudflare account
(the one that hosts the site):

```zsh
npm install
cd workers/newsletter-webhook
npx wrangler login
npx wrangler deploy
openssl rand -hex 24
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put ROUTINE_FIRE_URL
npx wrangler secret put ROUTINE_TOKEN
```

`openssl` prints a random secret for the webhook address: paste it at the
`WEBHOOK_SECRET` prompt. Then paste the routine's URL and token at the next two.
`wrangler deploy` prints the Worker's address, something like
`https://tetondems-newsletter-webhook.<account>.workers.dev`. The webhook URL is
that address followed by `/mailchimp/` and the secret.

### 3. Test it

```zsh
hook='https://tetondems-newsletter-webhook.<account>.workers.dev/mailchimp/<secret>'
curl "$hook"
curl "$hook" --data-urlencode 'type=campaign' --data-urlencode 'data[id]=4c10da0b52' \
  --data-urlencode 'data[subject]=Upcoming Forums' --data-urlencode 'data[status]=sent' \
  --data-urlencode 'data[list_id]=16de9de15d'
```

Both should print `ok`. The second starts a real run for the Sept 28 "Upcoming
Forums" newsletter. It shows up in the routine's runs at
<https://claude.ai/code/routines> and should end with a pull request.

### 4. Connect Mailchimp

In Mailchimp: **Audience**, pick the General Mailing List, **Manage Audience →
Settings → Webhooks → Create New Webhook**.

- **Callback URL**: the webhook URL from step 2.
- Tick only **Campaign sending**. Untick subscribes, unsubscribes, profile
  updates, cleaned addresses, and email changes.
- Leave all the "Only send updates when a change is made…" boxes ticked.
- **Save**. Mailchimp checks the address first, and the Worker answers.

If Mailchimp shows a signing secret after you save (it's shown once), store it:

```zsh
npx wrangler secret put MAILCHIMP_SIGNING_SECRET
```

From then on the Worker also refuses deliveries without a valid Mailchimp
signature, including the test in step 3.

## Day to day

- Only newsletters that are actually sent to the General Mailing List start a
  run. Canceled sends and other audience events are ignored.
- Resends and corrections: the routine adds to its newsletter pull request if
  one is still open, and skips events already on the site.
- If the routine can't be reached, the Worker returns an error and Mailchimp
  retries for about 75 minutes. Logs are in the Cloudflare dashboard under
  **Workers & Pages → tetondems-newsletter-webhook → Logs**.
- To run it by hand, click **Run now** on the routine. Leave the text empty to
  use the newest newsletter, or paste the lines the Worker would send:

  ```
  Mailchimp campaign sent.
  Campaign id: 4c10da0b52
  Subject: Upcoming Forums
  Archive: https://us13.campaign-archive.com/?u=dcad50e134d0d8f88e0c9f3da&id=4c10da0b52
  ```

- To change what the routine does, edit `routine-prompt.md` and paste it into
  the routine again. The routine keeps its own copy and never reads this file,
  so a change here can't alter what runs under your account until you paste it.
- To rotate the token: routine → **Edit** → API trigger → **Regenerate**, then
  `npx wrangler secret put ROUTINE_TOKEN`.
- To pause: use the routine's on/off switch, or delete the webhook in Mailchimp.
- The routines API is a research preview. If Anthropic retires the
  `anthropic-beta` value in `src/index.js`, update it there. The two previous
  versions keep working while callers migrate.
