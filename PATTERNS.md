# Migration Patterns

Architecture decisions and reusable patterns developed during the Top Knobs Hardware Shopify migration. Portable to similar high-catalog hardware/lifestyle e-commerce migrations.

For project-specific values (hex colors, rotation lists, brand strings), see the **Project Values** section at the end.

---

## 1. Catalog dedup via primary-finish tag + family metafield

**Problem.** When a brand sells the same physical design in 6–8 finishes, importing each finish as a separate Shopify product means collection pages show "the same" item N times in a row before any other design appears. Each finish-SKU is technically distinct, so Shopify can't dedupe on its own.

**Approach.**
1. Group products into "design families" by parsing SKU/title patterns (e.g. `TPK-TK3438PN` and `TPK-TK3438PC` are the same `TK3438` family).
2. Tag exactly one product per family with a `primary-finish` tag, distributed across a rotation list of popular finishes for visual variety.
3. Write two metafields to every product in the family:
   - `<brand>.family_finishes` (json) — array of `{name, handle}` for every sister product
   - `<brand>.finish_name` (single line text) — that product's own finish name
4. Filter collection-page rendering Liquid to only `primary-finish`-tagged products.
5. Render product card swatches from `family_finishes` so shoppers see "available in N finishes" via colored dots.
6. PDP shows full finish picker pulled from the same metafield, with `finish_name` driving the active-state highlight.

**Code locations.**
- `sections/tk-collection.liquid` — primary-finish filter on `collection.products`
- `snippets/product-card.liquid` — small swatches under card title
- `sections/tk-product.liquid` — large swatches with names on PDP
- `snippets/tk-finish-swatch.liquid` — reusable swatch renderer with central hex map

**Gotchas.**
- Distribution matters. If you tag the same finish as primary across all designs, collection pages become a wall of one color. Use a rotation list cycling through 6–8 finishes alphabetically by family root for even distribution.
- Liquid-side filtering of `collection.products` breaks pagination counts (a page may show 23/24 instead of 24/24). Acceptable; users don't notice.
- The metafield must be written to *every* product in the family, not just the primary. Non-primary products are still shoppable directly via search/PDP and need swatches to navigate to siblings.
- Bulk operations require GraphQL Admin API. Sidekick can't bulk-tag at scale.
- Run periodically as new products are added — the tagging only catches what existed at run time. Commit the tagging script to the repo and run after each catalog import.

---

## 2. Reusable hex-driven swatch snippet

**Problem.** Finish swatches need to render consistently across the homepage finish browser, the navigation mega-menu, product cards, PDPs, and collection filter sidebars. Hardcoding hex values per use site means updates miss locations.

**Approach.**
- One Liquid snippet (`tk-finish-swatch.liquid`) accepts a finish name string + size + extra class.
- Snippet contains a central `case/when` map from finish name → hex.
- All swatch renderings call the snippet with the finish name.
- The snippet outputs a `<span class="tk-swatch" data-finish="<name>" style="background: <hex>;">`.
- Companion CSS file (`tk-finish-swatches.css`) provides the metallic surface treatment: inset highlights, drop shadows, glossy overlay via `::after`.

**Why central map vs CSS attribute selectors.** CSS attribute selectors (`.tk-swatch[data-finish="polished-nickel"]`) work but require a stylesheet edit per new finish. Central Liquid map is one-stop edit, with CSS handling only the surface treatment that's identical across finishes.

**Code locations.**
- `snippets/tk-finish-swatch.liquid` — the central map
- `assets/tk-finish-swatches.css` — surface treatment CSS

**Gotchas.**
- For finishes not in the map, the snippet falls back to a circle with the finish's first letter. Visible at scale during development; useful as a "what's missing" signal.
- The snippet's inline `style="background: hex"` is the base color. The metallic `::after` overlay is the same for all finishes — that's intentional. Per-finish texture variation lives in the *family* CSS classes (see Pattern 7).
- Light finishes (white, glass, polished chrome) need a stronger border or they disappear on white backgrounds. The CSS file targets `[data-finish*="white"]` etc. with stronger border-color.

---

## 3. Theme-level default-sort redirect

**Problem.** Shopify's default collection sort is per-collection (`Online Store → Collections → [collection] → Sort order`). With thousands of collections, manually setting each is impractical. Default fallback when nothing's set is alphabetical, which clusters duplicate finish-SKUs together.

**Approach.** Inline JavaScript at the top of the collection section:
```js
(function () {
  var url = new URL(window.location.href);
  if (!url.searchParams.has('sort_by')) {
    url.searchParams.set('sort_by', '<default>');
    window.location.replace(url.toString());
  }
})();
```
Wrapped with a Liquid value that reads from a section schema setting so the default is editable in Theme Editor. Preserves filters/page params through the redirect.

