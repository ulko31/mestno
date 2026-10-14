import {categories,featureLabels,safeUrl,validateCatalogue} from './search.mjs?v=20261014b';
import {loadKudaGo,loadKudaGoReviews,mergeCatalogues} from './providers.mjs?v=20261014b';
import {loadKudaGoEvents} from './events-provider.mjs?v=20261014b';
import {priceFor,priceLabel} from './pricing.mjs?v=20261014b';
import {offerWhen,activityKeys} from './experiences.mjs?v=20261014b';
import {photoUrl} from './photo-assets.mjs?v=20261014b';
import {recommendationDraft} from './source-intake.mjs?v=20261014b';
import {preparePlace,prepareOffer,preparePhoto,applyAdminDrafts,ADMIN_DRAFT_KEY} from './admin-model.mjs?v=20261014b';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
const state={baseline:null,imported:null,catalogue:null,drafts:load(ADMIN_DRAFT_KEY,{schema_version:1,places:[]}),editing:null,offerId:null};
let apiController,reviewController,eventController;
const value=id=>$(id).value;
function status(text){$('editor-status').textContent=text;}
function syncCities(){}
function persistCatalogue(){const baseline=new Map(state.baseline.places.map(p=>[p.id,JSON.stringify(p)]));return save('kuda.catalogue',{schema_version:1,places:state.imported.places.filter(p=>baseline.get(p.id)!==JSON.stringify(p))});}
function installCatalogue(payload){state.imported=mergeCatalogues(state.imported||state.baseline,payload);state.catalogue=applyAdminDrafts(state.imported,state.drafts);const persisted=persistCatalogue();renderAll();return persisted;}
function renderAll(){
  const all=state.catalogue.places,q=value('place-search').toLowerCase(),shown=all.filter(p=>!q||(p.title+' '+p.address+' '+p.city).toLowerCase().includes(q));
  $('place-list').innerHTML=shown.slice(0,30).map(p=>`<button type="button" data-edit="${escape(p.id)}" class="${state.editing?.id===p.id?'is-selected':''}">${escape(p.title)}<small>${escape(p.address||p.city)}${p.status==='closed'?' · скрыто':''}</small></button>`).join('');
  $('place-list-count').textContent=shown.length+' мест · показаны первые 30';
  const counts=[[all.length,'адресов'],[all.reduce((n,p)=>n+(p.offers||[]).length,0),'программ'],[all.filter(p=>priceFor(p)||(p.offers||[]).some(e=>priceFor(p,{offer:e}))).length,'мест с бюджетом'],[all.filter(p=>p.photos?.length).length,'мест с фото']];
  $('admin-stats').innerHTML=counts.map(([n,label])=>`<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join('');
  $('draft-count').textContent=state.drafts.places.length+' изменённых карточек в черновике';
}
function set(id,v){$(id).value=v??'';}
function renderEditing(){
  const p=state.editing;$('editor-fields').classList.toggle('hidden',!p);$('editor-empty').classList.toggle('hidden',!!p);if(!p)return;
  for(const [id,k] of [['place-title','title'],['place-address','address'],['place-city','city'],['place-category','category'],['place-notes','notes'],['place-status','status'],['place-lat','lat'],['place-lon','lon']])set(id,p[k]);
  set('place-source',p.sources?.[0]?.url);const price=(p.prices||[])[0];set('place-budget',price?.amount);set('price-kind',price?.kind||'average_check');set('price-source',price?.source_url);set('price-note',price?.note);
  $('place-edit-title').textContent=p.title||'Новое место';
  $('programmes-list').innerHTML=(p.offers||[]).map(e=>`<article><strong>${escape(e.title)}</strong><p>${escape(offerWhen(e))} · ${escape(priceLabel(priceFor(p,{offer:e})))} · ${escape({open_group:'Общая группа',private:'Своя компания',individual:'Индивидуально',unknown:'Формат уточняется'}[e.format])}</p><button class="text-button" type="button" data-edit-offer="${escape(e.id)}">Изменить</button><button class="text-button" type="button" data-remove-offer="${escape(e.id)}">Удалить из черновика</button></article>`).join('')||'<p class="small-note">Программ ещё нет.</p>';
  $('photos-list').innerHTML=(p.photos||[]).map(f=>`<article><img class="admin-thumb" src="${escape(photoUrl(f.url))}" alt="${escape(f.caption||p.title)}"><p>${escape(f.caption)} · ${escape(f.author)} · ${escape(f.license)}</p><button class="text-button" type="button" data-remove-photo="${escape(f.id||f.source_url)}">Удалить из черновика</button></article>`).join('')||'<p class="small-note">Фотографий ещё нет.</p>';
  $('preview-place').href='index.html?place='+encodeURIComponent(p.id);
}
function persistDraft(p){
  validateCatalogue({schema_version:1,places:[p]});
  const draft={schema_version:1,places:[...state.drafts.places.filter(x=>x.id!==p.id),p]};
  if(!save(ADMIN_DRAFT_KEY,draft))throw new Error('Не хватает памяти браузера. Скачай черновик перед продолжением.');
  state.drafts=draft;state.editing=p;state.catalogue=applyAdminDrafts(state.catalogue,draft);renderAll();renderEditing();status('Черновик сохранён. Подбор в этом браузере обновлён; для общей публикации скачай каталог.');
}
function resetOffer(){state.offerId=null;$('offer-form').reset();}
function editorInput(){return {title:value('place-title'),address:value('place-address'),city:value('place-city'),category:value('place-category'),notes:value('place-notes'),status:value('place-status'),lat:value('place-lat'),lon:value('place-lon'),source_url:value('place-source'),budget:value('place-budget'),price_kind:value('price-kind'),price_source:value('price-source'),price_note:value('price-note')};}
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
$('place-search').addEventListener('input',renderAll);
$('new-place').addEventListener('click',()=>{state.editing={id:'editor:'+crypto.randomUUID(),title:'',city:'Санкт-Петербург',category:'activity',sources:[],features:[],documents:[],offers:[],photos:[],prices:[],lat:null,lon:null,status:'catalogue'};resetOffer();renderEditing();status('Заполни основные сведения и источник.');});
$('place-form').addEventListener('submit',e=>{e.preventDefault();try{if(!$('place-confirmed').checked)throw new Error('Подтверди проверку источника.');persistDraft(preparePlace(state.editing,editorInput()));}catch(err){status(err.message);}});
$('offer-form').addEventListener('submit',e=>{e.preventDefault();try{
  const p=preparePlace(state.editing,editorInput());
  const existing=(state.editing.offers||[]).find(x=>x.id===state.offerId);
  const offer={...existing,...prepareOffer({title:value('offer-title'),description:value('offer-description'),activities:[...$('offer-activities').selectedOptions].map(o=>o.value),format:value('offer-format'),audience:value('offer-audience'),price_note:value('offer-price-note'),source_url:value('offer-source'),booking_url:value('offer-booking'),budget:value('offer-budget'),starts_at:value('offer-start'),ends_at:value('offer-end'),schedule_note:value('offer-schedule'),requirements:value('offer-requirements')},{id:state.offerId||undefined})};
  p.offers=[...(p.offers||[]).filter(x=>x.id!==offer.id),offer];persistDraft(p);resetOffer();
}catch(err){status(err.message);}});
$('photo-form').addEventListener('submit',e=>{e.preventDefault();try{
  const p=preparePlace(state.editing,editorInput());const photo=preparePhoto({url:value('photo-url'),source_url:value('photo-source'),author:value('photo-author'),license:value('photo-license'),license_url:value('photo-license-url'),caption:value('photo-caption'),rights_confirmed:$('photo-rights').checked});
  p.photos=[...(p.photos||[]),photo];persistDraft(p);$('photo-form').reset();
}catch(err){status(err.message);}});
document.addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit]');if(edit){state.editing=structuredClone(state.catalogue.places.find(p=>p.id===edit.dataset.edit));resetOffer();renderEditing();renderAll();status('');}
  const remove=e.target.closest('[data-remove-offer]');if(remove)try{const p=preparePlace(state.editing,editorInput());p.offers=(p.offers||[]).filter(x=>x.id!==remove.dataset.removeOffer);persistDraft(p);}catch(err){status(err.message);}
  const photo=e.target.closest('[data-remove-photo]');if(photo)try{const p=preparePlace(state.editing,editorInput());p.photos=(p.photos||[]).filter(x=>(x.id||x.source_url)!==photo.dataset.removePhoto);persistDraft(p);}catch(err){status(err.message);}
  const programme=e.target.closest('[data-edit-offer]');if(programme){const o=state.editing.offers.find(x=>x.id===programme.dataset.editOffer);state.offerId=o.id;
    for(const [id,k] of [['offer-title','title'],['offer-description','description'],['offer-format','format'],['offer-audience','audience'],['offer-price-note','price_note'],['offer-source','source_url'],['offer-booking','booking_url'],['offer-schedule','schedule_note'],['offer-requirements','requirements']])set(id,o[k]);
    const time=s=>s?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(s)).replace(' ','T'):'';
    set('offer-audience',o.audience||'general');set('offer-start',time(o.starts_at));set('offer-end',time(o.ends_at));set('offer-budget',o.price?.amount);
    for(const opt of $('offer-activities').options)opt.selected=o.activities.includes(opt.value);$('offer-title').focus();
  }
});
$('export-drafts').addEventListener('click',()=>download(state.drafts,'mestno-admin-drafts.json'));
$('export-published').addEventListener('click',()=>download(state.catalogue,'mestno-places-for-publication.json'));
$('clear-drafts').addEventListener('click',()=>{if(!state.drafts.places.length)return;if(!window.confirm('Убрать локальные изменения? Сначала скачай черновик, если он нужен.'))return;localStorage.removeItem(ADMIN_DRAFT_KEY);state.drafts={schema_version:1,places:[]};state.catalogue=structuredClone(state.imported);state.editing=null;renderAll();renderEditing();status('Локальные черновики убраны.');});

// Data-source import handlers are appended below; their errors preserve the catalogue.

$('catalogue-file').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  try{if(f.size>25*1024*1024)throw new Error('Файл слишком большой: предел 25 МБ.');const payload=validateCatalogue(JSON.parse(await f.text()));const persisted=installCatalogue(payload);$('import-status').textContent=`Обработано ${payload.places.length} карточек. В общей базе: ${state.catalogue.places.length}.`+(persisted?' Каталог сохранён в этом браузере.':' Каталог работает до закрытия страницы: недостаточно места для сохранения.');}
  catch(err){$('import-status').textContent='Импорт не выполнен: '+err.message;}finally{e.target.value='';}
});
$('restore-catalogue').addEventListener('click',()=>{state.imported=structuredClone(state.baseline);state.catalogue=applyAdminDrafts(state.imported,state.drafts);try{localStorage.removeItem('kuda.catalogue');}catch{}syncCities();renderAll();$('import-status').textContent='Стартовая база восстановлена.';});
$('recommendation-form').addEventListener('submit',e=>{
  e.preventDefault();try{
    const row=recommendationDraft({url:$('recommendation-url').value,title:$('recommendation-title').value,
      address:$('recommendation-address').value,city:$('city').value,note:$('recommendation-note').value,noteIsOriginal:$('recommendation-original').checked});
    const rows=load('mestno.recommendations',[]);const existing=rows.findIndex(x=>x.source_url===row.source_url&&x.title===row.title&&x.address===row.address);
    if(existing>=0)rows[existing]=row;else rows.push(row);
    if(!save('mestno.recommendations',rows))throw new Error('Не хватает места в браузере. Сначала скачай сохранённые предложения.');
    $('recommendation-status').textContent=`Сохранено для проверки. В твоём списке ${rows.length} предложений; в общую выдачу они пока не добавлены.`;
  }catch(err){$('recommendation-status').textContent=err.message;}
});
$('recommendations-export').addEventListener('click',()=>{
  const rows=load('mestno.recommendations',[]);if(!rows.length){$('recommendation-status').textContent='Добавь первое предложение.';return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify({schema_version:1,recommendations:rows},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='mestno-recommendations.json';a.click();URL.revokeObjectURL(url);
});
$('download-catalogue').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(state.catalogue,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='mestno-catalogue.json';a.click();URL.revokeObjectURL(url);
});
$('api-cancel').addEventListener('click',()=>apiController?.abort());
$('reviews-cancel').addEventListener('click',()=>reviewController?.abort());
$('events-cancel').addEventListener('click',()=>eventController?.abort());
$('events-load').addEventListener('click',async()=>{
  if(eventController)return;eventController=new AbortController();$('events-load').disabled=true;$('events-cancel').classList.remove('hidden');
  try{const payload=await loadKudaGoEvents({city:$('api-city').value,signal:eventController.signal,
    onProgress:r=>{$('events-status').textContent=`Получено ${r.events} событий…`;}});
    const persisted=installCatalogue(payload);const n=payload.places.reduce((sum,p)=>sum+(p.offers||[]).length,0);
    $('events-status').textContent=`Загружено ${n} событий с датами и ссылками.`+(persisted?' Сохранено.':' Для сохранения скачай каталог.');
  }catch(err){$('events-status').textContent=eventController.signal.aborted?'Загрузка отменена. База сохранена.':'Не удалось загрузить события: '+err.message+' База сохранена.';}
  finally{eventController=null;$('events-load').disabled=false;$('events-cancel').classList.add('hidden');}
});
$('reviews-load').addEventListener('click',async()=>{
  if(reviewController)return;reviewController=new AbortController();$('reviews-load').disabled=true;$('reviews-cancel').classList.remove('hidden');
  try{
    const r=await loadKudaGoReviews({catalogue:state.catalogue,signal:reviewController.signal,
      onProgress:x=>{$('reviews-status').textContent=`Проверено ${x.checked} из ${x.total} мест, получено ${x.reviewCount} отзывов…`;}});
    const persisted=installCatalogue(r.catalogue);
    $('reviews-status').textContent=`Проверено ${r.checkedPlaces} мест. Загружено ${r.reviewCount} текстов отзывов с датами и источниками.`
      +(persisted?' Сохранено в этом браузере.':' Для сохранения скачай текущий каталог.');
  }catch(err){$('reviews-status').textContent=reviewController.signal.aborted?'Загрузка отменена. Каталог сохранён.':err.message+' Каталог сохранён.';}
  finally{reviewController=null;$('reviews-load').disabled=false;$('reviews-cancel').classList.add('hidden');}
});
$('api-load').addEventListener('click',async()=>{
  if(apiController)return;
  apiController=new AbortController();$('api-load').disabled=true;$('api-city').disabled=true;$('api-cancel').classList.remove('hidden');
  $('api-status').textContent='Соединяемся с KudaGo. Текущая база сохранена.';
  try{
    const result=await loadKudaGo({city:$('api-city').value||'spb',signal:apiController.signal,
      onProgress:p=>{$('api-status').textContent=`Страница ${p.page}: получено ${p.fetched} записей из ${p.total}, пригодных карточек ${p.accepted}.`;}});
    installCatalogue(result.catalogue);
    const closed=new Set(result.closedIds);for(const p of state.imported.places)if(closed.has(p.id)||closed.has('kudago:'+p.provider_ids?.kudago))p.status='closed';
    const persisted=persistCatalogue();state.catalogue=applyAdminDrafts(state.imported,state.drafts);renderAll();
    $('api-status').textContent=`Получено ${result.catalogue.places.length} карточек. В базе ${state.catalogue.places.length}.`
      +(result.truncated?' Достигнут лимит 10 страниц; это часть каталога источника.':'')
      +(persisted?' Сохранено в этом браузере.':' Для сохранения скачай текущий каталог.')
      +' Описания учитываются в поиске. Тексты отзывов загружаются через GitHub или файл каталога.';
  }catch(err){
    $('api-status').textContent=apiController.signal.aborted?'Загрузка отменена. База сохранена.':
      'Загрузка не выполнена: '+err.message+' Текущая база сохранена. При недоступности API в браузере можно загрузить файл, полученный по инструкции в исходном коде.';
  }finally{apiController=null;$('api-load').disabled=false;$('api-city').disabled=false;$('api-cancel').classList.add('hidden');}
});

try{
  const response=await fetch('places.json?v=20261014b');if(!response.ok)throw new Error('Не удалось загрузить каталог.');state.baseline=validateCatalogue(await response.json());
  const cached=load('kuda.catalogue',null);try{state.imported=cached?mergeCatalogues(state.baseline,validateCatalogue(cached)):structuredClone(state.baseline);}catch{state.imported=structuredClone(state.baseline);}
  try{state.catalogue=applyAdminDrafts(state.imported,state.drafts);}catch{state.drafts={schema_version:1,places:[]};state.catalogue=state.imported;status('Повреждённые черновики не применены.');}
  for(const [key,label] of Object.entries(categories)){const o=document.createElement('option');o.value=key;o.textContent=label;$('place-category').append(o);}
  for(const key of [...activityKeys,'child_friendly']){const o=document.createElement('option');o.value=key;o.textContent=featureLabels[key]||key;$('offer-activities').append(o);}
  renderAll();renderEditing();
}catch(err){status(err.message);}
