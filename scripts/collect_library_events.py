#!/usr/bin/env python3
"""Collect dated participation facts from the official Lermontov library site.

No photos, visitor identities, full descriptions or historic dates are copied.
The output is an attributed enrichment, not a replacement for the city catalogue.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request

ORIGIN='https://lermontovka-spb.ru'
MOSCOW=timezone(timedelta(hours=3))
VOID={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}

class Element:
    def __init__(self,tag='',attrs=None): self.tag=tag;self.attrs=dict(attrs or []);self.children=[]
    def text(self):
        if self.tag in ['script','style']:return ''
        return ' '.join(x.text() if isinstance(x,Element) else x for x in self.children)
    def nodes(self):
        yield self
        for x in self.children:
            if isinstance(x,Element):yield from x.nodes()
    def find_class(self,name):return next((x for x in self.nodes() if name in x.attrs.get('class','').split()),None)

class Page(HTMLParser):
    def __init__(self,html):
        super().__init__(convert_charrefs=True);self.root=Element();self.stack=[self.root];self.feed(html)
    def handle_starttag(self,tag,attrs):
        e=Element(tag,attrs);self.stack[-1].children.append(e)
        if tag not in VOID:self.stack.append(e)
    def handle_startendtag(self,tag,attrs):self.stack[-1].children.append(Element(tag,attrs))
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag:self.stack=self.stack[:i];break
    def handle_data(self,text):self.stack[-1].children.append(text)

def clean(text):return re.sub(r'\s+',' ',text).strip()
def official(url):
    p=urllib.parse.urlparse(url)
    return p.scheme=='https' and p.hostname=='lermontovka-spb.ru' and not p.username and not p.password
def slug_date(url):
    m=re.search(r'/(\d{1,2})[_-]+(\d{1,2})[_-]+(\d{2}(?:\d{2})?)(?:[_-]|/|$)',urllib.parse.unquote(url))
    if not m:return None
    day,month,year=map(int,m.groups());year=year+2000 if year<100 else year
    try:return datetime(year,month,day,tzinfo=MOSCOW)
    except ValueError:return None
def links(html,path):
    return list(dict.fromkeys(urllib.parse.urljoin(ORIGIN,x.attrs['href']).split('#')[0] for x in Page(html).root.nodes()
        if x.tag=='a' and x.attrs.get('href') and official(urllib.parse.urljoin(ORIGIN,x.attrs['href']))
        and urllib.parse.urlparse(urllib.parse.urljoin(ORIGIN,x.attrs['href'])).path.startswith(path)))

def parse_event(html,url,today=None):
    today=today or datetime.now(MOSCOW);day=slug_date(url)
    if not official(url) or not day or not today.date()<=day.date()<=(today+timedelta(days=90)).date():return None
    root=Page(html).root;detail=root.find_class('event-detail');description=root.find_class('person-detail-text')
    if not detail or not description:return None
    title_node=next((x for x in detail.nodes() if x.tag=='h1'),None)
    tags=detail.find_class('event-tags');times=detail.find_class('event-detail-time');address_node=detail.find_class('event-detail-adress')
    venue=next((x for x in tags.nodes() if x.tag=='a' and official(urllib.parse.urljoin(ORIGIN,x.attrs.get('href','')))
        and re.search(r'/(?:library|center)/',x.attrs.get('href',''))),None) if tags else None
    if not title_node or not venue or not times or not address_node:return None
    title=clean(title_node.text());text=clean(description.text());topic=(title+' '+text).lower().replace('ё','е')
    if re.search(r'отмена|отмен[её]н|перенес[её]н',title.lower()) or re.search(r'(?:мероприятие|встреча|занятие)\s+отмен[её]н',topic):return None
    if re.search(r'онлайн|zoom|вебинар|дистанционно',title.lower()):return None
    activities=[]
    for key,pattern in [('board_games',r'игротек|настольн.{0,15}игр'),('book_club',r'книжн.{0,15}клуб|читательск.{0,15}клуб|литературн.{0,15}клуб'),
        ('speaking_club',r'разговорн.{0,15}клуб'),('workshops',r'мастер[ -]?класс|практикум'),('painting',r'рисуем|живопис|акварел|рисовани'),
        ('pottery',r'керамик|гончар|лепк'),('candles',r'свеч'),('crafts',r'коллаж|аппликаци|вязан|вышив|переплет'),
        ('improv',r'импровизац')]:
        if re.search(pattern,title.lower()):activities.append(key)
    if not set(activities).intersection(['board_games','book_club','speaking_club','workshops']):return None
    if 'speaking_club' in activities or 'book_club' in activities:
        for lang,pattern in [('english',r'английск'),('french',r'француз'),('spanish',r'испанск'),('korean',r'корейск'),('german',r'немецк'),('italian',r'итальянск')]:
            if re.search(pattern,title.lower()):activities.append(lang+'_club')
        if re.search(r'жестов.{0,15}язык|ржя',title.lower()):activities.append('sign_club')
    hh=re.findall(r'(\d{1,2}):(\d{2})',times.text())
    if not hh:return None
    try:
        start=day.replace(hour=int(hh[0][0]),minute=int(hh[0][1]));end=day.replace(hour=int(hh[-1][0]),minute=int(hh[-1][1]))
    except ValueError:return None
    if end<start:end+=timedelta(days=1)
    if end<today:return None
    # A mismatch between the URL date and the visible date is never guessed away.
    visible=detail.find_class('event-detail-date')
    if visible:
        n=re.match(r'\s*(\d{1,2})\s',visible.text())
        if n and int(n.group(1))!=day.day:return None
    address=clean(address_node.text().split('Ст. м.')[0].split('Посмотреть')[0]).removeprefix('Адрес:').strip()
    coordinates=re.search(r"lat:\s*['\"]([\d.]+)['\"]\s*,\s*lon:\s*['\"]([\d.]+)['\"]",html)
    lat,lon=(map(float,coordinates.groups()) if coordinates else (None,None))
    if lat is not None and not (58<lat<61 and 28<lon<33):lat=lon=None
    checked=today.isoformat();venue_url=urllib.parse.urljoin(ORIGIN,venue.attrs['href'])
    free=bool(re.search(r'(?:вход|участие)\s+(?:бесплатн[а-я]*|свободн[а-я]*)|бесплатно',topic))
    fee=bool(re.search(r'\d\s*(?:₽|руб)|стоимость\s+материал|плат[аи]\s+за\s+материал',topic))
    amount=0 if free and not fee else None
    price=dict(amount=amount,currency='RUB',scope='visit',kind='admission',source_url=url,checked_at=checked,label='Участие в библиотечной встрече') if amount is not None else None
    levels=re.findall(r'\b[ABCАВС][12](?:[–-][ABCАВС]?[12])?\b',text)
    age=re.search(r'(?<!\d)(\d{1,2})\+',text)
    requirements=[]
    if re.search(r'необходима регистрац|нужна регистрац|по регистрации|требуется регистрац|по предварительн',topic):requirements.append('Нужна предварительная регистрация по ссылке организатора.')
    if levels:requirements.append('Уровень языка: '+', '.join(dict.fromkeys(levels))+'.')
    if age:requirements.append('Возраст '+age.group(1)+'+.')
    audience='children' if re.search(r'для\s+детей|детск.{0,15}мастер',title.lower()) or 'детская библиотека' in venue.text().lower() else 'general'
    if audience=='children':activities.append('child_friendly')
    summary=('Настольная игра с участниками.' if 'board_games' in activities else 'Разговорная практика в группе.' if 'speaking_club' in activities
        else 'Совместное обсуждение литературы.' if 'book_club' in activities else 'Творческое занятие по опубликованной программе.')
    offer=dict(id='lermontovka:'+urllib.parse.urlparse(url).path.strip('/'),title=title,description=summary,
        activities=activities,format='open_group',audience=audience,source_url=url,booking_url=url,checked_at=checked,
        starts_at=start.isoformat(),ends_at=end.isoformat(),price=price,requirements=' '.join(requirements))
    venue_id='seed:workshops' if urllib.parse.urlparse(venue_url).path=='/center/otkrytye-masterskie/' else 'lermontovka:'+urllib.parse.urlparse(venue_url).path.strip('/')
    return dict(id=venue_id,title=clean(venue.text()),address=address,
        city='Санкт-Петербург',category='library',lat=lat,lon=lon,coordinate_source_url=url,
        sources=[dict(url=venue_url,label='Библиотека',kind='official',retrieved_at=checked)],features=[],documents=[],
        notes='Библиотечная площадка с опубликованными встречами и занятиями. Дату, уровень и регистрацию смотри в программе.',
        offers=[offer],prices=[],status='catalogue',updated_at=checked,is_landmark=False,discovery_priority=5)

def fetch(url):
    if not official(url):raise ValueError('Unexpected source domain')
    req=urllib.request.Request(url,headers={'User-Agent':'Mestno/0.6 (public event facts; https://github.com/ulko31/mestno)'})
    with urllib.request.urlopen(req,timeout=20) as r:
        if not official(r.url):raise ValueError('Unexpected redirect')
        return r.read(2_000_000).decode('utf-8')

def collect(max_events=160):
    today=datetime.now(MOSCOW);seed=ORIGIN+'/events/';root=fetch(seed)
    pages=[seed,*links(root,'/library/'),*links(root,'/center/')]
    # Follow actual pagination links, never make up endpoint parameters.
    pages+= [u for u in links(root,'/events/') if 'PAGEN_' in u][:5]
    events=set();errors=[]
    with ThreadPoolExecutor(max_workers=3) as pool:
        jobs={pool.submit(fetch,u):u for u in dict.fromkeys(pages)}
        for job in as_completed(jobs):
            u=jobs[job]
            try:
                html=job.result()
                for link in links(html,'/events/'):
                    day=slug_date(link)
                    if day and today.date()<=day.date()<=(today+timedelta(days=90)).date():events.add(link)
            except Exception as e:errors.append(dict(url=u,error=type(e).__name__))
        print('Index pages checked:',len(jobs),'dated future links:',len(events),flush=True)
        places={};accepted=0;jobs={pool.submit(fetch,u):u for u in sorted(events,key=lambda u:(slug_date(u),u))[:max_events]}
        for job in as_completed(jobs):
            u=jobs[job]
            try:
                p=parse_event(job.result(),u,today)
                if not p:continue
                if p['id'] in places:places[p['id']]['offers']+=p['offers']
                else:places[p['id']]=p
                accepted+=1
                if accepted%10==0:print('Accepted programmes:',accepted,flush=True)
            except Exception as e:errors.append(dict(url=u,error=type(e).__name__))
    return dict(schema_version=1,generated_at=today.isoformat(),source_url=seed,places=list(places.values()),
        collection_report=dict(index_pages=len(pages),candidate_events=len(events),fetched_events=len(jobs),accepted_offers=accepted,errors=errors))

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--output',type=Path,default=Path('data/library-programmes-2026-10-12.json'))
    ap.add_argument('--max-events',type=int,default=160);args=ap.parse_args()
    if not 1<=args.max_events<=200:raise SystemExit('Limit 1..200')
    payload=collect(args.max_events)
    if not payload['places']:raise SystemExit('No verified programmes; existing catalogue remains unchanged')
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(payload['collection_report'],ensure_ascii=False))