**Code locations.**
- `sections/tk-collection.liquid` (top of file, before content)

**Gotchas.**
- There's a tiny visual flicker (page loads, then redirects). Inline script in `<head>` would be cleaner but requires section-level access to `<head>`.
- Default `best-selling` requires real sales data; on dev stores it's basically random. Use `price-descending` or `created-descending` as initial default; switch to `best-selling` once orders accumulate.
- The redirect's `?sort_by=X` becomes part of the URL. Slightly ugly but acceptable.
- Make the default selectable via section schema, not hardcoded — different brands prefer different defaults, and brands change their minds.

---

## 4. Multi-source image fallback in sections

**Problem.** Theme migrations can't easily ship Theme Editor uploads (those live in admin's Files area, not the theme repo). But sections that take images via `image_picker` only resolve admin uploads. Result: a freshly-deployed theme has empty image slots until someone manually uploads in admin.

**Approach.** Sections accept images from three sources, in priority order:
1. **Theme Editor `image_picker`** — preferred, admin-controllable
2. **Bundled asset filename** (text setting + `| asset_url` in Liquid) — ships with the theme repo via `/assets/`
3. **Placeholder div** — last-resort visual fallback

```liquid
{%- if block.settings.image != blank -%}
  {{- block.settings.image | image_url: width: 800 | image_tag ... -}}
{%- elsif block.settings.image_asset != blank -%}
  <img src="{{ block.settings.image_asset | asset_url }}" ... />
{%- else -%}
  <div class="...--placeholder"></div>
{%- endif -%}
```

JSON template references the asset by filename: `"image_asset": "knobs.jpg"`. Drop `knobs.jpg` into `/assets/` and it works.

**Code locations.**
- `sections/category-grid.liquid`, `sections/featured-collections.liquid`, `sections/sample-cta.liquid` — all use this pattern
- `templates/index.json` — sets `image_asset` filenames

**Gotchas.**
- Use a `text` schema field for the asset filename, not `url` (which only accepts internal Shopify URLs).
- Add an `info` text on the schema setting explaining the convention so future devs/admins know dropping a file in `/assets/` is enough.
- Theme Editor uploads still take priority — useful when the brand wants to A/B test images without code changes.

---

## 5. Dynamic product counts with manual override

**Problem.** Showing "1,200+ styles" on category cards needs to be either accurate or honestly fake. Hardcoded values go stale as the catalog grows. But `collection.products_count` returns the exact integer, which doesn't match marketing copy style ("2,400+").

**Approach.** Liquid logic in the section:
1. If `block.settings.count` is set → use it as-is (manual override)
2. Otherwise, parse the collection handle from `block.settings.url`, look up `collections[handle].products_count`, round down to nearest 100, format with thousands comma if ≥1000, append `+`

```liquid
{%- assign coll_handle = block.settings.url | split: '/collections/' | last | split: '?' | first | split: '/' | first -%}
{%- assign n = collections[coll_handle].products_count | divided_by: 100 | times: 100 -%}
```

**Code locations.**
- `sections/category-grid.liquid` — count derivation logic

**Gotchas.**
- Schema default for the `count` field MUST be empty string `""`, not a placeholder like `"1,200+"`. Shopify uses the schema default whenever JSON doesn't set the field, so a non-empty default short-circuits the dynamic logic.
- Liquid has no native number formatting. Manual thousands-comma logic needed for values ≥1000.
- For collections with 0 products, render no count line at all (hide the element), don't render "0+ styles".
- `collection.products_count` only counts published products. `collection.all_products_count` would include unpublished if needed.

---

## 6. Per-card image-fit for mixed-aspect imagery

**Problem.** Category card sections often need to display images of widely different aspect ratios (a landscape kitchen scene next to a portrait product silhouette). Single `object-fit: cover` either crops one or letterboxes the other.

**Approach.** Per-block `image_fit` select setting (cover or contain). Liquid emits a class on the wrapper div based on the setting; CSS targets `--cover` and `--contain` variants.

```liquid
{%- assign fit = block.settings.image_fit | default: 'cover' -%}
<div class="tile__img-wrap tile__img-wrap--{{ fit }}">
```

```css
.tile__img-wrap--cover img { object-fit: cover; }
.tile__img-wrap--contain img { object-fit: contain; }
.tile__img-wrap--contain { background: var(--page-bg); }
```

**Code locations.**
- `sections/category-grid.liquid` — image_fit setting + CSS

