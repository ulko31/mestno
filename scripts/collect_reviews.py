#!/usr/bin/env python3
"""Collect attributed review texts for retrieval, plus a separate fact-checking queue.
User profiles are not requested or stored. Review opinions never become verified facts.
"""
import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from import_places import KUDAGO, ROOT, fetch_json, safe_url, plain_text, merge_documents, write_catalogue

def posted_at(value):
    try:
        if isinstance(value,(int,float)):
            return datetime.fromtimestamp(value,timezone.utc)
        dt=datetime.fromisoformat(str(value).replace('Z','+00:00'))
        return dt.replace(tzinfo=timezone.utc) if not dt.tzinfo else dt.astimezone(timezone.utc)
    except (ValueError,TypeError,OverflowError):return None

def extract_signals(text):
    """Conservative hints for human review; uncertain time context stays explicit."""
    text=re.sub('<[^>]*>',' ',str(text)).lower().replace('ё','е')
    signals=set()
    scope='weekday_morning' if re.search(r'в\s+будни|по\s+будням',text) and re.search(r'утром|первой\s+половине\s+дня',text) else None
    conditional=bool(re.search(r'утром|вечером|ночью|выходн|иногда|раньше|бывало|после\s+\d|до\s+\d',text))
    quiet_negative=bool(re.search(r'(?<!не )\bшумно\b|\bочень\s+шумн|\bгромкая\s+музыка|\bне\s+тихо',text))
    quiet_positive=bool(re.search(r'(?<!не )\bтихо\b|\bтихая\s+(?:атмосфера|обстановка)|\bне\s+шумно',text))
    if quiet_positive:signals.add(('quiet',True,scope or ('context_required' if conditional else None)))
    if quiet_negative:signals.add(('quiet',False,scope or ('context_required' if conditional else None)))
    for key,positive,negative in [
        ('laptop_work',r'можно\s+(?:работать\s+)?с\s+ноутбуком|работал[аи]?\s+(?:с|за)\s+ноутбуком',r'нельзя\s+(?:работать\s+)?с\s+ноутбуком|запрещ\w*\s+ноутбук'),
        ('power_outlets',r'есть\s+розетки|много\s+розеток|розетки\s+у\s+столов',r'нет\s+розеток|розеток\s+нет'),
        ('green_interior',r'много\s+растений|среди\s+пальм|в\s+окружении\s+растений',r'растений\s+нет'),
        ('panoramic_view',r'панорамный\s+вид|вид\s+из\s+окна|вид\s+на\s+реку',r'вида\s+из\s+окна\s+нет'),
        ('lounge',r'лаунж[ -]зона|чил[л]?аут[ -]зона',r'лаунж[ -]зоны\s+нет'),
    ]:
        if re.search(negative,text):signals.add((key,False,'context_required' if conditional else None))
        elif re.search(positive,text):signals.add((key,True,'context_required' if conditional else None))
    return signals

def aggregate_comments(place,comments,today=None,max_age_days=180):
    today=today or datetime.now(timezone.utc)
    buckets={};seen=set()
    ref=next((s['url'] for s in place.get('sources',[]) if safe_url(s.get('url')) and 'kudago.com/' in s['url']),None)
    if not ref:return []
    for row in comments:
        date=posted_at(row.get('date_posted'))
        if row.get('is_deleted') or row.get('reply_to') or not date or not 0<=(today-date).total_seconds()/86400<=max_age_days:continue
        raw=str(row.get('text','')).strip()
        text_id=hashlib.sha256(raw.encode()).hexdigest()
        if not raw or text_id in seen:continue
        seen.add(text_id)
        author=row.get('user') or {}
        signature=hashlib.sha256(json.dumps(author,sort_keys=True,ensure_ascii=False).encode()).hexdigest() if author else None
        for key,value,scope in extract_signals(raw):
            item=buckets.setdefault((key,value,scope),{'count':0,'authors':set(),'date':date})
            item['count']+=1
            if signature:item['authors'].add(signature)
            item['date']=max(item['date'],date)
    pending=[]
    for (key,value,scope),item in sorted(buckets.items(),key=lambda kv:str(kv[0])):
        opposing=sum(v['count'] for (k,val,_),v in buckets.items() if k==key and val!=value)
        pending.append({'place_id':place['id'],'feature':key,'value':value,'scope':scope,
            'status':'pending_review','source_url':ref,'source_family':'kudago:visitor-comments','use_permitted':True,
            'checked_at':item['date'].isoformat(),'imported_at':today.isoformat(),'evidence_count':item['count'],
            'distinct_author_signatures':len(item['authors']),'opposing_mentions':opposing,
            'review_note':'Частота упоминаний — повод проверить условие и контекст. Это не независимое подтверждение и не гарантия.'})
    return pending

