/**
 * Environment validation. A Worker has no boot step, so this runs on first
 * request per isolate and fails loudly rather than serving a half-configured
 * auth server.
 */

export const MCP_SCOPE = 'caltrack:log';

export interface ValidatedConfig {
  /** Origin of the Worker, no trailing slash. OAuth issuer. */
  issuer: string;
  /** The MCP endpoint — the RFC 8707 resource identifier. */
  resource: string;
}

export function validateConfig(env: Env): ValidatedConfig {
  for (const name of ['KT_EMAIL', 'KT_PASSWORD', 'MCP_AUTH_PASSWORD', 'PUBLIC_URL'] as const) {
    if (typeof env[name] !== 'string' || env[name].trim() === '') {
      throw new Error(`Missing required binding ${name}`);
    }
  }
  if (env.MCP_AUTH_PASSWORD.length < 12) {
    throw new Error('MCP_AUTH_PASSWORD must be at least 12 characters — this guards a public endpoint');
  }
  const url = new URL(env.PUBLIC_URL);
  // Plain http is accepted only for local `wrangler dev`.
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('PUBLIC_URL must be an https:// URL — OAuth and MCP both require TLS');
  }
  return { issuer: url.origin, resource: `${url.origin}/mcp` };
}
