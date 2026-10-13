import {searchPlaces,safeUrl} from '../dist/search.mjs';
import {priceLabel} from '../dist/pricing.mjs';
import {offerWhen} from '../dist/experiences.mjs';
import {placeLink} from '../dist/place-links.mjs';
const escape=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const TTL=10*60*1000;
const keyboard={keyboard:[[{text:'📍 Поделиться точкой для поиска рядом',request_location:true}]],resize_keyboard:true,one_time_keyboard:true};
export function createBot({catalogue,miniAppUrl,now=()=>Date.now(),allowedUserIds=[]}={}){
  const url=safeUrl(miniAppUrl);if(!url||!url.startsWith('https://'))throw new Error('Нужен доступный HTTPS-адрес Mini App.');
  const sessions=new Map();
  const allowed=new Set(allowedUserIds.map(Number));
  const send=(chatId,text,markup)=>({method:'sendMessage',args:{chat_id:chatId,text,parse_mode:'HTML',link_preview_options:{is_disabled:true},...(markup?{reply_markup:markup}:{})}});
  const appButton=(query='')=>{const u=new URL(url);if(query)u.searchParams.set('query',query);return {inline_keyboard:[[{text:'Открыть приложение',web_app:{url:u.href}}]]};};
  async function handle(update){
    const message=update?.message;
    if(!message||message.chat?.type!=='private'||!Number.isSafeInteger(message.chat.id)||message.from?.is_bot)return [];
    if(allowed.size&&!allowed.has(message.from?.id))return [send(message.chat.id,'Бот пока в закрытом тестировании.')];
    const time=now();for(const [key,value] of sessions)if(value.expires<=time)sessions.delete(key);
    const chatId=message.chat.id,session=sessions.get(chatId)||{query:'',city:'Санкт-Петербург',location:null};
    const text=String(message.text||'').trim().slice(0,1000),command=text.split(/\s/)[0].split('@')[0];
    if(['/start','/help'].includes(command))return [send(chatId,'Напиши, куда хочется: например, «кафе для работы до 1000 рублей» или «групповой мастер-класс, познакомиться с людьми».\n\n/nearby — поиск рядом по разовой геопозиции\n/app — приложение\n/forget — удалить контекст и геопозицию',appButton())];
    if(command==='/app')return [send(chatId,'Все карточки, фильтры, карта и избранное — в приложении.',appButton())];
    if(command==='/forget'){sessions.delete(chatId);return [send(chatId,'Запрос и геопозиция удалены из памяти бота.',{remove_keyboard:true})];}
    if(command==='/nearby'||/рядом\s+со\s+мной|поблизости/.test(text.toLowerCase())&&!session.location){
      if(command!=='/nearby')session.query=text.replace(/рядом\s+со\s+мной|поблизости/gi,'').trim();
      session.awaitingLocation=true;session.expires=time+TTL;sessions.set(chatId,session);
      return [send(chatId,'Отправь точку кнопкой ниже. Подбор будет в радиусе 5 км по прямой; геопозиция хранится только в памяти до 10 минут. Постоянное отслеживание не используется.',keyboard)];
    }
    if(message.location){
      const {latitude:lat,longitude:lon}=message.location;
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return [send(chatId,'Не удалось прочитать координаты. Попробуй отправить точку ещё раз.')];
      if(message.location.live_period)return [send(chatId,'Для поиска нужна разовая точка. Останови трансляцию и отправь обычную геопозицию.')];
      session.location={lat,lon};session.awaitingLocation=false;
    }else{
      if(!text)return [send(chatId,'Напиши запрос текстом или отправь разовую геопозицию.')];
      if(/^https?:\/\/(?:www\.)?(?:instagram\.com|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)\//i.test(text))return [send(chatId,'Ссылка сама по себе не раскрывает содержание ролика. Напиши название места и что там понравилось — это поможет найти его в каталоге. Для общей базы ссылка и описание должны пройти проверку; автоматический сбор Instagram/TikTok пока не подключён.',appButton())];
      session.query=text.replace(/рядом\s+со\s+мной|поблизости/gi,'').trim();
    }
    session.expires=time+TTL;sessions.set(chatId,session);
    const result=searchPlaces(catalogue.places,{query:session.query,city:session.city,hideLandmarks:true,
      includeUnknownPrices:true,today:new Date(time),location:session.location,radius:session.location?5:null});
    const choices=[...result.results,...result.alternatives].slice(0,3),messages=[];
    if(!choices.length){
      let reason='Подходящих вариантов с известными условиями пока нет.';
      if(result.unknownPriceResults.length)reason+=` ${result.unknownPriceResults.length} мест подходят по занятию, но цена неизвестна. В приложении можно включить их отдельно.`;
      if(session.location)reason+=' Можно расширить радиус в приложении.';
      return [send(chatId,reason,appButton(session.query))];
    }
    if(result.unhandled.length)messages.push(send(chatId,'Пока не удалось учесть: '+escape(result.unhandled.join(' '))+'. Ниже варианты по понятой части запроса.'));
    for(const item of choices){
      const p=item.place,offer=item.offer;
      const body=[`<b>${escape(p.title)}</b>`,p.address?escape(p.address):'Адрес выбранного занятия уточни у организатора.',
        offer?`${escape(offer.title)}\n${escape(offerWhen(offer))}`:'',escape(priceLabel(item.price)),
        item.distance!==null?`${item.distance.toFixed(1)} км по прямой`:'',
        escape(item.reasons.slice(0,2).join(' · ')),item.warnings.length?'Уточни: '+escape(item.warnings.slice(0,2).join('; ')):''
      ].filter(Boolean).join('\n');
      const buttons=[[{text:'Открыть карточку',web_app:{url:placeLink(url,p.id,offer?.id||'')}}]];
      if(offer)buttons.push([{text:'Расписание и запись',url:offer.booking_url}]);
      const source=offer?.source_url||item.price?.source_url||p.sources?.[0]?.url;
      if(safeUrl(source))buttons.push([{text:'Источник',url:source}]);
      messages.push(send(chatId,body,{inline_keyboard:buttons}));
    }
    return messages;
  }
  return {handle,sessionCount:()=>sessions.size};
}
