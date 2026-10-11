const safe=s=>{try{const u=new URL(s);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password;}catch{return false;}};
export function cityDate(value=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}
export function requestedDate(text,today=new Date()){
  const q=String(text||'').toLowerCase();
  const day=/послезавтра/.test(q)?2:/завтра/.test(q)?1:/сегодня/.test(q)?0:null;
  if(day!==null)return cityDate(new Date(+new Date(today)+day*86400000));
  const match=q.match(/(?<!\d)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?!\d)/);
  if(!match)return null;
  const result=`${match[3]||cityDate(today).slice(0,4)}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  const date=new Date(result+'T12:00:00+03:00');
  return Number.isFinite(+date)&&cityDate(date)===result?result:null;
}
export function currentOffers(place,today=new Date()){
  return (place.offers||[]).filter(e=>{
    const age=(new Date(today)-new Date(e.checked_at))/86400000;
    return e&&safe(e.source_url)&&safe(e.booking_url)&&Number.isFinite(age)&&age>=0&&age<=90
      && (!e.ends_at||new Date(e.ends_at)>=new Date(today))
      && (!e.valid_until||new Date(e.valid_until)>=new Date(today));
  });
}
export function offersFor(place,{needs=[],company='',query='',today=new Date()}={}){
  const day=requestedDate(query,today);
  return currentOffers(place,today).filter(e=>{
    if(company==='new_people'&&e.format!=='open_group')return false;
    const requested=needs.filter(k=>['workshops','pottery','painting','cooking','improv','book_club','board_games','rpg','war_games','speaking_club','english_club','meetups','dance','sports'].includes(k));
    if(requested.some(k=>!(e.activities||[]).includes(k)))return false;
    if(day&&e.starts_at&&(e.is_continuous?day<cityDate(e.starts_at)||day>cityDate(e.ends_at):cityDate(e.starts_at)!==day))return false;
    return true;
  }).sort((a,b)=>{
    const dated=Number(Boolean(b.starts_at))-Number(Boolean(a.starts_at));
    if(dated)return dated;
    return (new Date(a.starts_at||'9999-01-01')-new Date(b.starts_at||'9999-01-01'))
      || ((a.price?.amount??Infinity)-(b.price?.amount??Infinity)) || String(a.title).localeCompare(String(b.title),'ru');
  });
}
export function offerDocuments(place,today=new Date()){
  return currentOffers(place,today).map(e=>({id:'offer:'+e.id,kind:'description',text:[e.title,e.description,
    e.format==='open_group'?'Открытая группа: можно присоединиться одному к другим участникам.':''].join(' '),
    source_url:e.source_url,observed_at:e.checked_at,valid_until:e.ends_at||e.valid_until}));
}
export function offerWhen(e){
  if(!e?.starts_at)return e?.schedule_note||'Регулярный формат · выбери дату в расписании';
  return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(e.starts_at));
}
