import {categories, moods, companies, featureLabels, safeUrl, hasFeature, parseQuery, searchPlaces, validateCatalogue} from './search.mjs';
import {loadKudaGo,mergeCatalogues} from './providers.mjs';
const $ = id => document.getElementById(id);
const escape = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const load = (key, fallback) => {try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
const save = (key, value) => {try{localStorage.setItem(key, JSON.stringify(value));return true;}catch{return false;}};
const state = {catalogue:null, baseline:null, favorites:new Set(load('kuda.favorites',[])), visited:new Set(load('kuda.visited',[])),
  location:null, lastSearch:null, visible:12, view:'discover',autoMood:'',autoCompany:''};
let toastTimer, apiController;
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3500);}

function card({place:p, distance=null, reasons=[],warnings=[],evidence=[]}) {
  const tags=[...new Set((p.features||[]).filter(f=>hasFeature(p,f.key,f.value) && f.value===true && featureLabels[f.key]).map(f=>f.key))];
  const refs=p.sources.map(s=>safeUrl(s.url)?`<a href="${escape(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${escape(s.label || 'Источник')} ↗</a>`:'').join('');
  const map='https://yandex.ru/maps/?text='+encodeURIComponent([p.title,p.address,p.city].filter(Boolean).join(', '));
  const priceAge=(Date.now()-new Date(p.price_checked_at))/86400000;
  const validPrice=Number.isFinite(p.price_max)&&safeUrl(p.price_source_url)&&Number.isFinite(priceAge)&&priceAge>=0&&priceAge<=30
    && (!p.price_valid_until||Date.now()<=new Date(p.price_valid_until));
  const unknown=!validPrice ? 'Стоимость не проверена' : `До ${p.price_max} ₽ · ${p.price_scope==='hour'?'за час':'за посещение'}`;
  const checks=warnings.length?`<div class="conditions-to-check"><strong>Перед визитом уточни</strong><ul>${warnings.map(w=>`<li>${escape(w)}</li>`).join('')}</ul></div>`:'';
  const proof=evidence.length?`<details class="text-evidence"><summary>На чём основан подбор</summary>${evidence.map(e=>`<p><span>${e.kind==='review'?'Отзыв посетителя':e.kind==='editorial'?'Обзор места':'Описание места'} · ${escape(String(e.observed_at).slice(0,10))}</span><br>«${escape(e.excerpt)}» <a href="${escape(safeUrl(e.source_url))}" target="_blank" rel="noopener noreferrer">Источник ↗</a></p>`).join('')}</details>`:'';
  return `<article class="place-card"><div class="card-cover cover-${escape(categories[p.category]?p.category:'other')}"><span class="category-label">${escape(categories[p.category]||'Место')}</span><span class="cover-shape" aria-hidden="true"></span><button class="favorite-button ${state.favorites.has(p.id)?'is-saved':''}" data-favorite="${escape(p.id)}" aria-label="${state.favorites.has(p.id)?'Убрать из избранного':'Сохранить'}: ${escape(p.title)}" aria-pressed="${state.favorites.has(p.id)}">${state.favorites.has(p.id)?'♥':'♡'}</button></div><div class="card-content"><h3>${escape(p.title)}</h3><p class="address">${escape(p.address || 'Точный адрес уточни в источнике')}${distance!==null?` · ${distance.toFixed(1)} км по прямой`:''}</p><div class="badges">${tags.map(key=>`<span class="badge">${escape(featureLabels[key])}</span>`).join('')}<span class="badge unknown">${escape(unknown)}</span></div><p class="card-note">${reasons.length?escape(reasons.join(' · '))+'. ':''}${escape(p.notes || 'Условия посещения требуют проверки.')}</p>${checks}${proof}<div class="card-sources">${refs}</div><div class="card-bottom"><a class="map-link" href="${escape(map)}" target="_blank" rel="noopener noreferrer">Открыть на карте ↗</a><button class="visited-button ${state.visited.has(p.id)?'is-visited':''}" data-visited="${escape(p.id)}">${state.visited.has(p.id)?'Посещено ✓':'Уже была / был'}</button></div></div></article>`;
}

function options() {
  return {query:$('query').value, category:$('category').value, budget:$('budget').value,
    mood:$('mood').value,company:$('company').value,city:$('city').value,hideLandmarks:$('hide-landmarks').checked,
    hideVisited:$('hide-visited').checked,visited:[...state.visited],location:state.location,radius:state.location?$('radius').value:null};
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
  $('intent-tags').innerHTML=[...new Set(labels)].map(label=>`<span>${escape(label)}</span>`).join('');
  const warnings=[];
  warnings.push(...result.filterConflicts);
  if(result.unhandled.length)warnings.push('Не удалось учесть: «'+result.unhandled.join(' ')+'». Подбор ниже — по понятой части запроса.');
  if(result.mood)warnings.push('Атмосферу оцениваем по описаниям и загруженным отзывам. В карточке есть основания; впечатление и шум могут зависеть от времени.');
  if(result.parsed.daypart||result.parsed.visitDay)warnings.push('Время учитывается в условиях места; открытие и расписание проверь в источнике.');
  if(result.company==='new_people')warnings.push('Показаны места с открытыми встречами. На конкретное событие может понадобиться запись.');
  $('intent-warning').textContent=warnings.join(' ');$('intent-warning').classList.toggle('hidden',!warnings.length);
  $('interpretation').classList.toggle('hidden',!labels.length&&!warnings.length);
}