**Gotchas.**
- For `contain` mode, the wrapper background must match page bg or the letterbox bands look like artifacts. Use a CSS variable that resolves to the section background.
- Tile aspect ratio matters more than fit. Set `aspect-ratio: 4/5` (or similar portrait) on the wrapper — closer to typical product photo aspect → less aggressive cropping in either mode.

---

## 7. Family-based CSS surface treatment for finishes

**Problem.** Five different bronze finishes (Aged, German, Tuscan, Sable, Venetian) all rendered as flat hex circles look like five identical brown blobs. Real bronze finishes are distinguished by their *surface character* (matte vs polished vs patina) more than their median color.

**Approach.** Classify each finish into a "family" via Liquid based on name pattern:
- **polished** → mirror gloss, sharp specular highlight
- **brushed** → horizontal striations + dampened sheen
- **satin** → uniform soft sheen
- **matte** → minimal highlight, almost flat
- **patina** → soft mottled aged look (multiple radial spots)

Each family gets distinct `box-shadow` + `::after` overlay. The base hex color does ~60% of the differentiation work; the family treatment does the other ~40% by making physical character visible.

```liquid
{%- assign family = 'satin' -%}
{%- if norm contains 'polished' or norm contains 'chrome' -%}
  {%- assign family = 'polished' -%}
{%- elsif norm contains 'brushed' -%}
  {%- assign family = 'brushed' -%}
... etc
{%- endif -%}
```

**Code locations.**
- `sections/finish-browser.liquid` — family classification + per-family CSS

**Gotchas.**
- Hex differentiation alone hits a ceiling. After ~3 finishes in similar tone family, no hex tweak makes them visually distinct.
- Real product photos as swatch backgrounds are tempting but fail in practice — cabinet/background colors leak through and obscure the finish.
- Per-family rules should be additive, not exclusive — a brushed bronze finish can use the brushed family's striated overlay regardless of base hex.

---

## 8. Bulk catalog operations via Claude Code + Shopify GraphQL

**Problem.** Top Knobs has ~10,000 products across ~4,500 collections. Any bulk operation (tagging, metafield writes, content updates) is out of reach for admin UI tools and Shopify Flow.

**Approach.** Use Claude Code with the Shopify AI Toolkit:
1. Authenticate once: `shopify store auth --store <store>.myshopify.com --scopes <needed>`
2. Write a Python or Node script that uses the Shopify Admin GraphQL API
3. Parallelize across 4–8 workers (Node startup is the bottleneck for `shopify store execute`; multiple processes amortize the startup cost)
4. Save progress to a file every N operations (resume on interrupt)
5. Log progress every M operations
6. Use idempotent mutations (`tagsAdd` ignores duplicates, `metafieldsSet` is overwrite-safe)
7. Save a CSV report of all writes for audit/rollback

**Code locations.**
- `scripts/<operation-name>.py` — committed to repo for re-running
- `scripts/<operation-name>-progress.json` — gitignored (state file)
- `scripts/<operation-name>-report.csv` — gitignored or archived

**Gotchas.**
- 2-character namespaces (`tk`) are rejected by GraphQL Admin API even though they work in Liquid. Use ≥3 character namespaces (`top_knobs`, `brand_x`).
- Single-threaded `shopify store execute` calls hit ~0.3 ops/sec because Node spins up fresh each time. 8 parallel workers → ~1.3 ops/sec. Acceptable.
- The progress save cadence matters: every 500 ops is good for 30-min runs; every 100 for longer ones.
- Store the script in the repo and document re-run conditions. New products added later will need re-tagging.
- Write idempotent operations whenever possible — let the script run multiple times safely vs requiring delicate state management.

---

## 9. Section schema conventions

**Problem.** Theme Editor settings get re-edited by non-developers. Defaults persist past their useful life. Schema fields can be cryptic.

**Approach.**
- **Use `info` text liberally** to explain non-obvious behaviors. "Filename of an image in /assets/ (e.g. knobs.jpg). Used when no Theme Editor image is set."
- **Use empty-string defaults** for fields that have dynamic fallback logic. Non-empty defaults short-circuit fallback chains.
- **Group related settings under `header` separators** in the schema. Visual order in the schema array determines visual order in Theme Editor.
- **Order `select` options by likely use** — most-likely-default first.
- **Document fallback chains** explicitly in `info` text, not in code comments shoppers/admins won't read.

**Code locations.**
- All `sections/*.liquid` schema blocks

---

## 10. Migration anti-patterns

Things we tried and abandoned. Don't reach for these without testing.

