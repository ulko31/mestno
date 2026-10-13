// A facility is not a scheduled group event, and a court tariff is not a person's budget.
export const sportLabels={climbing:'Скалолазание',boxing:'Бокс',ice_skating:'Коньки',wakeboarding:'Вейкборд',wakesurfing:'Вейксёрф',skiing:'Горные лыжи',snowboarding:'Сноуборд',badminton:'Бадминтон',basketball:'Баскетбол',volleyball:'Волейбол',beach_volleyball:'Пляжный волейбол',beach_tennis:'Пляжный теннис',table_tennis:'Настольный теннис',padel:'Падел',tennis:'Большой теннис',surfing:'Сёрфинг'};
export const sportKeys=Object.keys(sportLabels);
// Order matters: specific phrases are consumed before the generic tennis/volleyball terms.
export const sportPatterns=[
  ['table_tennis',/настольн[а-я]*\s+теннис[а-я]*|пинг[ -]?понг|ping[ -]?pong/],
  ['padel',/(?:пад[еэ]л[а-я]*|паддл[а-я]*)(?:[ -]+теннис[а-я]*)?|padel(?:\s+tennis)?|paddle\s+tennis/],
  ['beach_volleyball',/пляжн[а-я]*\s+волейбол[а-я]*/],
  ['beach_tennis',/пляжн[а-я]*\s+теннис[а-я]*/],
  ['wakeboarding',/вейкборд[а-я]*|вейк[ -]?парк[а-я]*|wakeboard[a-z]*|wake\s*park/],
  ['wakesurfing',/вейксерф[а-я]*|вейкс[её]рф[а-я]*|wakesurf[a-z]*/],
  ['skiing',/горн[а-я]*\s+лыж[а-я]*|горнолыж[а-я]*|лыжн[а-я]*\s+склон[а-я]*/],
  ['snowboarding',/сноуборд[а-я]*|snowboard[a-z]*/],
  ['badminton',/бадминтон[а-я]*|badminton/],['basketball',/баскетбол[а-я]*|стритбол[а-я]*|basketball/],
  ['volleyball',/волейбол[а-я]*|volleyball/],['tennis',/теннис[а-я]*|tennis/],
  ['surfing',/(?<![а-я])с[её]рфинг[а-я]*|искусственн[а-я]*\s+волн[а-я]*/],
  ['climbing',/скалолазани[а-я]*|скалодром[а-я]*|боулдеринг[а-я]*/],
  ['boxing',/бокс[а-я]*/],['ice_skating',/каток[а-я]*|катани[а-я]*\s+на\s+коньках|покататься\s+на\s+коньках/]
];
const safe=s=>{try{const u=new URL(s);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
export function currentFacilities(place,today=new Date()){
  return (place.sport_facilities||[]).filter(f=>{
    const age=(new Date(today)-new Date(f.checked_at))/86400000;
    return safe(f.source_url)&&safe(f.booking_url)&&Number.isFinite(age)&&age>=0&&age<=90
      &&(!f.valid_until||new Date(today)<=new Date(f.valid_until));
  });
}
export function sportsFor(place,{needs=[],today=new Date(),outdoors=false}={}){
  const requested=needs.filter(k=>sportKeys.includes(k));
  return currentFacilities(place,today).filter(f=>requested.every(k=>f.activities.includes(k))
    &&(!outdoors||f.environment==='outdoor'||f.environment==='mixed'));
}
export function sportDetails(f,today=new Date()){
  if(!f)return null;
  const warnings=[];
  if(f.season==='winter')warnings.push(f.activities.some(k=>['skiing','snowboarding'].includes(k))?'Зимний спорт: проверь открытие склонов, снег и работу подъёмников.':'Зимний формат: проверь сезонное расписание и доступные сеансы.');
  if(f.season==='summer')warnings.push('Открытая вода: проверь сезон, погоду и доступные сеансы.');
  if(f.environment==='unknown')warnings.push('Тип площадки пока не подтверждён.');
  const priceAge=(new Date(today)-new Date(f.tariff?.checked_at||f.checked_at))/86400000;
  const price=priceAge>=0&&priceAge<=30?f.tariff:null;
  const cost=price&&Number.isFinite(price.amount)?`${price.kind==='from'?'От ':''}${price.amount.toLocaleString('ru-RU')} ₽${price.unit?' / '+price.unit:''}`:null;
  return {label:f.activities.map(k=>sportLabels[k]).join(' · '),environment:{indoor:'В помещении',outdoor:'На открытом воздухе',mixed:'Есть крытые и открытые площадки',unknown:'Тип площадки уточни'}[f.environment]||'',warnings,conditions:f.note?[f.note]:[],cost,source_url:f.source_url,booking_url:f.booking_url,checked_at:f.checked_at};
}
