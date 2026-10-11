#!/usr/bin/env python3
"""Parse original link submissions into a review queue. Does not publish or invent facts."""
import argparse
import json
from datetime import datetime
from pathlib import Path
from import_places import safe_url

def parse_recommendations(payload):
    if not isinstance(payload,dict):
        raise ValueError('Expected a recommendation export object')
    rows=payload.get('recommendations')
    if payload.get('schema_version')!=1 or not isinstance(rows,list) or len(rows)>5000:
        raise ValueError('Expected up to 5000 source-attributed recommendations')
    queue={}
    for row in rows:
        if not isinstance(row,dict) or not safe_url(row.get('source_url')) or row.get('note_is_original') is not True:
            raise ValueError('Source URL and an original description are required')
        if any(not isinstance(row.get(k,''),str) for k in ['title','address','city','source_url','original_note','submitted_at']):
            raise ValueError('Recommendation fields must be strings')
        title=row.get('title','').strip();text=row.get('original_note','').strip()
        if not title or len(title)>250 or not text or len(text)>2000 or len(row.get('address',''))>500 or len(row.get('city',''))>150:
            raise ValueError('Invalid title or original description')
        datetime.fromisoformat(row.get('submitted_at','').replace('Z','+00:00'))
        cleaned={k:row.get(k,'') for k in ['title','address','city','source_url','original_note','submitted_at']}
        cleaned.update(status='pending_review',note_is_original=True,price_status='not_checked',photo_status='not_supplied')
        queue[(cleaned['source_url'],title,cleaned['address'])]=cleaned
    return list(queue.values())

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('input',type=Path);ap.add_argument('--output',type=Path,default=Path('data/recommendations_pending.json'))
    args=ap.parse_args();rows=parse_recommendations(json.loads(args.input.read_text()))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps({'schema_version':1,'recommendations':rows},ensure_ascii=False,indent=2)+'\n')
    print('Parsed recommendations for review:',len(rows))
