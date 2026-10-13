import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {preparePlace,prepareOffer,preparePhoto,applyAdminDrafts} from '../dist/admin-model.mjs';
import {applyEnrichment} from '../dist/enrichment.mjs';
import {searchPlaces} from '../dist/search.mjs';
import {priceFor} from '../dist/pricing.mjs';
import {currentOffers} from '../dist/experiences.mjs';
const today=new Date('2026-10-13T12:00:00Z');
const proof='https://example.org/place';
const venue={id:'a',title:'Место',city:'Санкт-Петербург',category:'activity',sources:[{url:proof}],features:[],notes:'Мастерская',offers:[],photos:[],prices:[],lat:null,lon:null};
const input={title:'Мастерская',city:'Санкт-Петербург',category:'activity',source_url:proof,notes:'Открытые занятия.',budget:'500',price_kind:'average_check',lat:'',lon:''};
const programme={title:'Общая группа',description:'Свечеварение с другими участниками.',activities:['workshops','candles'],format:'open_group',source_url:proof,booking_url:proof,budget:'0',starts_at:'2026-10-14T18:00',ends_at:'2026-10-14T19:30'};
test('an edited budget changes search without mutating the published record',()=>{
  const edited=preparePlace(venue,input,{today});
  const patched=applyAdminDrafts({schema_version:1,places:[venue]},{schema_version:1,places:[edited]});
  const r=searchPlaces(patched.places,{budget:500,today});assert.equal([...r.results,...r.alternatives][0].price.amount,500);
  assert.equal(searchPlaces(patched.places,{budget:499,today}).results.length,0);
  assert.deepEqual(venue.prices,[]);
});
test('saving unrelated fields preserves quote dates and additional tariffs',()=>{
  const price={id:'one',amount:500,currency:'RUB',scope:'visit',kind:'average_check',source_url:proof,checked_at:'2026-01-01',note:''};
  const p={...venue,prices:[price,{...price,id:'hour',kind:'hourly',scope:'hour',amount:200}]};
  const edited=preparePlace(p,input,{today});assert.deepEqual(edited.prices,p.prices);assert.equal(priceFor(edited,{today}),null);
  assert.equal(preparePlace(p,{...input,budget:''},{today}).prices.length,0);
});
test('editor rejects invalid amounts, unpaired coordinates and unsafe proof',()=>{
  for(const budget of [-1,Infinity,'abc'])assert.throws(()=>preparePlace(venue,{...input,budget},{today}));
  assert.throws(()=>preparePlace(venue,{...input,source_url:'javascript:alert(1)'},{today}));
  assert.throws(()=>preparePlace(venue,{...input,lat:59.9,lon:''},{today}));
});
test('programmes use Moscow time, preserve zero and exclude children from adult acquaintances',()=>{
  const e=prepareOffer(programme,{today,id:'one'});assert.equal(e.starts_at,'2026-10-14T15:00:00.000Z');assert.equal(e.price.amount,0);
  assert.equal(searchPlaces([{...venue,offers:[e]}],{query:'Бесплатный мастер-класс, познакомиться с людьми',today}).results.length,1);
  const child=prepareOffer({...programme,audience:'children'},{today,id:'child'});
  assert.ok(child.activities.includes('child_friendly'));
  assert.equal(searchPlaces([{...venue,offers:[child]}],{company:'new_people',query:'мастер-класс',today}).results.length,0);
  assert.throws(()=>prepareOffer({...programme,ends_at:'2026-10-14T17:00'},{today}));
  assert.throws(()=>prepareOffer({...programme,activities:['invented']},{today}));
});
test('unknown budgets remain labelled while paid programmes never match free requests',()=>{
  const e=prepareOffer({...programme,budget:''},{today,id:'unknown'}),p={...venue,offers:[e]};
  const r=searchPlaces([p],{query:'мастер-класс',budget:1000,today});assert.equal(r.alternatives.length,1);assert.equal(r.alternatives[0].price,null);
  assert.match(r.alternatives[0].warnings.join(' '),/не подтверждён/);
  assert.equal(searchPlaces([p],{query:'мастер-класс',budget:1000,today,includeUnknownPrices:false}).alternatives.length,0);
  const paid={...p,offers:[prepareOffer({...programme,budget:1200},{today,id:'paid'})]};
  assert.equal(searchPlaces([paid],{query:'Бесплатный мастер-класс',today}).results.length,0);
});
test('full draft replacement allows removal of programmes and pictures',()=>{
  const original={...venue,offers:[prepareOffer(programme,{today,id:'one'})]};
  const patched=applyAdminDrafts({schema_version:1,places:[original]},{schema_version:1,places:[{...original,offers:[]}]});
  assert.deepEqual(patched.places[0].offers,[]);assert.equal(original.offers.length,1);
});
test('photo records require permission and allow only safe assets',()=>{
  const i={url:'photos/seed-artmuza.jpg',source_url:proof,author:'Автор',license:'CC BY-SA 4.0',license_url:'https://creativecommons.org/licenses/by-sa/4.0/',caption:'Двор зимой',rights_confirmed:true};
  assert.equal(preparePhoto(i,{today}).url,i.url);
  for(const url of ['photos/../private.jpg','data:image/png,abc','javascript:alert(1)'])assert.throws(()=>preparePhoto({...i,url},{today}));
  assert.throws(()=>preparePhoto({...i,rights_confirmed:false},{today}));
});
test('only a complete official library collection can remove withdrawn programmes',()=>{
  const event=prepareOffer(programme,{today,id:'lermontovka:events/removed'}),manual={...event,id:'manual:one'};
  const catalogue={schema_version:1,places:[{...venue,offers:[event,manual]}]};
  const incoming={schema_version:1,places:[{...venue,offers:[]}],source_url:'https://lermontovka-spb.ru/events/',collection_report:{candidate_events:10,fetched_events:10,errors:[]}};
  assert.deepEqual(applyEnrichment(catalogue,incoming).places[0].offers.map(e=>e.id),['manual:one']);
  const partial={...incoming,collection_report:{...incoming.collection_report,fetched_events:9}};
  assert.equal(applyEnrichment(catalogue,partial).places[0].offers.length,2);
  assert.equal(catalogue.places[0].offers.length,2);
});
test('photo-only enrichment leaves fresh programmes intact and local files exist',()=>{
  const catalogue=JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url)));
  const photos=JSON.parse(fs.readFileSync(new URL('../data/photos-2026-10-12.json',import.meta.url)));
  const enriched=applyEnrichment(catalogue,photos);
  assert.equal(enriched.places.reduce((n,p)=>n+currentOffers(p,today).length,0),catalogue.places.reduce((n,p)=>n+currentOffers(p,today).length,0));
  for(const p of catalogue.places)for(const f of p.photos||[]){assert.ok(f.url.startsWith('photos/'));assert.ok(fs.existsSync(new URL('../dist/'+f.url,import.meta.url)));}
});
