import {validateCatalogue,safeUrl,categories} from './search.mjs?v=20261013';
import {photoUrl} from './photo-assets.mjs?v=20261013';
import {activityKeys} from './experiences.mjs?v=20261013';
const copy=x=>structuredClone(x);
export const ADMIN_DRAFT_KEY='mestno.admin.drafts';
function required(s,label,max=4000){if(typeof s!=='string'||!s.trim()||s.length>max)throw new Error('Проверь поле «'+label+'».');return s.trim();}
function url(s,label){const u=safeUrl(s);if(!u)throw new Error('Нужна ссылка http/https: '+label+'.');return u;}
function amount(s){if(s===''||s===undefined||s===null)return null;const n=Number(s);if(!Number.isFinite(n)||n<0||n>1000000)throw new Error('Бюджет должен быть от 0 до 1 000 000 ₽.');return n;}
export function preparePlace(record,input,{today=new Date(),id}={}){
  const checked=new Date(today).toISOString(),proof=url(input.source_url,'источник места');
  const p=record?copy(record):{id:id||'editor:'+crypto.randomUUID(),features:[],documents:[],offers:[],photos:[],prices:[],lat:null,lon:null,is_landmark:false,discovery_priority:5};
  p.title=required(input.title,'Название',250);p.address=String(input.address||'').trim().slice(0,500);
  p.city=required(input.city,'Город',150);if(!Object.hasOwn(categories,input.category))throw new Error('Выбери категорию.');p.category=input.category;
  p.notes=required(input.notes,'Описание',4000);p.status=input.status==='closed'?'closed':'catalogue';p.updated_at=checked;
  p.sources=[{url:proof,label:'Проверенный источник',kind:'official',retrieved_at:checked},...(p.sources||[]).filter(s=>s.url!==proof)];
  if(input.lat!==undefined||input.lon!==undefined){
    p.lat=input.lat===''||input.lat===null?null:Number(input.lat);p.lon=input.lon===''||input.lon===null?null:Number(input.lon);
    if((p.lat===null)!==(p.lon===null))throw new Error('Заполни обе координаты или оставь обе пустыми.');
  }
  if(input.budget!==undefined){
    const n=amount(input.budget),old=p.prices?.[0],kind=['average_check','admission','hourly','day_cap','menu_order','workspace'].includes(input.price_kind)?input.price_kind:'average_check';
    const proofPrice=n===null?null:url(input.price_source||proof,'источник бюджета'),note=String(input.price_note||'').trim().slice(0,1000);
    const unchanged=n===null?!old&&!Number.isFinite(p.price_max):old&&n===old.amount&&kind===old.kind&&proofPrice===old.source_url&&note===(old.note||'');
    if(!unchanged){p.price_max=null;p.price_checked_at=null;
    p.prices=n===null?[]:[{id:old?.id||'editor:budget',amount:n,currency:'RUB',scope:kind==='hourly'?'hour':'visit',
      kind,
      label:input.price_kind==='average_check'?'Средний чек на человека':'Ориентир по посещению',source_url:url(input.price_source||proof,'источник бюджета'),checked_at:checked,
      note,...(kind==='workspace'?{for_needs:['laptop_work']}:{})},...(p.prices||[]).slice(1)];}
  }
  validateCatalogue({schema_version:1,places:[p]});return p;
}
export function prepareOffer(input,{today=new Date(),id}={}){
  const checked=new Date(today).toISOString(),source=url(input.source_url,'источник программы');
  if(!Array.isArray(input.activities)||!input.activities.length||input.activities.some(x=>![...activityKeys,'child_friendly'].includes(x)))throw new Error('Укажи хотя бы одно занятие из списка.');
  const parseTime=s=>{if(!s)return null;const d=new Date(s.length===16?s+':00+03:00':s);if(!Number.isFinite(+d))throw new Error('Проверь дату и время.');return d.toISOString();};
  const starts=parseTime(input.starts_at),ends=parseTime(input.ends_at)||starts;
  if(ends&&(!starts||new Date(ends)<new Date(starts)))throw new Error('Окончание должно быть после начала.');
  const n=amount(input.budget);
  return {id:id||'editor:offer:'+crypto.randomUUID(),title:required(input.title,'Название программы',500),
    description:required(input.description,'Описание программы',4000),activities:[...new Set([...input.activities,...(input.audience==='children'?['child_friendly']:[])])],audience:input.audience==='children'?'children':'general',
    format:['open_group','private','individual','unknown'].includes(input.format)?input.format:'unknown',
    source_url:source,booking_url:url(input.booking_url||source,'запись'),checked_at:checked,
    ...(starts?{starts_at:starts,ends_at:ends}:{schedule_note:String(input.schedule_note||'Регулярный формат · проверь расписание').slice(0,500)}),
    price:n===null?null:{amount:n,currency:'RUB',scope:'visit',kind:'admission',label:'Участие в занятии',source_url:source,checked_at:checked},
    price_note:String(input.price_note||'').trim().slice(0,1000),requirements:String(input.requirements||'').trim().slice(0,1000)};
}
export function preparePhoto(input,{today=new Date(),id}={}){
  if(input.rights_confirmed!==true)throw new Error('Подтверди разрешение на использование фотографии.');
  const asset=photoUrl(input.url);if(!asset)throw new Error('Проверь адрес фотографии.');
  return {id:id||'editor:photo:'+crypto.randomUUID(),url:asset,source_url:url(input.source_url,'оригинал фото'),
    author:required(input.author,'Автор',250),license:required(input.license,'Лицензия',250),license_url:url(input.license_url,'лицензия'),
    caption:required(input.caption,'Подпись',1000),alt:input.caption,checked_at:new Date(today).toISOString()};
}
export function applyAdminDrafts(catalogue,drafts){
  validateCatalogue(catalogue);if(!drafts)return catalogue;
  if(drafts.schema_version!==1||!Array.isArray(drafts.places)||drafts.places.length>5000)throw new Error('Неверный формат черновиков.');
  validateCatalogue({schema_version:1,places:drafts.places});
  const byId=new Map(catalogue.places.map(p=>[p.id,copy(p)]));
  for(const p of drafts.places)byId.set(p.id,copy(p));
  return validateCatalogue({...catalogue,places:[...byId.values()]});
}
