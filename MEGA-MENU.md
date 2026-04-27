# Mega Menu — Setup Guide

## What I changed

Added 4 mega menu **blocks** to the header section in `sections/header-group.json`:

| Block | Title match | Type | Collection images |
|---|---|---|---|
| `mega-knobs` | "Knobs" | columns | yes — uses product image |
| `mega-pulls` | "Pulls" | columns | yes — uses product image |
| `mega-bath` | "Bath & Cabinet Hardware" / "Bath" / "Cabinet Hardware" | columns | yes |
| `mega-finish` | "By Finish" / "Finishes" / "Finish" | columns | yes — uses collection image |

The `title` setting on each block is what matches it to a navigation menu item. The match is case-insensitive and allows comma-separated alternatives (e.g. `"By Finish, Finishes, Finish"` matches all three).

## Why this fixes the broken menu you saw

The old `header-group.json` had **no `blocks`** in the `header` section. With no blocks, the theme falls back to a plain text dropdown — which is what's showing now (just one tiny "All Collections" text link in a box).

With these 4 blocks present, the theme automatically:
- Detects each top-level nav item with a matching title
- Renders its child links as a multi-column grid spanning the full page width
- Pulls a thumbnail from each collection's image (or first product image)
- Adds the gold underline + branded styling already in `header.liquid`

## What you need to do

### Step 1 — Commit `phase-1-patches/sections/header-group.json` to your repo

This file overwrites the existing `sections/header-group.json`. Either:
- Open https://github.com/lionstail18/top-knobs-shopify/edit/main/sections/header-group.json on GitHub.com, paste in the new content, commit
- Or pull the patch folder locally and `git add sections/header-group.json && git commit && git push`

Shopify will sync within a minute or two.

### Step 2 — Build out your navigation in Shopify Admin

This is the part you have to do manually (Shopify doesn't expose menu structure to GitHub). Go to:

**Online Store → Navigation → main-menu**

Make sure you have these top-level items, each with collection child links nested underneath:

#### "Knobs" (top-level link)
Children should be your knob collections — drag in the collections from your Collections list. For example:
- Aspen II
- Asbury
- Bar Pulls (knobs subset)
- Barrington
- Bedrock
- Chareau
- Channing
- ...etc, all your knob collections

#### "Pulls"
Same — drag in pull collections:
- Asbury Pulls
- Bar Pulls
- Bedrock Pulls
- Channing Pulls
- Cup Pulls
- ...etc

#### "Bath & Cabinet Hardware"
Children: knob/pull/towel-bar collections under the bath line.

#### "By Finish"
Children: collections you create, one per finish:
- Polished Chrome
- Polished Nickel
- Brushed Satin Nickel
- Honey Bronze
- Matte Black
- Polished Brass
- Antique English
- ...etc

> **Tip:** If you don't have one collection per finish yet, create them. Each collection's product list can be auto-populated using a smart collection rule: `Variant title contains "Polished Nickel"` (or whatever the finish is named in your variant titles).

### Step 3 — Add collection images (optional but recommended)

For each collection used in the mega menu, go to **Products → Collections → [collection]** and upload a square image. The mega menu will display it next to the link.

For finish collections specifically: turn OFF the "Use product image" setting (already done in `mega-finish` block) so it uses the collection image you upload — typically a clean swatch shot.

### Step 4 — Add promo tiles (optional)

Each mega-menu block supports up to 3 promo tiles on the right side (or bottom, depending on the block's `promo_position`). To add them:

1. Go to **Online Store → Themes → Customize → Header**
2. Click on a mega-menu block (e.g. "Mega menu — Knobs")
3. Scroll down to the "Promo 1", "Promo 2", "Promo 3" sections
4. Upload an image and add HTML content (e.g. "Free Shipping on $99+", "Try a Sample")
5. Save

### Step 5 — Hard-refresh and test

Cmd+Shift+R on the live storefront, hover each menu item. You should see a full-width flyout with collection thumbnails laid out in 3-4 columns.

## Visual reference

This matches the prototype's mega menu (open `Top Knobs Hardware.html` and hover any nav item). The Liquid theme will render slightly differently — Canopy's CSS classes for grid spacing, etc. — but the layout principle is the same:

- Multi-column grid (3-4 wide on desktop)
- Each child link shows: small thumbnail + collection name
- Optional promo tiles on the right or bottom
- Gold accent underline on the parent nav item
- Full-page-width flyout with white background

## Troubleshooting

**Menu still shows a tiny dropdown.** The block `title` doesn't match any nav menu item title exactly. Open the block in the customizer and confirm the title matches what's in your Navigation → main-menu.

**Mega menu shows but no thumbnails.** Either (a) collections don't have images set, or (b) the products in the collection don't have featured images. Check the collection in Admin → Products → Collections.

**Layout looks cramped.** Make sure you have at least 4 child links under each top-level item. The grid auto-adjusts to fill columns.

**Mobile menu not affected.** Mega menus only render on desktop (≥769px). Mobile uses a stacked accordion automatically — no config needed.