### Photos as finish-swatch backgrounds
- *Tried:* Use real product images as backgrounds for hex finish circles
- *Why it failed:* Cabinet/background colors leak into the swatch. Polished Nickel knob shot on white cabinets shows mostly white. Defeats the purpose.
- *Lesson:* Hex + family CSS treatment beats photo backgrounds for finish identification.

### `manual` (Featured) sort as catch-all default
- *Tried:* Set default sort to `manual` to use the curated order
- *Why it failed:* Most collections don't have manual order set. `manual` falls back to alphabetical Shopify-side, defeating the purpose.
- *Lesson:* Use `price-descending` or `best-selling` as default; reserve `manual` for collections where someone has actually curated.

### Schema-default trick for dynamic fallback
- *Tried:* Use schema `default: "1,200+"` and override in JSON to blank
- *Why it failed:* Shopify falls back to schema default whenever JSON doesn't set a field. Blanking JSON ≠ disabling the default.
- *Lesson:* Set schema defaults to empty string when you want dynamic fallback to kick in.

### Bulk admin work via Sidekick
- *Tried:* Sidekick to bulk-tag products, set sort orders, write metafields
- *Why it failed:* Sidekick is a chat UI on top of admin actions. It can't run for hours, can't parallelize, asks for confirmation per change.
- *Lesson:* Use Claude Code + Shopify AI Toolkit for any bulk operation >100 changes.

### Trying to "scrub" a paid theme to reuse on a second store
- *Tried:* Modify a Canopy/Impulse/etc. theme heavily and treat the result as "ours" for use on a different store
- *Why it failed:* Single-store licenses are a copyright issue, not a code-detection issue. Even 90%-rewritten code is still a derivative work in copyright law. There's no defensible threshold. And rewriting the foundational pieces (layout, JS framework, account pages, mega-menu engine) costs far more hours than just buying a second license.
- *Lesson:* Build all bespoke work as `tk-` prefixed additive files. For second stores, start from Dawn (free) and port the prefixed files. Don't try to launder a paid theme.

### Skipping theme-app-embed disable when removing an app
- *Tried:* Uninstall a search/filter app (Searchanise, Boost, etc.) from Apps list and assume it's gone
- *Why it failed:* Theme app embeds in `config/settings_data.json` survive uninstall. The app keeps injecting scripts via the theme until the embed is explicitly disabled. Orphan pages and URL redirects also persist.
- *Lesson:* Three-step removal — uninstall app, disable theme app embed (`"disabled": true` in settings_data.json), delete orphan pages and redirects.

### Building a theme from blank Liquid
- *Tried:* Skip a base theme entirely and have Claude Code write `layout/theme.liquid`, account pages, cart drawer, predictive search, variant picker, etc. from scratch
- *Why it failed:* The plumbing of a Shopify theme (storefront APIs, cart events, customer auth flows, accessibility helpers, internationalization, RTL, gift card pages, password page) is real work that gets you nothing strategic. Paid themes have polished it; Dawn has polished it for free.
- *Lesson:* Always start from a base theme. Spend Claude effort on the bespoke layer that differentiates the brand, not the foundation that's already solved.

### Hardcoding mega-menu links in theme code
- *Tried:* Hardcode the `Collections`, `Finishes`, etc. nav structure in `header.liquid` or section JSON
- *Why it failed:* Mega-menu rendering depends on **nested menu items configured in admin** (Online Store → Navigation → Main menu, but post-2024 Shopify moved it under **Content → Menus**). Until nested items exist in admin, dropdowns silently don't render — looks like a JS bug but is actually empty data. Hardcoding in code also blocks the merchant from making routine nav changes.
- *Lesson:* Theme renders nav structure *from* admin's Main menu. Document the expected menu structure in README/DEPLOY notes so the merchant configures nesting on launch day. The dropdown won't appear until a nested child is added.

---

## 11. Phase-based migration sequencing

**Problem.** Migrating a 5,000+ product e-commerce store between platforms (BigCommerce → Shopify, etc.) is a multi-month project with many concurrent risks (data loss, SEO drop, customer-account confusion, redirects, payment cutover). Trying to do it linearly or in one big push is how stores end up with silent data corruption or rankings drops that take 3–6 months to recover.

