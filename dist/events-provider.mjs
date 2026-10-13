import {safeUrl,validateCatalogue} from './search.mjs?v=20261012';
import {apiCities,KUDAGO_API,plainText} from './providers.mjs?v=20261012';
import {analyseText} from './text-analysis.mjs?v=20261012';
const concepts=['workshops','pottery','painting','cooking','improv','book_club','board_games','rpg','speaking_club','english_club','meetups','dance','exhibitions','live_music'];
export function eventPrice(value,{isFree=false,source,checkedAt}={}){
  const base={currency:'RUB',scope:'visit',source_url:source,checked_at:checkedAt,kind:'admission',label:'Участие в событии'};
  if(isFree===true)return {...base,amount:0};
  const text=plainText(value);
  // An interval, subscription, deposit, per-minute/group price cannot be a visit maximum.
  const exact=text.match(/^\s*(\d[\d \u00a0]*)\s*(?:₽|руб(?:\.|лей|ля|ль)?)(?:\s*(?:\/|за)\s*(?:чел(?:овека)?\.?|участника))?\s*$/i);
  return exact?{...base,amount:Number(exact[1].replace(/\s/g,''))}:null;
}
export function fromKudaGoEvents(data,{city='spb',checkedAt=new Date().toISOString(),today=new Date()}={}){
  if(!Array.isArray(data?.results)||data.results.length>100)throw new Error('Неожиданный формат событий KudaGo.');
  const venues=new Map();
  for(const e of data.results){
    const r=e.place,source=safeUrl(e.site_url);
    if(!r||!Number.isSafeInteger(r.id)||!Number.isSafeInteger(e.id)||!r.title||!source||r.is_closed)continue;
    const text=plainText(e.body_text||e.description).slice(0,8000);
    const doc={kind:'description',text:[e.title,text].join('. '),source_url:source,observed_at:checkedAt};
    const evidence=analyseText({documents:[doc]},['social_events',...concepts],{},today).evidence;
    const activities=concepts.filter(k=>evidence[k].positive.length&&!evidence[k].negative.length);
    const open=evidence.social_events.positive.length>0&&!evidence.social_events.negative.length;
    const dates=(e.dates||[]).filter(d=>Number.isFinite(d.start)&&Number.isFinite(d.end)&&d.end*1000>=+new Date(today));
    if(!dates.length)continue; // An event without a verifiable date does not become today's event.
    const id='kudago:'+r.id;
    if(!venues.has(id))venues.set(id,{id,title:r.title,category:'space',city:apiCities[city]||city,address:r.address||null,
      lat:r.coords?.lat??null,lon:r.coords?.lon??null,features:[],documents:[],offers:[],prices:[],
      provider_ids:{kudago:r.id},status:'catalogue',sources:[{url:source,label:'KudaGo · событие',kind:'catalogue',license:'KudaGo open API terms',retrieved_at:checkedAt}],
      notes:'Адрес и формат получены из KudaGo. Подробности участия указаны у события.'});
    const p=venues.get(id);
    for(const [i,d] of dates.slice(0,10).entries()){
      const starts=new Date(d.start*1000).toISOString(),ends=new Date(d.end*1000).toISOString();
      p.offers.push({id:`kudago:event:${e.id}:${i}`,title:e.title,description:text,format:open?'open_group':'unknown',
        activities,starts_at:starts,ends_at:ends,is_continuous:d.is_continuous===true,checked_at:checkedAt,
        source_url:source,booking_url:source,price:eventPrice(e.price,{isFree:e.is_free,source,checkedAt}),
        price_note:plainText(e.price).slice(0,300),requirements:e.age_restriction?`Возраст: ${e.age_restriction}`:''});
    }
  }
  return validateCatalogue({schema_version:1,places:[...venues.values()]});
}
export async function loadKudaGoEvents({city='spb',maxPages=3,fetcher=fetch,today=new Date(),signal,onProgress=()=>{}}={}){
  if(!apiCities[city]||!Number.isInteger(maxPages)||maxPages<1||maxPages>10)throw new Error('Проверь город и лимит страниц.');
  const checkedAt=new Date().toISOString(),records=[];
  for(let page=1;page<=maxPages;page++){
    if(signal?.aborted)throw new Error('Загрузка отменена.');
    const url=new URL('events/',KUDAGO_API);
    url.search=new URLSearchParams({location:city,page:String(page),page_size:'100',actual_since:String(Math.floor(+new Date(today)/1000)),
      fields:'id,title,description,body_text,dates,site_url,price,is_free,place,age_restriction',expand:'place,dates',text_format:'text'}).toString();
    const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),20000),abort=()=>timeout.abort();
    signal?.addEventListener('abort',abort,{once:true});
    try{
      const response=await fetcher(url.href,{signal:timeout.signal});if(!response.ok)throw new Error('KudaGo ответил '+response.status+'.');
      const data=await response.json();records.push(...fromKudaGoEvents(data,{city,checkedAt,today}).places);
      onProgress({pages:page,events:records.reduce((n,p)=>n+p.offers.length,0)});
      if(!data.next)break;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  // Combine all pages without losing events held at the same venue.
  const grouped=new Map();for(const p of records){const old=grouped.get(p.id);if(old){old.offers.push(...p.offers);old.offers=[...new Map(old.offers.map(e=>[e.id,e])).values()].slice(0,100);old.sources=[...new Map([...old.sources,...p.sources].map(s=>[s.url,s])).values()];}else grouped.set(p.id,p);}
  return validateCatalogue({schema_version:1,generated_at:checkedAt,places:[...grouped.values()]});
}
