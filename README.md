# kt-mcp

**🇨🇿 Česky** · [🇬🇧 English](README.en.md)

Self-hosted [MCP](https://modelcontextprotocol.io) server, který propojí AI agenta s vaším jídelníčkem na **kaloricketabulky.cz**.

Řeknete *„snědl jsem 3 vejce a banán"* — agent prohledá českou databázi potravin, vybere správnou porci a zapíše záznamy do vašeho skutečného jídelníčku. Oficiální aplikace zůstává zdrojem pravdy, takže prémiové funkce fungují dál.

Postaveno a otestováno s **Claudem** (desktop, mobil i web přes custom connector), ale server mluví standardním MCP přes HTTPS s OAuth 2.1, takže se může připojit jakýkoli agent, který podporuje vzdálené MCP servery.

> ## Neoficiální projekt, bez vazby na Dine4Fit
>
> kaloricketabulky.cz provozuje společnost **Dine4Fit, a.s.**, která s tímto
> projektem nemá nic společného a nijak ho neschvaluje. Veřejné API neexistuje;
> zde použité endpointy byly vyčteny z frontendového JavaScriptu samotného webu
> a mohou se kdykoli bez varování změnit nebo rozbít.
>
> Podmínky Dine4Fit udělují **osobní, nekomerční** licenci. Tento software je
> zveřejněn proto, abyste si mohli zautomatizovat přístup ke **svému vlastnímu
> účtu** — což licence dovoluje. Provozovat ho jako placenou nebo víceuživatelskou
> službu, případně dál šířit potravinová data, která vrací, je jiná věc a jde
> na váš vrub. Databáze patří Dine4Fit a je chráněna evropskými databázovými právy.
>
> Držte frekvenci požadavků na lidské úrovni. Nestavte na tom konkurenčního klienta.

## Co s tím jde dělat

Jakmile je agent připojený, přestane být zapisování jídel otravným proklikáváním vyhledávání. Pár vzorů, které v praxi fungují dobře:

- **Zapisujte mluvením.** „K snídani jsem měl rohlík se šunkou a dvě vejce." Agent vyhledá potraviny, zvolí přirozené porce (*kus (55 g)* místo odhadovaných gramů) a zapíše každou položku do správného denního jídla.

- **Zautomatizujte rutinu.** Pijete každý den dvě kávy s mlékem — proč je vypisovat? Pokud váš agent umí naplánované úlohy (Claude umí), řekněte mu to jednou: *„Každý den v 9:00 mi zapiš do jídelníčku dvě espressa s mlékem."* Denní konstanty se zapisují samy.

- **Vyfoťte talíř.** Pošlete agentovi fotku oběda a zeptejte se, co na ní je. Rozpozná potraviny, odhadne reálné gramáže z obrázku, spočítá kalorie — a po potvrzení zaloguje. Odhad je odhad, ale u míchaných talířů je to lepší než nezapsat nic.

- **Vyfoťte recept.** Vyfoťte recept z kuchařky nebo screenshot z webu a řekněte *„ulož mi to jako jídlo"*. Agent přečte suroviny, každou najde v databázi a vytvoří uložený recept — příště zalogujete jedním záznamem. Cestou můžete upravovat: *„vyměň smetanu za bílý jogurt a dej poloviční cukr."*

- **Ptejte se, jak vám jde den.** „Kolik kalorií mi dnes zbývá?" přečte denní součty přímo z jídelníčku.

## Nástroje

| Nástroj | Účel |
|---|---|
| `search_food` | Najde potraviny podle českého názvu nebo 13místného EAN kódu. Vrací id potraviny, které potřebují ostatní nástroje. |
| `get_food_portions` | Vypíše přirozené porce potraviny (`kus (55 g)`, `velký kus (60 g)`), takže „3 vejce" se zapíšou jako tři kusy, ne odhadnutá váha. |
| `get_food_nutrition` | Kalorie a makra pro dané množství, přepočítané samotným webem. Pouze čtení. |
| `log_food` | Zapíše záznam o jídle do jídelníčku. |
| `get_day_summary` | Přečte denní součty. |
| `create_meal` | Uloží recept složený z existujících potravin. |
| `list_my_meals` | Vypíše uložené recepty s jejich id a celkovou energií. |
| `log_meal` | Zaloguje celý uložený recept jako jeden záznam. |
| `delete_meal` | Smaže uložený recept. |

### Recepty

Web říká uloženému receptu *jídlo* (meal). `create_meal` ho složí
z existujících potravin, takže „3 vejce a 200 ml mléka" je jedna znovupoužitelná
položka místo dvou záznamů vypisovaných pokaždé znovu.

Množství se řídí stejným pravidlem jako `log_food`: `amount` počítá **jednotky**,
ne gramy. Vynecháte-li `unit_id`, použije se základní jednotka potraviny — gramy
u pevných potravin, mililitry u tekutin — tedy to, v čem se recepty běžně píší.
Když předáte `unit_id` z `get_food_portions`, počet ho násobí: 2 × `porce
(250 ml)` je 500 ml. Splést se je snadné: jeden raný test zadal 100 jednotek
`100 ml` a potichu vytvořil recept s deseti litry mléka.

## Jak to funguje

kaloricketabulky.cz je Spring MVC aplikace, kde každá routa odpoví i v JSON, když přidáte `?format=json` — vrací obálku `{code, data, message}`. Žádné oficiální ani dokumentované API neexistuje; endpointy byly zrekonstruovány z frontendového JavaScriptu webu. Úplná mapa je v `src/kt/client.ts`.

```
Agent  ──OAuth 2.1──►  kt-mcp  ──JSESSIONID──►  kaloricketabulky.cz
       ──MCP/HTTPS─►
```

Dvě hesla, každé hlídá něco jiného:

| Tajemství | Hlídá |
|---|---|
| `MCP_AUTH_PASSWORD` | Kdo smí tento server připojit k agentovi. Zadáváte ho jednou v prohlížeči při OAuth souhlasu. |
| `KT_PASSWORD` | Účet na kaloricketabulky.cz, do kterého nástroje zapisují. Nikdy neopouští server. |

### Co se stane při připojení

Žádný token ručně nevytváříte ani nekopírujete — OAuth to udělá za vás:

1. Do secretů Workeru vložíte svůj **login na kaloricketabulky.cz**
   (`KT_EMAIL` / `KT_PASSWORD`) a **přístupovou frázi, kterou si vymyslíte**
   (`MCP_AUTH_PASSWORD`). Přihlašovací údaje ke kalorickým tabulkám zůstávají
   na vašem serveru; agent je nikdy nevidí.
2. V agentovi přidáte URL konektoru, `https://<your-host>/mcp`. Agent se u
   vašeho serveru zaregistruje sám (dynamická registrace klientů).
3. Otevře se stránka v prohlížeči — obrazovka souhlasu vašeho serveru. Jednou
   zadáte `MCP_AUTH_PASSWORD`.
4. Váš server vygeneruje unikátní náhodný přístupový token a předá ho agentovi,
   který si ho uloží a automaticky obnovuje. Od té chvíle je každé volání
   nástroje ověřené tímto tokenem.

Protože si každý provozuje vlastní instanci, každý token patří jen jemu: váš
server zná jen váš jídelníček a tokeny vydává jen tomu, kdo zná vaši frázi.
Mezi instalacemi se nesdílí nic a žádná centrální služba neexistuje.

## Lokální vývoj

```bash
npm install
cp .dev.vars.example .dev.vars   # doplňte své údaje
npm test
npm run dev                      # http://localhost:8787
```

`GET /healthz` vrací výsledný veřejný MCP endpoint — nejrychlejší způsob, jak ověřit, že `PUBLIC_URL` je opravdu to, co si myslíte. Wrangler vyžaduje Node 22.12+.

## Vlastní hosting (Cloudflare Workers)

kt-mcp běží jako Cloudflare Worker na free plánu — žádný server, který by musel běžet, žádný tunel, žádné otevřené porty. Skládá se ze tří částí:

- [`agents`](https://github.com/cloudflare/agents) `McpAgent` — MCP server, jeden Durable Object na session (`src/mcp/agent.ts`)
- [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider) — OAuth 2.1 autorizační server; klienti, granty a tokeny jsou v KV (`src/worker.ts`)
- malá stránka souhlasu chráněná vaší frází (`src/auth/consent.ts`)

**1. Nastavte veřejnou URL.** V `wrangler.jsonc` nastavte `vars.PUBLIC_URL` na origin, na kterém Worker poběží — `https://kt-mcp.<vaše-subdomena>.workers.dev` nebo vlastní doména. Bez cesty a bez koncového lomítka.

**2. Nasaďte.**

```bash
npm install
npx wrangler deploy
```

KV namespace i Durable Object se vytvoří při prvním nasazení.

**3. Nastavte secrety.**

| Secret | Hodnota |
|---|---|
| `KT_EMAIL` / `KT_PASSWORD` | Váš login na kaloricketabulky.cz |
| `MCP_AUTH_PASSWORD` | Dlouhá přístupová fráze, kterou si zvolíte (min. 12 znaků) |

```bash
npx wrangler secret put KT_EMAIL
npx wrangler secret put KT_PASSWORD
npx wrangler secret put MCP_AUTH_PASSWORD
```

**4. Ověřte nasazení**, než ho připojíte k agentovi:

```bash
./scripts/verify-deployment.sh https://<your-host>
```

**5. Připojte agenta.** V Claudovi: Settings → Connectors → Add custom connector → zadejte `https://<your-host>/mcp`. Agent se sám zaregistruje, otevře stránku souhlasu a vy jednou zadáte `MCP_AUTH_PASSWORD`. Ostatní MCP klienti mají vlastní postup „přidat vzdálený MCP server" se stejnou URL.

### Pozdější změna domény

`PUBLIC_URL` je OAuth issuer a identifikátor zdroje podle RFC 8707, takže tokeny vydané pod starým hostname jsou po přesunu správně odmítnuty. Změňte `vars.PUBLIC_URL`, znovu nasaďte, spusťte ověřovací skript a v agentovi konektor odeberte a přidejte znovu.

### Zaseklí?

Pokud při vlastním hostování narazíte, založte [GitHub issue](../../issues) — rád pomůžu.

## Autentizace

Worker je sám sobě OAuth 2.1 autorizačním serverem (přes `@cloudflare/workers-oauth-provider`) a implementuje, co MCP specifikace od chráněného zdroje vyžaduje:

- `/.well-known/oauth-protected-resource/mcp` — RFC 9728 discovery
- `/.well-known/oauth-authorization-server` — RFC 8414 discovery
- `/authorize`, `/token`, `/register` — authorization code + PKCE, dynamická registrace klientů, rotace refresh tokenů

Přístupové tokeny žijí 30 dní a jsou uložené v KV, takže redeploy nevynutí nové připojení konektoru.

### Co chrání přístupová fráze

`MCP_AUTH_PASSWORD` je jediná cesta k získání tokenu. Každý požadavek na `/mcp`
vyžaduje platný bearer token a tokeny vydává výhradně formulář souhlasu po
porovnání s frází v konstantním čase. Formulář je cookie navázaný na prohlížeč,
který ho načetl, takže cross-site POST žádost schválit nemůže.
`scripts/security-audit.sh` to testuje zvenčí: neautentizovaná volání i volání
s padělaným tokenem jsou odmítnuta, vymyšlené autorizační kódy a refresh tokeny
jsou odmítnuty a žádný veřejný endpoint nevydává credential.

Dvě věci jsou veřejné záměrně a bezpečně: OAuth discovery dokumenty (vyžaduje je
specifikace) a dynamická registrace klientů. Registrace klienta útočníkovi nic
nedá — token bez fráze stále nezíská.

Hrubou sílu omezuje rate-limit binding Workers (`AUTH_LIMITER` v
`wrangler.jsonc`): 10 pokusů o heslo za minutu na IP klienta, počítaných při každém pokusu.

Zbytková rizika, o kterých je dobré vědět: kdokoli s frází má plný přístup;
granty lze odvolat smazáním záznamů v KV namespace; a protože registrace klientů
je otevřená, phishingový odkaz na stránku souhlasu by mohl frázi zachytit,
kdybyste ji tam zadali — před autorizací zkontrolujte jméno klienta a host
přesměrování zobrazené ve formuláři.

## Omezení

- **Nedokumentovaný upstream.** Dine4Fit tu nic negarantuje; refactoring frontendu může bez varování změnit tvary odpovědí. Klient při čemkoli nečekaném vyhodí chybu místo hádání, takže se rozbití projeví hlasitou chybou, ne špatným počtem kalorií.
- **`md5(hesla)` je ekvivalent hesla.** Web hashuje heslo na klientovi, hash je tedy stejně citlivý jako heslo samotné. Podle toho s `KT_PASSWORD` zacházejte.
- **Jeden účet na instanci.** Server se přihlašuje k jedinému účtu kaloricketabulky.cz. Dva lidé, dvě nasazení Workeru.
- **Osobní použití.** Automatizace zápisů do vlastního účtu je mnohem měkčí pozice než hromadný scraping, ale pořád je mimo cokoli, co Dine4Fit posvětil. Držte frekvenci požadavků na lidské úrovni a nestavte na tom konkurenčního klienta.
- **Čtení jednotlivých záznamů dne** je nejméně ověřený endpoint; `get_day_summary` posílá odpověď webu beze změny dál, protože její tvar není plně zdokumentovaný.
- **Část porce receptu zalogovat nejde.** Formulář pro přidání jídla sice nabízí `count` proti pseudo-jednotkám porce, procenta a gramy, ale server ho ignoruje a zaloguje vždy celý recept — měřeno na receptu o 249 kcal přidalo 0,5 porce i polovina váhy plných 249. `log_meal` proto nemá argument `portions`; když snědená byla jen část receptu, zalogujte suroviny jednotlivě přes `log_food`.

## Licence

[MIT](LICENSE). Databáze potravin a služba kaloricketabulky.cz patří Dine4Fit, a.s. — tato licence pokrývá pouze kód v tomto repozitáři.
