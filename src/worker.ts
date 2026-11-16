/**
 * Worker entrypoint.
 *
 *   /mcp                                      MCP (Streamable HTTP) — bearer-protected, served by KtMCP
 *   /authorize                                consent screen (src/auth/consent.ts)
 *   /token /register                          OAuth endpoints, handled by workers-oauth-provider
 *   /.well-known/oauth-*                      RFC 8414 / RFC 9728 discovery, handled by the provider
 *   GET /healthz                              liveness, unauthenticated
 */

import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { MCP_SCOPE, validateConfig } from './config.js';
import { handleAuthorize } from './auth/consent.js';
import { KtMCP } from './mcp/agent.js';

export { KtMCP };

const defaultHandler: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') {
      return Response.json({ status: 'ok', endpoint: validateConfig(env).resource });
    }
    if (url.pathname === '/authorize') return handleAuthorize(request, env);
    return new Response('Not found', { status: 404 });
  },
};

// The provider needs the public origin at construction (it is the OAuth issuer
// and resource identifier), and that comes from env, so build it on first request.
let provider: OAuthProvider<Env> | undefined;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!provider) {
      const { issuer, resource } = validateConfig(env);
      provider = new OAuthProvider<Env>({
        apiHandlers: { '/mcp': KtMCP.serve('/mcp') },
        defaultHandler,
        authorizeEndpoint: `${issuer}/authorize`,
        tokenEndpoint: `${issuer}/token`,
        clientRegistrationEndpoint: `${issuer}/register`,
        scopesSupported: [MCP_SCOPE],
        resourceMetadata: {
          resource,
          authorization_servers: [issuer],
          resource_name: 'CalTrack food logging',
        },
        requiredScopes: [MCP_SCOPE],
        accessTokenTTL: 60 * 60 * 24 * 30,
      });
    }
    return provider.fetch(request, env, ctx);
  },
};
