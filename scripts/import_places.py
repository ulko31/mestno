#!/usr/bin/env python3
"""Import attributed place facts and licensed descriptions for query-time retrieval."""
import argparse
import csv
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime.now(timezone.utc).isoformat(timespec="seconds")
DEFAULT_BBOX = "59.80,30.05,60.12,30.65"
CITIES = {"spb": "Санкт-Петербург", "msk": "Москва", "ekb": "Екатеринбург", "kzn": "Казань", "nsk": "Новосибирск", "nnv": "Нижний Новгород"}
KUDAGO = "https://kudago.com/public-api/v1.4/places/"
OSM = "https://overpass-api.de/api/interpreter"
USER_AGENT = "CityContextPrototype/0.1 (personal SPb catalogue; https://city-context-spb.wintry-moss-6546.chatgpt.site)"
LANDMARKS = re.compile(r"эрмитаж|hermitage|эрарта|erarta|петропавловск[а-я]*\s+(?:крепость|собор)|исаакиевск[а-я]*\s+собор|казанск[а-я]*\s+собор|петергоф|peterhof|русский\s+музей", re.I)

def safe_url(value):
    value = str(value or "").strip()
    if value.startswith("www."):
        value = "https://" + value
    parsed = urllib.parse.urlparse(value)
    return value if parsed.scheme in ("https", "http") and parsed.netloc and not parsed.username and not parsed.password else None

def fetch_json(url, payload=None):
    request = urllib.request.Request(url, data=payload, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=75) as response:
        return json.load(response)

def source(url, label, license_name, kind="catalogue"):
    return {"url": url, "label": label, "kind": kind, "license": license_name, "retrieved_at": NOW}

def feature(key, value, ref, scope=None):
    return {"key": key, "value": value, "status": "documented", "source_url": ref, "checked_at": NOW, "scope": scope}