function renderSearch(reset=false) {
  if (!state.catalogue) return;
  if(reset)state.visible=12;
  const result=searchPlaces(state.catalogue.places,options());state.lastSearch=result;
  renderInterpretation(result);
  $('results').innerHTML=result.results.slice(0,state.visible).map(card).join('');
  $('results-title').textContent=result.unhandled.length?'По понятой части запроса':($('query').value.trim()||$('mood').value||$('company').value?'Под твой запрос':'Открой новое место');
  $('current-city').textContent=$('city').value||'Каталог';
  $('result-count').textContent=result.alternatives.length?`${result.results.length+result.alternatives.length} вариантов · ${result.alternatives.length} с уточнениями`:`${result.results.length} из ${state.catalogue.places.length} мест`;
  $('empty-state').classList.toggle('hidden',result.results.length+result.alternatives.length!==0);
  $('load-more').classList.toggle('hidden',Math.max(result.results.length,result.alternatives.length)<=state.visible);
  const summary=[];
  if(result.needs.length||result.mood)summary.push('Подбираем по содержанию описаний и отзывов, а также проверенным условиям места.');
  if(result.budget!==null)summary.push(`Бюджет: до ${result.budget} ₽ ${result.priceScope==='hour'?'за час':'за посещение'}. Неизвестные цены отмечены в вариантах с уточнениями.`);
  if(state.location)summary.push('Расстояние считается по прямой. Время дороги уточни в картах.');
  if(!result.needs.length && result.budget===null && !state.location && !result.mood)summary.push('Каталог со ссылками на источники. Отмечай посещённые, чтобы открывать новые места.');
  if($('hide-landmarks').checked)summary.push('Туристическая классика скрыта по редакционному списку. Её можно включить или найти по названию.');
  if(result.company && !['children','new_people'].includes(result.company))summary.push('Сценарий встречи учитывается по формату места; впечатление от посещения индивидуально.');
  $('search-summary').textContent=summary.join(' ');$('search-summary').classList.toggle('hidden',summary.length===0);
  const details=[];
  for(const [key,n] of Object.entries(result.gaps))if(n)details.push(`«${featureLabels[key]}»: у части мест нет подтверждения`);
  if(result.unknownPrice)details.push('есть места без свежей цены за нужную единицу');
  if(result.unknownCoordinates)details.push('часть мест не имеет координат');
  if(result.unknownAtmosphere)details.push('для выбранного настроения у части мест нет подходящих признаков');
  $('empty-message').textContent=result.filterConflicts.length?result.filterConflicts.join(' '):details.length?'В этой базе недостаточно сведений для точного ответа: '+details.join('; ')+'. Можно изменить запрос или расширить каталог.':'Попробуй другую категорию, более общий запрос или проверь список посещённых мест.';
  const showAlternatives=result.alternatives.length>0;
  $('alternatives-section').classList.toggle('hidden',!showAlternatives);
  $('alternative-results').innerHTML=showAlternatives?result.alternatives.slice(0,state.visible).map(card).join(''):'';
}

