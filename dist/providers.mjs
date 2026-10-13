import {normalize, safeUrl, validateCatalogue} from './search.mjs?v=20261013b';

export const apiCities={spb:'Санкт-Петербург',msk:'Москва',ekb:'Екатеринбург',kzn:'Казань',nsk:'Новосибирск',nnv:'Нижний Новгород'};
export const KUDAGO_API='https://kudago.com/public-api/v1.4/';
const categoryRules=[['cowork','coworking'],['librar','library'],['anticafe','anticafe'],['billiard','billiards'],
  ['climbing','sport'],['sports','sport'],['skating-rink','sport'],['art-cent','space'],['creative-space','space'],
  ['nightclub','club'],['club','club'],['bar','bar'],['cafe','cafe'],['restaurant','restaurant'],['museum','museum'],
  ['galler','gallery'],['park','park'],['cinema','cinema'],['theat','theatre'],['recreation','activity'],['attraction','activity']];
const landmarkPattern=/эрмитаж|hermitage|эрарта|erarta|петропавловск[а-я]*\s+(?:крепость|собор)|исаакиевск[а-я]*\s+собор|казанск[а-я]*\s+собор|петергоф|peterhof|русский\s+музей/i;

export const plainText=value=>String(value||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
  .replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
  .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim();
export function mergeDocuments(old=[],next=[]){
  const docs=new Map();
  for(const d of [...old,...next]){
    const key=[d.kind,d.source_url,d.id||d.text].join('|'),prev=docs.get(key);
    if(!prev||new Date(d.retrieved_at||d.observed_at)>=new Date(prev.retrieved_at||prev.observed_at))docs.set(key,structuredClone(d));
  }
  return [...docs.values()];
}

export function fromKudaGo(data,{city='spb',checkedAt=new Date().toISOString()}={}) {
  if(!Array.isArray(data?.results)||data.results.length>100)throw new Error('Неожиданный формат ответа KudaGo.');
  const places=[];
  for(const r of data.results){
    if(r.is_closed||!r.title||!Number.isSafeInteger(r.id)||!safeUrl(r.site_url))continue;
    const tags=(r.categories||[]).map(c=>typeof c==='string'?c:c.slug).filter(Boolean);
    const category=categoryRules.find(([needle])=>tags.some(t=>t.includes(needle)))?.[1]||'other';
    const ref=safeUrl(r.site_url), features=[];
    const add=key=>features.push({key,value:true,status:'documented',source_url:ref,checked_at:checkedAt});
    if(category==='coworking'){add('coworking');add('laptop_work');}
    if(category==='billiards')add('billiards');
    if(category==='sport')add('sports');
    const description=plainText(r.body_text||r.description).slice(0,8000);
    places.push({id:'kudago:'+r.id,title:r.title,category,city:apiCities[city]||city,
      address:r.address||null,lat:r.coords?.lat??null,lon:r.coords?.lon??null,website:safeUrl(r.foreign_url),subway:r.subway||null,
      sources:[{url:ref,label:'KudaGo',kind:'catalogue',license:'KudaGo open API terms',retrieved_at:checkedAt}],features,tags,
      price_max:null,price_scope:null,price_source_url:null,status:'catalogue',updated_at:checkedAt,
      comments_count:Number.isFinite(r.comments_count)?r.comments_count:0,provider_ids:{kudago:r.id},is_landmark:landmarkPattern.test(r.title),
      documents:description?[{id:'kudago:description:'+r.id,kind:'description',text:description,source_url:ref,observed_at:checkedAt,retrieved_at:checkedAt}]:[],
      notes:'Адрес и формат получены из KudaGo. Атмосфера, цены и условия посещения отдельно не проверены.'});
  }
  return validateCatalogue({schema_version:1,places}).places;
}

const identity=p=>[normalize(p.city),normalize(p.title).replace(/[^a-zа-я0-9]/g,''),normalize(p.address).replace(/[^a-zа-я0-9]/g,'')].join('|');
export function mergeCatalogues(baseline,incoming){
  validateCatalogue(baseline);validateCatalogue(incoming);
  const records=new Map(baseline.places.map(p=>[p.id,structuredClone(p)]));
  const exact=new Map([...records.values()].filter(p=>p.address).map(p=>[identity(p),p.id]));
  for(const next of incoming.places){
    const id=records.has(next.id)?next.id:(next.address?exact.get(identity(next)):null);
    if(!id){records.set(next.id,structuredClone(next));if(next.address)exact.set(identity(next),next.id);continue;}
    const old=records.get(id);
    old.sources=[...new Map([...old.sources,...next.sources].map(s=>[s.url,s])).values()];
    const features=new Map();
    for(const f of [...old.features,...next.features]){
      const k=[f.key,f.value,f.source_url,f.scope||''].join('|'), prev=features.get(k);
      if(!prev||new Date(f.checked_at)>new Date(prev.checked_at))features.set(k,f);
    }
    old.features=[...features.values()];
    const snapshots={...old.review_snapshots};
    for(const [source,date] of Object.entries(next.review_snapshots||{}))if(!snapshots[source]||new Date(date)>new Date(snapshots[source])){
      old.documents=(old.documents||[]).filter(d=>d.kind!=='review'||d.source_url!==source);snapshots[source]=date;
    }
    const nextDocs=(next.documents||[]).filter(d=>d.kind!=='review'||!snapshots[d.source_url]
      || new Date(next.review_snapshots?.[d.source_url]||d.retrieved_at||d.observed_at)>=new Date(snapshots[d.source_url]));
    old.documents=mergeDocuments(old.documents,nextDocs);
    if(Object.keys(snapshots).length)old.review_snapshots=snapshots;
    old.provider_ids={...old.provider_ids,...next.provider_ids};
    for(const key of ['prices','offers','photos','billiards_terms','sport_facilities']){
      if(!Array.isArray(next[key]))continue;
      const entries=new Map((old[key]||[]).map(e=>[e.id||e.source_url,structuredClone(e)]));
      for(const e of next[key]){
        const id=e.id||e.source_url,previous=entries.get(id);
        if(!previous||new Date(e.checked_at||e.observed_at||0)>=new Date(previous.checked_at||previous.observed_at||0))entries.set(id,structuredClone(e));
      }
      old[key]=[...entries.values()];
    }
    if(Number.isFinite(next.comments_count))old.comments_count=next.comments_count;
    for(const k of ['address','lat','lon','website','opening_hours'])if(old[k]===null||old[k]===undefined)old[k]=next[k]??null;
    if(next.status==='closed')old.status='closed';
    old.is_landmark=old.is_landmark||next.is_landmark||false;
  }
  return validateCatalogue({...baseline,generated_at:new Date().toISOString(),places:[...records.values()],
    source_licenses:{...baseline.source_licenses,...incoming.source_licenses}});
}

export async function loadKudaGo({city='spb',maxPages=10,fetcher=fetch,onProgress=()=>{},signal}={}){
  if(!apiCities[city]||!Number.isInteger(maxPages)||maxPages<1||maxPages>20)throw new Error('Выбери поддерживаемый город и от 1 до 20 страниц.');
  const checkedAt=new Date().toISOString(), places=[], closedIds=new Set();
  let fetched=0, total=0, truncated=false;
  for(let page=1;page<=maxPages;page++){
    const url=new URL('places/',KUDAGO_API);
    url.search=new URLSearchParams({location:city,page:String(page),page_size:'100',
      fields:'id,title,address,coords,site_url,categories,is_closed,subway,foreign_url,comments_count,description,body_text',text_format:'text'}).toString();
    const timeout=new AbortController();const timer=setTimeout(()=>timeout.abort(),20000);
    const abort=()=>timeout.abort();signal?.addEventListener('abort',abort,{once:true});
    try{
      if(signal?.aborted)throw new Error('Загрузка отменена.');
      const response=await fetcher(url.href,{signal:timeout.signal});
      if(signal?.aborted)throw new Error('Загрузка отменена.');
      if(!response.ok)throw new Error('KudaGo ответил '+response.status+'.');
      const data=await response.json();
      places.push(...fromKudaGo(data,{city,checkedAt}));
      for(const p of data.results)if(p.is_closed&&Number.isSafeInteger(p.id))closedIds.add('kudago:'+p.id);
      fetched+=data.results.length;total=data.count||fetched;
      onProgress({page,fetched,total,accepted:places.length});
      if(!data.next){truncated=false;break;}
      truncated=page===maxPages;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  if(!places.length)throw new Error('API не вернул пригодных карточек. Текущий каталог сохранён.');
  const unique=[...new Map(places.map(p=>[p.id,p])).values()];
  return {catalogue:validateCatalogue({schema_version:1,generated_at:checkedAt,city:apiCities[city],
    source_licenses:{KudaGo:'https://docs.kudago.com/api/'},places:unique}),closedIds:[...closedIds],fetched,total,truncated};
}

export async function loadKudaGoReviews({catalogue,maxPlaces=20,fetcher=fetch,onProgress=()=>{},signal}={}){
  validateCatalogue(catalogue);
  if(!Number.isInteger(maxPlaces)||maxPlaces<1||maxPlaces>50)throw new Error('Можно проверить от 1 до 50 мест за запуск.');
  const selected=catalogue.places.filter(p=>p.status!=='closed'&&Number.isSafeInteger(p.provider_ids?.kudago)&&p.comments_count>0).slice(0,maxPlaces);
  if(!selected.length)throw new Error('Сначала загрузи места из KudaGo с доступными комментариями. В OpenStreetMap отзывов нет.');
  const retrievedAt=new Date().toISOString(),incoming=[];let reviewCount=0;
  for(const p of selected){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
    try{
      if(signal?.aborted)throw new Error('Загрузка отменена.');
      const url=new URL('places/'+p.provider_ids.kudago+'/comments/',KUDAGO_API);
      url.search=new URLSearchParams({page_size:'100',order_by:'-date_posted',fields:'id,date_posted,text,is_deleted,reply_to'}).toString();
      const response=await fetcher(url.href,{signal:controller.signal});
      if(signal?.aborted)throw new Error('Загрузка отменена.');
      if(!response.ok)throw new Error('KudaGo ответил '+response.status+'.');
      const data=await response.json();
      if(!Array.isArray(data.results)||data.results.length>100)throw new Error('Неожиданный формат комментариев.');
      const ref=p.sources.find(s=>{try{return new URL(s.url).hostname==='kudago.com';}catch{return false;}})?.url;
      if(!ref)throw new Error('Не найдена ссылка на конкретное место в KudaGo.');
      const seen=new Set(),docs=[];
      for(const r of data.results){
        const date=new Date(typeof r.date_posted==='number'?r.date_posted*1000:r.date_posted);
        const age=(new Date(retrievedAt)-date)/86400000;
        if(r.is_deleted||r.reply_to||!Number.isFinite(age)||age<0||age>730)continue;
        const text=plainText(r.text).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[контакт удалён]')
          .replace(/(?<!\w)\+?\d[\d ()-]{8,}\d(?!\w)/g,'[контакт удалён]').slice(0,3000);
        if(!text||seen.has(text))continue;seen.add(text);
        docs.push({id:'kudago:comment:'+(r.id||encodeURIComponent(text.slice(0,100))),kind:'review',text,
          source_url:ref,observed_at:date.toISOString(),retrieved_at:retrievedAt});
        if(docs.length===12)break;
      }
      reviewCount+=docs.length;
      incoming.push({...p,documents:mergeDocuments((p.documents||[]).filter(d=>d.kind!=='review'||d.source_url!==ref),docs),
        review_snapshots:{...p.review_snapshots,[ref]:retrievedAt}});
      onProgress({checked:incoming.length,total:selected.length,reviewCount});
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  return {catalogue:validateCatalogue({schema_version:1,places:incoming}),checkedPlaces:incoming.length,reviewCount};
}
