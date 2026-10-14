#!/usr/bin/env python3
"""Discover venue facts in public channel pages on list.tg.

Keep attributed dates, links, addresses and concept summaries; never copy images,
profiles or full posts. This is a candidate queue, not automatic verification.
No login, tokens, private channels or undocumented service endpoints are used.
"""
import argparse
from datetime import datetime,timezone,timedelta
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
try:
    from collect_library_events import Page,Element,clean
except ModuleNotFoundError:
    from scripts.collect_library_events import Page,Element,clean

ORIGIN='https://list.tg'
PATTERNS={
 'mafia':r'мафи[яюие]', 'quiz':r'квиз|викторин', 'karaoke':r'караоке',
 'karting':r'картинг', 'bowling':r'боулинг', 'arcade':r'пиксельн|светов.{0,10}пол',
 'video_games':r'playstation|видеоигр|приставк', 'cooking':r'кулинар|готовить вместе',
 'cozy':r'уютн|по[ -]?домашнему',
 'conversation':r'с\s+(?:друзьями|подругой|подругами)|для\s+встреч|неформальн.{0,12}общени|поболтать',
 'romantic':r'свидани|романтич',
 'coffee':r'кофе|капучино|эспрессо',
 'laptop_work':r'ноутбук|рабоч(?:ая|ие)\s+(?:зона|места)|стол\s+для.{0,25}работ',
 'billiards':r'биль?ярд|биллиард',
 'cocktails':r'коктейл|настойк|наливк',
 'dance':r'потанцевать|диджей|dj[ -]?сет',
 'waterfront':r'у\s+воды|вид\s+на\s+(?:воду|реку|пруд|залив)|на\s+берегу',
}
SUMMARY={'cozy':'уютная обстановка','conversation':'встреча с друзьями','romantic':'свидание',
 'coffee':'кофе','laptop_work':'работа с ноутбуком','billiards':'бильярд','cocktails':'коктейли и настойки','dance':'танцы','waterfront':'у воды',
 'mafia':'мафия','quiz':'квиз','karaoke':'караоке','karting':'картинг','bowling':'боулинг','arcade':'интерактивные игры','video_games':'видеоигры','cooking':'кулинарное занятие'}

def lines_of(element):
    """Keep visible paragraph boundaries; no scripts, hidden endpoints or OCR claims."""
    def visit(e):
        if isinstance(e,str):return e
        if e.tag in ['script','style']:return ''
        if e.tag=='br':return '\n'
        text=''.join(visit(c) for c in e.children)
        return '\n'+text+'\n' if e.tag in ['p','div','li'] else text
    return [clean(s) for s in visit(element).splitlines() if clean(s)]

def venue_candidates(lines):
    """A roundup is split by address; its signals never apply to every venue."""
    candidates=[];pending=[]
    for line in lines:
        m=re.match(r'[📍📎📌]\s*(.+)',line)
        if not m:
            pending.append(line);continue
        address=clean(m[1])
        if not re.search(r'\d',address) or len(address)>220:continue
        headings=[i for i,s in enumerate(pending) if 1<len(s)<=90 and not re.search(r'[.!?]$',s)
            and not re.match(r'куда|собра|сохраня|выбира|приглаша|сегодня|завтра|📆|▶',s,re.I)]
        idx=headings[-1] if headings else None
        title=pending[idx].strip('«»') if idx is not None else ''
        section=' '.join(pending[idx:] if idx is not None else pending).lower().replace('ё','е')
        signals=[key for key,pattern in PATTERNS.items() if re.search(pattern,section)]
        candidates.append({'title_candidate':title,'address_candidate':address,'signals':signals,
            'status':'pending_review','capacity_status':'unknown','price_status':'not_checked',
            'summary':'Темы отдельного фрагмента: '+', '.join(SUMMARY[k] for k in signals) if signals else 'Нужно проверить название и формат.'})
        pending=[]
    return candidates