function renderSaved(){const items=state.catalogue.places.filter(p=>state.favorites.has(p.id));$('saved-results').innerHTML=items.map(p=>card({place:p})).join('');$('saved-empty').classList.toggle('hidden',items.length>0);$('fav-count').textContent=items.length;}
function renderStats(){const p=state.catalogue.places;const values=[[p.length,'карточек в каталоге'],[p.filter(x=>x.notes||(x.documents||[]).some(d=>d.kind==='description')).length,'мест с описаниями'],[p.reduce((n,x)=>n+(x.documents||[]).filter(d=>d.kind==='review').length,0),'загруженных отзывов'],[p.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon)).length,'мест с координатами']];$('stats').innerHTML=values.map(([n,label])=>`<div class="stat"><strong>${n}</strong><span>${escape(label)}</span></div>`).join('');}
function renderAll(){renderSearch();renderSaved();renderStats();}
function syncCities(){
  const selected=$('city').value;
  const cities=[...new Set(state.catalogue.places.map(p=>p.city).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  $('city').innerHTML='';
  for(const city of cities){const o=document.createElement('option');o.value=city;o.textContent=city;$('city').append(o);}
  $('city').value=cities.includes(selected)?selected:(cities.includes('Санкт-Петербург')?'Санкт-Петербург':cities[0]||'');
}
function installCatalogue(payload){
  state.catalogue=mergeCatalogues(state.catalogue||state.baseline,payload);
  const persisted=save('kuda.catalogue',state.catalogue);syncCities();renderAll();return persisted;
}
function setView(view){state.view=view;for(const name of ['discover','saved','catalogue'])$(name+'-view').classList.toggle('hidden',name!==view);document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}

function reset(){for(const id of ['query','category','budget','mood','company'])$(id).value='';state.autoMood='';state.autoCompany='';state.location=null;$('radius-label').classList.add('hidden');$('location-button').textContent='◎ Рядом со мной';$('location-status').textContent='';renderSearch(true);}

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
  const query=e.target.closest('[data-query]');if(query){for(const id of ['category','budget','mood','company'])$(id).value='';$('query').value=query.dataset.query;syncTextContext();renderSearch(true);}
  const view=e.target.closest('[data-view]');if(view)setView(view.dataset.view);
});
$('search-form').addEventListener('submit',e=>{e.preventDefault();syncTextContext();renderSearch(true);});
for(const id of ['category','budget','company','mood','hide-visited','hide-landmarks','city','radius'])$(id).addEventListener('change',()=>renderSearch(true));
$('location-button').addEventListener('click',requestLocation);$('reset-search').addEventListener('click',reset);
$('clear-filters').addEventListener('click',reset);
$('retry-query').addEventListener('click',()=>{
  for(const id of ['category','budget','mood','company'])$(id).value='';
  state.autoMood='';state.autoCompany='';state.location=null;
  $('radius-label').classList.add('hidden');$('location-button').textContent='◎ Рядом со мной';$('location-status').textContent='';
  syncTextContext();renderSearch(true);
});
$('load-more').addEventListener('click',()=>{state.visible+=12;renderSearch();});
$('catalogue-file').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  try{if(f.size>25*1024*1024)throw new Error('Файл слишком большой: предел 25 МБ.');const payload=validateCatalogue(JSON.parse(await f.text()));const persisted=installCatalogue(payload);$('import-status').textContent=`Обработано ${payload.places.length} карточек. В общей базе: ${state.catalogue.places.length}.`+(persisted?' Каталог сохранён в этом браузере.':' Каталог работает до закрытия страницы: недостаточно места для сохранения.');}
  catch(err){$('import-status').textContent='Импорт не выполнен: '+err.message;}finally{e.target.value='';}
});
$('restore-catalogue').addEventListener('click',()=>{state.catalogue=state.baseline;try{localStorage.removeItem('kuda.catalogue');}catch{}syncCities();renderAll();$('import-status').textContent='Стартовая база восстановлена.';});
$('download-catalogue').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(state.catalogue,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='mestno-catalogue.json';a.click();URL.revokeObjectURL(url);
});
$('api-cancel').addEventListener('click',()=>apiController?.abort());
$('api-load').addEventListener('click',async()=>{
  if(apiController)return;
  apiController=new AbortController();$('api-load').disabled=true;$('api-city').disabled=true;$('api-cancel').classList.remove('hidden');
  $('api-status').textContent='Соединяемся с KudaGo. Текущая база сохранена.';
  try{
    const result=await loadKudaGo({city:$('api-city').value||'spb',signal:apiController.signal,
      onProgress:p=>{$('api-status').textContent=`Страница ${p.page}: получено ${p.fetched} записей из ${p.total}, пригодных карточек ${p.accepted}.`;}});
    const persisted=installCatalogue(result.catalogue);
    const closed=new Set(result.closedIds);for(const p of state.catalogue.places)if(closed.has(p.id)||closed.has('kudago:'+p.provider_ids?.kudago))p.status='closed';
    save('kuda.catalogue',state.catalogue);renderAll();
    $('api-status').textContent=`Получено ${result.catalogue.places.length} карточек. В базе ${state.catalogue.places.length}.`
      +(result.truncated?' Достигнут лимит 10 страниц; это часть каталога источника.':'')
      +(persisted?' Сохранено в этом браузере.':' Для сохранения скачай текущий каталог.')
      +' Описания учитываются в поиске. Тексты отзывов загружаются через GitHub или файл каталога.';
  }catch(err){
    $('api-status').textContent=apiController.signal.aborted?'Загрузка отменена. База сохранена.':
      'Загрузка не выполнена: '+err.message+' Текущая база сохранена. При недоступности API в браузере можно загрузить файл, полученный по инструкции в исходном коде.';
  }finally{apiController=null;$('api-load').disabled=false;$('api-city').disabled=false;$('api-cancel').classList.add('hidden');}
});

try {
  const response=await fetch('places.json');if(!response.ok)throw new Error('Не удалось загрузить каталог');
  state.baseline=validateCatalogue(await response.json());
  const cached=load('kuda.catalogue',null);try{state.catalogue=cached?mergeCatalogues(state.baseline,validateCatalogue(cached)):state.baseline;}catch{state.catalogue=state.baseline;}
  syncCities();
  for(const [value,label] of Object.entries(categories)){const option=document.createElement('option');option.value=value;option.textContent=label;$('category').append(option);}
  for(const [id,values] of [['mood',moods],['company',companies]])for(const [value,label] of Object.entries(values)){const option=document.createElement('option');option.value=value;option.textContent=label;$(id).append(option);}
  renderAll();
  const tg=window.Telegram?.WebApp;if(tg?.initData){tg.ready();tg.expand();}
}catch(err){$('results-title').textContent='Каталог не загрузился';$('search-summary').classList.remove('hidden');$('search-summary').textContent=err.message;}
