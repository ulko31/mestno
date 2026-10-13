import {analyseText, keywordMatches} from './text-analysis.mjs?v=20261013';
import {priceFor,priceIsEstimate} from './pricing.mjs?v=20261013';
import {currentOffers,offersFor,requestedDate,activityKeys} from './experiences.mjs?v=20261013';
import {photoUrl} from './photo-assets.mjs?v=20261013';
import {billiardsInfo} from './billiards.mjs?v=20261013';

export const categories = {
  coworking: 'Коворкинги', library: 'Библиотеки', cafe: 'Кафе', restaurant: 'Рестораны', bar: 'Бары',
  anticafe: 'Антикафе', billiards: 'Бильярд', sport: 'Спорт', activity: 'Активности', space: 'Городские пространства',
  museum: 'Музеи', gallery: 'Галереи', park: 'Парки', club: 'Музыка и танцы', cinema: 'Кино', theatre: 'Театры', other: 'Другие места'
};
export const moods = {
  calm: 'Спокойно поговорить', party: 'Потусить', melancholy: 'Погрустить',
  reflective: 'Подумать', dreamy: 'Помечтать', inspired: 'Вдохновиться', active: 'Размяться и переключиться'
};
export const companies = {
  alone: 'Одна / один', friends: 'С друзьями', date: 'С партнёром', first_date: 'Первое свидание',
  new_people: 'Познакомиться с людьми', parents: 'С родителями', children: 'С детьми'
};
export const featureLabels = {
  billiards: 'Есть бильярд', free_billiards: 'Игра в бильярд без отдельной оплаты',
  coworking: 'Есть рабочая зона', laptop_work: 'Можно работать с ноутбуком',
  free_coworking: 'Рабочее место без оплаты', free_workspace: 'Рабочее место без оплаты',
  free_entry: 'Вход без оплаты', quiet: 'Тишина указана в описании',
  cozy:'Уютная обстановка',conversation:'Место для общения',coffee:'Можно выпить кофе',romantic:'Обстановка для свидания',cocktails:'Есть коктейли и настойки',
  warm_lighting:'Тёплое освещение',vintage_interior:'Винтажный интерьер',
  food:'Можно поесть',
  child_friendly: 'Есть условия для детей', wifi: 'Есть Wi-Fi', power_outlets: 'Есть розетки',
  board_games: 'Есть настольные игры', social_events: 'Есть открытые встречи', meetups: 'Есть митапы',
  speaking_club: 'Есть разговорные встречи', english_club: 'Общение на английском', rpg: 'Есть ролевые игры', war_games: 'Есть варгеймы',
  dance: 'Есть танцевальные события', sports: 'Есть спортивные занятия',
  waterfront: 'У воды', exhibitions: 'Есть выставки', workshops: 'Есть мастер-классы',
  pottery:'Керамика и лепка',painting:'Рисование и живопись',cooking:'Кулинарные занятия',improv:'Импровизация',book_club:'Книжный клуб',
  candles:'Свечеварение',perfume:'Создание парфюма',mosaic:'Мозаика',tufting:'Тафтинг',resin:'Эпоксидная смола',crafts:'Рукоделие',
  french_club:'Общение на французском',spanish_club:'Общение на испанском',korean_club:'Общение на корейском',german_club:'Общение на немецком',italian_club:'Общение на итальянском',
  sign_club:'Русский жестовый язык',
  climbing: 'Есть скалолазание', boxing: 'Есть бокс', ice_skating: 'Есть каток',
  panoramic_view: 'Панорамный вид', green_interior: 'Растения в пространстве',
  lounge: 'Есть лаунж-зона', chamber_space: 'Камерное пространство',
  historic_interior: 'Исторический интерьер', art_interior: 'Искусство в интерьере',
  reading_space: 'Можно почитать', nature: 'Природный маршрут', garden: 'Есть сад',
  imaginative_exhibition: 'Выставка о воображении', live_music: 'Живая музыка', cinema_events: 'Есть кинопоказы'
};
export const normalize = s => String(s || '').toLowerCase().replaceAll('ё', 'е');
export const safeUrl = value => {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; }
  catch { return null; }
};