def review_documents(place,comments,today=None,max_age_days=730,max_reviews=12):
    today=today or datetime.now(timezone.utc)
    ref=next((s['url'] for s in place.get('sources',[]) if safe_url(s.get('url')) and 'kudago.com/' in s['url']),None)
    if not ref:return []
    docs=[];seen=set()
    for row in comments:
        date=posted_at(row.get('date_posted'))
        if row.get('is_deleted') or row.get('reply_to') or not date or not 0<=(today-date).total_seconds()/86400<=max_age_days:continue
        text=plain_text(row.get('text'))[:3000]
        # Do not distribute contact details embedded in a comment.
        text=re.sub(r'[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}', '[контакт удалён]',text)
        text=re.sub(r'(?<!\w)\+?\d[\d ()-]{8,}\d(?!\w)', '[контакт удалён]',text)
        digest=hashlib.sha256(text.encode()).hexdigest()
        if not text or digest in seen:continue
        seen.add(digest)
        docs.append({'id':'kudago:comment:'+str(row.get('id') or digest),'kind':'review','text':text,
            'source_url':ref,'observed_at':date.isoformat(),'retrieved_at':today.isoformat()})
    return sorted(docs,key=lambda d:d['observed_at'],reverse=True)[:max_reviews]

def select_places(places,limit):
    groups={}
    for p in places:
        if p.get('comments_count',0)>0:groups.setdefault(p.get('category','other'),[]).append(p)
    for group in groups.values():group.sort(key=lambda p:p.get('comments_count',0),reverse=True)
    selected=[]
    # Different formats, not only the most commented tourist landmarks.
    while groups and len(selected)<limit:
        for key in list(groups):
            selected.append(groups[key].pop(0))
            if not groups[key]:del groups[key]
            if len(selected)>=limit:break
    return selected

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--catalogue',type=Path,default=ROOT/'dist/places.json')
    ap.add_argument('--output',type=Path,default=ROOT/'data/review_candidates.json')
    ap.add_argument('--max-places',type=int,default=20)
    ap.add_argument('--max-pages',type=int,default=2)
    ap.add_argument('--input',type=Path,help='Local comments export: {place_id: results[]}')
    args=ap.parse_args()
    if not 1<=args.max_places<=50 or not 1<=args.max_pages<=3:ap.error('Limits: 1–50 places, 1–3 pages each')
    places=json.loads(args.catalogue.read_text(encoding='utf-8'))['places']
    def provider_id(p):
        value=p.get('provider_ids',{}).get('kudago')
        if value is None and p['id'].startswith('kudago:'):value=p['id'].split(':',1)[1]
        return int(value) if str(value).isdigit() else None
    selected=[p for p in places if provider_id(p) is not None and p.get('status')!='closed']
    selected=select_places(selected,args.max_places) if not args.input else selected[:args.max_places]
    local=json.loads(args.input.read_text(encoding='utf-8')) if args.input else None
    pending=[];errors=[];checked=0;texts=0
    for p in selected:
        comments=[]
        try:
            for page in range(1,args.max_pages+1):
                query=urlencode({'page':page,'page_size':100,'order_by':'-date_posted',
                    'fields':'id,date_posted,text,is_deleted,reply_to'})
                data=local.get(p['id'],{'results':[]}) if local is not None else fetch_json(KUDAGO+str(provider_id(p))+'/comments/?'+query)
                if not isinstance(data.get('results'),list):raise ValueError('Invalid comments response')
                comments.extend(data['results'])
                if local is not None or not data.get('next'):break
            documents=review_documents(p,comments);texts+=len(documents)
            ref=next((s['url'] for s in p.get('sources',[]) if 'kudago.com/' in s['url']),None)
            old=[d for d in p.get('documents',[]) if d.get('kind')!='review' or d.get('source_url')!=ref]
            p['documents']=merge_documents(old,documents)
            if ref:p['review_snapshots']={**p.get('review_snapshots',{}),ref:datetime.now(timezone.utc).isoformat()}
            pending.extend(aggregate_comments(p,comments));checked+=1
        except Exception as exc:
            errors.append({'place_id':p['id'],'error':str(exc)})
            # A blocked endpoint should not trigger dozens of identical requests.
            if getattr(exc,'code',None) in (403,429):break
    args.output.parent.mkdir(parents=True,exist_ok=True)
    if checked:write_catalogue(places,args.catalogue)
    payload={'schema_version':1,'status':'pending_review','checked_places':checked,'review_texts':texts,'candidates':pending,
        'warnings':errors,'note':'Тексты с датами и источниками добавлены в documents карточек. Это мнения посетителей; признаки не становятся проверенными фактами.'}
    args.output.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'checked_places':checked,'review_texts':texts,'candidate_signals':len(pending),'warnings':len(errors)},ensure_ascii=False))
    return 2 if errors else 0

if __name__=='__main__':raise SystemExit(main())
