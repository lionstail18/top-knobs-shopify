# Sidekick Prompt — Finishes Navigation Setup

Adds the 18 Top Knobs finish links under the "Finishes" item in your main-menu so the mega-menu can render colored swatches.

## How to use

1. Open Shopify admin → click the Sidekick chat icon (top right)
2. Copy and paste the prompt block below into Sidekick
3. When Sidekick is done, ping me to push the swatch-rendering theme code

---

## Prompt to paste into Sidekick

> Hi Sidekick. Please add child links to the "Finishes" item in my main-menu navigation. Here's exactly what I need:
>
> 1. Open Online Store → Navigation → main-menu.
> 2. Find the top-level item titled "Finishes". If it doesn't exist, add it as a top-level dropdown parent (no URL).
> 3. Under "Finishes", add the following 18 child links. For each one, the title is on the left and the URL is on the right. Add them in this order (already alphabetical).
> 4. Save the menu.
>
> | Title | URL |
> |---|---|
> | Antique English | `/collections/all?filter.v.option.finish=Antique+English` |
> | Ash Gray | `/collections/all?filter.v.option.finish=Ash+Gray` |
> | Brushed Satin Brass | `/collections/all?filter.v.option.finish=Brushed+Satin+Brass` |
> | Brushed Satin Nickel | `/collections/all?filter.v.option.finish=Brushed+Satin+Nickel` |
> | Champagne Bronze | `/collections/all?filter.v.option.finish=Champagne+Bronze` |
> | Cocoa Bronze | `/collections/all?filter.v.option.finish=Cocoa+Bronze` |
> | Flat Black | `/collections/all?filter.v.option.finish=Flat+Black` |
> | German Bronze | `/collections/all?filter.v.option.finish=German+Bronze` |
> | Honey Bronze | `/collections/all?filter.v.option.finish=Honey+Bronze` |
> | Mahogany Bronze | `/collections/all?filter.v.option.finish=Mahogany+Bronze` |
> | Oil Rubbed Bronze | `/collections/all?filter.v.option.finish=Oil+Rubbed+Bronze` |
> | Pewter Antique | `/collections/all?filter.v.option.finish=Pewter+Antique` |
> | Polished Brass | `/collections/all?filter.v.option.finish=Polished+Brass` |
> | Polished Chrome | `/collections/all?filter.v.option.finish=Polished+Chrome` |
> | Polished Nickel | `/collections/all?filter.v.option.finish=Polished+Nickel` |
> | Sable | `/collections/all?filter.v.option.finish=Sable` |
> | Tuscan Bronze | `/collections/all?filter.v.option.finish=Tuscan+Bronze` |
> | Umbrio | `/collections/all?filter.v.option.finish=Umbrio` |
>
> When you're done, confirm: how many links you added, and paste the URL of the first one back to me so I can verify it's the right format.

---

## After Sidekick is done

Ping me — I'll push the `header.liquid` change that wires `collection_images: "swatch"` to the swatch snippet, plus the panel CSS. The colored dots will appear automatically because the lookup uses the link title as a key.

Two finishes (**Ash Gray**, **Sable**) aren't in the hex-color map yet, so they'll show as a grey circle with a letter until I add them. I'll do that in the same patch — easy two-line addition.

## If the URLs don't work

If you click "Polished Chrome" in the menu and see "no products found," the filter parameter `filter.v.option.finish` doesn't match how your products are set up. Most likely fix: your variant option is named something different, like "Color" or has different casing. Tell me what you see and I'll give you the corrected URL pattern — Sidekick can do a search-and-replace across all 18 links.
