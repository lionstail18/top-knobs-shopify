# Sidekick Prompt — Bulk-Create 18 Finish Collections

Creates one smart collection per Top Knobs finish, all in one Sidekick session.

## How to use

1. Open Shopify admin → Sidekick (chat icon)
2. Paste the prompt below in one shot — don't break it up
3. If Sidekick still asks for confirmation between each one, answer "yes, continue" or "yes to all" and let it run

If Sidekick refuses to batch, fall back to creating them manually at Products → Collections → Create collection. The "Recipe card" section below has every value you'd need to type.

---

## Prompt to paste into Sidekick

> Sidekick, I need you to create 18 smart collections in a single batch — one per finish in our catalog. Please don't pause for confirmation between each one; create all 18 in sequence and report back at the end with a summary.
>
> **Use this exact configuration for every collection:**
> - **Type:** Smart
> - **Conditions:** Products must match all conditions, with one condition: "Variant's title contains [finish name]"
> - **Description:** "Shop all hardware available in the [finish name] finish."
> - **Theme template:** Default collection
> - **Sales channels:** Online Store
>
> **For each collection, the title and handle are different.** Note the handle format: `[finish-name]-finish` (the word "finish" goes at the END, not the start — this is a deliberate change from the convention you used on the first one):
>
> | # | Title | Handle |
> |---|---|---|
> | 1 | Antique English | antique-english-finish |
> | 2 | Ash Gray | ash-gray-finish |
> | 3 | Brushed Satin Brass | brushed-satin-brass-finish |
> | 4 | Brushed Satin Nickel | brushed-satin-nickel-finish |
> | 5 | Champagne Bronze | champagne-bronze-finish |
> | 6 | Cocoa Bronze | cocoa-bronze-finish |
> | 7 | Flat Black | flat-black-finish |
> | 8 | German Bronze | german-bronze-finish |
> | 9 | Honey Bronze | honey-bronze-finish |
> | 10 | Mahogany Bronze | mahogany-bronze-finish |
> | 11 | Oil Rubbed Bronze | oil-rubbed-bronze-finish |
> | 12 | Pewter Antique | pewter-antique-finish |
> | 13 | Polished Brass | polished-brass-finish |
> | 14 | Polished Chrome | polished-chrome-finish |
> | 15 | Polished Nickel | polished-nickel-finish |
> | 16 | Sable | sable-finish |
> | 17 | Tuscan Bronze | tuscan-bronze-finish |
> | 18 | Umbrio | umbrio-finish |
>
> **Also:** the first collection you already made uses the handle `finish-antique-english`. Please update its handle to `antique-english-finish` so it matches the rest. (You can rename a handle by editing the URL on the existing collection — Shopify will set up a 301 redirect automatically.)
>
> When you're done, confirm: total count of collections created, and whether the rename of the first one succeeded.

---

## Follow-up: update the menu links (manual — Sidekick can't do this part)

Sidekick has a hard limitation on navigation-menu mutations. It can read the menu but can't write to it, so the Finishes sub-navigation has to be updated manually. Don't waste time prompting Sidekick for this — go straight to the menu editor.

**Fast manual path in the Shopify admin:**

1. Open Online Store → Navigation → Main menu
2. Expand the Finishes item — you'll see two existing children pointing at filtered URLs (`/collections/all?filter.v.option.finish=...`)
3. **Fix the existing two first.** Click each one, delete the URL in the Link field, and start typing the finish name. Shopify autocompletes from your collections — pick the matching one (e.g. type "Polished Chrome" → pick the `Polished Chrome` collection from the dropdown). The autocomplete is the trick that makes this fast — you never type a URL.
4. **Add the remaining 16.** Click "Add menu item to Finishes" → Name field gets the finish name → Link field gets the same name (autocompletes) → Add. The button stays open after each add so you can keep going.
5. Save once at the end, not after each one.

Estimated time: ~20 seconds per item once you're in the rhythm. About 6 minutes total.

Use the recipe card below for the exact list of titles. The URL is always `/collections/[handle]-finish` but you shouldn't have to type that — autocomplete handles it.

---

## What was originally a Sidekick prompt (kept for reference, do NOT paste)

The prompt below was supposed to update menu links via Sidekick. It doesn't work because of the mutation limit described above. Left here only so you remember what was tried.

> ~~Now please update the Finishes sub-navigation in main-menu. The child links currently point to `/collections/all?filter.v.option.finish=...` — change each one to point at the matching collection URL using the new handle format `[finish-name]-finish`.~~
>
> ~~For example, the "Antique English" link should change from `/collections/all?filter.v.option.finish=Antique+English` to `/collections/antique-english-finish`.~~
>
> ~~Apply the same conversion to all 18 menu items. Save the menu when done and confirm the count.~~

---

## Recipe card — for manual entry if Sidekick won't batch

If you end up creating these one at a time in Products → Collections → Create collection, here's the values to use. The same description template and rule applies to all 18 — just swap in the title.

**Constant fields (same for every one):**
- Description: `Shop all hardware available in the [Title] finish.`
- Collection type: Smart
- Condition: `Variant's title` `contains` `[Title]`
- Theme template: Default collection

**Variable fields (title + handle):**

| Title | Handle |
|---|---|
| Antique English | antique-english-finish |
| Ash Gray | ash-gray-finish |
| Brushed Satin Brass | brushed-satin-brass-finish |
| Brushed Satin Nickel | brushed-satin-nickel-finish |
| Champagne Bronze | champagne-bronze-finish |
| Cocoa Bronze | cocoa-bronze-finish |
| Flat Black | flat-black-finish |
| German Bronze | german-bronze-finish |
| Honey Bronze | honey-bronze-finish |
| Mahogany Bronze | mahogany-bronze-finish |
| Oil Rubbed Bronze | oil-rubbed-bronze-finish |
| Pewter Antique | pewter-antique-finish |
| Polished Brass | polished-brass-finish |
| Polished Chrome | polished-chrome-finish |
| Polished Nickel | polished-nickel-finish |
| Sable | sable-finish |
| Tuscan Bronze | tuscan-bronze-finish |
| Umbrio | umbrio-finish |

Shopify auto-generates the handle from the title; if it gives you `antique-english` instead of `antique-english-finish`, edit the URL field directly before saving.