function currentObservations(p, key, today = new Date()) {
  return (p.features || []).filter(f => {
    const age = (new Date(today) - new Date(f.checked_at)) / 86400000;
    const expires = f.valid_until ? new Date(f.valid_until) : null;
    const starts = f.valid_from ? new Date(f.valid_from) : null;
    return f.key === key && ['documented', 'verified'].includes(f.status)
      && Boolean(safeUrl(f.source_url)) && Number.isFinite(age) && age >= 0 && age <= 90
      && (!expires || (Number.isFinite(+expires) && new Date(today) <= expires))
      && (!starts || (Number.isFinite(+starts) && new Date(today) >= starts));
  });
}
export function hasFeature(p, key, value = true, today = new Date(), context = {}) {
  const observations = currentObservations(p, key, today);
  const applicable = observations.filter(f => !f.scope || ['entry','game','workspace'].includes(f.scope)
    || (f.scope === 'weekday_morning' && context.daypart === 'morning' && context.visitDay === 'weekday'));
  return applicable.some(f=>f.value===value) && !applicable.some(f=>f.value!==value);
}
function meetsFeature(p, key, today, context) {
  if (hasFeature(p,key,true,today,context)) return true;
  // Legacy catalogues use coworking for a documented work area, including inside a cafe.
  if (key === 'laptop_work') return !currentObservations(p,key,today).some(f=>f.value===false)
    && hasFeature(p,'coworking',true,today,context);
  if (key === 'free_workspace') return hasFeature(p,'free_coworking',true,today,context);
  return false;
}

