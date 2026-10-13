// Execute actual editor handlers against a minimal DOM. No visual/browser claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyAdminDrafts,ADMIN_DRAFT_KEY} from '../dist/admin-model.mjs';
import {searchPlaces} from '../dist/search.mjs';
const html=fs.readFileSync(new URL('../dist/admin.html',import.meta.url),'utf8');
const catalogue=JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url)));
const RealDate=Date;
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-13T12:00:00Z']));}static now(){return +new RealDate('2026-10-13T12:00:00Z');}};
class Element{
  constructor(){this.value='';this.checked=false;this.textContent='';this.innerHTML='';this.options=[];this.events={};this.classes=new Set();this.dataset={};
    this.classList={add:n=>this.classes.add(n),remove:n=>this.classes.delete(n),toggle:(n,force)=>{const on=force===undefined?!this.classes.has(n):force;on?this.classes.add(n):this.classes.delete(n);}};}
  get selectedOptions(){return this.options.filter(o=>o.selected);}
  append(o){this.options.push(o);}addEventListener(n,fn){(this.events[n]??=[]).push(fn);}
  emit(n){return Promise.all((this.events[n]||[]).map(fn=>fn({preventDefault(){},target:this})));}
  reset(){}focus(){}click(){}
}
const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
const el=id=>{assert.ok(elements.has(id),'Missing editor field '+id);return elements.get(id);};
const documentEvents={};globalThis.document={getElementById:el,createElement:()=>new Element(),addEventListener:(n,fn)=>documentEvents[n]=fn};
globalThis.window={confirm:()=>true};const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.fetch=async()=>({ok:true,json:async()=>catalogue});
await import('../dist/admin.mjs');
function click(selector,dataset){documentEvents.click({target:{closest:s=>s===selector?{dataset}:null}});}
test('editor loads real records and all programme choices',()=>{
  assert.ok(el('place-list').innerHTML.includes('data-edit='));assert.ok(el('admin-stats').innerHTML.includes(String(catalogue.places.length)));
  assert.ok(el('offer-activities').options.some(o=>o.value==='sign_club'));assert.ok(el('offer-activities').options.some(o=>o.value==='candles'));
});
test('saving a budget through the page changes local search and does not publish it',async()=>{
  const p=catalogue.places.find(p=>p.title==='Брынза');assert.ok(p);
  click('[data-edit]',{edit:p.id});el('place-confirmed').checked=true;el('place-budget').value='500';el('price-kind').value='average_check';el('price-source').value='https://example.org/current-menu';
  await el('place-form').emit('submit');const drafts=JSON.parse(storage.get(ADMIN_DRAFT_KEY));assert.equal(drafts.places.length,1);
  assert.equal(drafts.places[0].prices[0].amount,500);assert.ok(el('editor-status').textContent.includes('Черновик сохранён'));
  const local=applyAdminDrafts(catalogue,drafts);const found=searchPlaces(local.places,{category:'cafe',budget:500,includeUnknownPrices:false,today:new Date()});
  assert.ok([...found.results,...found.alternatives].some(x=>x.place.id===p.id));assert.equal(p.prices?.length||0,0);
});
test('API city imports preserve the editor draft and a failed import preserves data',async()=>{
  globalThis.fetch=async()=>({ok:true,json:async()=>({count:1,next:null,results:[{id:123456789,title:'Тестовая Москва',address:'Тестовый адрес 1',coords:{lat:55.75,lon:37.6},categories:['cafes'],site_url:'https://kudago.com/msk/place/test/'}]})});
  el('api-city').value='msk';await el('api-load').emit('click');assert.ok(el('api-status').textContent.includes('Получено 1'));
  const delta=JSON.parse(storage.get('kuda.catalogue'));assert.equal(delta.places.length,1);assert.equal(delta.places[0].title,'Тестовая Москва');
  assert.equal(JSON.parse(storage.get(ADMIN_DRAFT_KEY)).places[0].prices[0].amount,500);
  const stored=storage.get('kuda.catalogue');globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};await el('api-load').emit('click');
  assert.ok(el('api-status').textContent.includes('Текущая база сохранена'));assert.equal(storage.get('kuda.catalogue'),stored);
});
test('the optional social form saves a deduplicated review queue',async()=>{
  el('city').value='Санкт-Петербург';el('recommendation-url').value='https://www.instagram.com/p/example/';el('recommendation-title').value='Мастерская из ролика';
  el('recommendation-note').value='Моё короткое описание.';el('recommendation-original').checked=true;
  await el('recommendation-form').emit('submit');await el('recommendation-form').emit('submit');
  const rows=JSON.parse(storage.get('mestno.recommendations'));assert.equal(rows.length,1);assert.equal(rows[0].status,'pending_review');
  assert.ok(el('recommendation-status').textContent.includes('пока не добавлены'));assert.equal(JSON.parse(storage.get(ADMIN_DRAFT_KEY)).places.length,1);
});
test('removing local drafts restores the original budget while keeping city imports',async()=>{
  await el('clear-drafts').emit('click');assert.equal(storage.get(ADMIN_DRAFT_KEY),undefined);
  const p=catalogue.places.find(p=>p.title==='Брынза');click('[data-edit]',{edit:p.id});assert.equal(el('place-budget').value,'');
  el('place-search').value='Тестовая Москва';await el('place-search').emit('input');assert.ok(el('place-list').innerHTML.includes('Тестовая Москва'));
});
