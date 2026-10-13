import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchPlaces,parseQuery,validateCatalogue} from '../dist/search.mjs';
import {billiardsInfo} from '../dist/billiards.mjs';
import {priceFor} from '../dist/pricing.mjs';
import {applyEnrichment} from '../dist/enrichment.mjs';
const today=new Date('2026-10-13T20:00:00Z'),url='https://example.org/venue';
const document=text=>({id:'d',kind:'description',text,source_url:url,observed_at:'2026-10-13T08:00:00Z'});
const place=(id,text,category='cafe')=>({id,title:id,city:'Санкт-Петербург',category,sources:[{url}],features:[],documents:[document(text)],prices:[]});
const all=r=>[...r.results,...r.alternatives];
const term=(mode,extra={})=>({id:'game',mode,verified:true,source_url:url,checked_at:'2026-10-13T08:00:00Z',...extra});
test('cozy coffee meetings and work require different evidence',()=>{
  const chat=place('chat','Уютная кофейня для встречи с друзьями, кофе и выпечка.'),work=place('work','Тихая рабочая зона для ноутбука, Wi-Fi и розетки.');
  const library=place('library','Тихая зона для чтения и работы с ноутбуком.','library');
  assert.deepEqual(all(searchPlaces([chat,work,library],{query:'Уютное кафе попить кофе с подругой',today})).map(x=>x.place.id),['chat']);
  assert.deepEqual(all(searchPlaces([chat,work,library],{query:'Кафе поработать с ноутбуком',today})).map(x=>x.place.id),['work']);
  assert.equal(parseQuery('Уютное кафе без ноутбука, не для работы').needs.includes('laptop_work'),false);
});
test('a first date ranks conversation and lighting ahead of a quiet work area',()=>{
  const date=place('date','Кофе, тёплый свет, винтажный интерьер для свидания.'),office=place('office','Тихое кафе для работы с ноутбуком и кофе.');
  const r=searchPlaces([office,date],{query:'Первое свидание в кафе, спокойно поговорить',today});
  assert.equal(all(r)[0].place.id,'date');assert.ok(r.results[0].reasons.some(s=>s.includes('освещение')));
});
test('coffee budget uses a menu order while a meal uses its bill',()=>{
  const p=place('coffee','Кофе и завтраки.'),q={currency:'RUB',scope:'visit',source_url:url,checked_at:'2026-10-13T08:00:00Z'};
  p.prices=[{...q,id:'bill',amount:2300,kind:'average_check'},{...q,id:'cup',amount:370,kind:'menu_order',for_needs:['coffee']}];
  assert.equal(all(searchPlaces([p],{query:'Попить кофе до 500 рублей',today}))[0].price.amount,370);
  assert.equal(all(searchPlaces([p],{query:'Поесть до 500 рублей',today})).length,0);
});
test('billiards category includes a documented table inside a bar',()=>{
  const bar=place('bar','Бар с бильярдом и закусками.','bar'),cafe=place('cafe','Кофе и выпечка.');
  assert.deepEqual(all(searchPlaces([bar,cafe],{category:'billiards',today})).map(x=>x.place.id),['bar']);
});
test('free game excludes paid games, ticket attractions and unknown costs',()=>{
  const make=(id,mode)=>({...place(id,'Бильярд, еда и напитки.','bar'),billiards_terms:mode?[term(mode)]:[]});
  const free=make('free','free'),paid=make('paid','paid'),ticket=make('ticket','ticket'),unknown=make('unknown');
  assert.deepEqual(all(searchPlaces([paid,ticket,unknown,free],{query:'Поесть и бильярд без отдельной оплаты',today})).map(x=>x.place.id),['free']);
  assert.ok(parseQuery('Поесть и бильярд бонусом к заказу').needs.includes('free_billiards'));
});
test('free with an order exposes the minimum and respects the budget',()=>{
  const p={...place('order','Бильярд, еда и напитки.','bar'),billiards_terms:[term('with_order',{min_order:900,game_amount:0,queue:true})]};
  assert.equal(all(searchPlaces([p],{query:'Бесплатный бильярд',budget:800,today})).length,0);
  const r=searchPlaces([p],{query:'Бесплатный бильярд',budget:1000,today});assert.equal(r.alternatives.length,1);
  assert.match(r.alternatives[0].billiards.label,/нужен заказ/);assert.match(r.alternatives[0].warnings.join(' '),/900 ₽/);
  assert.equal(r.alternatives[0].price,null,'A zero game charge is not the total visit budget');
});
test('a published free-game claim is labelled and never upgraded to venue confirmation',()=>{
  const p={...place('reported','Бильярд.','bar'),billiards_terms:[term('free',{verified:false,game_amount:0})]};
  const r=searchPlaces([p],{query:'Бесплатный бильярд',today});assert.equal(r.results.length,0);assert.equal(r.alternatives.length,1);
  assert.match(r.alternatives[0].billiards.label,/По публикации/);
});
test('stale or contradictory game conditions do not prove free use',()=>{
  const p={...place('x','Бильярд.','bar'),billiards_terms:[term('free',{checked_at:'2026-08-01'})]};
  assert.equal(all(searchPlaces([p],{query:'Бесплатный бильярд',today})).length,0);
  p.billiards_terms=[term('free'),term('paid')];assert.equal(billiardsInfo(p,{today}).mode,'unknown');
});
test('paid game costs are separate from a food bill and preserve hourly units',()=>{
  const p={...place('paid','Бильярд и еда.','bar'),billiards_terms:[term('paid',{game_amount:750,game_scope:'hour'})],prices:[{id:'food',amount:500,currency:'RUB',scope:'visit',kind:'average_check',source_url:url,checked_at:'2026-10-13T08:00:00Z'}]};
  assert.equal(priceFor(p,{needs:['billiards'],today}),null);
  assert.equal(priceFor(p,{needs:['billiards'],scope:'hour',today}).amount,750);
  assert.match(billiardsInfo(p,{today}).label,/стол \/ час/);
});
test('billiards terms survive catalogue enrichment and unsafe sources are rejected',()=>{
  const p=place('x','Бильярд.','bar');
  const result=applyEnrichment({schema_version:1,places:[p]},{schema_version:1,places:[{...p,billiards_terms:[term('free')]}]});
  assert.equal(billiardsInfo(result.places[0],{today}).free,true);
  assert.throws(()=>validateCatalogue({schema_version:1,places:[{...p,billiards_terms:[term('free',{source_url:'javascript:alert(1)'})]}]}));
});
test('real catalogue has distinct scenarios and multiple water routes',()=>{
  const places=JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url))).places;
  const opts={today,city:'Санкт-Петербург',hideLandmarks:true};
  const date=all(searchPlaces(places,{...opts,query:'Первое свидание в кафе, спокойно поговорить'})),work=all(searchPlaces(places,{...opts,query:'Поработать с ноутбуком в кафе'}));
  assert.ok(date.length>=15);assert.ok(date.some(x=>x.place.title.startsWith('Aster')));assert.ok(!work.some(x=>x.place.title.startsWith('Aster')));
  const rivers=all(searchPlaces(places,{...opts,query:'Подумать, погулять у воды'}));assert.ok(rivers.length>=25);assert.ok(rivers.some(x=>x.place.title.includes('Смоленки')));assert.ok(rivers.some(x=>x.place.title==='Юсуповский сад'));
  const bars=all(searchPlaces(places,{...opts,query:'Бар с друзьями, коктейли и настойки'}));for(const title of ['Хоровод','Звонок'])assert.ok(bars.some(x=>x.place.title===title));
  const games=all(searchPlaces(places,{...opts,query:'Бесплатный бильярд'}));assert.ok(games.some(x=>x.place.title==='Schmaus Döner und Bar'));assert.ok(!games.some(x=>['Leon Club','Альмак'].includes(x.place.title)||x.place.title.startsWith('MazaPark')));
});
