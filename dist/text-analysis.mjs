// Local retrieval over attributed text. This is an explainable text analyser, not an LLM.
import {offerDocuments} from './experiences.mjs?v=20261012';
const normalize=s=>String(s||'').toLowerCase().replaceAll('ё','е');
const safeUrl=s=>{try{const u=new URL(s);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
export function stem(word){
  const w=normalize(word);
  if(w.length<5)return w;
  return w.replace(/(?:иями|ями|ами|ого|ему|ому|ыми|ими|ать|ять|еть|ить|ался|лась|лись|ала|али|ают|яют|уют|ется|ются|ий|ый|ой|ая|ое|ые|ом|ем|ам|ах|ях|ов|ев|ую|юю|ы|и|а|я|е|у|ю|ь)$/,'');
}
export const words=text=>normalize(text).match(/[a-zа-я0-9]+/g)||[];
export function documentsOf(place,today=new Date()){
  const documents=[...(place.documents||[]),...offerDocuments(place,today)];
  if(place.notes&&!/^(?:Условия посещения и актуальность требуют проверки\.|Адрес и формат получены из KudaGo\.)/.test(place.notes))documents.push({id:'editorial:'+place.id,kind:'editorial',text:place.notes,
    source_url:place.sources?.[0]?.url,observed_at:place.updated_at||place.sources?.[0]?.retrieved_at,
    valid_until:place.editorial_valid_until});
  return documents.filter(d=>{
    const date=new Date(d.observed_at||d.retrieved_at), age=(new Date(today)-date)/86400000;
    return typeof d.text==='string'&&d.text.trim()&&safeUrl(d.source_url)&&Number.isFinite(age)&&age>=0
      && age<=(d.kind==='review'?730:365)
      && (!d.valid_from||new Date(today)>=new Date(d.valid_from))
      && (!d.valid_until||new Date(today)<=new Date(d.valid_until));
  }).map(d=>({...d,stale:d.kind==='review'&&(new Date(today)-new Date(d.observed_at))/86400000>180}));
}

// Only requested concepts are evaluated; additional wording remains searchable in the corpus.
const patterns={
  laptop_work:[/ноутбук|коворкинг|рабоч(?:ая|ие)\s+(?:зона|места)|для\s+(?:работы|учебы)|приходят\s+(?:работать|поработать|учиться)|удобно\s+(?:работать|учиться)|работал[аи]?\s+за\s+компьютером|писать\s+код/,
    /(?:нельзя|запрещен[а-я]*|не\s+разреш[а-я]*)[^.!?]{0,35}ноутбук|ноутбук[^.!?]{0,35}(?:нельзя|запрещен[а-я]*|не\s+разреш[а-я]*)|поработать\s+не\s+получилось/],
  quiet:[/(?<![а-я])тих[а-я]*|тишин[а-я]*|не\s+шумно|негромк[а-я]*\s+музык[а-я]*|без\s+громк[а-я]*\s+музык[а-я]*/,
    /(?<!не )(?<![а-я])шумн[а-я]*|не\s+тихо|(?<!не )(?<!без )(?<![а-я])громк[а-я]*\s+музык[а-я]*|нет\s+тишины/],
  wifi:[/wi[ -]?fi|вай[ -]?фай|есть\s+интернет/,/(?:нет|без)\s+(?:wi[ -]?fi|вай[ -]?фая|интернета)|(?:wi[ -]?fi|вай[ -]?фай)\s+(?:не\s+работает|нет)/],
  power_outlets:[/розетк[а-я]*|зарядить\s+ноутбук/,/нет\s+розеток|розеток\s+нет|без\s+розеток/],
  lounge:[/лаунж|чилл?[ -]?аут|диван[а-я]*|мягк[а-я]*\s+(?:кресл[а-я]*|подушк[а-я]*)/],
  chamber_space:[/камерн[а-я]*|небольш[а-я]*\s+(?:зал|кафе|пространств[а-я]*)|уединенн[а-я]*/],
  panoramic_view:[/панорамн[а-я]*|вид\s+(?:из\s+окон|из\s+окна|на\s+(?:реку|город|залив|крыши))/],
  green_interior:[/растени[а-я]*|пальм[а-я]*|оранжере[а-я]*|в\s+окружении\s+зелени/],
  reading_space:[/почитать|читальн[а-я]*|читател[а-я]*|чтени[а-я]*|читать\s+книги/],
  garden:[/(?<![а-я])сад(?:ом|а|у|е)?(?![а-я])|зелен[а-я]*\s+двор/],
  nature:[/экотроп[а-я]*|лесн[а-я]*\s+(?:троп[а-я]*|маршрут[а-я]*)|природ[а-я]*|заповедник[а-я]*/],
  waterfront:[/набережн[а-я]*|у\s+воды|вид\s+на\s+(?:реку|залив)|берег[а-я]*\s+(?:реки|залива|озера)/],
  historic_interior:[/историческ[а-я]*\s+(?:интерьер[а-я]*|особняк[а-я]*)|лепнин[а-я]*|старинн[а-я]*|изразцов[а-я]*/],
  art_interior:[/арт[ -]?объект[а-я]*|искусств[а-я]*\s+в\s+интерьер[а-я]*|картины\s+на\s+стенах|художественн[а-я]*\s+интерьер[а-я]*/],
  imaginative_exhibition:[/выставк[а-я]*[^.!?]{0,80}(?:мечт[а-я]*|воображени[а-я]*|сн(?:ы|ов|ах)|о\s+любви)/],
  exhibitions:[/выставк[а-я]*|экспозици[а-я]*/],
  board_games:[/настолк[а-я]*|настольн[а-я]*\s+игр[а-я]*|игротек[а-я]*/],
  rpg:[/ролев[а-я]*\s+игр[а-я]*|d\s*&\s*d|dnd|днд/],
  war_games:[/варгейм[а-я]*|warhammer/],
  billiards:[/бильярд[а-я]*|бильярдн[а-я]*\s+стол/],
  social_events:[/открыт[а-я]*\s+(?:встреч[а-я]*|игротек[а-я]*|групп[а-я]*|мастер[ -]?класс[а-я]*)|общ[а-я]*\s+групп[а-я]*|сборн[а-я]*\s+(?:групп[а-я]*|мастер[ -]?класс[а-я]*)|можно\s+присоединиться|знакомств[а-я]*|клуб\s+по\s+интересам|разговорн[а-я]*\s+клуб[а-я]*/,
    /только\s+для\s+вашей\s+компании|закрыт[а-я]*\s+(?:групп[а-я]*|мероприяти[а-я]*)|посторонних\s+не\s+будет/],
  meetups:[/митап[а-я]*|meetup/],
  speaking_club:[/разговорн[а-я]*\s+клуб[а-я]*|speaking\s+club/],
  english_club:[/разговорн[а-я]*\s+клуб[а-я]*[^.!?]{0,40}английск[а-я]*|english\s+(?:club|speaking)/],
  workshops:[/мастер[ -]?класс[а-я]*|творческ[а-я]*\s+заняти[а-я]*/],
  pottery:[/керамик[а-я]*|гончар[а-я]*|лепк[а-я]*|глин[а-я]*/],
  painting:[/живопис[а-я]*|рисовани[а-я]*|рисовать|акварел[а-я]*|картина/],
  cooking:[/кулинар[а-я]*|готовить\s+вместе|приготовлени[а-я]*\s+(?:блюд[а-я]*|ед[а-я]*)/],
  improv:[/импровизаци[а-я]*/],
  book_club:[/книжн[а-я]*\s+клуб[а-я]*|литературн[а-я]*\s+клуб[а-я]*|обсужд[а-я]*\s+книг[а-я]*/],
  candles:[/свечеварени[а-я]*|свеч[а-я]*/],perfume:[/парфюм[а-я]*|духи/],mosaic:[/мозаик[а-я]*/],tufting:[/тафтинг[а-я]*|создани[а-я]*\s+ковр[а-я]*/],resin:[/эпоксидн[а-я]*\s+смол[а-я]*/],crafts:[/рукодели[а-я]*|вязан[а-я]*|вышив[а-я]*|коллаж[а-я]*/],
  french_club:[/французск[а-я]*\s+(?:разговорн[а-я]*\s+)?клуб[а-я]*|клуб[а-я]*[^.!?]{0,50}французск[а-я]*/],
  spanish_club:[/испанск[а-я]*\s+(?:разговорн[а-я]*\s+)?клуб[а-я]*|клуб[а-я]*[^.!?]{0,50}испанск[а-я]*/],
  korean_club:[/корейск[а-я]*\s+(?:разговорн[а-я]*\s+)?клуб[а-я]*|клуб[а-я]*[^.!?]{0,50}корейск[а-я]*/],
  german_club:[/немецк[а-я]*\s+(?:разговорн[а-я]*\s+)?клуб[а-я]*|клуб[а-я]*[^.!?]{0,50}немецк[а-я]*/],
  italian_club:[/итальянск[а-я]*\s+(?:разговорн[а-я]*\s+)?клуб[а-я]*|клуб[а-я]*[^.!?]{0,50}итальянск[а-я]*/],
  sign_club:[/жестов[а-я]*\s+язык[а-я]*|ржя/],
  dance:[/танц[а-я]*|диджей[а-я]*|dj[ -]?сет[а-я]*/],
  live_music:[/жив[а-я]*\s+музык[а-я]*|концерт[а-я]*/],
  child_friendly:[/детск[а-я]*\s+(?:зона|комната|меню)|с\s+детьми|для\s+детей/],
  sports:[/спортивн[а-я]*|тренировк[а-я]*|скалолазани[а-я]*|скалодром[а-я]*|бокс|каток/],
  climbing:[/скалолазани[а-я]*|скалодром[а-я]*|боулдеринг[а-я]*/],
  boxing:[/бокс[а-я]*/], ice_skating:[/каток[а-я]*|катани[а-я]*\s+на\s+коньках/]
};

function timeContext(text,context,document){
  const q=normalize(text);
  const part=/утром|первой\s+половине\s+дня/.test(q)?'morning':/вечером/.test(q)?'evening':/ночью/.test(q)?'night':'';
  const day=/в\s+будни|по\s+будням/.test(q)?'weekday':/выходн/.test(q)?'weekend':'';
  if(part&&context.daypart&&part!==context.daypart)return {skip:true};
  if(day&&context.visitDay&&day!==context.visitDay)return {skip:true};
  if(document.scope==='weekday_morning'&&(context.daypart!=='morning'||context.visitDay!=='weekday'))return {conditional:true};
  const conditional=Boolean((part&&!context.daypart)||(day&&!context.visitDay)||/иногда|бывало|на\s+мероприятиях|только\s+при/.test(q));
  return {conditional,contextLabel:[day==='weekday'?'в будни':day==='weekend'?'в выходные':'',
    {morning:'утром',evening:'вечером',night:'ночью'}[part]||''].filter(Boolean).join(' ')};
}

export function analyseText(place,keys,context={},today=new Date()){
  const documents=documentsOf(place,today), evidence=Object.fromEntries(keys.map(k=>[k,{positive:[],negative:[]}])) ;
  for(const document of documents){
    // A contrast starts a separate clause, so a restriction is not lost inside a positive sentence.
    const clauses=document.text.replace(/<[^>]*>/g,' ').split(/[.!?;\n]+|,\s*(?:но\s+|а\s+|(?=вечером|утром|ночью))/i);
    for(const original of clauses){
      const text=normalize(original);
      if(!text.trim()||/не\s+(?:подтвержден[а-я]*|проверен[а-я]*|указан[а-я]*)|требует\s+проверки/.test(text))continue;
      const timing=timeContext(text,context,document);if(timing.skip)continue;
      for(const key of keys){
        const rule=patterns[key];if(!rule)continue;
        const negative=Boolean(rule[1]?.test(text));
        if(!negative&&!rule[0].test(text))continue;
        // Generic negation must not produce an affirmative statement.
        if(!negative&&/(?:нет|без|не\s+бывает|не\s+проводят)\s/.test(text)&&!(key==='quiet'&&/без\s+громк[а-я]*\s+музык[а-я]*/.test(text)))continue;
        const item={key,value:!negative,source_url:document.source_url,kind:document.kind,observed_at:document.observed_at||document.retrieved_at,
          excerpt:original.trim().split(/\s+/).slice(0,18).join(' ').slice(0,220),conditional:timing.conditional,
          contextLabel:timing.contextLabel,stale:document.stale};
        evidence[key][negative?'negative':'positive'].push(item);
      }
    }
  }
  return {documents,evidence};
}

export function keywordMatches(place,documents,keywords){
  const tokens=new Set(words([place.title,place.address,place.subway,...(place.tags||[]),...documents.map(d=>d.text)].join(' ')).map(stem));
  return keywords.filter(k=>tokens.has(stem(k)));
}