**Approach.** Eight phases, each gated on completion of the prior:
1. **Discovery & planning** — full audit of existing site, Screaming Frog crawl exported (becomes the redirect map basis), SEO baseline snapshot (top pages, traffic, keywords, backlinks).
2. **Build new store in dev environment** — never on a live store. Theme, IA, global settings (brand, fonts, nav, footer) before products land.
3. **Data migration in batches of 200–500** — validate each batch with 10% spot-check. Migrate blog/content pages last (URL handles matter for redirects).
4. **Store configuration** — payments, shipping, tax, email templates, apps.
5. **SEO & redirects** — bulk CSV redirect import. Port meta titles/descriptions explicitly; do not let theme regenerate from defaults.
6. **QA & testing** — 50–100 random product validations against originals; full e2e checkout with real cards; cross-device.
7. **Launch cutover** — low-traffic window, final delta sync, DNS switch, sitemap submit, monitor live.
8. **Post-launch (2–4 weeks)** — daily 404 monitoring first week; weekly rankings checks for 4–8 weeks.

**Code locations.** N/A — this is a project-management pattern, but the artifacts that travel between phases (URL crawl CSV, redirect map CSV, SEO baseline doc, batch-import spreadsheets) should live in a `migration/` subdirectory of the theme repo so they're versioned alongside the code.

**Gotchas.**
- Customers/orders are usually skipped in migration to avoid PII complications. If skipped, plan a customer comms email *before* launch warning that accounts won't carry over — otherwise you get a support spike.
- Keep the old platform paused but **not cancelled** for 30–60 days post-launch as rollback insurance and to reference historical data.
- `best-selling` sort needs sales data; on a freshly-migrated store it's basically random. Use `price-descending` or `created-descending` until orders accumulate (see Pattern 3).
- Phase 1 is the phase people skip and regret. The crawl from Phase 1 directly powers Phase 5 — there is no shortcut to the redirect map.

---

## 12. GitHub-Shopify auto-sync workflow

**Problem.** Shopify themes can be edited directly in admin, but for any non-trivial work you want version control, branching, and the ability to use Claude Code / external editors. Shopify CLI's `theme push` and `theme pull` work but require manual sync each time.

**Approach.** Use Shopify's native **Connect to GitHub** integration on the theme:
1. Create an empty repo on GitHub (`<brand>-shopify`).
2. Initialize with a README on github.com so a `main` branch exists. *Without an initial commit, no branch exists — Shopify's connection screen will show "No branches found" and silently fail.*
3. Either push existing theme files via Shopify CLI to a separate branch, or use GitHub Desktop to clone, drop unzipped theme files in, commit, push.
4. In Shopify admin → Online Store → Themes → three-dot menu on the theme → **Connect to GitHub** → select repo and `main` branch.
5. **First connect creates a new theme** in your theme list (not modifying the existing one). This is intentional — your live theme stays untouched while the Git-backed version builds.
6. Preview the new theme. Once verified, **publish** it. Subsequent pushes to `main` auto-sync to that published theme.

**Code locations.** N/A — store admin behavior. But the theme repo's `README.md` should document this connection and the branch convention so contributors don't accidentally re-create the connection from a fork.

**Gotchas.**
- **First connection always creates a new theme.** Reviewers often think this is a bug. Just preview, publish, then future pushes update in place.
- **`assets/<name>.dynamic.css`** files are auto-generated by some themes (Canopy, others). They live in your local repo but Shopify rejects them on push with "Cannot overwrite generated asset". Delete them locally and they stop being pushed.
- Sync works in both directions if you connect bidirectional. Edits to JSON template files in the Theme Editor commit back to GitHub. Be aware of merge conflicts if a designer edits the customizer at the same time you push code.
- **Headless setups break this pattern entirely.** If a downstream contractor pivots to a headless storefront (Hydrogen, Next.js, custom React), Shopify themes don't apply at all and the GitHub-theme link becomes dead weight. Confirm architecture before investing in theme-side patches.
- Direct edits on github.com (the web editor) trigger the same auto-sync as desktop pushes. Useful for quick fixes.

---

## 13. Schema validation traps in Shopify sections

**Problem.** Shopify Liquid section schemas have several lurking validation rules that fire only at deploy time, not while editing locally. A 20-section theme push can fail with the same error across 11 files because Claude (or any code-gen tool) made one consistent assumption that's wrong.

**Approach.** Pre-flight check section schemas before pushing. The recurring traps:

1. **`default` and `presets` are mutually exclusive at the top level.** A schema can have one or the other, not both. The legacy `default` block (specifying initial blocks) was deprecated in favor of `presets[0].blocks`. New themes use `presets` exclusively.
2. **Section type names must exactly match a file in `/sections/`.** A `header-group.json` referencing `"type": "announcement-bar"` requires `sections/announcement-bar.liquid`. Renaming a section file but not the references fails the push.
3. **Inline `default` values inside individual settings are still valid** — only the top-level `default` block is the problem. `{ "type": "color", "default": "#000" }` is fine.

