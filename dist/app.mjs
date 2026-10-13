import {categories, moods, companies, featureLabels, safeUrl, hasFeature, parseQuery, searchPlaces, validateCatalogue} from './search.mjs?v=20261013b';
import {mergeCatalogues} from './providers.mjs?v=20261013b';
import {documentsOf} from './text-analysis.mjs?v=20261013b';
import {priceFor,priceLabel} from './pricing.mjs?v=20261013b';
import {currentOffers,offerWhen} from './experiences.mjs?v=20261013b';
import {linkedPlace,placeLink} from './place-links.mjs?v=20261013b';
import {photoUrl} from './photo-assets.mjs?v=20261013b';
import {applyAdminDrafts,ADMIN_DRAFT_KEY} from './admin-model.mjs?v=20261013b';
import {billiardsInfo} from './billiards.mjs?v=20261013b';
import {sportLabels,sportsFor,sportDetails} from './sports.mjs?v=20261013b';
const $ = id => document.getElementById(id);
const escape = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const load = (key, fallback) => {try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
const save = (key, value) => {try{localStorage.setItem(key, JSON.stringify(value));return true;}catch{return false;}};
const state = {catalogue:null, baseline:null, favorites:new Set(load('kuda.favorites',[])), visited:new Set(load('kuda.visited',[])),
  location:null, lastSearch:null, visible:12, view:'discover',autoMood:'',autoCompany:'',openedPlace:null,openedOffer:''};
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3500);}

