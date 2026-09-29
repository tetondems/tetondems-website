/**
 * Relays Mailchimp's "campaign sent" webhook to the Claude Code routine that
 * proposes a newsletter's events as a pull request (routine-prompt.md).
 * Mailchimp can't send the routine's bearer token, so this Worker checks that
 * the request came from Mailchimp and makes the call itself. Setup: README.md.
 */

// Research-preview API: https://code.claude.com/docs/en/routines#trigger-a-routine
const ROUTINE_HEADERS = {
  'anthropic-beta': 'experimental-cc-routine-2026-04-01',
  'anthropic-version': '2023-06-01',
  'content-type': 'application/json',
};

const bytes = (s) => new TextEncoder().encode(s);
const same = (a, b) => {
  const x = bytes(a);
  const y = bytes(b);
  return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
};

// Mailchimp's optional HMAC signing: "X-Mailchimp-Signature: t=<unix time>,v1=<hex>",
// an HMAC-SHA256 of "<t>.<raw body>". Deliveries over five minutes old are refused.
async function signed(request, body, secret) {
  const header = request.headers.get('x-mailchimp-signature') ?? '';
  const t = header.match(/\bt=(\d+)\b/)?.[1];
  const v1 = header.match(/\bv1=([0-9a-f]{64})\b/)?.[1];
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes(`${t}.${body}`)));
  return same([...mac].map((b) => b.toString(16).padStart(2, '0')).join(''), v1);
}

// Mailchimp posts form fields (type, data[id], data[subject], data[status], data[list_id]).
// JSON with the same shape is accepted too.
function campaignFrom(request, body) {
  if ((request.headers.get('content-type') ?? '').includes('application/json')) {
    const json = JSON.parse(body);
    return { type: json.type, ...json.data };
  }
  const form = new URLSearchParams(body);
  const data = (key) => form.get(`data[${key}]`) ?? undefined;
  return { type: form.get('type'), id: data('id'), subject: data('subject'), status: data('status'), list_id: data('list_id') };
}

export default {
  async fetch(request, env) {
    if (!env.WEBHOOK_SECRET || !same(new URL(request.url).pathname, `/mailchimp/${env.WEBHOOK_SECRET}`)) {
      return new Response('Not found', { status: 404 });
    }
    // Mailchimp checks the callback URL with a GET when the webhook is saved.
    if (request.method === 'GET' || request.method === 'HEAD') return new Response('ok');
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const body = await request.text();
    if (env.MAILCHIMP_SIGNING_SECRET && !(await signed(request, body, env.MAILCHIMP_SIGNING_SECRET))) {
      return new Response('Bad signature', { status: 401 });
    }
    let campaign;
    try {
      campaign = campaignFrom(request, body);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (campaign.type !== 'campaign' || campaign.status !== 'sent' || campaign.list_id !== env.MAILCHIMP_LIST_ID) {
      console.log(`Ignored: type=${campaign.type} status=${campaign.status} list=${campaign.list_id}`);
      return new Response('ignored');
    }
    if (!/^[0-9a-z]{6,20}$/i.test(campaign.id ?? '')) return new Response('Bad campaign id', { status: 400 });

    const subject = String(campaign.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const text = [
      'Mailchimp campaign sent.',
      `Campaign id: ${campaign.id}`,
      `Subject: ${subject}`,
      `Archive: ${env.MAILCHIMP_ARCHIVE}&id=${campaign.id}`,
    ].join('\n');
    const res = await fetch(env.ROUTINE_FIRE_URL, {
      method: 'POST',
      headers: { ...ROUTINE_HEADERS, authorization: `Bearer ${env.ROUTINE_TOKEN}` },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      // Any error status makes Mailchimp retry, at growing intervals, for about 75 minutes.
      console.error(`Routine fire failed for campaign ${campaign.id}: ${res.status} ${await res.text()}`);
      return new Response('Routine fire failed', { status: 502 });
    }
    const { claude_code_session_url } = await res.json().catch(() => ({}));
    console.log(`Campaign ${campaign.id} "${subject}" -> ${claude_code_session_url}`);
    return new Response('ok');
  },
};
