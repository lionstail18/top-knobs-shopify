# Sidekick Prompt — Filter Audit (pre-S&D setup)

Audits your product catalog to figure out which fields will work as filters in Shopify Search & Discovery (or Algolia later). Run this **before** installing S&D so you know what to configure.

## How to use

1. Open Shopify admin → click the Sidekick chat icon
2. Paste the prompt block below in one shot
3. Sidekick will read across products and produce a report
4. Use the report to configure filters in Search & Discovery once you install it

---

## Prompt to paste into Sidekick

> Hi Sidekick. I just uninstalled Searchanise and I'm about to install Shopify's Search & Discovery app to replace the faceted filtering it was doing. Before I configure filters, audit my product catalog and tell me which fields will actually work as filters. Be thorough — bad filter setup wastes weeks. Be concise — I want to read the report in two minutes.
>
> **Step 1 — Sample products across collections**
> Look at 20–30 products spread across different collections (e.g. one or two each from Asbury, Pemberton, Brockwell, Crystal, Dakota, Edwardian, Garrison, Sanctuary, Serene, Tuscany — whatever you find). Note what data shape they have.
>
> **Step 2 — Inventory each data source**
> For each of the following, tell me whether it's used, how many distinct values exist catalog-wide, and 5 sample values:
> 1. **Variant options** — what option names appear? (e.g. "Finish", "Center-to-Center", "Size", "Color")
> 2. **Product metafields** — anything populated, especially in the `tk.*` namespace (e.g. `tk.finish`, `tk.material`, `tk.center_to_center`, `tk.projection`, `tk.mounting`)
> 3. **Product tags** — patterns like `finish-polished-chrome`, `cc-3in`, `style-modern`?
> 4. **Product type** — distinct `product_type` values across the catalog (Knobs, Pulls, Appliance Pulls, Bath Hardware, etc.)
> 5. **Vendor** — is everything labeled "Top Knobs" or are there variations?
> 6. **Variant titles** — do variant titles consistently contain finish/size info (e.g. "Polished Chrome / 3 inch")?
>
> **Step 3 — Recommend a filter setup**
> Based on what you find, give me a prioritized list of filters to configure in Search & Discovery. For each one, include:
> - **Filter name** (what customers see — e.g. "Finish")
> - **Source** (variant option / metafield / tag / product type)
> - **Distinct value count** (if >50, flag it as too noisy for a filter)
> - **Coverage** (rough % of products that have this data — anything below 80% is risky)
> - **Cleanup needed** (e.g. "13 products use 'Polished Chrome', 2 use 'polished chrome' — needs normalization before filtering")
>
> Order the list highest-impact first — Finish is almost certainly #1 for cabinet hardware. Center-to-Center, Product Type, and Material are typical follow-ons.
>
> **Step 4 — Note gaps**
> If a filter WOULD be useful but the data isn't there yet (e.g. "Material would help but no products have material data"), note it as future work. Don't recommend it for current setup.
>
> **Step 5 — Format**
> Output as a single markdown table for the recommended filters, then a short bulleted list of gaps. Don't dump all the raw inventory data — just enough sample values to make the recommendation make sense. Total report should fit in one screen.

---

## What to do with the report

When Sidekick reports back, you'll have a clear picture of:

- **Which filters to enable in S&D** — copy the filter names and sources straight into the Search & Discovery app's Filters config
- **Which fields need data cleanup first** — a "Polished Chrome" vs "polished chrome" inconsistency means you'll get two filter values for the same finish, which looks broken
- **Which filters are aspirational** — gaps you might fill later by adding metafields or tagging products

If the report shows your finish data lives across multiple sources inconsistently (some in variant options, some in tags, some in metafields), that's a sign the catalog needs normalization before any filter system — Search & Discovery, Algolia, or otherwise — will give clean results. Better to know that now than after you've configured Algolia and the facets show 4 different "polished chrome" entries.

## Then install Search & Discovery

After the audit:

1. Apps → Shopify App Store → "Search & Discovery" (free, first-party from Shopify) → install
2. Open the app → Filters section
3. Add a filter for each item in Sidekick's recommendation list, using the Source it identified
4. Save — filters appear on collection pages immediately, your `tk-collection.liquid` already renders whatever Shopify provides

If your finish-swatch styling in the filter sidebar still works (the colored dots next to each finish name), no theme change is needed. If swatches stop appearing, ping me — that's a small CSS tweak in `tk-collection.liquid` to re-hook them to the new filter source.
