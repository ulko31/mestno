const safe=s=>{try{const u=new URL(s);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
export const billiardsModes=['free','with_order','paid','ticket','unknown'];
export function currentBilliards(place,{today=new Date(),context={}}={}){
  const terms=(place.billiards_terms||[]).filter(t=>{
    const age=(new Date(today)-new Date(t.checked_at))/86400000;
    return safe(t.source_url)&&billiardsModes.includes(t.mode)&&Number.isFinite(age)&&age>=0&&age<=30
      &&(!t.valid_until||new Date(today)<=new Date(t.valid_until))
      &&(!t.visit_day||t.visit_day===context.visitDay)&&(!t.daypart||t.daypart===context.daypart);
  }).sort((a,b)=>Number(b.verified===true)-Number(a.verified===true)||new Date(b.checked_at)-new Date(a.checked_at));
  if(!terms.length){
    const facts=(place.features||[]).filter(f=>f.key==='free_billiards'&&['documented','verified'].includes(f.status)&&safe(f.source_url)
      &&new Date(today)>=new Date(f.checked_at)&&(new Date(today)-new Date(f.checked_at))/86400000<=30
      &&(!f.valid_until||new Date(today)<=new Date(f.valid_until))&&(!f.valid_from||new Date(today)>=new Date(f.valid_from)));
    const free=facts.find(f=>f.value===true);
    return free&&!facts.some(f=>f.value===false)?{mode:'free',game_amount:0,verified:true,source_url:free.source_url,checked_at:free.checked_at}:null;
  }
  const top=terms[0],peers=terms.filter(t=>t.verified===top.verified);
  return peers.some(t=>t.mode!==top.mode)?{...top,mode:'unknown',conflict:true,verified:false}:top;
}
export function billiardsInfo(place,opts={}){
  const term=currentBilliards(place,opts),warnings=[];
  if(!term)return {term:null,mode:'unknown',label:'Оплата игры уточняется',warnings:['Стоимость бильярда пока не найдена.'],free:false,verified:false};
  const n=Number.isFinite(term.game_amount)?term.game_amount.toLocaleString('ru-RU'):null;
  const range=Number.isFinite(term.game_from)&&Number.isFinite(term.game_to)?term.game_from.toLocaleString('ru-RU')+'–'+term.game_to.toLocaleString('ru-RU'):null;
  let label={free:'Игра без оплаты',with_order:'Игра без отдельной оплаты · нужен заказ',ticket:'Игра входит в платный билет',unknown:'Оплата игры уточняется',paid:n||range?`Игра ${n||range} ₽${term.game_scope==='hour'?' / стол / час':''}`:'Игра оплачивается отдельно'}[term.mode];
  if(term.verified!==true&&term.mode!=='unknown')label='По публикации: '+label.toLowerCase();
  if(term.conflict)warnings.push('Источники расходятся об оплате игры.');
  else if(term.verified!==true)warnings.push('Условия игры указаны в публикации, у заведения пока не подтверждены.');
  if(term.mode==='with_order')warnings.push(Number.isFinite(term.min_order)?'Для игры нужен заказ от '+term.min_order+' ₽.':'Для игры нужен заказ; минимальная сумма не опубликована.');
  if(term.queue)warnings.push('Бильярд в порядке очереди; свободный стол не гарантирован.');
  if(term.note)warnings.push(term.note);
  return {term,mode:term.mode,label,warnings,free:['free','with_order'].includes(term.mode),verified:term.verified===true&&!term.conflict};
}
