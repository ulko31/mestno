// Event-to-search integration with a small DOM double; this is not a visual browser test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const catalogue=JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url)));
const RealDate=Date;
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-13T20:00:00Z']));}static now(){return +new RealDate('2026-10-13T20:00:00Z');}};
class Element {
  constructor(){this.value='';this.checked=false;this.textContent='';this.innerHTML='';this.options=[];this.events={};this.classes=new Set();this.dataset={};
    this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),toggle:(name,force)=>{const on=force===undefined?!this.classes.has(name):force;on?this.classes.add(name):this.classes.delete(name);}};
  }
  addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
  append(option){this.options.push(option);}
  emit(name){return Promise.all((this.events[name]||[]).map(fn=>fn({preventDefault(){},target:this})));}
}
const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
elements.get('hide-visited').checked=true;elements.get('hide-landmarks').checked=true;elements.get('radius').value='5';
const documentEvents={};
globalThis.document={getElementById:id=>{assert.ok(elements.has(id),'Missing UI element '+id);return elements.get(id);},
  createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener:(name,fn)=>{documentEvents[name]=fn;}};
globalThis.window={};
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
globalThis.fetch=async()=>({ok:true,json:async()=>catalogue});
await import('../dist/app.mjs');
const el=id=>elements.get(id);
const query=text=>{el('query').value=text;el('category').value='';el('budget').value='';el('search-form').emit('submit');};

test('real page boots with the complete mood and companion choices',()=>{
  assert.equal(el('mood').options.length,7);
  assert.ok(el('company').options.some(o=>o.value==='first_date'));
  assert.ok(el('company').options.some(o=>o.value==='new_people'));
  assert.match(el('result-count').textContent,/^\d+ (?:из|вариантов)/);
  assert.ok(!el('results').innerHTML.includes('Государственный Эрмитаж'));
});
test('mood change event reaches the search and is not overridden by old text',()=>{
  query('Спокойно поговорить');
  assert.equal(el('mood').value,'calm');
  const calm=el('results').innerHTML;
  el('mood').value='party';el('mood').emit('change');
  assert.notEqual(el('results').innerHTML,calm);
  assert.ok(el('results').innerHTML.includes('Blank'));
  assert.ok(el('intent-tags').innerHTML.includes('Потусить'));
  el('mood').value='';el('mood').emit('change');
  const count=catalogue.places.filter(p=>p.city==='Санкт-Петербург'&&p.status!=='closed'&&!p.is_landmark).length;
  assert.ok(el('result-count').textContent.startsWith(String(count)+' '));
});
test('free text finds work cafes from the actual catalogue',()=>{
  query('Поработать с ноутбуком в кафе, не в коворкинге');
  assert.ok(el('results').innerHTML.includes('Coffee 3'));
  assert.ok(el('results').innerHTML.includes('Бэнч'));
  assert.ok(!el('results').innerHTML.includes('cover-coworking'));
  assert.ok(el('intent-tags').innerHTML.includes('Можно работать с ноутбуком'));
});
test('example selection clears stale scenario filters and keeps cafe OR gallery candidates',()=>{
  el('category').value='coworking';el('mood').value='party';el('company').value='children';el('budget').value='1';
  const target={dataset:{query:'Помечтать на выставке или в атмосферном кафе'}};
  documentEvents.click({target:{closest:selector=>selector==='[data-query]'?target:null}});
  assert.equal(el('budget').value,'');assert.equal(el('category').value,'');
  assert.equal(el('mood').value,'dreamy');
  assert.ok(el('results').innerHTML.includes('Coffee 3'));
  assert.ok(el('results').innerHTML.includes('Anna Nova Gallery'));
  assert.ok(!el('results').innerHTML.includes('Брынза'));
  assert.ok(!el('results').innerHTML.includes('Государственный Эрмитаж'));
});
test('free billiards separates confirmed games and public reports, excluding paid games',()=>{
  query('Бесплатный бильярд');
  assert.ok(el('results').innerHTML.includes('Schmaus'));
  assert.ok(el('alternative-results').innerHTML.includes('По публикации'));
  const cards=el('results').innerHTML+el('alternative-results').innerHTML;
  assert.ok(!cards.includes('Leon Club'));assert.ok(!cards.includes('Альмак'));assert.ok(!cards.includes('MazaPark'));
});

