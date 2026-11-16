# kt-mcp

[🇨🇿 Česky](README.md) · **🇬🇧 English**

A self-hosted [MCP](https://modelcontextprotocol.io) server that connects an AI agent to your **kaloricketabulky.cz** food diary.

You say *"I ate 3 eggs and a banana"* — the agent searches the Czech food database, picks the right portion unit, and writes the entries into your real diary. The official app stays the source of truth, so premium features keep working.

Built and tested with **Claude** (desktop, mobile and web via a custom connector), but it speaks standard MCP over HTTPS with OAuth 2.1, so any agent that supports remote MCP servers can connect.

> ## Unofficial, and not affiliated with Dine4Fit
>
> kaloricketabulky.cz is operated by **Dine4Fit, a.s.**, who are not involved in
> this project and do not endorse it. There is no public API; the endpoints used
> here were read out of the site's own frontend JavaScript and may change or
> break without notice.
>
> Dine4Fit's terms grant a **personal, non-commercial** licence. This software is
> published so that you can automate access to **your own account** — which is
> what that licence permits. Running it as a paid or multi-tenant service, or
> redistributing the food data it returns, is a different matter and is on you.
> The database is Dine4Fit's and is protected by EU database rights.
>
> Keep the request rate human. Don't build a competing client on it.

## What you can do with it

Once connected, food logging stops being a chore of tapping through search screens. Some patterns that work well in practice:

- **Log by talking.** "I had a rohlík with ham and two eggs for breakfast." The agent searches, resolves natural portions (*kus (55 g)* instead of guessed grams), and logs each item into the right meal slot.

- **Automate your routine.** You drink two coffees with milk every day — why type it? If your agent supports scheduled tasks (Claude does), tell it once: *"Every day at 9:00, log two espressos with milk into my diary."* Your daily constants log themselves.

- **Photograph your plate.** Send the agent a photo of your lunch and ask what's on it. It identifies the foods, estimates real gram amounts from the picture, tells you the calories — and logs it when you confirm. Estimates are estimates, but for mixed plates it beats not logging at all.

- **Photograph a recipe.** Snap a recipe from a cookbook or a screenshot from the web and say *"save this as a meal"*. The agent reads the ingredients, finds each one in the database, and creates a reusable saved recipe — one entry to log next time you cook it. You can edit on the way in: *"swap the cream for white yogurt and halve the sugar."*

- **Ask how your day is going.** "How many calories do I have left?" reads today's totals straight from the diary.

## Tools

| Tool | Purpose |
|---|---|
| `search_food` | Find foods by Czech name or 13-digit EAN barcode. Returns the food id the other tools need. |
| `get_food_portions` | List a food's natural portion units (`kus (55 g)`, `velký kus (60 g)`) so "3 eggs" logs as three pieces rather than an estimated weight. |
| `get_food_nutrition` | Calories and macros for a quantity, scaled by the site itself. Read-only. |
| `log_food` | Write an eating record into the diary. |
| `get_day_summary` | Read back a day's totals. |
| `create_meal` | Save a recipe built from existing foods. |
| `list_my_meals` | List saved recipes with their ids and total energy. |
| `log_meal` | Log a whole saved recipe into the diary as one entry. |
| `delete_meal` | Delete a saved recipe. |

### Recipes

The site calls a saved recipe a *meal*. `create_meal` composes one from
existing foods, so "3 eggs and 200 ml milk" becomes a single reusable item
rather than two entries typed out every time.

Quantities follow the same rule as `log_food`: `amount` counts **units**, not
grams. Omitting `unit_id` selects the food's own base unit, which is grams for
solids and millilitres for liquids — what recipes are normally written in. Pass
a `unit_id` from `get_food_portions` and the count multiplies it, so 2 of
`porce (250 ml)` is 500 ml. Getting this backwards is easy: an early test asked
for 100 of the `100 ml` unit and quietly created a recipe containing ten litres
of milk.

## How it works

kaloricketabulky.cz is a Spring MVC app where every route also answers JSON if you append `?format=json`, returning a `{code, data, message}` envelope. There is no official or documented API — these endpoints were recovered from the site's own frontend JavaScript. See `src/kt/client.ts` for the full map.

```
Agent  ──OAuth 2.1──►  kt-mcp  ──JSESSIONID──►  kaloricketabulky.cz
       ──MCP/HTTPS─►
```

Two credentials, doing different jobs:

| Secret | Guards |
|---|---|
| `MCP_AUTH_PASSWORD` | Who may connect this server to an agent. You type it once in a browser during the OAuth consent step. |
| `KT_PASSWORD` | The kaloricketabulky.cz account the tools write to. Never leaves the server. |

### What happens when you connect

You never create or copy a token by hand — OAuth does it for you:

1. You put your **kaloricketabulky.cz login** (`KT_EMAIL` / `KT_PASSWORD`) and a
   **passphrase you invent** (`MCP_AUTH_PASSWORD`) into the Worker's secrets. The kaloricketabulky.cz credentials stay on your server; the agent
   never sees them.
2. In your agent you add the connector URL, `https://<your-host>/mcp`. The agent
   registers itself with your server automatically (dynamic client registration).
3. A browser page opens — your server's consent screen. You type
   `MCP_AUTH_PASSWORD` once.
4. Your server mints a unique, random access token and hands it to the agent,
   which stores it and refreshes it automatically. From then on every tool call
   is authenticated with that token.

Because every person runs their own instance, every token is theirs alone: your
server knows only your diary and only mints tokens for whoever knows your
passphrase. Nothing is shared between installations, and there is no central
service.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in your credentials
npm test
npm run dev                      # http://localhost:8787
```

`GET /healthz` returns the resulting public MCP endpoint — the quickest way to check that `PUBLIC_URL` is really what you think it is. Wrangler needs Node 22.12+.

## Self-hosting (Cloudflare Workers)

kt-mcp runs as a Cloudflare Worker on the free plan — no server to keep alive, no tunnel, no open ports. It is built from three pieces:

- [`agents`](https://github.com/cloudflare/agents) `McpAgent` — the MCP server, one Durable Object per session (`src/mcp/agent.ts`)
- [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider) — the OAuth 2.1 authorization server; clients, grants and tokens live in KV (`src/worker.ts`)
- a small consent page guarded by your passphrase (`src/auth/consent.ts`)

**1. Set the public URL.** In `wrangler.jsonc`, set `vars.PUBLIC_URL` to the origin the Worker will be served from — `https://kt-mcp.<your-subdomain>.workers.dev`, or a custom domain you attach to it. No path, no trailing slash.

**2. Deploy.**

```bash
npm install
npx wrangler deploy
```

The KV namespace and the Durable Object are created on first deploy.

**3. Set the secrets.**

| Secret | Value |
|---|---|
| `KT_EMAIL` / `KT_PASSWORD` | Your kaloricketabulky.cz login |
| `MCP_AUTH_PASSWORD` | A long passphrase you choose (min. 12 characters) |

```bash
npx wrangler secret put KT_EMAIL
npx wrangler secret put KT_PASSWORD
npx wrangler secret put MCP_AUTH_PASSWORD
```

**4. Verify the deployment** before connecting an agent:

```bash
./scripts/verify-deployment.sh https://<your-host>
```

**5. Connect your agent.** In Claude: Settings → Connectors → Add custom connector → enter `https://<your-host>/mcp`. The agent registers itself, opens the consent page, and you type `MCP_AUTH_PASSWORD` once. Other MCP clients have their own "add remote MCP server" flow with the same URL.

### Changing the domain later

`PUBLIC_URL` is the OAuth issuer and the RFC 8707 resource identifier, so tokens issued under the old hostname are correctly rejected after a move. Change `vars.PUBLIC_URL`, redeploy, re-run the verify script, then remove and re-add the connector in your agent.

### Stuck?

If you hit a wall self-hosting, open a [GitHub issue](../../issues) — happy to help you get unstuck.

## Authentication

The Worker is its own OAuth 2.1 authorization server (via `@cloudflare/workers-oauth-provider`), implementing what the MCP spec requires of a protected resource:

- `/.well-known/oauth-protected-resource/mcp` — RFC 9728 discovery
- `/.well-known/oauth-authorization-server` — RFC 8414 discovery
- `/authorize`, `/token`, `/register` — authorization code + PKCE, dynamic client registration, refresh-token rotation

Access tokens live 30 days and are stored in KV, so redeploying does not force you to reconnect.

### What the passphrase protects

`MCP_AUTH_PASSWORD` is the only way to obtain a token. Every request to `/mcp`
requires a valid bearer token, and tokens are minted solely by the consent form
after a constant-time comparison against that passphrase. The form is bound to
the browser that loaded it by a cookie, so a cross-site POST cannot approve a
request. `scripts/security-audit.sh` probes this from outside: unauthenticated
and forged-token calls are rejected, fabricated authorization codes and refresh
tokens are rejected, and no public endpoint exposes a credential.

Two things are public by design and safe to be so: OAuth discovery documents
(the spec requires them) and dynamic client registration. Registering a client
gets an attacker no further — they still cannot obtain a token without the
passphrase.

Brute force is bounded by a Workers rate-limit binding (`AUTH_LIMITER` in
`wrangler.jsonc`): 10 password attempts per minute per client IP, counted on every attempt.

Residual risks worth knowing: anyone holding the passphrase has full access;
grants can be revoked by deleting the KV namespace's entries; and because client
registration is open, a phishing link to the consent page could capture the
passphrase if you typed it there — check the client name and redirect host shown
on the form before authorizing.

## Caveats

- **Undocumented upstream.** Dine4Fit guarantees nothing here; a frontend refactor could change payload shapes without warning. The client throws on anything unexpected rather than guessing, so breakage surfaces as a loud error rather than a wrong calorie count.
- **`md5(password)` is password-equivalent.** The site hashes the password client-side, so the hash is as sensitive as the password. Treat `KT_PASSWORD` accordingly.
- **One account per instance.** The server logs into a single kaloricketabulky.cz account. Two people, two Worker deployments.
- **Personal use.** Automating entry into your own account is a far softer position than bulk scraping, but it is still outside anything Dine4Fit has sanctioned. Keep the request rate human, and don't build a competing client on it.
- **Reading a day's individual entries** is the least-verified endpoint; `get_day_summary` passes the site's response through unmodified because its shape isn't fully documented.
- **Partial portions of a recipe cannot be logged.** The meal-add form offers a `count` against portion, percent and gram pseudo-units, but the server ignores it and logs the whole recipe regardless — measured against a 249 kcal recipe, both 0.5 portions and half the total weight added the full 249. `log_meal` therefore takes no `portions` argument; log the ingredients individually with `log_food` when only part of a recipe was eaten.

## License

[MIT](LICENSE). The food database and the kaloricketabulky.cz service belong to Dine4Fit, a.s. — this licence covers only the code in this repository.