def allowed(url):
    p=urllib.parse.urlparse(url)
    return p.scheme=='https'and p.hostname=='list.tg'and not p.username and not p.password and p.path.startswith('/channel/')
def nodes_by_class(root,name):return [x for x in root.nodes()if name in x.attrs.get('class','').split()]
def parse_posts(html,channel,today=None,page_url=None):
    if not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]{3,63}',channel):raise ValueError('Invalid channel')
    today=today or datetime.now(timezone.utc);root=Page(html).root;records=[]
    for bubble in nodes_by_class(root,'bubble'):
        caption=bubble.find_class('caption')
        if not caption:continue
        text=caption.find_class('txt');time=next((x for x in caption.nodes()if x.tag=='time'and x.attrs.get('datetime')),None)
        link=next((x for x in caption.nodes()if x.tag=='a'and 'bt-link' in x.attrs.get('class','').split()and re.fullmatch(r'/channel/'+re.escape(channel)+r'/\d+',x.attrs.get('href',''))),None)
        if not text or not time:continue
        path=link.attrs['href']if link else urllib.parse.urlparse(page_url or '').path
        if not re.fullmatch(r'/channel/'+re.escape(channel)+r'/\d+',path):continue
        try:date=datetime.fromisoformat(time.attrs['datetime'].replace('Z','+00:00'))
        except ValueError:continue
        if not date.tzinfo or not today-timedelta(days=180)<=date<=today:continue
        full=clean(text.text());body=full.split('Go to eat |')[0].split('Пойдем сегодня Петербург')[0]
        addresses=re.findall(r'(?:📍|📎|📌)\s*([^📍📎📌]{3,160})',body)
        addresses=[re.split(r'#|🗓|💵|Я в ТГ|Где поесть|Кофе и Парадные',clean(a))[0].strip(' .')for a in addresses]
        # A street address gives a candidate; it does not prove a water view.
        prose=re.split(r'[📍📎📌]',body)[0].lower().replace('ё','е')
        signals=[key for key,pattern in PATTERNS.items()if re.search(pattern,prose)]
        venue_links=[{'title':clean(x.text()),'url':x.attrs.get('href')}for x in text.nodes()if x.tag=='a'and x.attrs.get('href')
            and 2<len(clean(x.text()))<100 and not re.search(r'я в|питер|петербург|подпис|читать|купить|здесь|регистрац',clean(x.text()),re.I)]
        source=ORIGIN+path;post_id=source.rsplit('/',1)[-1]
        free_game=bool(re.search(r'биль?ярд[^.!?]{0,35}(?:бесплатн|без\s+оплаты)|бесплатн[^.!?]{0,35}биль?ярд',prose))
        paid_game=bool(re.search(r'биль?ярд[^.!?]{0,30}\d+\s*(?:₽|руб)',prose))
        records.append({'id':'public:'+channel+':'+post_id,'publisher':channel,'retrieval_url':source,
            'source_url':'https://t.me/'+channel+'/'+post_id,'published_at':date.isoformat(),
            'retrieved_at':today.isoformat(),'headline':' '.join(body.split()[:10]),'venue_links':venue_links,'addresses':addresses,
            'signals':signals,'summary':'В публичной рекомендации описаны: '+', '.join(SUMMARY[s]for s in signals)+'.'if signals else 'Публикация для проверки адреса и формата.',
            'free_game_reported':free_game and not paid_game,'status':'pending_review',
            'multiple_venues':len(addresses)>1 or bool(re.search(r'подборк|дайджест|спешлы\s+в\s+ресторанах|\d+\s+мест',prose[:160])),
            'possible_promotion':bool(re.search(r'реклама|erid|промокод|розыгрыш',prose))})
        records[-1]['venue_candidates']=venue_candidates(lines_of(text))
        records[-1]['company_context']={'colleagues':bool(re.search(r'коллег|корпоратив|тимбилдинг',prose)),
            'large_group':bool(re.search(r'больш[а-я]*\s+компани',prose))}
        # Discovery of a poker mention is not permission to promote a gambling venue.
        if re.search(r'покер',prose):records[-1]['restricted_activity_review']='non_monetary_format_not_confirmed'
    return list({r['id']:r for r in records}.values())
