import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

// Bindings wrangler cannot infer: the OAuth provider injects this into env at runtime.
declare global {
  namespace Cloudflare {
    interface Env {
      OAUTH_PROVIDER: OAuthHelpers;
    }
  }
  interface Env {
    OAUTH_PROVIDER: OAuthHelpers;
  }
}