export function distanceKm(a, b) {
  if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return null;
  const r = x => x * Math.PI / 180;
  const dlat = r(b.lat - a.lat), dlon = r(b.lon - a.lon);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

const categoryPatterns = [
  [/коворкинг[а-я]*/g, ['coworking']], [/библиотек[а-я]*/g, ['library']],
  [/антикафе|тайм[ -]кафе/g, ['anticafe']], [/кафе|кофейн[а-я]*/g, ['cafe']],
  [/ресторан[а-я]*/g, ['restaurant']], [/(?<![а-я])бар(?:а|е|ы|ов|у|ом)?(?![а-я])/g, ['bar']],
  [/выставк[а-я]*/g, ['gallery','museum','space']], [/галере[а-я]*/g, ['gallery']],
  [/музе[а-я]*/g, ['museum']], [/(?<![а-я])парк(?:а|е|и|ов|у|ом)?(?![а-я])/g, ['park']],
  [/кинотеатр[а-я]*|кино(?![а-я])/g, ['cinema']], [/театр[а-я]*/g, ['theatre']],
  [/городск[а-я]* пространств[а-я]*|пространств[а-я]*|кластер[а-я]*/g, ['space']]
];

export function parseQuery(text) {
  const q = normalize(text);
  let rest = q;
  const needs = new Set(), excludedCategories = new Set(), requestedCategories = new Set(), excludedFeatures = new Set();
  let mood = '', company = '', daypart = '', visitDay = '', outdoors = false;
  const consume = (pattern, action) => {
    let found = false;
    rest = rest.replace(pattern, match=>{found=true;action?.(match);return ' ';});
    return found;
  };
  const optionalFree = consume(/(?:не\s+обязательно\s+бесплат[а-я]*|не\s+бесплат[а-я]*)/g);
  consume(/(?:без|кроме|не(?:\s+(?:хочу|нужен|нужны|надо))?)\s+(?:(?:в|на)\s+)?(коворкинг[а-я]*|библиотек[а-я]*|антикафе|кафе|кофейн[а-я]*|ресторан[а-я]*|бар(?:а|ов|ы|е)?|клуб[а-я]*)/g, match=>{
    for (const [pattern,values] of categoryPatterns) if(new RegExp(pattern.source).test(match)) values.forEach(x=>excludedCategories.add(x));
    if (/клуб/.test(match)) excludedCategories.add('club');
  });
  consume(/без\s+(?:бильярд[а-я]*|танц[а-я]*|караоке)|не\s+нужен\s+бильярд[а-я]*/g, match=>{
    if (/бильярд/.test(match)) excludedFeatures.add('billiards');
    if (/танц/.test(match)) excludedFeatures.add('dance');
    if (/караоке/.test(match)) excludedFeatures.add('karaoke');
  });
  consume(/не\s+хочу\s+(?:тусить|тусовк[а-я]*|вечеринк[а-я]*)/g,()=>{mood='calm';});
  consume(/не\s+хочу\s+(?:знакомиться|знакомств[а-я]*)/g);
  consume(/(?:без\s+ноутбук[а-я]*|не\s+(?:для\s+работы|работать|поработать)(?:\s+(?:с\s+ноутбуком|за\s+ноутбуком))?)/g);
  consume(/уютн[а-я]*|по[ -]?домашн[а-я]*/g,()=>needs.add('cozy'));
  consume(/романтич[а-я]*/g,()=>needs.add('romantic'));
  consume(/(?:попить|выпить|пить)\s+(?:чашку\s+)?кофе|(?:за|на)\s+чашк[а-я]*\s+кофе|(?<![а-я])кофе(?![а-я])/g,()=>needs.add('coffee'));
  consume(/коктейл[а-я]*|настойк[а-я]*|наливк[а-я]*/g,()=>needs.add('cocktails'));
  consume(/поесть|покушать|перекусить|поужинать|пообедать|позавтракать|ужин[а-я]*|обед[а-я]*|завтрак[а-я]*|(?<![а-я])ед[ауые](?![а-я])/g,()=>needs.add('food'));
  consume(/бильярд[а-я]*|(?<![а-я])пул(?![а-я])/g,()=>needs.add('billiards'));
  consume(/(?:по|про)?работать|поработа[а-я]*|ноутбук[а-я]*|учиться|поучиться|готовиться\s+к\s+(?:экзамен[а-я]*|сесси[а-я]*)|для\s+(?:работы|учебы)|писать\s+код|программировать|позаниматься|сфокусироваться|подготовить\s+(?:курсовую|диплом)/g,()=>needs.add('laptop_work'));
  consume(/не\s+шумн[а-я]*|без\s+(?:громк[а-я]*\s+музык[а-я]*|шум[а-я]*)|тишин[а-я]*|тих[а-я]*/g,()=>needs.add('quiet'));
  consume(/(?:вай[ -]?фай|wi[ -]?fi|wifi|интернет[а-я]*)/g,()=>needs.add('wifi'));
  consume(/розетк[а-я]*|зарядить\s+ноутбук/g,()=>needs.add('power_outlets'));
  consume(/панорамн[а-я]*\s+(?:вид[а-я]*|окн[а-я]*)|красив[а-я]*\s+вид[а-я]*/g,()=>needs.add('panoramic_view'));
  consume(/растени[а-я]*|среди\s+(?:пальм|зелени)|оранжере[а-я]*/g,()=>needs.add('green_interior'));
  consume(/камерн[а-я]*\s+(?:мест[а-я]*|пространств[а-я]*|зал[а-я]*)/g,()=>needs.add('chamber_space'));
  consume(/историческ[а-я]*\s+интерьер[а-я]*/g,()=>needs.add('historic_interior'));
  consume(/почитать|чтени[а-я]*/g,()=>needs.add('reading_space'));
  consume(/d\s*&\s*d|dnd|днд|ролев[а-я]*\s+игр[а-я]*|нри/g,()=>{needs.add('board_games');needs.add('rpg');});
  consume(/варгейм[а-я]*|warhammer/g,()=>{needs.add('board_games');needs.add('war_games');});
  consume(/настолк[а-я]*|настольн[а-я]*\s+(?:игр[а-я]*|играть)|игротек[а-я]*/g,()=>needs.add('board_games'));
  consume(/перв[а-я]*\s+(?:свидани[а-я]*|знакомств[а-я]*|встреч[а-я]*)/g,()=>{company='first_date';});
  consume(/митап[а-я]*/g,()=>{company='new_people';needs.add('social_events');needs.add('meetups');});
  consume(/разговорн[а-я]*\s+клуб[а-я]*|speaking\s+club/g,()=>{company='new_people';needs.add('social_events');needs.add('speaking_club');});
  consume(/английск[а-я]*|на\s+английском/g,()=>needs.add('english_club'));
  for(const [re,key] of [[/французск[а-я]*/g,'french_club'],[/испанск[а-я]*/g,'spanish_club'],[/корейск[а-я]*/g,'korean_club'],[/немецк[а-я]*/g,'german_club'],[/итальянск[а-я]*/g,'italian_club']])consume(re,()=>needs.add(key));
  consume(/русск[а-я]*\s+жестов[а-я]*\s+язык[а-я]*|жестов[а-я]*\s+язык[а-я]*|ржя/g,()=>needs.add('sign_club'));
  consume(/познакомиться|знакомиться|нов[а-я]*\s+(?:люд[а-я]*|знакомств[а-я]*|друз[а-я]*)|найти\s+(?:компанию|друзей)|по\s+интересам|единомышленник[а-я]*/g,()=>{company='new_people';needs.add('social_events');});
  consume(/(?:с\s+)?(?:ребенком|детьми)|детск[а-я]*/g,()=>{company='children';needs.add('child_friendly');});
  consume(/(?:с\s+)?(?:родителями|мамой|папой)/g,()=>{if(!company)company='parents';});
  consume(/(?:с\s+)?(?:друзьями|подругой|другом|подругами|компанией)/g,()=>{if(!company)company='friends';});
  consume(/(?:с\s+)?(?:партнером|девушкой|парнем|молодым\s+человеком)|свидани[а-я]*/g,()=>{if(!company)company='date';});
  consume(/(?<![а-я])(?:одна|один|одной|одному)(?![а-я])|наедине\s+с\s+собой/g,()=>{if(!company)company='alone';});
  const moodPatterns = [
    [/погрустить|пострадать|грустн[а-я]*|меланхоли[а-я]*|разбит[а-я]*\s+сердц[а-я]*/g,'melancholy'],
    [/помечтать|мечтательн[а-я]*|мечтать/g,'dreamy'],
    [/подумать|поразмышлять|размышл[а-я]*|собраться\s+с\s+мыслями/g,'reflective'],
    [/вдохновиться|вдохновени[а-я]*|вдохновляющ[а-я]*/g,'inspired'],
    [/спокойн[а-я]*(?:\s+(?:поговорить|посидеть|пообщаться))?|поболтать|поговорить|без\s+суеты/g,'calm'],
    [/потусить|потусоваться|тусовк[а-я]*|вечеринк[а-я]*/g,'party'],
    [/размяться|активн[а-я]*\s+(?:отдых[а-я]*|вечер[а-я]*)|переключиться/g,'active']
  ];
  for (const [pattern,value] of moodPatterns) consume(pattern,()=>{if(!mood)mood=value;});
  consume(/потанцевать|танц[а-я]*|диджей[а-я]*|dj[ -]?сет[а-я]*/g,()=>{needs.add('dance');if(!mood)mood='party';});
  for(const [pattern,key] of [[/скалолазани[а-я]*|скалодром[а-я]*|боулдеринг[а-я]*/g,'climbing'],[/бокс[а-я]*/g,'boxing'],[/каток[а-я]*|покататься\s+на\s+коньках/g,'ice_skating']])
    consume(pattern,()=>{needs.add('sports');needs.add(key);if(!mood)mood='active';});
  consume(/спорт[а-я]*|тренировк[а-я]*/g,()=>{needs.add('sports');if(!mood)mood='active';});
  consume(/(?:у|около|возле|рядом\s+с)\s+(?:воды|заливом|залива|рекой|реки|пруд[а-я]*|озер[а-я]*)|вид\s+на\s+(?:воду|залив|реку|озер[а-я]*|пруд[а-я]*)|набережн[а-я]*|пруд[а-я]*|озер[а-я]*/g,()=>needs.add('waterfront'));
  consume(/мастер[ -]?класс[а-я]*|сделать\s+что[ -]то\s+руками/g,()=>needs.add('workshops'));
  for(const [pattern,key] of [[/керамик[а-я]*|гончар[а-я]*(?:\s+круг[а-я]*)?|лепк[а-я]*|лепить/g,'pottery'],
    [/рисовани[а-я]*|рисовать|живопис[а-я]*|акварел[а-я]*/g,'painting'],[/кулинар[а-я]*|готовить\s+вместе/g,'cooking'],
    [/импровизаци[а-я]*/g,'improv'],[/книжн[а-я]*\s+клуб[а-я]*|литературн[а-я]*\s+клуб[а-я]*|читательск[а-я]*\s+клуб[а-я]*/g,'book_club'],
    [/свечеварени[а-я]*|свеч[а-я]*/g,'candles'],[/парфюм[а-я]*|дух[иов]+(?![а-я])/g,'perfume'],[/мозаик[а-я]*/g,'mosaic'],[/тафтинг[а-я]*|созда[а-я]*\s+ковр[а-я]*/g,'tufting'],[/эпоксидн[а-я]*\s+смол[а-я]*/g,'resin'],[/рукодели[а-я]*|вязан[а-я]*|вышив[а-я]*|коллаж[а-я]*/g,'crafts']])consume(pattern,()=>needs.add(key));
  consume(/группов[а-я]*|сборн[а-я]*|пробн[а-я]*\s+(?:урок|заняти[а-я]*)/g);
  consume(/погулять|прогулк[а-я]*|гулять|на\s+свежем\s+воздухе|на\s+улице/g,()=>{outdoors=true;});
  consume(/утром|в\s+первой\s+половине\s+дня/g,()=>{daypart='morning';});
  consume(/днем|после\s+обеда/g,()=>{daypart='afternoon';});
  consume(/вечером/g,()=>{daypart='evening';});
  consume(/ночью/g,()=>{daypart='night';});
  consume(/в\s+будни|будним\s+днем/g,()=>{visitDay='weekday';});
  consume(/в\s+выходные|на\s+выходных/g,()=>{visitDay='weekend';});
  const budgetMatch = rest.match(/(?:до|бюджет(?:ом)?(?:\s+до)?)\s*(\d[\d\s]*)\s*(?:₽|руб[а-я]*|р(?![а-я]))/);
  const budget = budgetMatch ? Number(budgetMatch[1].replaceAll(' ', '')) : null;
  if(budgetMatch) rest=rest.replace(budgetMatch[0],' ');
  const priceScope = consume(/за\s+час|в\s+час|почасов[а-я]*/g) ? 'hour' : 'visit';
  const free = consume(/бесплат[а-я]*|без\s+(?:отдельной\s+)?оплаты|без\s+доплат[а-я]*|(?:игра\s+)?бонусом|не\s+доплачивать/g) && !optionalFree;
  if(free) {
    if(needs.has('billiards')) needs.add('free_billiards');
    else if(needs.has('laptop_work')) needs.add('free_workspace');
    else needs.add('free_entry');
  }
  for (const [pattern,values] of categoryPatterns) consume(pattern, match=>{values.forEach(x=>requestedCategories.add(x));if(/выставк/.test(match))needs.add('exhibitions');});
  const exhibitionAlternative=needs.has('exhibitions')&&/или|либо/.test(q)&&[...requestedCategories].some(c=>!['gallery','museum','space'].includes(c));
  if(exhibitionAlternative)needs.delete('exhibitions');
  if(needs.has('quiet') && !mood)mood='calm';
  if(needs.has('cozy') && !mood)mood='calm';
  const ignored = new Set(['куда','сходить','место','места','местечко','хочу','хочется','нужно','нужна','нужен','можно','где',
    'для','чтобы','посидеть','провести','время','сегодня','завтра','сейчас','просто','пожалуйста','немного','немножко',
    'чего','что','нибудь','какое','какая','такое','такой','очень','мне','нам','там','потом','это','есть','будет','будут','найти',
    'новое','новые','новый','необычное','интересное','интересный','классное','уютное','уютный','атмосферное','атмосферный',
    'своими','своей','свой','людьми','человеком','пообщаться','посмотреть','поиграть','попробовать','питер','питере','петербург','петербурге','санкт','спб','или',
    'без','про','при','под','над','еще','тоже','как','так','если','которое','которые','также','люблю','любят','рублей']);
  rest=rest.replace(/атмосферн[а-я]*|уютн[а-я]*|интересн[а-я]*|необычн[а-я]*|нов(?:ое|ый|ые|ом|ую)(?![а-я])/g,' ');
  const keywords = rest.split(/[^a-zа-я0-9]+/).filter(t=>t.length>2&&!ignored.has(t)&&! /^\d+$/.test(t));
  return {q,needs:[...needs],excludedFeatures:[...excludedFeatures],requestedCategories:[...requestedCategories],
    excludedCategories:[...excludedCategories],budget,priceScope,mood,company,outdoors,daypart,visitDay,exhibitionAlternative,keywords:[...new Set(keywords)]};
}

const profiles = {
  calm: ['conversation','cozy','quiet','lounge','reading_space','chamber_space','warm_lighting'],
  party: ['dance','live_music','cocktails'],
  melancholy: ['quiet','reading_space','waterfront','nature','garden','chamber_space','imaginative_exhibition'],
  reflective: ['quiet','reading_space','waterfront','nature','garden','imaginative_exhibition','historic_interior'],
  dreamy: ['panoramic_view','green_interior','lounge','garden','imaginative_exhibition','art_interior'],
  inspired: ['exhibitions','workshops','art_interior','historic_interior','live_music'],
  active: ['sports','climbing','boxing','ice_skating','billiards']
};
const companyProfiles = {
  first_date:{cafe:5,restaurant:4,bar:4,gallery:4,park:3,anticafe:3,space:2,activity:3,sport:2,billiards:2},
  date:{cafe:3,restaurant:5,gallery:3,park:3,activity:2,space:2},
  friends:{cafe:3,restaurant:3,bar:4,anticafe:5,activity:4,sport:3,billiards:4,club:3,space:3,park:2},
  parents:{museum:4,gallery:3,cafe:3,restaurant:4,park:3,space:2},
  alone:{library:4,cafe:3,gallery:4,museum:3,park:3,space:2,coworking:4}
};
const aliases = {coworking:'коворкинг',library:'библиотека чтение книги',cafe:'кафе кофе',restaurant:'ресторан ужин еда',
  bar:'бар коктейли',billiards:'бильярд',space:'пространство',museum:'музей выставка',gallery:'галерея выставка',
  activity:'активность',sport:'спорт скалолазание',park:'парк',club:'клуб музыка танцы'};

export function searchPlaces(places, opts = {}) {
  const query = parseQuery(opts.query || '');
  const mood = opts.mood !== undefined ? (opts.mood==='quiet'?'calm':opts.mood) : query.mood;
  const company = opts.company !== undefined ? opts.company : query.company;
  const context = {daypart:query.daypart,visitDay:query.visitDay};
  const needs = [...new Set([...query.needs,...(opts.features || []),
    ...(company==='children'?['child_friendly']:[]),...(company==='new_people'?['social_events']:[]),...(opts.category==='billiards'?['billiards']:[])])];
  const budget = opts.budget !== undefined && opts.budget !== null && opts.budget !== '' ? Number(opts.budget) : query.budget;
  const priceScope = opts.priceScope || query.priceScope;
  const visited = new Set(opts.visited || []);
  const results = [], alternatives = [], unknownPriceResults=[];
  const gaps = Object.fromEntries(needs.map(k=>[k,0]));
  const profile = mood==='calm'&&needs.includes('laptop_work')?['quiet','reading_space','chamber_space']:profiles[mood];
  const conversationVisit=!needs.includes('laptop_work')&&(needs.includes('coffee')||mood==='calm'&&['friends','date','first_date'].includes(company));
  const scenarioKeys=conversationVisit?['conversation','cozy','romantic','warm_lighting','vintage_interior','coffee','lounge','chamber_space']:needs.includes('laptop_work')?['laptop_work','quiet','wifi','power_outlets']:[];
  let unknownPrice = 0, unknownCoordinates = 0, unknownAtmosphere = 0;
  const visitDate=requestedDate(opts.query,opts.today);
  for (const p of places) {
    if (p.status==='closed' || (opts.hideVisited && visited.has(p.id))) continue;
    if (opts.city && p.city !== opts.city) continue;
    const explicitlyNamed = query.keywords.length && query.keywords.every(t=>normalize(p.title).includes(t));
    if (opts.hideLandmarks && p.is_landmark && !explicitlyNamed) continue;
    const participates=currentOffers(p,opts.today).length>0;
    if (opts.category && p.category!==opts.category && !(opts.category==='activity'&&participates)&&opts.category!=='billiards') continue;
    if (query.requestedCategories.length && !query.requestedCategories.includes(p.category)) continue;
    if (query.excludedCategories.includes(p.category)) continue;
    if (query.outdoors && !['park','space'].includes(p.category)) continue;
    if(conversationVisit&&['library','coworking'].includes(p.category))continue;
    const billiards=needs.includes('billiards')?billiardsInfo(p,{today:opts.today,context}):null;
    if(needs.includes('free_billiards')&&!billiards?.free)continue;
    if (company==='first_date' && !companyProfiles.first_date[p.category]) continue;
    const explicitOffer=company==='new_people'||needs.some(k=>activityKeys.includes(k));
    const wantsOffer=explicitOffer||(participates&&['activity','sport'].includes(p.category)&&!needs.includes('laptop_work'));
    const matchingOffers=wantsOffer?offersFor(p,{needs,company,query:opts.query,today:opts.today}):[];
    // An available private workshop and an unrelated public meetup are not the same offer.
    if(explicitOffer&&p.offers?.length&&!matchingOffers.length)continue;
    let offer=matchingOffers[0]||null;
    if(needs.includes('free_entry'))offer=matchingOffers.find(e=>priceFor(p,{offer:e,today:opts.today})?.amount===0)||offer;
    if(offer&&budget!==null){const within=matchingOffers.find(e=>{const q=priceFor(p,{offer:e,today:opts.today,scope:priceScope,needs,context});return q&&q.amount<=budget;});if(within)offer=within;}
    const searchable=offer?{...p,offers:[offer],documents:(p.documents||[]).filter(d=>!String(d.id).startsWith('offer:'))}:p;
    const analysis=analyseText(searchable,[...new Set([...needs,...(profile||[]),...scenarioKeys,...query.excludedFeatures,'exhibitions','quiet'])],context,opts.today);
    const resolve=key=>{
      const ev=analysis.evidence[key]||{positive:[],negative:[]};
      if(key==='free_billiards'&&billiards?.term){
        if(billiards.free)return {supported:true,strong:billiards.verified,hardNegative:false,conflict:false,positive:[],negative:[]};
        if(['paid','ticket'].includes(billiards.mode))return {supported:false,strong:false,hardNegative:true,conflict:false,positive:[],negative:[]};
      }
      if(offer&&key==='free_entry'&&priceFor(p,{offer,today:opts.today})?.amount===0)return {supported:true,strong:true,hardNegative:false,conflict:false,positive:[],negative:[]};
      if(offer&&((offer.activities||[]).includes(key)||key==='social_events'&&offer.format==='open_group')){
        return {supported:true,strong:true,hardNegative:false,conflict:false,positive:ev.positive.filter(e=>e.source_url===offer.source_url),negative:[]};
      }
      const hardNegative=hasFeature(p,key,false,opts.today,context)||ev.negative.some(e=>e.kind!=='review'&&!e.conditional&&!e.stale);
      const documented=meetsFeature(p,key,opts.today,context);
      // Prices and free use require explicit facts with the correct scope, never inference from prose.
      const positive=key.startsWith('free_')?[]:ev.positive;
      const conflict=positive.length>0&&ev.negative.length>0 || documented&&ev.negative.length>0;
      const strong=!hardNegative&&!conflict&&(documented||positive.some(e=>e.kind!=='review'&&!e.conditional&&!e.stale));
      return {supported:!hardNegative&&(documented||positive.length>0),strong,hardNegative,conflict,positive,negative:ev.negative};
    };
    if (query.excludedFeatures.some(key=>resolve(key).supported)) continue;
    if(query.exhibitionAlternative&&['gallery','museum','space'].includes(p.category)&&!resolve('exhibitions').supported)continue;
    if(mood==='calm'&&resolve('quiet').hardNegative)continue;
    const conditions=Object.fromEntries(needs.map(key=>[key,resolve(key)]));
    if(needs.some(key=>conditions[key].hardNegative))continue;
    const supportedNeeds=needs.filter(key=>conditions[key].supported);
    const coreActivities=new Set(['laptop_work','billiards','climbing','boxing','ice_skating','exhibitions','waterfront','coffee','food','cocktails',...activityKeys,...(company==='new_people'?['social_events']:[])]);
    if(needs.some(key=>coreActivities.has(key)&&!conditions[key].supported))continue;
    const missing=needs.filter(key=>!conditions[key].strong);
    missing.forEach(key=>gaps[key]++);
    const moodBoost=profile?profile.filter(key=>resolve(key).supported):[];
    if(profile&&!moodBoost.length){unknownAtmosphere++;if(!supportedNeeds.length&&!(conversationVisit&&resolve('coffee').supported))continue;}
    if(mood==='party'&&!moodBoost.includes('dance')&&!['bar','club'].includes(p.category))continue;
    const warnings=missing.map(key=>{
      const ev=conditions[key];
      if(ev.conflict)return featureLabels[key]+': сведения противоречат друг другу';
      if(ev.positive.some(e=>e.conditional))return featureLabels[key]+': зависит от времени или условий';
      if(ev.positive.some(e=>e.publication_date_unknown))return featureLabels[key]+': дата публикации не указана';
      if(ev.positive.some(e=>e.stale))return featureLabels[key]+': только старые отзывы';
      if(ev.positive.length)return featureLabels[key]+': по отзывам, нужно уточнить';
      return featureLabels[key]+': пока нет сведений';
    });
    if(profile&&!moodBoost.length)warnings.push('Атмосферу для «'+moods[mood]+'» нужно уточнить');
    else if(profile&&!moodBoost.some(key=>resolve(key).strong))warnings.push('Атмосфера описана в отзывах или зависит от времени');
    const price=priceFor(p,{today:opts.today,scope:priceScope,needs,context,offer});
    if(needs.includes('free_entry')&&price?.amount>0)continue;
    let unknownBudget=false;
    if (budget!==null && Number.isFinite(budget)) {
      if(!price){unknownPrice++;unknownBudget=true;warnings.push('Цена неизвестна: бюджет до '+budget+' ₽ не подтверждён');}
      else if(price.amount>budget)continue;
      else if(priceIsEstimate(price))warnings.push(price.kind==='menu_order'?'Бюджет рассчитан по примеру заказа; итог зависит от выбранных блюд и количества заказов':price.kind==='from'?'Указана начальная цена; выбранная программа может стоить дороже':'Средний чек — ориентир, итог зависит от заказа');
    }
    if(offer?.requirements)warnings.push(offer.requirements);
    if(billiards)warnings.push(...billiards.warnings);
    if(needs.includes('free_billiards')&&billiards?.mode==='with_order'&&budget!==null&&Number.isFinite(billiards.term.min_order)&&billiards.term.min_order>budget)continue;
    if(visitDate&&wantsOffer&&!offer?.starts_at)warnings.push('Дата '+visitDate+' не подтверждена: проверь расписание и места в группе');
    const distance = opts.location ? distanceKm(opts.location,p) : null;
    if (opts.location && opts.radius) {
      if (distance===null) {unknownCoordinates++;continue;}
      else if (distance > Number(opts.radius)) continue;
    }
    const matches = keywordMatches({...p,tags:[...(p.tags||[]),categories[p.category],aliases[p.category]]},analysis.documents,query.keywords);
    const recognized = needs.length || query.requestedCategories.length || mood || company || query.outdoors;
    if (query.keywords.length && !recognized && matches.length===0) continue;
    // Unknown labels alone are not a recommendation. At least one requested activity or atmosphere must be supported.
    if(needs.length&&!supportedNeeds.length&&!moodBoost.length&&!matches.length)continue;
    const companyWeight = companyProfiles[company]?.[p.category] || 0;
    const scenarioScore=scenarioKeys.reduce((n,key)=>n+(resolve(key).strong?key==='romantic'&&company!=='first_date'&&company!=='date'?0:6:resolve(key).supported?2:0),0);
    const score = matches.length*8 + supportedNeeds.length*8 + (needs.length-missing.length)*2 + (offer?12:0)+scenarioScore
      + moodBoost.reduce((sum,key)=>sum+(resolve(key).strong?7:2),0) + companyWeight - warnings.length*3
      + (Number.isFinite(p.discovery_priority)?Math.max(-5,Math.min(6,p.discovery_priority)):0) + (p.status==='reviewed'?1:0) + (distance===null?0:Math.max(0,3-distance/4));
    const reasons = supportedNeeds.map(n=>conditions[n].strong?featureLabels[n]:'В текстах: '+featureLabels[n].toLowerCase());
    if(conversationVisit){const why=scenarioKeys.filter(k=>resolve(k).supported).map(k=>featureLabels[k].toLowerCase()).slice(0,2);if(why.length)reasons.push('Для встречи: '+why.join(', '));}
    if(moodBoost.length)reasons.push('Почему для «'+moods[mood]+'»: '+moodBoost.map(k=>featureLabels[k].toLowerCase()).join(', '));
    if(company==='first_date')reasons.push('Первое свидание — по формату места');
    const evidence=[...supportedNeeds,...moodBoost].flatMap(key=>{
      const ev=resolve(key);return ev.conflict?[...ev.positive.slice(0,1),...ev.negative.slice(0,1)]:ev.positive;
    }).filter((e,i,all)=>all.findIndex(x=>x.source_url===e.source_url&&x.excerpt===e.excerpt)===i).slice(0,2);
    const item={place:p,score,distance,reasons,matches,warnings:[...new Set(warnings)],evidence,offer,price,billiards};
    if(unknownBudget&&opts.includeUnknownPrices===false)unknownPriceResults.push(item);
    else if(!warnings.length)results.push(item);else alternatives.push(item);
  }
  const sort=(a,b)=>(budget!==null?Number(Boolean(b.price))-Number(Boolean(a.price)):0)||b.score-a.score || a.place.title.localeCompare(b.place.title,'ru');
  results.sort(sort);alternatives.sort(sort);unknownPriceResults.sort(sort);
  const unhandled = query.keywords.filter(t=>![...results,...alternatives,...unknownPriceResults].some(r=>r.matches.includes(t)));
  const filterConflicts=opts.category&&query.requestedCategories.length&&!query.requestedCategories.includes(opts.category)
    ? ['В запросе: '+query.requestedCategories.map(k=>categories[k]).join(' / ')+'. В фильтре: '+categories[opts.category]+'.']:[];
  return {results,alternatives,unknownPriceResults,needs,budget,priceScope,gaps,unknownPrice,unknownCoordinates,unknownAtmosphere,parsed:query,mood,company,unhandled,filterConflicts,visitDate};
}

export function validateCatalogue(payload) {
  if (payload?.schema_version!==1 || !Array.isArray(payload.places) || payload.places.length > 50000)
    throw new Error('Нужен каталог версии 1, до 50 000 карточек.');
  const ids = new Set();
  for (const p of payload.places) {
    if (typeof p.id!=='string' || typeof p.title!=='string' || !p.id || !p.title || ids.has(p.id)
      || !Array.isArray(p.sources) || !p.sources.length || p.sources.some(s=>!safeUrl(s.url)) || !Array.isArray(p.features)
      || p.features.some(f=>!f || typeof f.key!=='string' || !safeUrl(f.source_url)))
      throw new Error('В карточке нет источника, идентификатор повторяется или формат неверен.');
    ids.add(p.id);
    if(p.billiards_terms!==undefined&&(!Array.isArray(p.billiards_terms)||p.billiards_terms.length>30||p.billiards_terms.some(t=>!t||!safeUrl(t.source_url)||!['free','with_order','paid','ticket','unknown'].includes(t.mode)||t.game_amount!==undefined&&(!Number.isFinite(t.game_amount)||t.game_amount<0)||t.min_order!==undefined&&t.min_order!==null&&(!Number.isFinite(t.min_order)||t.min_order<0))))throw new Error('Условия бильярда должны содержать источник, вид оплаты и неотрицательные суммы.');
    if(p.prices!==undefined&&(!Array.isArray(p.prices)||p.prices.length>30||p.prices.some(q=>!q||!Number.isFinite(q.amount)||q.amount<0||!safeUrl(q.source_url)||q.currency!=='RUB'||!['visit','hour'].includes(q.scope))))throw new Error('Некорректные цены: нужны сумма, источник и единица.');
    if(p.offers!==undefined&&(!Array.isArray(p.offers)||p.offers.length>100||p.offers.some(e=>!e||typeof e.id!=='string'||typeof e.title!=='string'||!safeUrl(e.source_url)||!safeUrl(e.booking_url)||!Array.isArray(e.activities)||!['open_group','private','individual','unknown'].includes(e.format))))throw new Error('Некорректный формат занятия или события.');
    if(p.photos!==undefined&&(!Array.isArray(p.photos)||p.photos.length>20||p.photos.some(f=>!f||!photoUrl(f.url)||!safeUrl(f.source_url)||!f.author||!f.license||!safeUrl(f.license_url))))throw new Error('Фотографии должны содержать источник, автора и разрешение.');
    if(p.documents!==undefined&&(!Array.isArray(p.documents)||p.documents.length>100||p.documents.some(d=>
      !d||typeof d.text!=='string'||d.text.length>24000||!safeUrl(d.source_url)||!['description','review','editorial'].includes(d.kind))))
      throw new Error('Некорректный текстовый источник: нужны текст, тип и ссылка.');
    for (const [key,min,max] of [['lat',-90,90],['lon',-180,180]])
      if (p[key]!==null && p[key]!==undefined && (!Number.isFinite(p[key]) || p[key]<min || p[key]>max))
        throw new Error('Некорректные координаты.');
  }
  return payload;
}
