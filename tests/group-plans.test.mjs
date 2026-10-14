import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchPlaces,parseQuery,validateCatalogue} from '../dist/search.mjs';
import {participationLabel} from '../dist/group-plans.mjs';
import {priceFor} from '../dist/pricing.mjs';
const today='2026-10-14T12:00:00Z',url='https://example.org/venue';
const place=(id,text,offers=[])=>({id,title:id,category:'activity',sources:[{url}],features:[],documents:[{id:'desc',kind:'description',text,source_url:url,observed_at:'2026-10-14T00:00:00Z'}],offers});
const offer=(id,extra={})=>({id,title:id,source_url:url,booking_url:url,activities:['mafia'],description:'Мафия своей компанией.',format:'private',checked_at:'2026-10-14T00:00:00Z',...extra});
const all=r=>[...r.results,...r.alternatives];
const catalogue=JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url))).places;
test('colleagues, party size and after-work time are independent of laptop work',()=>{
  const p=parseQuery('После работы с коллегами, нас 8 человек');
  assert.equal(p.company,'colleagues');assert.equal(p.partySize,8);assert.equal(p.afterWork,true);assert.equal(p.daypart,'evening');assert.ok(!p.needs.includes('laptop_work'));assert.deepEqual(p.keywords,[]);assert.equal(parseQuery('Компания, 8 человек').partySize,8);assert.equal(parseQuery('Нас 150 человек').partySize,150);
});
test('a game night is not a cozy catch-up or a coworking recommendation',()=>{
  const p=[place('mafia','Мафия для вашей компании.'),place('craft','Мастер-классы по керамике.'),place('cafe','Уютное кафе для встречи с друзьями.'),place('work','Тихая зона для работы с ноутбуком.')];
  const r=searchPlaces(p,{query:'Поиграть с друзьями',today});assert.equal(r.intent,'friends_activity');assert.deepEqual(all(r).map(x=>x.place.id),['mafia']);
});
test('quiet conversation with colleagues does not become a team game',()=>{
  const p=[place('games','Мафия для вашей компании. Уютная зона ожидания.'),{...place('cafe','Уютная кофейня для общения, кофе и десерты.'),category:'cafe'}];
  const r=searchPlaces(p,{query:'Спокойно поговорить с коллегами за кофе',today});
  assert.equal(r.intent,'colleague_catchup');assert.deepEqual(all(r).map(x=>x.place.id),['cafe']);
});
test('shared activity is an OR of different activities, not a requirement to offer them all',()=>{
  const p=[place('a','Квиз для друзей.'),place('b','Караоке.'),place('c','Боулинг.')];
  assert.equal(all(searchPlaces(p,{query:'Поиграть с друзьями',today})).length,3);
});
test('a generic sports address does not prove a shared leisure experience',()=>{
  const p=place('gym','Условия посещения и актуальность требуют проверки.');p.features=[{key:'sports',value:true,status:'documented',checked_at:'2026-10-14',source_url:url}];
  assert.equal(all(searchPlaces([p],{query:'Интересно провести время с друзьями',today})).length,0);
});
test('excluded game wording is not consumed as a positive request',()=>{
  const p=parseQuery('Поиграть с друзьями без караоке');assert.ok(p.excludedFeatures.includes('karaoke'));assert.ok(!p.needs.includes('karaoke'));
});
test('private team minimum excludes a couple, but open-group minimum does not require bringing a team',()=>{
  const p=place('p','Мафия.',[offer('private',{party_min:8,party_max:12}),offer('open',{format:'open_group',party_min:8,party_max:12})]);
  const r=searchPlaces([p],{query:'Мафия, нас 2 человека',today});assert.equal(all(r)[0].offer.id,'open');
  assert.ok(all(r)[0].warnings.some(s=>s.includes('Общая группа')));
});
test('simultaneous players and total guests are distinct capacities',()=>{
  const p=place('p','Пиксельные игры.',[offer('arena',{activities:['arcade'],party_max:15,simultaneous_max:6})]);
  const r=searchPlaces([p],{query:'Пиксельные игры, нас 8 человек',today});assert.equal(r.results.length,0);assert.equal(r.alternatives.length,1);assert.match(r.alternatives[0].warnings.join(' '),/смена игроков/);
  assert.equal(all(searchPlaces([p],{query:'Пиксельные игры, нас 8 человек одновременно',today})).length,0);
});
test('unknown capacity is labelled, not inferred from cozy prose',()=>{
  const p=place('p','Мафия для вашей компании. Уютный зал.');const r=searchPlaces([p],{query:'Мафия, нас 8 человек',today});
  assert.equal(r.results.length,0);assert.match(r.alternatives[0].warnings.join(' '),/Вместимость.*8/);
});
test('private rooms are not inferred from a chamber-like interior',()=>{
  const p=[place('chamber','Камерный зал.'),place('private','Отдельная комната для компании.')];
  assert.deepEqual(all(searchPlaces(p,{query:'Отдельная комната',today})).map(x=>x.place.id),['private']);
});
test('new-people query never substitutes an invitation-only team game',()=>{
  const p=place('p','Мафия.',[offer('private',{party_min:8,party_max:12})]);
  assert.equal(all(searchPlaces([p],{query:'Мафия, познакомиться с новыми людьми',today})).length,0);
});
test('non-monetary poker requires explicit absence of both stakes and valuable prizes',()=>{
  const p=[place('unknown','Покерный клуб.'),place('stakes','Покер без денежных ставок. Денежные призы.'),place('friendly','Покер без денежных ставок, без ценных призов.')];
  assert.deepEqual(all(searchPlaces(p,{query:'Покер с друзьями',today})).map(x=>x.place.id),['friendly']);
});
test('capacity validation rejects negative or reversed boundaries',()=>{
  assert.throws(()=>validateCatalogue({schema_version:1,places:[place('p','',[offer('a',{party_min:9,party_max:2})])]}));
  assert.match(participationLabel(offer('p',{party_min:8,party_max:12})),/8–12 человек/);
});
test('group package is divided only by known size and respects its weekday',()=>{
  const e=offer('e',{price:{amount:12000,currency:'RUB',scope:'visit',kind:'from',unit:'group',visit_day:'weekday',source_url:url,checked_at:'2026-10-14T00:00:00Z'}}),p=place('p','',[e]);
  assert.equal(priceFor(p,{offer:e,partySize:8,context:{visitDay:'weekday'},today}).amount,1500);
  assert.equal(priceFor(p,{offer:e,context:{visitDay:'weekday'},today}),null);
  assert.equal(priceFor(p,{offer:e,partySize:8,context:{visitDay:'weekend'},today}),null);
});
test('real colleague plans have sourced capacities and FoodLoft does not masquerade as a date for two',()=>{
  const r=searchPlaces(catalogue,{query:'После работы с коллегами, нас 8 человек',today});
  for(const name of ['FoodLoft','Mafia VIP','Pixel Quest'])assert.ok(all(r).some(x=>x.place.title.includes(name)),name);
  const date=all(searchPlaces(catalogue,{query:'Необычное свидание, попробовать что-то новое',today}));
  assert.ok(date.some(x=>x.place.title.includes('Pixel Quest')));assert.ok(!date.some(x=>x.place.title.includes('FoodLoft')||x.place.title.includes('Mafia VIP')));
  const roomDate=all(searchPlaces(catalogue,{query:'Свидание, отдельная комната',today}));assert.ok(!roomDate.some(x=>x.place.title.includes('FoodLoft')));
});
test('FoodLoft budget includes minimum order and service, not just an advertised per-person number',()=>{
  const p=catalogue.find(p=>p.id==='curated:foodloft-beringa'),e=p.offers[0];
  assert.equal(priceFor(p,{offer:e,partySize:7,today}).amount,6286);
  assert.equal(priceFor(p,{offer:e,partySize:25,today}),null);
  assert.equal(all(searchPlaces([p],{query:'Кулинарный мастер-класс, нас 7 человек, до 5000 рублей',today})).length,0);
});