Remediation for the `default + presets` clash:
```liquid
{% schema %}
{
  "name": "Section name",
  "settings": [...],
  "blocks": [...],
  "presets": [
    {
      "name": "Default",
      "blocks": [
        { "type": "block-type", "settings": {...} }
      ]
    }
  ]
}
{% endschema %}
```
Move any starter blocks into `presets[0].blocks` and delete the top-level `default` key entirely.

**Code locations.**
- All `sections/*.liquid` files
- `sections/*-group.json` (header/footer groups)
- `templates/*.json` (page templates)

**Gotchas.**
- The error message ("Invalid schema: cannot define both 'default' and 'presets'") fires on *every* affected file in one push, so you can fix all of them in one Claude Code pass — but verify the fix didn't accidentally strip inline setting defaults.
- After removing top-level `default` blocks, newly-added sections via Theme Editor start with no preset blocks. If the brand wants starter content (announcement messages, trust items, FAQ entries), copy that into `presets[0].blocks`.
- A `theme push` partial-fails: files that pass validation upload, files that fail don't. The theme is left in a half-deployed state. Re-push after fixes is safe (idempotent).

---

## 14. Searchanise/3rd-party search-app removal cleanup

**Problem.** Theme-app-embed search apps (Searchanise, Algolia, Klevu, Boost, etc.) install via a Theme App Embed *and* may create supporting infrastructure (a `/pages/search-results-page` template, URL redirects, a custom search results template). Uninstalling the app from the Apps list does NOT remove the embed or the orphan infrastructure. Pages and redirects keep firing, sending real customer traffic to dead pages.

**Approach.** Three-layer cleanup:
1. **Disable the theme app embed.** In `config/settings_data.json`, find the `blocks` map for the app and set `"disabled": true`. Or in Theme Editor: App embeds → toggle off. Just uninstalling the app from Admin doesn't disable the embed; it remains rendered until disabled.
2. **Delete the orphan page** at Online Store → Pages. Look for `Search Results Page`, `search-results`, or similar.
3. **Audit URL redirects** at Online Store → Navigation → URL redirects. The app may have created `/collections/* → /pages/search-results-page` redirects. Delete any that route through the dead page.
4. **Replace functionality.** Most 3rd-party search apps were doing two jobs: predictive search box AND faceted collection-page filters. Shopify's native predictive search handles the search box for free. For filters, install **Search & Discovery** (Shopify first-party, free) and configure filters there.

**Code locations.**
- `config/settings_data.json` — app embed disable flags
- Online Store → Pages — orphan templates
- Online Store → Navigation → URL redirects — orphan routes

**Gotchas.**
- Until the orphan page is deleted, the menu items pointing at `/pages/search-results-page` keep working as redirects, masking the breakage from the merchant.
- After app removal, the collection filter sidebar will look "broken" — but it's actually rendering only Shopify's native filters (Availability, Price). The theme code is fine. Install Search & Discovery to populate facets.
- If the existing collection sidebar Liquid checks for filter labels containing "finish", "color", or "colour" to render swatch dots (see Pattern 2), name the new S&D filter exactly "Finish" so the existing detection keeps working.

---

## 15. Filter source audit before configuring Search & Discovery

**Problem.** Shopify's Search & Discovery app supports filters on variant options, product types, vendors, tags, and metafields. The right source depends on how the catalog data is actually structured — and on a migrated catalog, finish/material/size info might live in any of those four places (sometimes inconsistently across products). Configuring filters against the wrong source produces empty or fragmented facets.

**Approach.** Run an audit *before* opening Search & Discovery:
1. For each candidate filter dimension (Finish, Center-to-Center, Material, Mounting, etc.), check four candidate sources:
   - Variant option name + values
   - Product metafield (e.g. `<brand>.finish`, `<brand>.material`)
   - Tag prefix (e.g. `finish-polished-chrome`)
   - Variant title substring (worst case — usually a sign of a sloppy import)
2. For each source, count how many products populate it. The "cleanest" source is the one with the highest population AND the most consistent values.
3. Prefer metafields when available — they're already structured, easy to filter on, and survive variant-option changes.
4. If Finish lives only in variant titles (smart-collection rule was `Variant title contains "X"`), that's a sign the catalog needs cleanup — adding a real "Finish" variant option to all products is a one-time bulk operation that pays back forever.

A Sidekick prompt that walks the catalog and produces a per-dimension recommendation table (best source, population %, values) is much faster than auditing in admin.

