# Phase 1 Patches — Deployment Guide

These patches fix the gaps between the prototype and what's currently live on TopKnobsHardware.net. They are **drop-in replacements** for existing files in your repo (`lionstail18/top-knobs-shopify`).

## What's in this folder

```
phase-1-patches/
├── sections/
│   ├── tk-product.liquid          ← REPLACE existing file
│   └── tk-collection.liquid       ← REPLACE existing file
├── snippets/
│   ├── tk-finish-swatch.liquid    ← NEW file (add to repo)
│   └── tk-product-card.liquid     ← REPLACE existing file
└── assets/
    └── tk-finish-swatches.css     ← NEW file (add to repo)
```

---

## What each patch fixes

### `sections/tk-product.liquid` (PDP)
- ✅ **MAP pricing** — shows compare_at strikethrough + "Save X%" badge when set
- ✅ **Real swatch colors** — Matte Black, Honey Bronze, Polished Nickel, etc. now render with correct hex (was all gray before)
- ✅ **Hides empty specs** — no more "Center-to-Center: 0" or empty Ships/Warranty rows
- ✅ **Reviews summary block** — 4.8★ aggregate + 3 review cards (configurable in section settings)
- ✅ **Quantity discount** — "Buy 4+ — Save 10%" highlights when threshold reached
- ✅ **Recently Viewed strip** — persistent across page loads via localStorage

### `sections/tk-collection.liquid` (Collection page)
- ✅ **Finish swatches in filter sidebar** — colored dots next to finish names
- ✅ **Styled price filter** — $-prefixed inputs, "Max in collection: $X" hint
- ✅ **Active filter chips** — clickable chips above grid, click × to remove
- ✅ **Collapsible filter groups** — `<details>` elements with chevron, all open by default
- ✅ **Cleaned up count** — "Showing **1,234** products" instead of "Showing 1234 product"

### `snippets/tk-finish-swatch.liquid` (NEW)
- Reusable finish-color renderer with hex map for 50+ Top Knobs finishes.
- Falls back to a circle with the finish's first initial for any unmapped finish.

### `snippets/tk-product-card.liquid` (Product card)
- ✅ Sale badge ("Save X%") top-left when on sale
- ✅ Strikethrough compare_at price next to current price
- ✅ Finish dots with real colors (using `tk-finish-swatch` snippet)
- ✅ "+N" indicator when more than 4 finishes available

### `assets/tk-finish-swatches.css` (NEW)
- Swatch styling — base look, light-finish outlines, initial fallback, contextual sizes.

---

## How to deploy

### Option A: Direct commit to main (fastest)

1. Open your repo: <https://github.com/lionstail18/top-knobs-shopify>
2. For each file in this folder:
   - Navigate to the matching path in your repo
   - Click **Edit** (✏️ icon)
   - Paste in the new content from the patch
   - Commit message: `Phase 1 patch: <filename>`
3. After all 5 files are committed, Shopify auto-syncs to your live theme via the GitHub integration.
4. Hard-refresh the storefront (`Cmd+Shift+R`) to see changes.

### Option B: Branch + PR (safer)

1. Create a branch: `phase-1-patches`
2. Commit all 5 files to the branch
3. Open a PR for review
4. Merge when ready

### Option C: Pull this folder locally

```bash
git checkout -b phase-1-patches
# Copy the contents of phase-1-patches/ over the matching paths in your repo
git add sections/ snippets/ assets/
git commit -m "Phase 1: PDP + collection + finish swatch patches"
git push origin phase-1-patches
```

---

## After deploying — load the new CSS

Open `layout/theme.liquid` and add this line **inside `<head>`**, near your other stylesheet tags:

```liquid
{{ 'tk-finish-swatches.css' | asset_url | stylesheet_tag }}
```

Without this, the swatch dots won't have their styling.

---

## Phase 2 — what YOU need to configure in Shopify Admin

These patches assume some configuration exists. If you haven't set these up yet, the new features won't have data to show:

### 1. Product Metafields (Settings → Custom data → Products)

Create these metafields with namespace `tk`:

| Namespace.Key | Type | Description | Example |
|---|---|---|---|
| `tk.size` | Single line text | Center-to-center measurement | `3 in (76mm)` |
| `tk.material` | Single line text | Construction material | `Solid Zinc Alloy` |
| `tk.mounting` | Single line text | Mounting hardware | `Two M4 screws included` |
| `tk.projection` | Single line text | How far it sticks out | `1-1/8 in (29mm)` |
| `tk.warranty` | Single line text | Warranty terms | `Lifetime Limited` |
| `tk.ships` | Single line text | Ship time | `1–2 business days` |

If a metafield is blank, that spec row simply won't render — no more empty-value rows.

### 2. Compare-at Price (per product)

For MAP strikethrough pricing to work, set a **Compare-at price** on each product variant that is **higher** than the actual price. Shopify Admin → Products → [product] → Pricing.

Without compare_at, no strikethrough or "Save X%" appears.

### 3. Storefront Filters (Apps → Search & Discovery)

Configure filters on `/collections/*`:
- Add filter for **Vendor** (collection name)
- Add filter for **Product option: Finish** (this is what triggers the finish swatches)
- Add filter for **Product option: Size**
- Add filter for **Price**

Once configured, the new sidebar will render finish swatches automatically — the collection section detects "finish" / "color" / "colour" in the filter label.

### 4. Mega Menu (Theme customizer)

The mega menu issue you saw on `/collections/all` is **configuration, not code**. Open Online Store → Themes → Customize → Header section. For each main nav item ("All Collections", "By Finish", etc.), add the mega menu blocks the theme exposes (collection grid, featured product, etc.).

---

## QA checklist after deploy

Open these pages and confirm:

- [ ] **PDP** — Pull up any product on sale (with compare_at): does the strikethrough + Save % appear?
- [ ] **PDP** — Switch finish swatches: do the dots have real colors? Does the price update?
- [ ] **PDP** — Scroll down: do reviews appear? Does Complete the Look show? Does Recently Viewed appear after viewing 2+ products?
- [ ] **PDP** — Increase qty to 4: does the "Save 10%" message highlight green?
- [ ] **PDP** — On a product with no metafields set: does the spec block hide empty rows?
- [ ] **Collection** — Filter sidebar: finish names show colored swatches?
- [ ] **Collection** — Apply 2 filters: do chips appear above the grid? Click × — does it remove just that filter?
- [ ] **Collection** — Price filter: $ prefix shows on both inputs?
- [ ] **Product card** — Cards on sale show "Save X%" badge top-left + strikethrough price?

---

## Rollback

If anything goes sideways, every file in this folder has an exact analogue in the previous repo state. Either:
- Revert the commits in GitHub, OR
- Roll back the theme version in Shopify Admin → Online Store → Themes → ⋯ → Older versions

Both options are non-destructive — your customizer settings, products, and metafields are untouched.

---

## What's NOT in this patch

These are deliberately deferred to keep the patch focused and reviewable:

- **Mega menu in `header.liquid`** — that file is 76KB; the issue is theme customizer config, not code. Walking you through customizer setup is faster than another code patch.
- **Search results page redesign** — the live page uses `main-search.liquid` (default Canopy). We can patch this separately.
- **Cart drawer styling tweaks** — current `cart-drawer.liquid` works; only visual polish remaining.
- **Homepage** — depends on which sections you have configured. Send me a screenshot and I'll patch what needs work.

These can all be Phase 2 patches once Phase 1 is live and validated.