function card({place:p, distance=null, reasons=[],warnings=[],evidence=[],offer=null,price=undefined,billiards=null,sport=null},detail=false) {
  const tags=[...new Set((p.features||[]).filter(f=>hasFeature(p,f.key,f.value) && f.value===true && f.key!=='free_billiards' && featureLabels[f.key]).map(f=>f.key))];
  const refs=p.sources.map(s=>safeUrl(s.url)?`<a href="${escape(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${escape(s.label || 'Источник')} ↗</a>`:'').join('');
  const map='https://yandex.ru/maps/?text='+encodeURIComponent([p.title,p.address,p.city].filter(Boolean).join(', '));
  if(price===undefined)price=priceFor(p,{offer});
  if(!billiards&&(p.billiards_terms?.length||tags.includes('billiards')||p.category==='billiards'))billiards=billiardsInfo(p);
  const gameInfo=billiards?`<p class="game-cost"><strong>${escape(billiards.label)}</strong>${billiards.term?`<br><a href="${escape(safeUrl(billiards.term.source_url))}" target="_blank" rel="noopener noreferrer">Условия игры ↗</a> · ${escape(String(billiards.term.checked_at).slice(0,10))}`:''}${billiards.warnings.length?`<br>${escape(billiards.warnings.join(' '))}`:''}</p>`:'';
  if(!sport)sport=sportDetails(sportsFor(p)[0]);
  const sportInfo=sport?`<p class="sport-info"><strong>${escape(sport.label)}</strong> · ${escape(sport.environment)}${sport.cost?`<br>${escape(sport.cost)}`:''}${sport.conditions.length||sport.warnings.length?`<br>${escape([...sport.conditions,...sport.warnings].join(' '))}`:''}<br><a href="${escape(safeUrl(sport.booking_url))}" target="_blank" rel="noopener noreferrer">Площадка и запись ↗</a> · ${escape(String(sport.checked_at).slice(0,10))}</p>`:'';
  const unknown=priceLabel(price);
  const priceInfo=price?`<p class="price-source">${escape(price.label||'Указанная цена')} · ${escape(String(price.checked_at).slice(0,10))} <a href="${escape(safeUrl(price.source_url))}" target="_blank" rel="noopener noreferrer">${price.kind==='menu_order'?'Меню':'Источник цены'} ↗</a>${price.note?`<br>${escape(price.note)}`:''}</p>`:'';
  const photo=(p.photos||[]).find(f=>photoUrl(f.url)&&safeUrl(f.source_url)&&f.author&&f.license);
  const image=photo?`<img class="place-photo" src="${escape(photoUrl(photo.url))}" alt="${escape(photo.alt||p.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:'';
  const photoCredit=photo?`<p class="photo-credit">${escape(photo.caption||'Фото места')} · ${escape(photo.author)} · <a href="${escape(safeUrl(photo.license_url))}" target="_blank" rel="noopener noreferrer">${escape(photo.license)}</a> · <a href="${escape(safeUrl(photo.source_url))}" target="_blank" rel="noopener noreferrer">Оригинал ↗</a> · кадрировано</p>`:'';
  const format=offer?`<div class="offer-summary"><span class="offer-format">${offer.format==='open_group'?'Можно прийти одной / одному':offer.format==='private'?'Для своей компании':'Занятие по записи'}</span><h4>${escape(offer.title)}</h4><p>${escape(offerWhen(offer))}</p><p>${escape(offer.description||'')}</p><a class="text-link" href="${escape(safeUrl(offer.booking_url))}" target="_blank" rel="noopener noreferrer">Расписание и запись ↗</a></div>`:'';
  const otherWarnings=warnings.filter(w=>!billiards?.warnings.includes(w)&&!sport?.warnings.includes(w));
  const checks=otherWarnings.length?`<div class="conditions-to-check"><strong>Перед визитом уточни</strong><ul>${otherWarnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul></div>`:'';
  const proof=evidence.length?`<details class="text-evidence"><summary>На чём основан подбор</summary>${evidence.map(e=>`<p><span>${e.source_kind==='social'?'Публичная рекомендация':e.kind==='review'?'Отзыв посетителя':e.kind==='editorial'?'Обзор места':'Описание места'} · ${e.publication_date_unknown?'дата публикации не указана':escape(String(e.observed_at).slice(0,10))}</span><br>«${escape(e.excerpt)}» <a href="${escape(safeUrl(e.source_url))}" target="_blank" rel="noopener noreferrer">Источник ↗</a></p>`).join('')}</details>`:'';
  return `<article class="place-card"><div class="card-cover cover-${escape(categories[p.category]?p.category:'other')}"><span class="cover-shape" aria-hidden="true"></span>${image}<span class="category-label">${escape(categories[p.category]||'Место')}</span><button class="favorite-button ${state.favorites.has(p.id)?'is-saved':''}" data-favorite="${escape(p.id)}" aria-label="${state.favorites.has(p.id)?'Убрать из избранного':'Сохранить'}: ${escape(p.title)}" aria-pressed="${state.favorites.has(p.id)}">${state.favorites.has(p.id)?'♥':'♡'}</button></div><div class="card-content"><h3>${escape(p.title)}</h3><p class="address">${escape(p.address || 'Точный адрес уточни в источнике')}${distance!==null?` · ${distance.toFixed(1)} км по прямой`:''}</p><div class="badges">${tags.map(key=>`<span class="badge">${escape(featureLabels[key])}</span>`).join('')}<span class="badge ${price?'price-badge':'unknown'}">${escape(unknown)}</span></div>${priceInfo}${gameInfo}${sportInfo}${format}<p class="card-note">${reasons.length?escape(reasons.join(' · '))+'. ':''}${escape(p.notes || 'Условия посещения требуют проверки.')}</p>${checks}${proof}${photoCredit}<div class="card-sources">${refs}</div><div class="card-bottom">${detail?'':`<button class="text-button" data-open-place="${escape(p.id)}" data-open-offer="${escape(offer?.id||'')}">Карточка ↗</button>`}<a class="map-link" href="${escape(map)}" target="_blank" rel="noopener noreferrer">На карте ↗</a><button class="visited-button ${state.visited.has(p.id)?'is-visited':''}" data-visited="${escape(p.id)}">${state.visited.has(p.id)?'Посещено ✓':'Уже была / был'}</button></div></div></article>`;
}

function options() {
  return {query:$('query').value, category:$('category').value, budget:$('budget').value,
    sport:$('sport-type').value,billiardsPayment:$('billiards-payment').value,
    mood:$('mood').value,company:$('company').value,city:$('city').value,hideLandmarks:$('hide-landmarks').checked,
    hideVisited:$('hide-visited').checked,visited:[...state.visited],location:state.location,radius:state.location?$('radius').value:null,
    includeUnknownPrices:!$('known-price-only').checked};
}

function syncTextContext(){
  const intent=parseQuery($('query').value);
  for(const [id,key] of [['mood','autoMood'],['company','autoCompany']]){
    if(intent[id]||$(id).value===state[key])$(id).value=intent[id];state[key]=intent[id];
  }
}
function renderInterpretation(result){
  const labels=[];
  if(result.mood)labels.push(moods[result.mood]);
  if(result.company)labels.push(companies[result.company]);
  labels.push(...result.needs.map(k=>featureLabels[k]||k));
  if(result.parsed.requestedCategories.length)labels.push(result.parsed.requestedCategories.map(k=>categories[k]).join(' / '));
  if($('category').value)labels.push('Категория: '+categories[$('category').value]);
  if(result.parsed.excludedCategories.length)labels.push('Исключаем: '+result.parsed.excludedCategories.map(k=>categories[k]).join(', '));
  if(result.parsed.outdoors)labels.push('На открытом воздухе');
  if(result.parsed.daypart)labels.push({morning:'Утром',afternoon:'Днём',evening:'Вечером',night:'Ночью'}[result.parsed.daypart]);
  if(result.parsed.visitDay)labels.push(result.parsed.visitDay==='weekday'?'В будни':'В выходные');
  if(result.budget!==null)labels.push(`До ${result.budget} ₽ ${result.priceScope==='hour'?'за час':'за посещение'}`);
  if(state.location)labels.push('Рядом · '+$('radius').value+' км');
  if(result.visitDate)labels.push('Дата: '+result.visitDate);
  if(result.billiardsPayment)labels.push({free:'Бильярд без отдельной оплаты',paid:'Бильярд оплачивается отдельно',ticket:'Бильярд внутри платного билета',unknown:'Оплата бильярда ещё не подтверждена'}[result.billiardsPayment]);
  $('intent-tags').innerHTML=[...new Set(labels)].map(label=>`<span>${escape(label)}</span>`).join('');
  const warnings=[];
  warnings.push(...result.filterConflicts);
  if(result.needs.includes('laptop_work')&&['first_date','date','friends'].includes(result.company))warnings.push('В тексте запрошена работа с ноутбуком. Для встречи без работы выбери пример «Кофе с подругой» или «Первое свидание».');
  if(result.unhandled.length)warnings.push('Не удалось учесть: «'+result.unhandled.join(' ')+'». Подбор ниже — по понятой части запроса.');
  $('intent-warning').textContent=warnings.join(' ');$('intent-warning').classList.toggle('hidden',!warnings.length);
  $('interpretation').classList.toggle('hidden',!labels.length&&!warnings.length);
}

function renderSearch(reset=false) {
  if (!state.catalogue) return;
  if(reset)state.visible=12;
  const result=searchPlaces(state.catalogue.places,options());state.lastSearch=result;
  renderInterpretation(result);
  $('billiards-options').classList.toggle('hidden',!result.needs.includes('billiards'));
  $('sports-options').classList.toggle('hidden',!result.needs.includes('sports')&&$('category').value!=='sport');
  $('results').innerHTML=result.results.slice(0,state.visible).map(item=>card(item)).join('');
  $('results-title').textContent=result.unhandled.length?'По понятой части запроса':($('query').value.trim()||$('mood').value||$('company').value?'Под твой запрос':'Открой новое место');
  $('current-city').textContent=$('city').value||'Каталог';
  $('result-count').textContent=result.alternatives.length?`${result.results.length+result.alternatives.length} вариантов · ${result.alternatives.length} с уточнениями`:`${result.results.length} из ${state.catalogue.places.length} мест`;
  $('empty-state').classList.toggle('hidden',result.results.length+result.alternatives.length!==0);
  $('load-more').classList.toggle('hidden',Math.max(result.results.length,result.alternatives.length)<=state.visible);
  $('search-summary').textContent='';$('search-summary').classList.add('hidden');
  $('budget-options').classList.toggle('hidden',result.budget===null);
  const unknown=[...result.results,...result.alternatives].filter(x=>!x.price).length;
  $('budget-status').textContent=result.unknownPriceResults.length?`${result.unknownPriceResults.length} мест скрыто без данных о бюджете.`:unknown?`${unknown} вариантов без данных о бюджете — уточни стоимость в карточке.`:result.budget!==null?'Средний чек учитывается как бюджет на человека.':'';
  const details=[];
  for(const [key,n] of Object.entries(result.gaps))if(n)details.push(`«${featureLabels[key]}»: у части мест нет подтверждения`);
  if(result.unknownPrice)details.push('есть места без свежей цены за нужную единицу');
  if(result.unknownCoordinates)details.push('часть мест не имеет координат');
  if(result.unknownAtmosphere)details.push('для выбранного настроения у части мест нет подходящих признаков');
  $('empty-message').textContent=result.filterConflicts.length?result.filterConflicts.join(' '):details.length?'В этой базе недостаточно сведений для точного ответа: '+details.join('; ')+'. Можно изменить запрос или расширить каталог.':'Попробуй другую категорию, более общий запрос или проверь список посещённых мест.';
  const showAlternatives=result.alternatives.length>0;
  $('alternatives-section').classList.toggle('hidden',!showAlternatives);
  $('alternative-results').innerHTML=showAlternatives?result.alternatives.slice(0,state.visible).map(item=>card(item)).join(''):'';
}

function renderSaved(){const items=state.catalogue.places.filter(p=>state.favorites.has(p.id));$('saved-results').innerHTML=items.map(p=>card({place:p})).join('');$('saved-empty').classList.toggle('hidden',items.length>0);$('fav-count').textContent=items.length;}
function renderStats(){const p=state.catalogue.places;const values=[[p.filter(x=>documentsOf(x).some(d=>d.kind!=='review')).length,'мест с содержанием для подбора'],[p.length,'всего адресов'],[p.reduce((n,x)=>n+(x.documents||[]).filter(d=>d.kind==='review').length,0),'загруженных отзывов'],[p.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)).length,'мест с координатами']];$('stats').innerHTML=values.map(([n,label])=>`<div class="stat"><strong>${n}</strong><span>${escape(label)}</span></div>`).join('');}
function renderAll(){renderSearch();renderSaved();renderStats();if(state.openedPlace)renderPlacePanel();}
function renderPlacePanel(){
  const p=state.catalogue.places.find(x=>x.id===state.openedPlace);if(!p){toast('Этого места пока нет в каталоге.');closePlace();return;}
  const found=[...(state.lastSearch?.results||[]),...(state.lastSearch?.alternatives||[]),...(state.lastSearch?.unknownPriceResults||[])].find(x=>x.place.id===p.id);
  const offer=state.openedOffer?currentOffers(p).find(e=>e.id===state.openedOffer):found?.offer;
  $('place-content').innerHTML=card({place:p,...(found||{}),offer:offer||null,price:offer?priceFor(p,{offer}):found?.price},true);
  const more=currentOffers(p).filter(e=>e.id!==offer?.id);
  if(more.length)$('place-content').innerHTML+=`<section class="other-offers"><h3>Другие форматы здесь</h3>${more.map(e=>`<div><strong>${escape(e.title)}</strong><p>${escape(offerWhen(e))} · ${escape(priceLabel(priceFor(p,{offer:e})))}</p>${e.price_note?`<p>${escape(e.price_note)}</p>`:''}<p>${escape(e.format==='open_group'?'Можно присоединиться к группе':e.format==='private'?'Только для своей компании':'Формат группы уточни')}${e.requirements?' · '+escape(e.requirements):''}</p><a href="${escape(safeUrl(e.booking_url))}" target="_blank" rel="noopener noreferrer">Расписание и запись ↗</a></div>`).join('')}</section>`;
  $('place-panel').classList.remove('hidden');document.body?.classList.add('place-is-open');
  $('close-place').focus?.();
}
function closePlace(){$('place-panel').classList.add('hidden');document.body?.classList.remove('place-is-open');state.openedPlace=null;state.openedOffer='';}
function syncCities(){
  const selected=$('city').value;
  const cities=[...new Set(state.catalogue.places.map(p=>p.city).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  $('city').innerHTML='';
  for(const city of cities){const o=document.createElement('option');o.value=city;o.textContent=city;$('city').append(o);}
  $('city').value=cities.includes(selected)?selected:(cities.includes('Санкт-Петербург')?'Санкт-Петербург':cities[0]||'');
}
function persistCatalogue(){
  const baseline=new Map(state.baseline.places.map(p=>[p.id,JSON.stringify(p)]));
  const delta=state.catalogue.places.filter(p=>baseline.get(p.id)!==JSON.stringify(p));
  return save('kuda.catalogue',{schema_version:1,places:delta});
}
function installCatalogue(payload){
  state.catalogue=mergeCatalogues(state.catalogue||state.baseline,payload);
  const persisted=persistCatalogue();syncCities();renderAll();return persisted;
}
function setView(view){state.view=view;for(const name of ['discover','saved','catalogue'])$(name+'-view').classList.toggle('hidden',name!==view);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}

function reset(){for(const id of ['query','category','budget','mood','company','sport-type','billiards-payment'])$(id).value='';$('known-price-only').checked=false;state.autoMood='';state.autoCompany='';state.location=null;$('radius-label').classList.add('hidden');$('location-button').textContent='◎ Рядом со мной';$('location-status').textContent='';renderSearch(true);}

async function requestLocation(){
  if(state.location){state.location=null;$('location-button').textContent='◎ Рядом со мной';$('radius-label').classList.add('hidden');$('location-status').textContent='';renderSearch(true);return;}
  $('location-status').textContent='Запрашиваем разрешение. Координаты используются в этом браузере для подбора.';
  const success=coords=>{state.location={lat:coords.latitude,lon:coords.longitude};$('radius-label').classList.remove('hidden');$('location-button').textContent='× Отключить геолокацию';$('location-status').textContent='Точка получена. Места без координат не попадут в подборку рядом.';renderSearch(true);};
  const failure=()=>{$('location-status').textContent='Геолокация недоступна. Можно искать по названию, адресу или категории.';};
  const tg=window.Telegram?.WebApp;
  try{
    if(tg?.initData && tg.LocationManager && tg.isVersionAtLeast('8.0'))tg.LocationManager.init(()=>tg.LocationManager.getLocation(loc=>loc?success(loc):failure()));
    else if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>success(p.coords),failure,{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
    else failure();
  }catch{failure();}
}

document.addEventListener('click',e=>{
  const favorite=e.target.closest('[data-favorite]');const visited=e.target.closest('[data-visited]');
  if(favorite){const id=favorite.dataset.favorite;state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);save('kuda.favorites',[...state.favorites]);renderAll();}
  if(visited){const id=visited.dataset.visited;state.visited.has(id)?state.visited.delete(id):state.visited.add(id);save('kuda.visited',[...state.visited]);renderAll();toast('Список посещённых обновлён');}
  const open=e.target.closest('[data-open-place]');if(open){state.openedPlace=open.dataset.openPlace;state.openedOffer=open.dataset.openOffer||'';renderPlacePanel();}
  const query=e.target.closest('[data-query]');if(query){for(const id of ['category','budget','mood','company','sport-type','billiards-payment'])$(id).value='';$('query').value=query.dataset.query;syncTextContext();renderSearch(true);}
  const view=e.target.closest('[data-view]');if(view)setView(view.dataset.view);
});
document.addEventListener('error',e=>{if(e.target?.classList?.contains?.('place-photo'))e.target.hidden=true;},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePlace();});
window.addEventListener?.('storage',e=>{if(e.key!==ADMIN_DRAFT_KEY&&e.key!=='kuda.catalogue')return;try{const cached=load('kuda.catalogue',null);state.catalogue=applyAdminDrafts(cached?mergeCatalogues(state.baseline,cached):state.baseline,load(ADMIN_DRAFT_KEY,null));syncCities();renderAll();}catch{toast('Не удалось применить изменения редактора.');}});
$('close-place').addEventListener('click',closePlace);
$('place-panel').addEventListener('click',e=>{if(e.target===$('place-panel'))closePlace();});
$('share-place').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(placeLink(window.location.href,state.openedPlace,state.openedOffer));toast('Ссылка на карточку скопирована');}catch{toast('Копирование недоступно в этом браузере.');}});
$('search-form').addEventListener('submit',e=>{e.preventDefault();syncTextContext();renderSearch(true);});
for(const id of ['category','budget','company','mood','hide-visited','hide-landmarks','city','radius','known-price-only','sport-type','billiards-payment'])$(id).addEventListener('change',()=>renderSearch(true));
$('location-button').addEventListener('click',requestLocation);$('reset-search').addEventListener('click',reset);
$('clear-filters').addEventListener('click',reset);
$('retry-query').addEventListener('click',()=>{
  for(const id of ['category','budget','mood','company','sport-type','billiards-payment'])$(id).value='';
  state.autoMood='';state.autoCompany='';state.location=null;
  $('radius-label').classList.add('hidden');$('location-button').textContent='◎ Рядом со мной';$('location-status').textContent='';
  syncTextContext();renderSearch(true);
});
$('load-more').addEventListener('click',()=>{state.visible+=12;renderSearch();});

try {
  const response=await fetch('places.json?v=20261013b');if(!response.ok)throw new Error('Не удалось загрузить каталог');
  state.baseline=validateCatalogue(await response.json());
  const cached=load('kuda.catalogue',null);try{state.catalogue=cached?mergeCatalogues(state.baseline,validateCatalogue(cached)):state.baseline;}catch{state.catalogue=state.baseline;}
  try{state.catalogue=applyAdminDrafts(state.catalogue,load(ADMIN_DRAFT_KEY,null));}catch{toast('Черновики редактора не удалось прочитать. Опубликованный каталог доступен.');}
  syncCities();
  for(const [value,label] of Object.entries(categories)){const option=document.createElement('option');option.value=value;option.textContent=label;$('category').append(option);}
  for(const [value,label] of Object.entries(sportLabels)){const option=document.createElement('option');option.value=value;option.textContent=label;$('sport-type').append(option);}
  for(const [id,values] of [['mood',moods],['company',companies]])for(const [value,label] of Object.entries(values)){const option=document.createElement('option');option.value=value;option.textContent=label;$(id).append(option);}
  const initialQuery=window.location?.href?new URL(window.location.href).searchParams.get('query'):null;
  if(initialQuery){$('query').value=initialQuery.slice(0,1000);syncTextContext();}
  $('admin-link').classList.toggle('hidden',!window.location?.hostname?.endsWith('.chatgpt.site'));
  renderAll();
  const tg=window.Telegram?.WebApp;if(tg?.initData){tg.ready();tg.expand();}
  const link=linkedPlace({href:window.location?.href,startParam:tg?.initDataUnsafe?.start_param||''});
  if(link){state.openedPlace=link.id;state.openedOffer=link.offer;renderPlacePanel();}
}catch(err){$('results-title').textContent='Каталог не загрузился';$('search-summary').classList.remove('hidden');$('search-summary').textContent=err.message;}
