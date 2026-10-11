// Event-to-search integration with a small DOM double; this is not a visual browser test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const catalogue=JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url)));
const RealDate=Date;
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-11T12:00:00Z']));}static now(){return +new RealDate('2026-10-11T12:00:00Z');}};
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
  assert.ok(el('result-count').textContent.includes(String(catalogue.places.length)));
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
  assert.equal(el('result-count').textContent,`${count} из ${catalogue.places.length} мест`);
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
test('unverified free billiards is displayed as an alternative, not an exact result',()=>{
  query('Бесплатный бильярд');
  assert.equal(el('results').innerHTML,'');
  assert.ok(el('empty-state').classes.has('hidden'));
  assert.ok(!el('alternatives-section').classes.has('hidden'));
  assert.ok(el('alternative-results').innerHTML.includes('Бар разбитых сердец'));
  assert.ok(el('alternative-results').innerHTML.includes('пока нет сведений'));
});

test('the screenshot combination keeps real work cafes with explicit unknown-price warnings',()=>{
  query('Поработать с ноутбуком в кафе или библиотеке');
  el('category').value='cafe';el('budget').value='1000';el('mood').value='calm';el('budget').emit('change');
  assert.ok(el('empty-state').classes.has('hidden'));
  assert.ok(el('alternative-results').innerHTML.includes('Coffee 3'));
  assert.ok(el('alternative-results').innerHTML.includes('Бэнч'));
  assert.ok(el('alternative-results').innerHTML.includes('бюджет до 1000 ₽ не подтверждён'));
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
test('the API button installs a returned city and a network error preserves it',async()=>{
  globalThis.fetch=async()=>({ok:true,json:async()=>({count:1,next:null,results:[{id:123456789,title:'Тестовая Москва',
    address:'Тестовый адрес 1',coords:{lat:55.75,lon:37.6},categories:['cafes'],site_url:'https://kudago.com/msk/place/test/'}]})});
  el('api-city').value='msk';await el('api-load').emit('click');
  assert.ok(el('api-status').textContent.includes('Получено 1'));
  assert.ok(el('city').options.some(p=>p.value==='Москва'));
  assert.ok(storage.get('kuda.catalogue').includes('Тестовая Москва'));
  const stored=storage.get('kuda.catalogue');
  globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
  await el('api-load').emit('click');
  assert.ok(el('api-status').textContent.includes('Текущая база сохранена'));
  assert.equal(storage.get('kuda.catalogue'),stored);
});
