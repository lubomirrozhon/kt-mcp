/**
 * The single-user consent screen.
 *
 * workers-oauth-provider owns the protocol (discovery, registration, PKCE,
 * tokens, storage in KV). This file owns only the one decision it delegates:
 * "is this person allowed to connect?" — answered by MCP_AUTH_PASSWORD.
 *
 * Uses the provider's beginConsent/approveConsent pair, which binds the form
 * to the browser with a cookie, so a cross-site POST cannot approve a request.
 */

import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { MCP_SCOPE } from '../config.js';

/** Constant-time comparison that tolerates differing lengths. */
async function secretMatches(supplied: string, expected: string): Promise<boolean> {
  // Hash both sides so the comparison runs over fixed-length inputs.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(supplied)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function page(body: string, status: number, headers: Headers = new Headers()): Response {
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(body, { status, headers });
}

function consentPage(clientName: string, redirectHost: string, handle: string, error: string | null): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to CalTrack food logging</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 26rem; margin: 4rem auto; padding: 0 1.25rem; line-height: 1.5; }
  h1 { font-size: 1.25rem; margin-bottom: .25rem; }
  p { color: #666; margin-top: 0; }
  label { display: block; font-weight: 600; margin: 1.5rem 0 .35rem; }
  input[type=password] { width: 100%; padding: .6rem .7rem; font-size: 1rem; border: 1px solid #999; border-radius: .4rem; box-sizing: border-box; }
  button { margin-top: 1rem; width: 100%; padding: .65rem; font-size: 1rem; font-weight: 600; border: 0; border-radius: .4rem; background: #b5540b; color: #fff; cursor: pointer; }
  .error { background: #fdecea; color: #8a1c12; padding: .6rem .75rem; border-radius: .4rem; margin-top: 1rem; }
  .client { font-size: .85rem; color: #777; margin-top: 1.5rem; border-top: 1px solid #ddd; padding-top: .75rem; }
</style></head><body>
<h1>Connect to your food diary</h1>
<p>This grants access to log food into your kaloricketabulky.cz account.</p>
${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
<form method="POST">
  <input type="hidden" name="handle" value="${escapeHtml(handle)}">
  <label for="password">Access password</label>
  <input type="password" id="password" name="password" autocomplete="current-password" autofocus required>
  <button type="submit">Authorize</button>
</form>
<div class="client">Requested by <strong>${escapeHtml(clientName)}</strong>, redirecting to <strong>${escapeHtml(redirectHost)}</strong></div>
</body></html>`;
}

export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const oauth: OAuthHelpers = env.OAUTH_PROVIDER;

  let authRequest;
  try {
    // The form posts back to this same URL, so the query still carries the
    // original OAuth parameters on POST — nothing is trusted from the body.
    authRequest = await oauth.parseAuthRequest(request);
  } catch (error) {
    return new Response(`Invalid authorization request: ${error instanceof Error ? error.message : String(error)}`, {
      status: 400,
    });
  }
  const consent = await oauth.describeConsent(authRequest);

  if (request.method === 'GET') {
    const tx = await oauth.beginConsent(authRequest);
    return page(consentPage(consent.clientName, consent.redirectHost, tx.handle, null), 200, tx.headers);
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const form = await request.formData();
  const handle = form.get('handle');
  const password = form.get('password');
  if (typeof handle !== 'string' || typeof password !== 'string') {
    return new Response('Bad request', { status: 400 });
  }

  // Count every attempt, right or wrong, so guessing is throttled per IP.
  if (env.AUTH_LIMITER) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (!(await env.AUTH_LIMITER.limit({ key })).success) {
      return page(consentPage(consent.clientName, consent.redirectHost, handle, 'Too many attempts. Wait a minute.'), 429);
    }
  }

  // Check the password *before* approveConsent: that call burns the one-shot
  // handle, and a typo shouldn't force a page reload.
  if (!(await secretMatches(password, env.MCP_AUTH_PASSWORD))) {
    return page(consentPage(consent.clientName, consent.redirectHost, handle, 'Incorrect password.'), 401);
  }

  try {
    const approved = await oauth.approveConsent(request, handle, { scope: [MCP_SCOPE] });
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      userId: 'owner', // single-user: there is exactly one principal
      metadata: {},
      scope: [MCP_SCOPE],
      props: {},
    });
    const headers = new Headers(approved.headers);
    headers.set('Location', redirectTo);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    // Expired, replayed, or foreign handle: start over from the client.
    return new Response(`Consent could not be completed: ${error instanceof Error ? error.message : String(error)}. Restart the connection from your agent.`, {
      status: 400,
    });
  }
}