**Code locations.**
- `scripts/filter-audit.py` (or a Sidekick prompt at `SIDEKICK-FILTER-AUDIT.md`)
- The collection-page Liquid (e.g. `tk-collection.liquid`) reads `collection.filters` directly — no theme change needed; whatever S&D exposes, the theme renders.

**Gotchas.**
- S&D auto-populates some default filters when first installed. They're rarely the right ones for a hardware catalog. Plan to delete S&D's defaults and replace with the audit's recommendations.
- When using metafields as filter sources, the metafield definition must have "Use this metafield as a filter" enabled in Settings → Custom data → Products before S&D will see it.
- Don't pre-install S&D before the audit. The audit reads the catalog directly; S&D doesn't influence what data exists.

---

## 16. Base theme as licensed dependency, not a starting copy

**Problem.** Paid Shopify themes (Canopy, Impulse, Prestige, etc.) are sold as single-store licenses. Modifications you make on top are yours, but the underlying theme is a derivative work. Copying a heavily-modified paid theme to a second store violates the license — and there's no "I changed it enough that it's mine now" copyright threshold.

**Approach.** Treat the base theme as a licensed dependency, not a starting copy. Build all bespoke work as **prefixed sections/snippets/assets** (e.g. `tk-product.liquid`, `tk-finish-swatch.liquid`, `tk-finish-swatches.css`) that are *additive* and don't modify base-theme files. When porting to a new store:
1. Pay for a new license of the base theme (or pick a free base — Dawn is fully-featured for most purposes).
2. Copy only the prefixed files to the new theme. They drop in cleanly because they were built additively.
3. Adapt CSS variable names and snippet conventions for the new base (~few hours per file).

Files that travel cleanly:
- `sections/tk-*.liquid` — bespoke sections
- `snippets/tk-*.liquid` — bespoke snippets
- `assets/tk-*.css`, custom favicons, brand SVGs
- Brand-specific JSON templates (`templates/index.json`, etc.) — but adapt section types to whatever the new base's section types are

Files that DO NOT travel:
- `layout/theme.liquid` — base theme's foundation
- `assets/main.css`, base theme JS — base theme code
- Heavily-modified base sections like `header.liquid` — derivative, license-bound to original store

**Code locations.**
- Use a `tk-` (or brand-) prefix on every file you author. This makes the migration manifest self-evident.
- Document the prefix convention in `README.md` so contractors don't sprinkle modifications into base files.

**Gotchas.**
- Modifying a base file (e.g. adding lines to `header.liquid`) creates a "hybrid" file that's licence-bound to the original store. Try to wrap modifications in your own snippet that the base file `render`s, instead.
- Free themes (Dawn, Sense, Refresh) have no per-store licensing concerns. Use them as the base for any second/third stores unless a paid theme's aesthetic genuinely matches the brand out-of-the-box.
- Even with the prefix discipline, the `templates/index.json` and similar JSON templates reference base-theme section types. Plan to recreate JSON templates on the new theme.

---

## Workflow patterns

These are meta-level patterns about how the work itself gets done, not about the codebase.

### A. Multi-tool dev environment for theme work

Standard setup that worked for non-developer brand owners:
- **GitHub Desktop** (not raw `git` CLI) for commits/pushes — visual diff, friendlier for designers
- **VS Code** with the Claude Code extension — file-tree visible, integrated terminal, real-time file appearance as Claude writes
- **Shopify CLI** for the initial theme push (`shopify theme push`) and for one-off deploys outside the GitHub auto-sync
- **Terminal** (mac default) for `node`, `npm`, `claude`, `shopify` commands

Required pre-reqs that always trip people up:
- **Node.js ≥18** (Claude Code requires it). On macs with old Node, the system version sticks via `which node`. Use `n` (`sudo npm install -g n`, then `sudo n lts`) to bypass PATH issues — `brew install node` and `brew link node --overwrite` often fail to override an old install.
- `sudo npm install -g @anthropic-ai/claude-code` — note the `-ai` suffix; `@anthropic/claude-code` is the wrong package name.

### B. Phased patch delivery from design tools

Pattern for working with Claude Design (or any code-emitting design tool):
- Don't ship one massive patch. Ship Phase 1 (5–7 most-impactful files), validate live, then Phase 2.
- Each phase ships with a `DEPLOY.md` documenting what's in the patch, where files go (sections/, snippets/, assets/, root), one-line edits to existing base files (e.g. add `{{ 'tk-finish-swatches.css' | asset_url | stylesheet_tag }}` to `layout/theme.liquid`), Shopify Admin prerequisites (metafields to define, app installs needed), and a QA checklist.
- Phase 2 is scoped after Phase 1 is live — the "what's broken in the wild" feedback drives Phase 2 priorities better than upfront planning.

