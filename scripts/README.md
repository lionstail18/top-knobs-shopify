# scripts/

Operational scripts for the Top Knobs Shopify store. Run from the repo root.

## tag-primary-finishes.py

Picks one product per design family to be the `primary-finish` representative
on collection pages, and writes the per-family finish metadata that the
collection-page finish picker reads.

**What it writes**

| Target | What | Where |
|---|---|---|
| `primary-finish` tag | One product per design family | Tags on the chosen product |
| `top_knobs.finish_name` | The product's own finish (e.g. "Polished Chrome") | Metafield on every product |
| `top_knobs.family_finishes` | JSON array of `{name, handle}` for every sister product | Metafield on every product |

The "primary" pick uses a balanced rotation: among `[Polished Nickel, Honey
Bronze, Matte Black, Brushed Satin Nickel, Polished Chrome, Champagne Bronze,
Oil Rubbed Bronze, Brushed Nickel]`, the script picks whichever finish is
available in that family AND has been used least so far in the pass. If none
of the rotation finishes are available, it falls back to a "premium" score
(brushed/polished/satin > bronze > matte/flat).

### Auth

You must be authenticated against the store with `read_products` AND
`write_products` scopes — the read-only token from `read_products` alone will
fail at the first mutation. Re-auth before running:

```sh
shopify store auth --store 3bfxti-00.myshopify.com --scopes read_products,write_products
```

### Re-running after a product import

This is the common case. Run it from the repo root:

```sh
python3 scripts/tag-primary-finishes.py --dry-run
```

The dry-run will fetch all products, parse them into design families, compute
the desired tag/metafield state, diff against what's actually in the store, and
print:

- the rotation-finish distribution (PN/HB/MB/BSN/PC/CB/ORB/BN)
- the number of primary-tag changes required
- the number of metafield writes required
- two CSVs in `./tag-primary-output/` (`primary-finish-report.csv`,
  `primary-finish-changes.csv`) — review these before applying

If the diff looks right, run it for real (drop `--dry-run`):

```sh
python3 scripts/tag-primary-finishes.py
```

The script is **idempotent**: running it on a stable catalog is a no-op
(0 changes, 0 metafield writes). Running it after an import only touches the
products whose tags or metafields don't match the current desired state.

### Resume

Progress is saved every 200 families to
`./tag-primary-output/progress.json`. If the run is interrupted (Ctrl-C, network
flake), just re-run the same command — it'll skip families already recorded.

To start over from scratch, pass `--reset`:

```sh
python3 scripts/tag-primary-finishes.py --reset
```

### Other flags

| Flag | Default | Notes |
|---|---|---|
| `--store` | `3bfxti-00.myshopify.com` | Override the target store |
| `--workers` | `8` | Parallel mutation workers. Lowering reduces risk of throttling; raising past ~12 hits diminishing returns since `shopify store execute` Node startup is the bottleneck. |
| `--output-dir` | `./tag-primary-output` | Where CSVs + progress live |
| `--skip-fetch` | off | Reuse cached `products.json` from the output dir (debug aid; do not use for a production re-run) |

### Expected runtime

| Catalog state | Approx duration |
|---|---|
| Full first run (10k products, all writes) | 45 minutes |
| Rebalance only (~1k tag swaps) | 22 minutes |
| Idempotent re-run (0 writes) | ~3 minutes (just the fetch) |
| After typical small import (a few new families) | ~3-5 minutes |

The fetch alone runs ~41 paginated GraphQL calls and takes ~2-3 minutes; the
rest scales linearly with the number of changes.

### When the diff is large after an import

If the dry-run shows a *lot* of unexpected changes (e.g. hundreds of retags
when you only imported a few products), it usually means SKU patterns from the
new vendor don't match the parser's TPK-/ATL-/TPK-M conventions and have
collapsed into the wrong families. Look at `primary-finish-changes.csv` and
verify the `family` column groupings before applying.