test('budget shows unknowns by default and supports a known-price-only filter',()=>{
  query('Поработать с ноутбуком в кафе или библиотеке');
  el('category').value='cafe';el('budget').value='1000';el('mood').value='calm';el('budget').emit('change');
  assert.ok(el('empty-state').classes.has('hidden'));
  assert.ok(!el('alternative-results').innerHTML.includes('Coffee 3'));
  assert.ok(el('alternative-results').innerHTML.includes('Бэнч'));
  assert.ok(el('alternative-results').innerHTML.includes('Заказ от'));
  assert.ok(el('alternative-results').innerHTML.includes('Брынза'));
  el('known-price-only').checked=false;el('known-price-only').emit('change');
  assert.ok(el('alternative-results').innerHTML.includes('Брынза'));
  assert.ok(el('alternative-results').innerHTML.includes('бюджет до 1000 ₽ не подтверждён'));
  el('known-price-only').checked=true;el('known-price-only').emit('change');
  assert.ok(!el('alternative-results').innerHTML.includes('Брынза'));
  el('known-price-only').checked=false;el('known-price-only').emit('change');
  assert.ok(!el('results').innerHTML.includes('До 1000 ₽'));
  el('mood').value='';
});
test('an unhandled condition appears in the user-facing interpretation',()=>{
  query('Кафе с живыми совами');
  assert.ok(el('intent-warning').textContent.includes('совами'));
  assert.equal(el('results-title').textContent,'По понятой части запроса');
});
test('conflicting category filters are explained and can be cleared while preserving the request',()=>{
  query('Кафе для работы с ноутбуком');el('category').value='coworking';el('category').emit('change');
  assert.ok(el('intent-warning').textContent.includes('В фильтре: Коворкинги'));
  el('retry-query').emit('click');
  assert.equal(el('query').value,'Кафе для работы с ноутбуком');assert.equal(el('category').value,'');
  assert.ok(el('results').innerHTML.includes('Coffee 3'));
});
test('the long summary is hidden, while open groups have booking information',()=>{
  el('city').value='Санкт-Петербург';query('Групповой мастер-класс, познакомиться с новыми людьми');
  assert.equal(el('search-summary').textContent,'');assert.ok(el('search-summary').classes.has('hidden'));
  const cards=el('results').innerHTML+el('alternative-results').innerHTML;
  assert.ok(cards.includes('Керамишная'));assert.ok(cards.includes('Расписание и запись'));
  assert.ok(cards.includes('Можно прийти одной / одному'));assert.ok(!cards.includes('Гончарная студия №1'));
});
test('the nearby button requests one point, hides places without coordinates and can be disabled',async()=>{
  Object.defineProperty(globalThis,'navigator',{value:{geolocation:{getCurrentPosition(success){success({coords:{latitude:59.94,longitude:30.32}});}}},configurable:true});
  query('Групповой мастер-класс, познакомиться с новыми людьми');
  await el('location-button').emit('click');
  assert.ok(el('intent-tags').innerHTML.includes('Рядом · 5 км'));
  assert.ok(!(el('results').innerHTML+el('alternative-results').innerHTML).includes('Керамишная'));
  assert.ok(el('location-status').textContent.includes('без координат'));
  await el('location-button').emit('click');
  assert.ok((el('results').innerHTML+el('alternative-results').innerHTML).includes('Керамишная'));
});
test('opening a recommendation displays its card and other programmes',()=>{
  const p=catalogue.places.find(p=>p.title==='Керамишная');assert.ok(p);
  const target={dataset:{openPlace:p.id,openOffer:p.offers[0].id}};
  documentEvents.click({target:{closest:selector=>selector==='[data-open-place]'?target:null}});
  assert.ok(!el('place-panel').classes.has('hidden'));
  assert.ok(el('place-content').innerHTML.includes('Другие форматы здесь'));
  assert.ok(el('place-content').innerHTML.includes('Только для своей компании'));
  el('close-place').emit('click');assert.ok(el('place-panel').classes.has('hidden'));
});
test('source and editing tools are on a separate page',()=>{
  assert.ok(!html.includes('id="recommendation-form"'));assert.ok(!html.includes('id="api-load"'));
  assert.ok(html.includes('href="admin.html"'));assert.ok(html.includes('О каталоге'));
});
