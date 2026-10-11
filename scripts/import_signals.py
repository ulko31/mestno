#!/usr/bin/env python3
"""Prepare source-attributed, non-verbatim observations for review, not automatic publication."""
import argparse
import json
from pathlib import Path
from import_places import safe_url

SUPPORTED = {"quiet", "coworking", "billiards", "free_billiards", "free_coworking", "free_entry", "child_friendly", "wheelchair", "laptop_work", "free_workspace", "wifi", "power_outlets", "board_games", "social_events", "meetups", "speaking_club", "english_club", "rpg", "war_games", "dance", "sports", "climbing", "boxing", "ice_skating", "waterfront", "exhibitions", "workshops", "panoramic_view", "green_interior", "lounge", "chamber_space", "historic_interior", "art_interior", "reading_space", "nature", "garden", "imaginative_exhibition", "live_music", "cinema_events"}

def queue_signals(rows):
    pending, seen = [], set()
    for row in rows:
        key = (row.get("place_id"), row.get("feature"), row.get("value"), row.get("scope"), row.get("source_url"))
        if key in seen:
            continue
        if row.get("feature") not in SUPPORTED or not safe_url(row.get("source_url")):
            raise ValueError("Invalid feature/source URL")
        if row.get("use_permitted") is not True or not row.get("source_family"):
            raise ValueError("Permission status and source family are required")
        seen.add(key)
        pending.append({**row, "status": "pending_review"})
    return pending

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("input", type=Path)
    ap.add_argument("--output", type=Path, default=Path("data/signals_pending.json"))
    args = ap.parse_args()
    rows = queue_signals(json.loads(args.input.read_text(encoding="utf-8")))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Prepared for review:", len(rows))

if __name__ == "__main__":
    main()
