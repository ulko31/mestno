import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchPlaces,parseQuery} from '../dist/search.mjs';
import {analyseText,documentsOf} from '../dist/text-analysis.mjs';
const today='2026-10-14T12:00:00Z',url='https://example.org/place';
const place=(id,text,category='cafe',kind='description')=>({id,title:id,category,sources:[{url}],features:[],documents:[{id:'d',kind,text,source_url:url,observed_at:'2026-10-13T08:00:00Z'}]});
const all=r=>[...r.results,...r.alternatives];
const catalogue=JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url))).places;

test('heart-to-heart and girls catch-up phrases are recognized as a visit, not a missing keyword',()=>{
  for(const query of ['Душевно посидеть с подругой','Девчачьи посиделки в кафе','Поболтать по душам с подругами','Ламповое кафе с подругой']){
    const r=searchPlaces([],{query,today});assert.equal(r.mood,'soulful',query);assert.equal(r.company,'friends');assert.equal(r.intent,'friend_catchup');
    assert.ok(parseQuery(query).needs.includes('cozy'));assert.deepEqual(r.unhandled,[]);
  }
});
test('catch-up requires a food setting with relevant atmosphere, not a generic friend-friendly activity',()=>{
  const p=[place('talk','Кофе, диваны для неторопливого отдыха с друзьями.'),place('office','Кофе, тихая рабочая зона для ноутбука, Wi-Fi и розетки.'),place('clay','Уютный мастер-класс для друзей.','activity'),place('romance','Кофе и обстановка для свидания.')];
  assert.deepEqual(all(searchPlaces(p,{query:'Посидеть с подругой душевно',today})).map(x=>x.place.id),['talk']);
});
test('two independent setting cues can match cozy; vintage by itself cannot',()=>{
  const a=place('a','Камерная винтажная кофейня.'),b=place('b','Кофе и винтажная мебель.');
  const r=searchPlaces([b,a],{query:'Уютное кафе с подругой',today});
  assert.deepEqual(r.results.map(x=>x.place.id),['a']);assert.ok(r.results[0].reasons.some(x=>x.startsWith('По обстановке:')));
  assert.ok(r.results[0].evidence.every(x=>x.source_url===url));assert.ok(!r.results[0].reasons.join(' ').includes('тишин'));
});
test('a date phrase does not prove conversation, and date and friends have different ranking',()=>{
  const romance=place('romance','Кофе и романтичная обстановка для свидания. Тёплый свет.'),talk=place('talk','Кофе и диваны для неторопливого отдыха с друзьями.');
  assert.equal(analyseText(romance,['conversation'],{},today).evidence.conversation.positive.length,0);
  assert.equal(all(searchPlaces([romance,talk],{query:'Первое свидание в кафе',today}))[0].place.id,'romance');
  assert.equal(all(searchPlaces([romance,talk],{query:'Посидеть с подругой в кафе',today}))[0].place.id,'talk');
});
test('atmosphere, sockets and Wi-Fi do not prove permission or facilities for laptop work',()=>{
  const p=[place('chat','Уютная кофейня с винтажной мебелью, Wi-Fi и розетками.'),place('work','Кофе. Есть отдельная зона для работы с ноутбуком.')];
  assert.deepEqual(all(searchPlaces(p,{query:'Поработать с ноутбуком в кафе',today})).map(x=>x.place.id),['work']);
});
test('explicit activities with friends retain their purpose; a plain friend filter is broad',()=>{
  const p=[place('padel','Есть корты для падела.','sport'),place('talk','Уютная кофейня с кофе.')];
  assert.equal(searchPlaces(p,{query:'Поиграть в падел с подругой',today}).intent,'');
  assert.deepEqual(all(searchPlaces(p,{query:'Поиграть в падел с подругой',today})).map(x=>x.place.id),['padel']);
  assert.equal(searchPlaces(p,{company:'friends',today}).intent,'');
  assert.equal(searchPlaces(p,{company:'friends',mood:'soulful',today}).intent,'friend_catchup');
});
test('conditional, old or conflicting ambiance cannot become a strong inferred setting',()=>{
  const p=place('timed','Утром тёплый свет и винтажная мебель.');
  const r=searchPlaces([p],{query:'Уютное кафе с подругой',today});assert.equal(r.results.length,0);
  const conflicting=place('conflict','Неуютное кафе. Винтажная мебель и тёплый свет.');
  assert.equal(all(searchPlaces([conflicting],{query:'Уютное кафе с подругой',today})).length,0);
});
test('large windows support light, not a panoramic view',()=>{
  const p=place('windows','Кофейня с панорамными окнами, цветами и старинным шкафом.');
  const ev=analyseText(p,['panoramic_view','daylight'],{},today).evidence;
  assert.equal(ev.panoramic_view.positive.length,0);assert.equal(ev.daylight.positive.length,1);
});
test('an explicit conversation restriction defeats attractive decor',()=>{
  const p=place('p','Кофе, винтажная мебель и тёплый свет. Место не подходит для разговоров.');
  assert.equal(all(searchPlaces([p],{query:'Уютное кафе поговорить с подругой',today})).length,0);
});
test('mixed-source notes do not duplicate or overrule attributed documents',()=>{
  const p=place('p','Кофе и десерты.');p.notes_are_summary=true;p.notes='Уютная кофейня с зоной для ноутбука.';p.updated_at='2026-10-13';
  assert.equal(documentsOf(p,today).length,1);assert.equal(all(searchPlaces([p],{query:'Поработать с ноутбуком',today})).length,0);
});
test('the real friend query has a wider evidenced selection and excludes offices and generic Brynza',()=>{
  const r=searchPlaces(catalogue,{query:'Уютное кафе попить кофе и поболтать с подругой',today});
  const ids=r.results.map(x=>x.place.id);
  for(const id of ['seed:coffee3','curated:le-moniteur','curated:opetit-clair','curated:doris-local','curated:civil-sovetskaya','osm:node:9969325421'])assert.ok(ids.includes(id),id);
  assert.ok(r.results.length>=8);assert.ok(all(r).every(x=>x.place.category==='cafe'&&!x.place.title.includes('Брынза')));
  assert.deepEqual(r.unhandled,[]);
});
test('real laptop results keep dedicated work areas without promoting the Brynza network article',()=>{
  const r=searchPlaces(catalogue,{query:'Поработать с ноутбуком в кафе',today});
  assert.ok(r.results.some(x=>x.place.id==='seed:coffee3'));assert.ok(r.results.some(x=>x.place.id==='seed:bench'));
  assert.ok(all(r).every(x=>!x.place.title.includes('Брынза')));
});