def plain_text(value):
    value=re.sub(r'<(script|style)\b[^>]*>.*?</\1>', ' ', str(value or ''), flags=re.I|re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ',value))).strip()

def merge_documents(old, new):
    docs={}
    for d in old+new:
        key=(d.get('kind'),d.get('source_url'),d.get('id') or d.get('text'))
        prev=docs.get(key)
        if not prev or d.get('retrieved_at',d.get('observed_at',''))>=prev.get('retrieved_at',prev.get('observed_at','')):docs[key]=d
    return list(docs.values())

def base(identifier, title, category, address, lat, lon, refs, website=None):
    return {"id": identifier, "title": title, "category": category, "city": "Санкт-Петербург", "address": address or None,
            "lat": lat, "lon": lon, "website": safe_url(website), "sources": refs, "features": [],
            "price_max": None, "price_scope": None, "price_source_url": None,
            "status": "catalogue", "updated_at": NOW, "notes": "Условия посещения и актуальность требуют проверки."}

def kudago_places(data, city="spb"):
    for row in data.get("results", []):
        if row.get("is_closed") or not row.get("title"):
            continue
        cats = [x.get("slug", "") if isinstance(x, dict) else x for x in row.get("categories", [])]
        category = "other"
        priorities = [("cowork", "coworking"), ("librar", "library"), ("anticafe", "anticafe"), ("billiard", "billiards"),
                      ("climbing", "sport"), ("sports", "sport"), ("skating-rink", "sport"), ("art-cent", "space"),
                      ("nightclub", "club"), ("club", "club"), ("bar", "bar"),
                      ("cafe", "cafe"), ("restaurant", "restaurant"), ("museum", "museum"), ("galler", "gallery"),
                      ("park", "park"), ("cinema", "cinema"), ("theat", "theatre"), ("billiard", "billiards"),
                      ("recreation", "activity"), ("attraction", "activity")]
        for needle, target in priorities:
            if any(needle in c for c in cats):
                category = target
                break
        coords = row.get("coords") or {}
        ref = safe_url(row.get("site_url"))
        if not ref:
            continue  # Attribution to the particular material is mandatory.
        place = base("kudago:" + str(row["id"]), row["title"], category, row.get("address"),
                     coords.get("lat"), coords.get("lon"), [source(ref, "KudaGo", "KudaGo open API terms")], row.get("foreign_url"))
        place["city"] = CITIES.get(city, city)
        place["provider_ids"] = {"kudago": row["id"]}
        place["comments_count"] = row.get("comments_count", 0)
        place["is_landmark"] = bool(LANDMARKS.search(row["title"]))
        place["subway"] = row.get("subway") or None
        place["tags"] = cats
        description=plain_text(row.get('body_text') or row.get('description'))[:8000]
        place['documents']=[{'id':'kudago:description:'+str(row['id']),'kind':'description','text':description,
            'source_url':ref,'observed_at':NOW,'retrieved_at':NOW}] if description else []
        if category == "coworking":
            place["features"].extend([feature("coworking", True, ref), feature("laptop_work", True, ref)])
        if category == "billiards":
            place["features"].append(feature("billiards", True, ref))
        if category == "sport":
            place["features"].append(feature("sports", True, ref))
        yield place

def osm_places(data):
    categories = {"cafe": "cafe", "restaurant": "restaurant", "bar": "bar", "pub": "bar", "library": "library",
                  "coworking": "coworking", "cinema": "cinema", "theatre": "theatre", "museum": "museum",
                  "gallery": "gallery", "park": "park", "billiards": "billiards", "bowling_alley": "activity",
                  "dance": "activity", "sports_centre": "sport", "climbing": "sport", "boxing": "sport", "ice_skating": "sport"}
    for row in data.get("elements", []):
        tags = row.get("tags") or {}
        name = tags.get("name:ru") or tags.get("name")
        if not name or tags.get("access") == "private" or tags.get("disused") == "yes":
            continue
        category = next((categories[tags[key]] for key in ("office", "amenity", "tourism", "leisure", "sport")
                         if tags.get(key) in categories), "other")
        ref = "https://www.openstreetmap.org/" + row["type"] + "/" + str(row["id"])
        address = ", ".join(str(tags[k]) for k in ("addr:street", "addr:housenumber") if tags.get(k))
        center = row.get("center") or row
        place = base("osm:" + row["type"] + ":" + str(row["id"]), name, category, address,
                     center.get("lat"), center.get("lon"), [source(ref, "OpenStreetMap", "ODbL-1.0")],
                     tags.get("website") or tags.get("contact:website"))
        if category == "coworking":
            place["features"].extend([feature("coworking", True, ref), feature("laptop_work", True, ref)])
        if category == "sport":
            place["features"].append(feature("sports", True, ref))
        if tags.get("sport") in ("climbing", "boxing", "ice_skating"):
            place["features"].append(feature(tags["sport"], True, ref))
        if tags.get("sport") == "billiards":
            place["features"].append(feature("billiards", True, ref))
        if tags.get("billiards:fee") == "no":
            place["features"].append(feature("free_billiards", True, ref, "game"))
        if tags.get("fee") == "no":
            place["features"].append(feature("free_entry", True, ref, "entry"))
        if tags.get("wheelchair") in ("yes", "no", "limited"):
            place["features"].append(feature("wheelchair", tags["wheelchair"], ref))
        place["opening_hours"] = tags.get("opening_hours") or None
        yield place

def normalize_name(value):
    return re.sub(r"[^a-zа-я0-9]", "", (value or "").lower().replace("ё", "е"))

def merge(existing, incoming):
    """Only identical source IDs or identical title+nonempty address; never merge chain branches by name."""
    records = {p["id"]: json.loads(json.dumps(p)) for p in existing}
    exact = {(normalize_name(p.get("city")), normalize_name(p["title"]), normalize_name(p.get("address"))): p["id"]
             for p in existing if p.get("address")}
    for new in incoming:
        key = (normalize_name(new.get("city")), normalize_name(new["title"]), normalize_name(new.get("address")))
        identifier = new["id"] if new["id"] in records else exact.get(key) if new.get("address") else None
        if identifier:
            old = records[identifier]
            old["sources"] = list({s["url"]: s for s in old["sources"] + new["sources"]}.values())
            old["provider_ids"] = {**old.get("provider_ids", {}), **new.get("provider_ids", {})}
            if new.get("comments_count") is not None:old["comments_count"] = new["comments_count"]
            old["is_landmark"] = old.get("is_landmark", False) or new.get("is_landmark", False)
            old["features"] = list({(s["key"], str(s["value"]), s["source_url"], s.get("scope")): s
                                     for s in old["features"] + new["features"]}.values())
            snapshots=dict(old.get('review_snapshots',{}))
            for ref,date in new.get('review_snapshots',{}).items():
                if ref not in snapshots or date>snapshots[ref]:
                    old['documents']=[d for d in old.get('documents',[]) if d.get('kind')!='review' or d.get('source_url')!=ref]
                    snapshots[ref]=date
            next_docs=[d for d in new.get('documents',[]) if d.get('kind')!='review' or d.get('source_url') not in snapshots
                or new.get('review_snapshots',{}).get(d['source_url'],d.get('retrieved_at',d.get('observed_at','')))>=snapshots[d['source_url']]]
            old['documents']=merge_documents(old.get('documents',[]),next_docs)
            if snapshots:old['review_snapshots']=snapshots
            for field in ("address", "lat", "lon", "website", "opening_hours"):
                if old.get(field) is None and new.get(field) is not None:
                    old[field] = new[field]
        else:
            records[new["id"]] = new
            if new.get("address"):
                exact[key] = new["id"]
    return sorted(records.values(), key=lambda p: p["title"].lower())

def validate(places):
    for p in places:
        if not p.get("id") or not p.get("title") or not p.get("sources"):
            raise ValueError("Every place needs an ID, title and provenance")
        if not all(safe_url(s.get("url")) for s in p["sources"]):
            raise ValueError("Invalid source URL")
        docs=p.get('documents',[])
        if not isinstance(docs,list) or len(docs)>100 or any(not isinstance(d,dict) or not isinstance(d.get('text'),str)
            or len(d['text'])>24000 or not safe_url(d.get('source_url')) or d.get('kind') not in ('description','review','editorial') for d in docs):
            raise ValueError('Invalid text document')
        for key, low, high in (("lat", -90, 90), ("lon", -180, 180)):
            v = p.get(key)
            if v is not None and (not isinstance(v, (float, int)) or not low <= v <= high):
                raise ValueError("Invalid coordinate")

def write_catalogue(places, output):
    validate(places)
    payload = {"schema_version": 1, "cities": sorted({p.get("city", "Санкт-Петербург") for p in places}), "generated_at": NOW,
               "source_licenses": {"OpenStreetMap": "https://www.openstreetmap.org/copyright",
                                   "KudaGo": "https://docs.kudago.com/api/"}, "places": places}
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(output)
    csv_path = output.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["id", "title", "city", "category", "address", "lat", "lon", "sources"])
        for p in places:
            w.writerow([p.get(k) for k in ("id", "title", "city", "category", "address", "lat", "lon")] +
                       [" | ".join(s["url"] for s in p["sources"])])
    return payload

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=["kudago", "osm", "all", "file"], default="all")
    parser.add_argument("--city", choices=list(CITIES), default="spb")
    parser.add_argument("--input", type=Path, help="Local API export or catalogue (no network required)")
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "places.json")
    parser.add_argument("--max-pages", type=int, default=20)
    parser.add_argument("--bbox", default=DEFAULT_BBOX, help="south,west,north,east; default excludes distant suburbs")
    args = parser.parse_args()
    if args.city != "spb" and args.provider in ("osm", "all"):
        parser.error("For other cities use --provider kudago; the default OSM bbox covers SPb only")
    if args.max_pages < 1 or args.max_pages > 100:
        parser.error("--max-pages must be between 1 and 100")
    existing = json.loads(args.output.read_text(encoding="utf-8")).get("places", []) if args.output.exists() else []
    collected, errors, closed_ids = [], [], set()
    if args.input:
        data = json.loads(args.input.read_text(encoding="utf-8"))
        collected = data.get("places", []) if args.provider == "file" else list(
            osm_places(data) if args.provider == "osm" else kudago_places(data, args.city))
    else:
        if args.provider in ("kudago", "all"):
            try:
                for page in range(1, args.max_pages + 1):
                    query = urllib.parse.urlencode({"location": args.city, "page": page, "page_size": 100,
                                                    "fields": "id,title,address,coords,site_url,categories,is_closed,subway,foreign_url,comments_count,description,body_text", "text_format":"text"})
                    data = fetch_json(KUDAGO + "?" + query)
                    closed_ids.update('kudago:'+str(p['id']) for p in data.get('results',[]) if p.get('is_closed'))
                    collected.extend(kudago_places(data, args.city))
                    print("KudaGo: page", page, "records", len(collected), file=sys.stderr)
                    if not data.get("next"):
                        break
            except Exception as exc:
                errors.append("KudaGo: " + str(exc))
        if args.provider in ("osm", "all"):
            try:
                values = [float(v) for v in args.bbox.split(",")]
                if len(values) != 4 or not (-90 <= values[0] < values[2] <= 90 and -180 <= values[1] < values[3] <= 180):
                    raise ValueError("Invalid bbox")
                bbox = ",".join(str(v) for v in values)
                query = ("[out:json][timeout:60];(nwr[amenity~\"^(cafe|restaurant|bar|pub|library|coworking|cinema|theatre)$\"](" + bbox +
                         ");nwr[office=coworking](" + bbox + ");nwr[tourism~\"^(museum|gallery)$\"](" + bbox +
                         ");nwr[leisure~\"^(park|bowling_alley|sports_centre)$\"](" + bbox +
                         ");nwr[sport~\"^(billiards|climbing|boxing|ice_skating)$\"](" + bbox + "););out center tags;")
                collected.extend(osm_places(fetch_json(OSM, urllib.parse.urlencode({"data": query}).encode())))
            except Exception as exc:
                errors.append("OSM: " + str(exc))
        if args.provider == "file":
            parser.error("--provider file requires --input")
    if collected or closed_ids:
        merged = merge(existing, collected)
        for p in merged:
            if p['id'] in closed_ids or 'kudago:'+str(p.get('provider_ids',{}).get('kudago')) in closed_ids:p['status']='closed'
        result = write_catalogue(merged, args.output)
        print(json.dumps({"imported_rows": len(collected), "catalogue_size": len(merged), "output": str(args.output),
                          "warnings": errors}, ensure_ascii=False))
        if errors:
            return 2  # No success claim on partial source failure.
    else:
        print(json.dumps({"catalogue_preserved": True, "warnings": errors or ["No incoming places"]}, ensure_ascii=False))
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
