// Independent visit criteria, not a new venue category.
export const groupActivities={mafia:'Мафия',quiz:'Квизы',karaoke:'Караоке',bowling:'Боулинг',karting:'Картинг',arcade:'Интерактивные игры',video_games:'Видеоигры',escape_room:'Командные квесты',poker_no_stakes:'Покер без денежных ставок и ценных призов'};
export const groupPatterns=[
  ['mafia',/мафи[яюие]/],['quiz',/квиз[а-я]*|викторин[а-я]*/],['karaoke',/караоке/],['bowling',/боулинг[а-я]*/],['karting',/картинг[а-я]*/],
  ['arcade',/пиксельн[а-я]*\s+(?:пол[а-я]*|игр[а-я]*|комнат[а-я]*)|светов[а-я]*\s+пол[а-я]*|интерактивн[а-я]*\s+игр[а-я]*/],
  ['video_games',/playstation|плейстейшн|видеоигр[а-я]*|игров[а-я]*\s+приставк[а-я]*|консол[а-я]*/],
  ['escape_room',/эскейп|квест[а-я]*\s+(?:комнат[а-я]*|с\s+друз[а-я]*|для\s+команд[а-я]*)/]
];
export const sharedActivities=new Set([...Object.keys(groupActivities),'board_games','billiards','workshops','cooking','pottery','painting','improv','dance','rpg','war_games']);
export const gameActivities=new Set([...Object.keys(groupActivities),'board_games','billiards','rpg','war_games']);
export function supportsActivity(offer,key){return ['shared_activity','group_games'].includes(key)?(offer.activities||[]).some(k=>(key==='group_games'?gameActivities:sharedActivities).has(k)):(offer.activities||[]).includes(key);}
export function fitsParty(offer,{partySize=null,simultaneous=false}={}){
  if(!partySize)return true;
  if(offer.format==='private'&&Number.isFinite(offer.party_min)&&partySize<offer.party_min)return false;
  if(Number.isFinite(offer.party_max)&&partySize>offer.party_max)return false;
  if(simultaneous&&Number.isFinite(offer.simultaneous_max)&&partySize>offer.simultaneous_max)return false;
  return true;
}
export function participationLabel(offer){
  if(!offer)return '';
  const format={private:'Только ваша компания',open_group:'Можно присоединиться к другим',individual:'Индивидуальный формат',unknown:'Формат участия уточняется'}[offer.format];
  const size=Number.isFinite(offer.party_min)&&offer.party_min>1&&Number.isFinite(offer.party_max)?`${offer.party_min}–${offer.party_max} человек`:Number.isFinite(offer.party_max)?`до ${offer.party_max} человек`:Number.isFinite(offer.party_min)?`от ${offer.party_min} человек`:'';
  const simultaneous=Number.isFinite(offer.simultaneous_max)?`одновременно играют до ${offer.simultaneous_max}`:'';
  return [format,size,simultaneous,offer.duration_note,offer.capacity_note].filter(Boolean).join(' · ');
}
export function partyWarnings(offer,partySize,includeRotation=true){
  if(!partySize)return [];
  if(!offer||offer.format==='unknown'||!Number.isFinite(offer.party_max))return [`Вместимость для компании из ${partySize} человек нужно подтвердить`];
  const out=[];
  if(offer.format==='open_group')out.push('Общая группа: участие всей вашей компании и свободные места нужно подтвердить');
  if(includeRotation&&offer.simultaneous_max&&partySize>offer.simultaneous_max)out.push(`Одновременно играют до ${offer.simultaneous_max}; для вашей компании нужна смена игроков`);
  return out;
}