def fetch(url):
    if not allowed(url):raise ValueError('Only public list.tg channel pages')
    req=urllib.request.Request(url,headers={'User-Agent':'Mestno/0.7 (public venue discovery; https://github.com/ulko31/mestno)'})
    with urllib.request.urlopen(req,timeout=20)as r:
        if not allowed(r.url):raise ValueError('Unexpected redirect')
        html=r.read(4_000_000).decode('utf-8')
    if 'Site Unavailable' in html or len(html)<1000:raise ValueError('Source unavailable')
    return html
def collect(channels,extra_urls=(),limit=60,max_pages=12):
    today=datetime.now(timezone.utc);posts={};errors=[];pages=0
    urls=[ORIGIN+'/channel/'+c for c in channels]+list(extra_urls)
    urls=list(dict.fromkeys(urls));seen=set()
    while urls and len(seen)<max_pages:
        url=urls.pop(0)
        if url in seen:continue
        seen.add(url)
        try:
            html=fetch(url);pages+=1;channel=urllib.parse.urlparse(url).path.split('/')[2]
            parsed=parse_posts(html,channel,today,url)
            for p in parsed:
                if len(posts)<limit:posts[p['id']]=p
            # Only follow public post links actually present in the loaded page.
            for e in Page(html).root.nodes():
                if e.tag!='a':continue
                u=urllib.parse.urljoin(ORIGIN,e.attrs.get('href',''));match=re.fullmatch(r'/(?:channel/)?([a-zA-Z0-9_]+)/(\d+)',urllib.parse.urlparse(u).path)
                if match and match[1]in channels and urllib.parse.urlparse(u).hostname in ['t.me','telegram.me','list.tg']:
                    target=ORIGIN+'/channel/'+match[1]+'/'+match[2]
                    if target not in seen and target not in urls:urls.append(target)
        except Exception as e:
            errors.append({'url':url,'error':type(e).__name__,'http_status':getattr(e,'code',None)})
            if getattr(e,'code',None)==429:break
    return {'schema_version':1,'generated_at':today.isoformat(),'recommendations':list(posts.values()),
        'collection_report':{'pages_read':pages,'posts':len(posts),'posts_with_address':sum(bool(p['addresses'])for p in posts.values()),
            'venue_candidates':sum(len(p['venue_candidates']) for p in posts.values()),'errors':errors,
            'full_archive':False,'coverage':'Only posts in accessible public HTML and observed post links; scripted archive pagination is not accessed',
            'oldest_post':min((p['published_at'] for p in posts.values()),default=None),
            'newest_post':max((p['published_at'] for p in posts.values()),default=None)}}
if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--channel',action='append');ap.add_argument('--url',action='append',default=[])
    ap.add_argument('--limit',type=int,default=120);ap.add_argument('--max-pages',type=int,default=12);ap.add_argument('--output',type=Path,default=Path('data/public-recommendations-2026-10-13.json'));args=ap.parse_args()
    if not 1<=args.limit<=200:raise SystemExit('Limit 1..200')
    channels=args.channel or ['gotoeatspb','eatpeterburg','infopeterburg','uniteclub']
    if any(not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]{3,63}',c)for c in channels):raise SystemExit('Invalid channel')
    if not 1<=args.max_pages<=30:raise SystemExit('Pages 1..30')
    result=collect(channels,args.url,args.limit,args.max_pages)
    if not result['recommendations']:raise SystemExit('No public posts read; existing catalogue unchanged')
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result['collection_report'],ensure_ascii=False))
