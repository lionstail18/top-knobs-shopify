#!/usr/bin/env python3
"""Tag one product per design family with `primary-finish` and write per-family
finish metafields, used by collection pages to dedupe to one card per design.

Pipeline:
  1. Fetch every product (id, handle, title, vendor, tags, variants[0].sku, the
     finish metafields).
  2. Group products into design families by SKU pattern (ATL- / TPK-TK-) or, for
     M-coded Top Knobs SKUs, by stripped product title.
  3. For each family, pick the primary product using a balanced rotation:
     among the 8 rotation finishes that are AVAILABLE in that family, pick the
     one with the lowest count so far in the pass (ties broken by rotation
     order). If no rotation finish is available, fall back to a "premium" score
     (prefer brushed/polished/satin > bronze > matte/flat).
  4. Diff against current store state, then write only what differs:
       - tagsAdd  primary-finish on the new primary
       - tagsRemove primary-finish on the old primary if it changed
       - metafieldsSet top_knobs.finish_name and top_knobs.family_finishes
         on every product whose value differs

The script is idempotent: a clean re-run after the data has stabilised is a
no-op. It is also resumable: progress is written every N families, and re-running
with the same --output-dir picks up where it left off.

Auth: requires read_products + write_products scopes:
    shopify store auth --store <store>.myshopify.com --scopes read_products,write_products
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
import subprocess
import sys
import threading
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

DEFAULT_STORE = "3bfxti-00.myshopify.com"
NAMESPACE = "top_knobs"

ROTATION = [
    "Polished Nickel", "Honey Bronze", "Matte Black", "Brushed Satin Nickel",
    "Polished Chrome", "Champagne Bronze", "Oil Rubbed Bronze", "Brushed Nickel",
]
ROT_INDEX = {f: i for i, f in enumerate(ROTATION)}

FINISH_VOCAB = [
    "Brushed Satin Nickel", "Polished Stainless Steel", "Brushed Stainless Steel",
    "Oil Rubbed Bronze", "Brushed Satin Brass", "Antique English", "Polished Chrome",
    "Polished Nickel", "Antique Pewter", "Champagne Bronze", "Mahogany Bronze",
    "Tuscan Bronze", "German Bronze", "Honey Bronze", "Modern Bronze", "Patina Rouge",
    "Patina Black", "Venetian Bronze", "Burnished Bronze", "Brushed Bronze",
    "Light Bronze", "Medium Bronze", "Cocoa Bronze", "Antique Bronze", "Aged Bronze",
    "Cafe Bronze", "Brushed Nickel", "Matte Black", "Flat Black", "Coal Black",
    "Black Nickel", "French Gold", "Matte Rose Gold", "Matte Gold", "Polished Brass",
    "Vintage Brass", "Dark Antique Brass", "Brass Antique", "Satin Brass",
    "Old English Copper", "Antique Copper", "Stainless Steel", "Cast Iron",
    "Pewter Antique", "Pewter Light", "Matte Chrome", "High White Gloss",
    "Warm Brass", "Ash Gray", "Sable", "Umbrio", "Slate", "Champagne", "Rust",
    "Pewter", "Iron", "Aluminum", "Graphite", "Silicon Bronze Light",
    "Silicon Bronze Medium",
]
FINISH_PATS = [(f, re.compile(r"\b" + re.escape(f) + r"\b", re.I))
               for f in sorted(set(FINISH_VOCAB), key=len, reverse=True)]

FINISH_CODE_MAP = {
    "PN": "Polished Nickel", "PC": "Polished Chrome", "HB": "Honey Bronze",
    "BLK": "Flat Black", "MB": "Matte Black", "BSN": "Brushed Satin Nickel",
    "BN": "Brushed Nickel", "OB": "Oil Rubbed Bronze", "ORB": "Oil Rubbed Bronze",
    "CB": "Champagne Bronze", "TB": "Tuscan Bronze", "GBZ": "German Bronze",
    "ABZ": "Aged Bronze", "AP": "Antique Pewter", "PTA": "Antique Pewter",
    "AG": "Ash Gray", "SAB": "Sable", "UM": "Umbrio", "VB": "Venetian Bronze",
    "SL": "Slate",
    "BRN": "Brushed Nickel", "CH": "Polished Chrome", "BL": "Matte Black",
    "WB": "Warm Brass", "CM": "Champagne", "O": "Aged Bronze",
    "BB": "Burnished Bronze", "WG": "High White Gloss", "P": "Pewter", "R": "Rust",
}

PRODUCTS_QUERY = """
query Products($cursor: String) {
  products(first: 250, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      handle
      title
      vendor
      tags
      finish: metafield(namespace: "details", key: "finish") { value }
      tkFamilyFinishes: metafield(namespace: "%s", key: "family_finishes") { value }
      tkFinishName: metafield(namespace: "%s", key: "finish_name") { value }
      variants(first: 1) { nodes { sku } }
    }
  }
}
""" % (NAMESPACE, NAMESPACE)

TAGS_ADD_MUTATION = """
mutation TagsAdd($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    node { ... on Product { id } }
    userErrors { field message }
  }
}
"""

TAGS_REMOVE_MUTATION = """
mutation TagsRemove($id: ID!, $tags: [String!]!) {
  tagsRemove(id: $id, tags: $tags) {
    node { ... on Product { id } }
    userErrors { field message }
  }
}
"""

METAFIELDS_SET_MUTATION = """
mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id }
    userErrors { field message code }
  }
}
"""

# --------------------------------------------------------------------------- #
# Shopify CLI shell wrapper                                                   #
# --------------------------------------------------------------------------- #

class Shopify:
    def __init__(self, store: str):
        self.store = store
        self._lock = threading.Lock()

    def call(self, query: str, variables: dict, allow_mutations: bool = False, retries: int = 4):
        """Run one shopify-CLI GraphQL call with throttle/backoff. Returns (ok, msg, data)."""
        last_err = None
        for attempt in range(retries):
            cmd = ["shopify", "store", "execute", "--store", self.store,
                   "--query", query, "--variables", json.dumps(variables), "--json"]
            if allow_mutations:
                cmd.append("--allow-mutations")
            try:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
            except subprocess.TimeoutExpired:
                last_err = "timeout"
                time.sleep(2 + random.random() * 2)
                continue
            out = proc.stdout.strip()
            if not out:
                last_err = f"empty stdout: {proc.stderr[:200]}"
                time.sleep(2 + random.random() * 2)
                continue
            try:
                d = json.loads(out)
            except json.JSONDecodeError:
                last_err = f"non-json: {out[:200]}"
                time.sleep(2 + random.random() * 2)
                continue
            top = d.get("errors") or []
            throttled = any("THROTTLED" in str(e).upper() or "rate limit" in str(e).lower() for e in top)
            if throttled:
                wait = 2 ** attempt + random.random()
                time.sleep(wait)
                last_err = "throttled"
                continue
            if top:
                return False, f"top_errs={str(top)[:300]}", d
            return True, "ok", d
        return False, last_err or "unknown", None

# --------------------------------------------------------------------------- #
# Fetch                                                                       #
# --------------------------------------------------------------------------- #

def fetch_all_products(sh: Shopify) -> list[dict]:
    print(f"Fetching products from {sh.store} ...", flush=True)
    cursor = None
    products: list[dict] = []
    page = 0
    while True:
        page += 1
        ok, msg, d = sh.call(PRODUCTS_QUERY, {"cursor": cursor} if cursor else {})
        if not ok:
            sys.exit(f"fetch failed on page {page}: {msg}")
        node = d["products"]
        products.extend(node["nodes"])
        print(f"  page {page}: {len(node['nodes'])} products (running total: {len(products)})", flush=True)
        if not node["pageInfo"]["hasNextPage"]:
            break
        cursor = node["pageInfo"]["endCursor"]
    return products

# --------------------------------------------------------------------------- #
# Parse & plan                                                                #
# --------------------------------------------------------------------------- #

def detect_finish(metafield_value, title, sku):
    if metafield_value:
        return metafield_value
    for name, pat in FINISH_PATS:
        if pat.search(title):
            return name
    if sku:
        m = re.search(r"-([A-Z]{1,4})$", sku)
        if m and m.group(1) in FINISH_CODE_MAP:
            return FINISH_CODE_MAP[m.group(1)]
        m = re.match(r"^TPK-TK\d+([A-Z]{2,4})$", sku)
        if m and m.group(1) in FINISH_CODE_MAP:
            return FINISH_CODE_MAP[m.group(1)]
    return None

def parse_root(sku, title, finish):
    sku = sku or ""
    if sku.startswith("ATL-"):
        parts = sku.split("-")
        return "ATL:" + ("-".join(parts[1:-1]) if len(parts) >= 3 else sku)
    m = re.match(r"^TPK-(TK\d+)([A-Z]{2,4})$", sku)
    if m:
        return "TPK:" + m.group(1)
    if sku.startswith("TPK-"):
        body = sku[4:]
        clean = re.sub(r"\b" + re.escape(body) + r"\b", " ", title, flags=re.I)
        clean = re.sub(r"\b[MT]K?\d+[A-Z]*\b", " ", clean)
        if finish:
            clean = re.sub(r"\b" + re.escape(finish) + r"\b", " ", clean, flags=re.I)
        for f, pat in FINISH_PATS:
            clean = pat.sub(" ", clean)
        clean = re.sub(r"\bBase\b", " ", clean, flags=re.I)
        clean = re.sub(r"\s+", " ", clean).strip().lower()
        return "TPK_T:" + clean
    clean = title
    if finish:
        clean = re.sub(r"\b" + re.escape(finish) + r"\b", " ", clean, flags=re.I)
    clean = re.sub(r"\b[A-Z]{1,3}\d+[A-Z]*\b", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip().lower()
    return "UNK:" + clean

def premium_score(f):
    if not f:
        return 0
    fl = f.lower()
    if "brushed satin" in fl: return 100
    if "polished" in fl: return 90
    if "brushed" in fl: return 80
    if "satin" in fl: return 75
    if "honey" in fl: return 65
    if "champagne" in fl or "warm brass" in fl: return 62
    if "bronze" in fl: return 60
    if any(w in fl for w in ("pewter", "brass", "gold", "copper")): return 50
    if any(w in fl for w in ("ash gray", "slate", "sable", "umbrio")): return 40
    if "matte" in fl: return 20
    if "flat" in fl: return 15
    return 30

def normalise_member(p):
    sku = p["variants"]["nodes"][0]["sku"] if p["variants"]["nodes"] else None
    mf = (p.get("finish") or {}).get("value") if p.get("finish") else None
    finish = detect_finish(mf, p["title"], sku)
    return {
        "product_id": p["id"],
        "handle": p["handle"],
        "sku": sku,
        "title": p["title"],
        "vendor": p["vendor"],
        "finish": finish,
        "tags": p["tags"],
        "current_finish_name": (p.get("tkFinishName") or {}).get("value") if p.get("tkFinishName") else None,
        "current_family_finishes": (p.get("tkFamilyFinishes") or {}).get("value") if p.get("tkFamilyFinishes") else None,
        "has_primary_tag": "primary-finish" in p["tags"],
    }

def build_families(products):
    fams: defaultdict[str, list] = defaultdict(list)
    for p in products:
        m = normalise_member(p)
        fams[parse_root(m["sku"], m["title"], m["finish"])].append(m)
    return fams

def select_primaries_balanced(families):
    """Returns dict family -> chosen member dict. Uses least-used-first balance."""
    counter: Counter = Counter()
    chosen = {}
    for root in sorted(families):
        members = families[root]
        by_finish = {m["finish"]: m for m in members if m["finish"]}
        available = [f for f in ROTATION if f in by_finish]
        if available:
            best = min(available, key=lambda f: (counter[f], ROT_INDEX[f]))
            chosen[root] = by_finish[best]
            counter[best] += 1
        else:
            chosen[root] = sorted(members, key=lambda m: -premium_score(m["finish"]))[0]
    return chosen, counter

def build_actions(families, chosen):
    """Diff desired state against current state. Returns list of action dicts."""
    actions = []
    for root in sorted(families):
        members = families[root]
        primary = chosen[root]
        ff_target = sorted(
            [{"name": m["finish"], "handle": m["handle"]} for m in members if m["finish"]],
            key=lambda x: x["name"],
        )
        ff_json = json.dumps(ff_target, separators=(",", ":"))

        old_primary = next((m for m in members if m["has_primary_tag"]), None)
        retag_old_id = old_primary["product_id"] if old_primary and old_primary["product_id"] != primary["product_id"] else None
        tag_new_id = primary["product_id"] if not primary["has_primary_tag"] else None

        meta_writes = []
        for m in members:
            if m["finish"] and m["current_finish_name"] != m["finish"]:
                meta_writes.append({
                    "ownerId": m["product_id"],
                    "namespace": NAMESPACE, "key": "finish_name",
                    "type": "single_line_text_field", "value": m["finish"],
                })
            if ff_target and m["current_family_finishes"] != ff_json:
                meta_writes.append({
                    "ownerId": m["product_id"],
                    "namespace": NAMESPACE, "key": "family_finishes",
                    "type": "json", "value": ff_json,
                })

        actions.append({
            "family": root,
            "family_size": len(members),
            "primary_id": primary["product_id"],
            "primary_handle": primary["handle"],
            "primary_finish": primary["finish"],
            "old_primary_id": old_primary["product_id"] if old_primary else None,
            "old_primary_handle": old_primary["handle"] if old_primary else None,
            "old_primary_finish": old_primary["finish"] if old_primary else None,
            "retag_old_id": retag_old_id,
            "tag_new_id": tag_new_id,
            "meta_writes": meta_writes,
            "members": members,
            "family_finishes_target": ff_target,
        })
    return actions

# --------------------------------------------------------------------------- #
# Apply                                                                       #
# --------------------------------------------------------------------------- #

class ProgressFile:
    def __init__(self, path: Path):
        self.path = path
        if path.exists():
            self.data = json.loads(path.read_text())
        else:
            self.data = {"completed_families": [], "results": []}
        self.lock = threading.Lock()

    @property
    def done(self) -> set:
        return set(self.data["completed_families"])

    def record(self, family: str, result: dict):
        with self.lock:
            self.data["completed_families"].append(family)
            self.data["results"].append(result)

    def save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data))
        tmp.replace(self.path)

MAX_METAFIELDS_PER_CALL = 24

def apply_action(sh: Shopify, action: dict) -> dict:
    result = {"family": action["family"], "tag_change": "skip", "untag": "skip",
              "metafield_writes": 0, "errors": []}

    if action["retag_old_id"]:
        ok, msg, _ = sh.call(TAGS_REMOVE_MUTATION,
                             {"id": action["retag_old_id"], "tags": ["primary-finish"]},
                             allow_mutations=True)
        result["untag"] = "ok" if ok else "fail"
        if not ok:
            result["errors"].append(f"untag: {msg}")
            return result

    if action["tag_new_id"]:
        ok, msg, _ = sh.call(TAGS_ADD_MUTATION,
                             {"id": action["tag_new_id"], "tags": ["primary-finish"]},
                             allow_mutations=True)
        result["tag_change"] = "ok" if ok else "fail"
        if not ok:
            result["errors"].append(f"tag: {msg}")
            return result

    for i in range(0, len(action["meta_writes"]), MAX_METAFIELDS_PER_CALL):
        batch = action["meta_writes"][i:i + MAX_METAFIELDS_PER_CALL]
        ok, msg, d = sh.call(METAFIELDS_SET_MUTATION, {"metafields": batch}, allow_mutations=True)
        if ok:
            ue = (d.get("metafieldsSet") or {}).get("userErrors") or []
            if ue:
                result["errors"].append(f"meta_userErrs: {str(ue)[:300]}")
            result["metafield_writes"] += len(batch)
        else:
            result["errors"].append(f"meta: {msg}")
            break
    return result

def run_apply(sh: Shopify, actions: list, output_dir: Path, workers: int) -> ProgressFile:
    progress = ProgressFile(output_dir / "progress.json")
    pending = [a for a in actions if a["family"] not in progress.done
               and (a["retag_old_id"] or a["tag_new_id"] or a["meta_writes"])]
    total = len(pending)
    print(f"Applying changes: {total} families pending ({len(progress.done)} resumed), {workers} workers", flush=True)

    if total == 0:
        return progress

    start = time.time()
    n_ok = sum(1 for r in progress.data["results"] if not r.get("errors"))
    n_fail = sum(1 for r in progress.data["results"] if r.get("errors"))
    completed = 0
    finish_dist = Counter()
    for a in actions:
        if a["family"] in progress.done:
            finish_dist[a["primary_finish"] or "(unknown)"] += 1

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(apply_action, sh, a): a for a in pending}
        for fut in as_completed(futures):
            action = futures[fut]
            try:
                result = fut.result()
            except Exception as e:
                result = {"family": action["family"], "errors": [str(e)],
                          "tag_change": "exc", "untag": "exc", "metafield_writes": 0}
            completed += 1
            if result["errors"]:
                n_fail += 1
            else:
                n_ok += 1
            finish_dist[action["primary_finish"] or "(unknown)"] += 1
            progress.record(action["family"], {
                "family": action["family"],
                "family_size": action["family_size"],
                "primary_id": action["primary_id"],
                "primary_handle": action["primary_handle"],
                "primary_finish": action["primary_finish"],
                "old_primary_id": action["old_primary_id"],
                "old_primary_handle": action["old_primary_handle"],
                "old_primary_finish": action["old_primary_finish"],
                **result,
            })
            if completed % 200 == 0:
                progress.save()
            if completed % 100 == 0:
                elapsed = time.time() - start
                rate = completed / elapsed if elapsed else 0
                eta = (total - completed) / rate if rate else 0
                top = ", ".join(f"{(k or '?').split()[0][:6]}={v}"
                                for k, v in finish_dist.most_common(5))
                print(f"progress: {completed}/{total} ok={n_ok} fail={n_fail} "
                      f"rate={rate:.1f}/s eta={eta:.0f}s top: {top}", flush=True)
    progress.save()
    elapsed = time.time() - start
    print(f"DONE total={completed} ok={n_ok} fail={n_fail} elapsed={elapsed:.0f}s", flush=True)
    return progress

# --------------------------------------------------------------------------- #
# Reporting                                                                   #
# --------------------------------------------------------------------------- #

def write_report_csv(actions, output_dir: Path):
    path = output_dir / "primary-finish-report.csv"
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["family_root", "product_handle", "sku", "title", "vendor",
                    "finish_name", "was_tagged_primary", "family_size",
                    "family_finishes_json_truncated"])
        for a in actions:
            ff_json = json.dumps(a["family_finishes_target"], separators=(",", ":"))
            ff_short = ff_json[:197] + "..." if len(ff_json) > 200 else ff_json
            for m in a["members"]:
                w.writerow([
                    a["family"], m["handle"], m["sku"] or "", m["title"], m["vendor"],
                    m["finish"] or "",
                    "yes" if m["product_id"] == a["primary_id"] else "no",
                    a["family_size"], ff_short,
                ])
    print(f"  wrote {path} ({path.stat().st_size:,} bytes)")

def write_change_csv(actions, output_dir: Path):
    path = output_dir / "primary-finish-changes.csv"
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["family", "family_size", "action",
                    "old_finish", "old_handle", "new_finish", "new_handle",
                    "metafield_writes_planned"])
        for a in actions:
            if a["retag_old_id"] or a["tag_new_id"]:
                action = "RETAG"
            elif a["meta_writes"]:
                action = "META_ONLY"
            else:
                action = "kept"
            w.writerow([
                a["family"], a["family_size"], action,
                a["old_primary_finish"] or "", a["old_primary_handle"] or "",
                a["primary_finish"] or "", a["primary_handle"] or "",
                len(a["meta_writes"]),
            ])
    print(f"  wrote {path} ({path.stat().st_size:,} bytes)")

def print_distribution(actions, label):
    dist = Counter(a["primary_finish"] or "(unknown)" for a in actions)
    print(f"\n{label} (top 12 of {len(dist)} distinct):")
    for f, c in dist.most_common(12):
        print(f"  {f:<30} {c:>6}")

# --------------------------------------------------------------------------- #
# Entry point                                                                 #
# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--store", default=DEFAULT_STORE,
                        help=f"Shopify store domain (default: {DEFAULT_STORE})")
    parser.add_argument("--workers", type=int, default=8,
                        help="Parallel mutation workers (default: 8)")
    parser.add_argument("--output-dir", type=Path, default=Path("./tag-primary-output"),
                        help="Where to write CSVs + progress file (default: ./tag-primary-output)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Plan and print what would change; do not write to Shopify")
    parser.add_argument("--reset", action="store_true",
                        help="Delete the resume progress file and start fresh")
    parser.add_argument("--skip-fetch", action="store_true",
                        help="Re-use products.json from output dir (debug aid)")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.reset:
        for fn in ("progress.json", "products.json"):
            p = args.output_dir / fn
            if p.exists():
                p.unlink()

    sh = Shopify(args.store)

    products_cache = args.output_dir / "products.json"
    if args.skip_fetch and products_cache.exists():
        print(f"Loading cached products from {products_cache}", flush=True)
        products = json.loads(products_cache.read_text())
    else:
        products = fetch_all_products(sh)
        products_cache.write_text(json.dumps(products))

    families = build_families(products)
    chosen, counter = select_primaries_balanced(families)
    actions = build_actions(families, chosen)

    print(f"\nFamilies: {len(families)}, products: {sum(len(v) for v in families.values())}")
    print(f"\nRotation-finish counts (balanced selection):")
    for f in ROTATION:
        print(f"  {f:<30} {counter[f]:>6}")

    print_distribution(actions, "All-finish distribution")

    n_retag = sum(1 for a in actions if a["retag_old_id"] or a["tag_new_id"])
    n_meta = sum(1 for a in actions if a["meta_writes"])
    n_meta_writes = sum(len(a["meta_writes"]) for a in actions)
    print(f"\nWork required:")
    print(f"  primary-tag changes: {n_retag} families")
    print(f"  metafield writes:    {n_meta_writes} fields across {n_meta} families")

    write_report_csv(actions, args.output_dir)
    write_change_csv(actions, args.output_dir)

    if args.dry_run:
        print("\nDRY RUN — no mutations were sent.")
        return

    if n_retag == 0 and n_meta_writes == 0:
        print("\nNothing to do — store is already in the desired state.")
        return

    run_apply(sh, actions, args.output_dir, args.workers)

if __name__ == "__main__":
    main()