### C. Bulk admin changes — Sidekick vs Claude Code split

- **Sidekick** for one-off catalog edits where the merchant is in front of admin (manual menu edits, single-product fixes, asking-not-doing audits). Sidekick can produce structured recommendation reports but cannot reliably execute mutations at scale.
- **Claude Code + Shopify Admin GraphQL API** for any operation that touches >100 records (bulk tagging, metafield writes, redirect imports). See Pattern 8.
- A Sidekick *prompt template* committed to the repo (e.g. `SIDEKICK-FILTER-AUDIT.md`) is a great middle ground — generates recommendations the merchant can paste into admin without scaling to GraphQL.

### D. Staging flow: preview theme → publish → auto-sync

- The first GitHub-connected theme upload creates an unpublished theme. Preview it, then publish.
- After publish, auto-sync hits the published theme directly. There is no separate staging environment unless the merchant explicitly uses Shopify's "duplicate theme" feature or a second connected branch.
- For risky changes, **duplicate the published theme** (admin → Themes → … → Duplicate) before pushing. The duplicate is a snapshot; if the new push breaks something, swap the published theme back to the duplicate.

---

## Project Values (Top Knobs)

These are the specific values used in this migration. Swap when porting to a different brand.

### Metafield namespace
- `top_knobs` (≥3 chars required by GraphQL Admin API)

### Metafield keys
- `top_knobs.family_finishes` — JSON array of sister-finish products
- `top_knobs.finish_name` — single-line-text finish name of this product

### Finish rotation (for primary-finish distribution)
1. Polished Nickel
2. Honey Bronze
3. Matte Black
4. Brushed Satin Nickel
5. Polished Chrome
6. Champagne Bronze
7. Oil Rubbed Bronze
8. Brushed Nickel

### Finish hex map (snippet)
| Finish | Hex |
|---|---|
| Aged Bronze | `#5e5132` |
| Antique Pewter | `#6f6c64` |
| Ash Gray | `#bcb6a8` |
| Brushed Nickel | `#9c9a93` |
| Brushed Satin Nickel | `#bdb9ad` |
| Champagne Bronze | `#a8895c` |
| Flat Black | `#1d1d1f` |
| German Bronze | `#5d3530` |
| Honey Bronze | `#b48342` |
| Matte Black | `#0d0d0d` |
| Oil Rubbed Bronze | `#2a1a0e` |
| Polished Brass | `#d4af37` |
| Polished Chrome | `#d8dde0` |
| Polished Nickel | `#c8c2b0` |
| Sable | `#352620` |
| Slate | `#525a62` |
| Tuscan Bronze | `#7d5a30` |
| Umbrio | `#1f1814` |
| Venetian Bronze | `#6e4326` |

### SKU parsing patterns (Top Knobs catalog)
- TPK-TK pattern: `TPK-TK<digits><FINISH_CODE>` — strip last 2–3 chars for design root
- Atlas pattern: `ATL-<MODEL>-<FINISH_CODE>` — split by `-`, design root = everything before last segment
- M-prefix pattern: SKU is M-coded; group by product title minus trailing SKU code

### Default collection sort
- Initial default: `price-descending` (premium-first, no sales-data dependency)
- Future default once orders accumulate: `best-selling`

### Top-level homepage sections (in order)
1. Hero
2. Trust bar
3. Shop by Category (4 cards)
4. Featured Collections (6 cards)
5. Browse by Finish (17 swatches)
6. Product grid (Featured)
7. Sample CTA
8. Trade CTA

---

## Re-use checklist for a new brand migration

When porting these patterns to a different brand:

- [ ] Replace `top_knobs` namespace with brand-specific namespace (≥3 chars)
- [ ] Update finish hex map in `tk-finish-swatch.liquid` for brand's actual finishes
- [ ] Update SKU parsing patterns in `scripts/tag-primary-finishes.py`
- [ ] Set finish rotation list based on brand's most-photographed/popular finishes
- [ ] Update brand string everywhere (`tk-` CSS class prefix can stay or be renamed)
- [ ] Choose initial default sort based on brand's catalog state (sales data, manual curation)
- [ ] Update homepage section list and asset filenames
- [ ] Re-photograph or re-source category card lifestyle images
- [ ] Verify metafield types match Shopify's current accepted set (json, single_line_text_field)
- [ ] Re-run bulk catalog tagging script for the new store

---

*Last updated: end of Top Knobs Phase 2 migration. Maintained alongside the theme repo so it travels with the codebase.*
