// A menu item, an average bill and an activity ticket have different meanings.
import {activityKeys} from './experiences.mjs?v=20261014b';
import {currentBilliards} from './billiards.mjs?v=20261014b';
const safe=s=>{try{const u=new URL(s);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
export function currentPrice(q,today=new Date()){
  const age=(new Date(today)-new Date(q?.checked_at))/86400000;
  return q&&Number.isFinite(q.amount)&&q.amount>=0&&q.currency==='RUB'&&safe(q.source_url)
    && Number.isFinite(age)&&age>=0&&age<=30
    && (!q.valid_from||new Date(today)>=new Date(q.valid_from))
    && (!q.valid_until||new Date(today)<=new Date(q.valid_until));
}
export function priceFor(place,{today=new Date(),scope='visit',needs=[],context={},offer=null,partySize=null}={}){
  // Never substitute a cheap drink or free entrance for a requested workshop.
  if(offer){
    const band=Number.isInteger(partySize)&&(offer.party_tariffs||[]).find(t=>partySize>=t.min_size&&partySize<=t.max_size);
    if(band&&scope==='visit'){
      const total=Math.max(band.per_person*partySize,band.minimum_total)*(1+band.service_percent/100);
      const q={amount:Math.ceil(total/partySize),currency:'RUB',scope:'visit',kind:'from',source_url:band.source_url,checked_at:band.checked_at,
        label:'Расчёт нижней границы на человека для вашей компании',note:`Для ${partySize} человек: минимум заказа ${band.minimum_total.toLocaleString('ru-RU')} ₽, обслуживание ${band.service_percent}%. Дополнительные заказы увеличат итог.`};
      return currentPrice(q,today)?q:null;
    }
    const q=offer.price;
    if(!currentPrice(q,today)||q.scope!==scope||q.visit_day&&q.visit_day!==context.visitDay)return null;
    if(q.unit==='group')return Number.isInteger(partySize)&&partySize>0?{...q,amount:Math.ceil(q.amount/partySize),kind:'from',unit:'person',label:'Доля базового тарифа на человека',note:`Тариф ${q.amount.toLocaleString('ru-RU')} ₽ за компанию из ${partySize} человек. Дополнительные услуги оплачиваются отдельно.`}:null;
    return q;
  }
  const game=needs.includes('billiards')?currentBilliards(place,{today,context}):null;
  if(game?.mode==='paid'){
    // An hourly game tariff is never replaced by the food bill or guessed duration.
    if(game.game_scope!==scope||!Number.isFinite(game.game_amount))return null;
    return {amount:game.game_amount,currency:'RUB',scope,kind:scope==='hour'?'hourly':'admission',source_url:game.source_url,checked_at:game.checked_at,label:'Оплата бильярда',note:'Еда и напитки оплачиваются отдельно.'};
  }
  const activity=needs.some(k=>activityKeys.includes(k)||['billiards','climbing','boxing','ice_skating'].includes(k));
  let quotes=(place.prices||[]).filter(q=>currentPrice(q,today)&&q.scope===scope
    &&(!needs.includes('cocktails')||!q.excludes_beverages)
    && (!q.visit_day||q.visit_day===context.visitDay)
    && (!q.daypart||q.daypart===context.daypart)
    && (!q.for_needs?.length||q.for_needs.some(k=>needs.includes(k)))
    && (!activity||game&&['free','with_order'].includes(game.mode)||!['average_check','menu_order'].includes(q.kind))
    && (!needs.includes('laptop_work')||q.kind!=='admission'||!['cafe','restaurant','bar'].includes(place.category)));
  if(!place.prices?.length&&Number.isFinite(place.price_max)){
    const legacy={amount:place.price_max,currency:'RUB',scope:place.price_scope,kind:'admission',
      checked_at:place.price_checked_at,source_url:place.price_source_url,valid_until:place.price_valid_until,label:'Посещение'};
    if(currentPrice(legacy,today)&&legacy.scope===scope)quotes.push(legacy);
  }
  // A menu example is useful for a coffee/work request; use the reported bill for meals.
  const preferMenu=needs.includes('laptop_work')||needs.includes('coffee');
  const rank=q=>q.kind==='average_check'?(preferMenu?2:0):q.kind==='menu_order'?(preferMenu?0:2):1;
  return quotes.sort((a,b)=>rank(a)-rank(b)||a.amount-b.amount)[0]||null;
}
export function priceLabel(q){
  if(!q)return 'Бюджет уточняется';
  const n=q.amount.toLocaleString('ru-RU');
  if(q.kind==='average_check')return `Бюджет ≈ ${n} ₽ / человек`;
  if(q.kind==='menu_order')return `Заказ от ${n} ₽`;
  if(q.kind==='day_cap')return `Бюджет до ${n} ₽`;
  if(q.kind==='hourly')return `${n} ₽ / час`;
  if(q.kind==='from')return `От ${n} ₽ / человек`;
  return q.amount===0?(q.kind==='workspace'?'Рабочее место без оплаты':'Без оплаты'):`${n} ₽ / человек`;
}
export const priceIsEstimate=q=>q&&['average_check','menu_order','from'].includes(q.kind);
