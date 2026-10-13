#!/usr/bin/env python3
"""Collect public waterfront locations and published map points from Mostotrest."""
import argparse
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
try:from collect_library_events import Page,clean
except ModuleNotFoundError:from scripts.collect_library_events import Page,clean
ORIGIN='https://mostotrest-spb.krti.gov.spb.ru'
PREFERRED=['карповки','смоленки','ждановская','адмирала лазарева','мартынова','крюкова','ново-адмиралтейского','песочная','ушаковская','макарова','монастырки','пряжки','мойки','фонтанки','кутузова','смольная','зимней','лебяжьей','мытнинская','аптекарская','английская','петровская','екатерингофки','оккервиль']
def allowed(url):
 p=urllib.parse.urlparse(url);return p.scheme=='https'and p.hostname==urllib.parse.urlparse(ORIGIN).hostname and not p.username and not p.password and p.path.startswith('/embankments')
def parse_place(html,url,today=None):
 if not allowed(url):return None
 today=today or datetime.now(timezone.utc);root=Page(html).root
 title=next((clean(e.text())for e in root.nodes()if e.tag=='h1'),'')
 if not title or not re.search('набереж|берегоукреп',title,re.I):return None
 point=next((e for e in root.nodes()if e.attrs.get('id')=='map-opts'),None)
 lat=lon=None
 if point:
  try:
   data=json.loads(urllib.parse.unquote(point.attrs.get('data-o','')));lat=float(data.get('x',data.get('center',[None,None])[0]));lon=float(data.get('y',data.get('center',[None,None])[1]))
   if not(58<lat<61 and 28<lon<33):lat=lon=None
  except (ValueError,TypeError,KeyError,IndexError):lat=lon=None
 text=clean(root.text());water=re.search(r'Водная преграда:\s*([^:]{2,70}?)\s*(?:Общая длина|Год открытия|Количество)',text)
 water=water.group(1).strip()if water else None
 description=title+'. Городской маршрут для прогулки у воды'+(' вдоль '+water if water else '')+'. Точка на карте — ориентир для выбора участка, а не весь маршрут. Доступ к спускам и ограничения на выбранном участке проверь перед прогулкой.'
 checked=today.isoformat()
 return {'id':'waterfront:'+urllib.parse.urlparse(url).path.rsplit('/',1)[-1],'title':title,'address':title+', Санкт-Петербург','city':'Санкт-Петербург','category':'space',
  'lat':lat,'lon':lon,'coordinate_source_url':url,'coordinate_precision':'publisher_map_marker','notes':description,
  'sources':[{'url':url,'kind':'official','label':'Мостотрест · набережная','retrieved_at':checked}],
  'documents':[{'id':'waterfront:description','kind':'description','text':description,'source_url':url,'observed_at':checked,'retrieved_at':checked}],
  'features':[],'prices':[],'offers':[],'status':'catalogue','updated_at':checked,'discovery_priority':5,'is_landmark':False}
def fetch(url):
 if not allowed(url):raise ValueError('Unexpected source')
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mestno/0.7 (public waterfront facts; https://github.com/ulko31/mestno)'}),timeout=18)as r:
  if not allowed(r.url):raise ValueError('Unexpected redirect')
  return r.read(3_000_000).decode('utf-8')
def collect(limit=24):
 today=datetime.now(timezone.utc);index=ORIGIN+'/embankments';root=Page(fetch(index)).root;links={}
 for e in root.nodes():
  if e.tag=='a'and e.attrs.get('href','').startswith('/embankments/')and re.search('набереж|берегоукреп',e.text(),re.I):links[ORIGIN+e.attrs['href']]=clean(e.text())
 rank=lambda pair:next((i for i,t in enumerate(PREFERRED)if t in pair[1].lower()),100)
 chosen=sorted(links.items(),key=rank)[:limit];places=[];errors=[]
 with ThreadPoolExecutor(max_workers=3)as pool:
  jobs={pool.submit(fetch,u):u for u,title in chosen}
  for future in as_completed(jobs):
   u=jobs[future]
   try:
    p=parse_place(future.result(),u,today)
    if p:places.append(p)
   except Exception as e:errors.append({'url':u,'error':type(e).__name__})
 return {'schema_version':1,'generated_at':today.isoformat(),'source_url':index,'places':sorted(places,key=lambda p:p['title']),
  'collection_report':{'index_locations':len(links),'requested':len(chosen),'accepted':len(places),'with_coordinates':sum(p['lat']is not None for p in places),'errors':errors}}
if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--limit',type=int,default=24);ap.add_argument('--output',type=Path,default=Path('data/waterfronts-2026-10-13.json'));args=ap.parse_args()
 if not 1<=args.limit<=40:raise SystemExit('Limit 1..40')
 result=collect(args.limit)
 if not result['places']:raise SystemExit('No waterfronts read; existing catalogue unchanged')
 args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result['collection_report'],ensure_ascii=False))
