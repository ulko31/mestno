// Visit purpose and observable setting are separate: neither company nor Wi-Fi proves atmosphere.
export const visitLabels={friend_catchup:'Неспешная встреча с друзьями',date:'Свидание',work:'Работа с ноутбуком',coffee:'Встреча за кофе'};
export const ambienceKeys=['cozy','conversation','lounge','chamber_space','warm_lighting','daylight','fireplace','vintage_interior','green_interior','art_interior','designed_interior','historic_interior','panoramic_view','slow_pace'];
const foodFormats=new Set(['cafe','restaurant','bar','anticafe']);
export function visitIntent({query,needs,mood,company,category,activityKeys}){
  if(needs.includes('laptop_work'))return 'work';
  const activity=query.outdoors||needs.some(k=>activityKeys.includes(k)||['billiards','sports','waterfront','exhibitions','reading_space'].includes(k));
  const sit=/посид[а-я]*|посиделк[а-я]*|встрет[а-я]*|поболт[а-я]*|пообщ[а-я]*|поговор[а-я]*|девчач[а-я]*|душевн[а-я]*/.test(query.q);
  if(['date','first_date'].includes(company))return 'date';
  if(!activity&&mood!=='party'&&(!category||foodFormats.has(category))&&company==='friends'
    &&(sit||['calm','soulful'].includes(mood)||needs.some(k=>['coffee','tea','desserts'].includes(k))))return 'friend_catchup';
  if(!activity&&needs.includes('coffee'))return 'coffee';
  return '';
}
export function acceptsVisit(category,intent){return !['friend_catchup','coffee'].includes(intent)||foodFormats.has(category);}

// This is a derived fit, not a claim that a venue is objectively cozy or quiet.
// Two independent setting families are required; a lone vintage object is insufficient.
export function ambienceFit(resolve){
  const families=[['lounge','chamber_space'],['vintage_interior','green_interior','art_interior','designed_interior','historic_interior','fireplace'],['warm_lighting','daylight'],['panoramic_view'],['slow_pace']];
  const strongKeys=families.map(keys=>keys.find(k=>resolve(k).strong)).filter(Boolean);
  const supportedKeys=families.map(keys=>keys.find(k=>resolve(k).supported)).filter(Boolean);
  const direct=resolve('cozy');
  const strong=!direct.hardNegative&&!direct.conflict&&(direct.strong||strongKeys.length>=2);
  const supported=!direct.hardNegative&&(direct.supported||supportedKeys.length>=2);
  const keys=strong?strongKeys:supportedKeys;
  return {supported,strong,derived:!direct.strong&&strong,keys,
    positive:keys.flatMap(k=>resolve(k).positive),hardNegative:direct.hardNegative,conflict:direct.conflict,negative:direct.negative};
}

export function visitWeights(intent){
  if(intent==='work')return {laptop_work:10,quiet:7,wifi:3,power_outlets:3};
  if(intent==='friend_catchup')return {conversation:12,cozy:8,lounge:8,chamber_space:5,warm_lighting:5,daylight:4,vintage_interior:4,green_interior:4,art_interior:3,designed_interior:3,historic_interior:3,panoramic_view:3,slow_pace:8,coffee:3,tea:3,desserts:3};
  if(intent==='date')return {romantic:14,cozy:5,warm_lighting:7,chamber_space:5,panoramic_view:6,historic_interior:3,art_interior:3,conversation:3};
  if(intent==='coffee')return {coffee:7,conversation:8,cozy:6,lounge:5,slow_pace:5};
  return {};
}
