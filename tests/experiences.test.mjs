import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchPlaces,validateCatalogue} from '../dist/search.mjs';
import {priceFor,priceLabel} from '../dist/pricing.mjs';
import {currentOffers,offersFor,requestedDate} from '../dist/experiences.mjs';
import {fromKudaGoEvents,eventPrice,loadKudaGoEvents} from '../dist/events-provider.mjs';
import {placeLink,linkedPlace} from '../dist/place-links.mjs';
import {mergeCatalogues} from '../dist/providers.mjs';
const today=new Date('2026-10-11T12:00:00Z'),source='https://example.org/classes';
const quote=(amount,kind='admission')=>({amount,kind,currency:'RUB',scope:'visit',source_url:source,checked_at:'2026-10-10'});
const offer=(id,format='open_group',amount=2000)=>({id,title:id,description:'Групповой мастер-класс по керамике',format,activities:['workshops','pottery'],source_url:source,booking_url:source,checked_at:'2026-10-10',price:quote(amount)});
const place=(id,offers=[])=>({id,title:id,category:'activity',city:'Санкт-Петербург',address:'Улица, 1',sources:[{url:source}],features:[],documents:[],offers});
const all=r=>[...r.results,...r.alternatives];
test('unlabelled public groups match meeting people while private workshops do not',()=>{
 const r=searchPlaces([place('public',[offer('public')]),place('private',[offer('private','private')])],{query:'Групповой мастер-класс, познакомиться с новыми людьми',today});
 assert.deepEqual(all(r).map(x=>x.place.id),['public']);assert.equal(r.unhandled.length,0);
});
test('a private ceramic activity cannot inherit social status from an unrelated open meetup',()=>{
 const p=place('mixed',[offer('private','private'),{...offer('meetup'),activities:['meetups']}]);
 assert.equal(all(searchPlaces([p],{query:'Керамика, познакомиться с людьми',today})).length,0);
});
test('workshop price is used instead of cheap cafe menu or free admission',()=>{
 const p={...place('mixed',[offer('ceramics')]),category:'cafe',prices:[quote(0),quote(290,'menu_order')]};
 assert.equal(all(searchPlaces([p],{query:'Мастер-класс, познакомиться с людьми до 1000 рублей',today})).length,0);
 const r=searchPlaces([p],{query:'Мастер-класс, познакомиться с людьми до 2500 рублей',today});assert.equal(r.results[0].price.amount,2000);
});
test('the affordable option is selected within the same venue and both have their own price',()=>{
 const p=place('ceramics',[offer('circle','open_group',3500),offer('hand','open_group',3000)]);
 assert.equal(searchPlaces([p],{query:'Мастер-класс, познакомиться с людьми',budget:3000,today}).results[0].offer.id,'hand');
});
test('expired events disappear and tomorrow is based on Moscow rather than UTC',()=>{
 const p=place('event',[{...offer('old'),starts_at:'2026-10-09T19:00:00+03:00',ends_at:'2026-10-09T21:00:00+03:00'},
 {...offer('future'),starts_at:'2026-10-12T19:00:00+03:00',ends_at:'2026-10-12T21:00:00+03:00'}]);
 assert.deepEqual(currentOffers(p,today).map(x=>x.id),['future']);
 assert.equal(offersFor(p,{query:'сегодня',today}).length,0);assert.equal(offersFor(p,{query:'завтра',today}).length,1);
 assert.equal(requestedDate('сегодня',new Date('2026-10-11T22:30:00Z')),'2026-10-12');
 assert.equal(requestedDate('31.02.2026',today),null);
});
test('a recurring group never falsely promises a place on the requested date',()=>{
 const r=searchPlaces([place('recurring',[offer('class')])],{query:'сегодня мастер-класс, познакомиться с людьми',today});
 assert.equal(r.results.length,0);assert.ok(r.alternatives[0].warnings.some(x=>x.includes('Дата 2026-10-11 не подтверждена')));
});
test('a published average check and a menu example remain estimates, not visit maximums',()=>{
 const p={...place('coffee'),category:'cafe',prices:[quote(2000,'average_check'),quote(290,'menu_order')]};
 assert.equal(priceFor(p,{today}).kind,'average_check');assert.equal(priceFor(p,{today,needs:['laptop_work']}).kind,'menu_order');
 assert.match(priceLabel(p.prices[0]),/Бюджет ≈/);assert.match(priceLabel(p.prices[1]),/Заказ от/);
 assert.equal(all(searchPlaces([p],{budget:1000,today})).length,0);
});
test('a stale price never qualifies for the budget and unknown prices can be opted into',()=>{
 const p={...place('unknown'),offers:undefined,prices:[{...quote(200),checked_at:'2026-01-01'}]};
 const r=searchPlaces([p],{budget:500,includeUnknownPrices:false,today});assert.equal(all(r).length,0);assert.equal(r.unknownPriceResults.length,1);
 assert.equal(searchPlaces([p],{budget:500,includeUnknownPrices:true,today}).alternatives.length,1);
});
test('a radius excludes venues without coordinates from all groups',()=>{
 const p=place('no point');const r=searchPlaces([p],{location:{lat:59.93,lon:30.31},radius:5,today});
 assert.equal(all(r).length,0);assert.equal(r.unknownCoordinates,1);
});
test('newer price, image and activity enrichment cannot be replaced by an older cached import',()=>{
 const baseline={schema_version:1,places:[{...place('x'),prices:[{id:'price',...quote(2000),checked_at:'2026-10-11'}],offers:[offer('x')]}]};
 const cached={schema_version:1,places:[{...place('x'),prices:[{id:'price',...quote(500),checked_at:'2026-01-01'}]}]};
 assert.equal(mergeCatalogues(baseline,cached).places[0].prices[0].amount,2000);
});
test('event tariff parsing refuses group, subscription, range and minute rates',()=>{
 for(const value of ['от 500 рублей','500–1000 рублей','1000 рублей за группу','4,5 рубля в минуту','1200 рублей в абонементе'])assert.equal(eventPrice(value,{source,checkedAt:'2026-10-10'}),null);
 assert.equal(eventPrice('1 100 руб.',{source,checkedAt:'2026-10-10'}).amount,1100);
});
test('dated API event attaches to a real venue without inventing social participation',()=>{
 const data={results:[{id:10,title:'Мастер-класс по керамике',body_text:'Можно присоединиться к общей группе.',site_url:source,
 place:{id:20,title:'Студия',address:'Адрес'},dates:[{start:+new Date('2026-10-12T10:00Z')/1000,end:+new Date('2026-10-12T12:00Z')/1000}],price:'2000 руб.'}]};
 const p=fromKudaGoEvents(data,{checkedAt:'2026-10-10',today}).places[0];assert.equal(p.offers[0].format,'open_group');assert.equal(p.offers[0].price.amount,2000);
 assert.equal(p.features.length,0);assert.equal(p.documents.length,0);
 const concert=structuredClone(data);concert.results[0].body_text='Концерт классической музыки';concert.results[0].title='Концерт';
 assert.equal(fromKudaGoEvents(concert,{checkedAt:'2026-10-10',today}).places[0].offers[0].format,'unknown');
});
test('an events API failure rejects the import instead of announcing a partial success',async()=>{
 await assert.rejects(loadKudaGoEvents({fetcher:async()=>({ok:false,status:403}),today}),/403/);
});
test('deep links preserve IDs, offers and existing query parameters without HTML injection',()=>{
 const url=placeLink('https://example.org/?city=spb','osm:node:123','intro');
 assert.deepEqual(linkedPlace({href:url}),{id:'osm:node:123',offer:'intro'});
 assert.equal(new URL(url).searchParams.get('city'),'spb');assert.equal(linkedPlace({startParam:'place_seed%3Abench'}).id,'seed:bench');
 assert.throws(()=>placeLink('javascript:alert(1)','x'));assert.equal(linkedPlace({startParam:'place_%ZZ'}),null);
});
test('the actual catalogue has source-attributed offers and licensed photos and answers the requested scenario',()=>{
 const catalogue=validateCatalogue(JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url))));
 const r=searchPlaces(catalogue.places,{query:'Мастер-класс, познакомиться с новыми людьми',today});
 assert.ok(r.results.some(x=>x.place.title==='Керамишная'));assert.ok(r.results.some(x=>x.offer.activities.includes('improv')));
 assert.ok(all(r).some(x=>x.offer.activities.includes('painting')));assert.ok(!all(r).some(x=>x.place.title.includes('Гончарная студия №1')));
 assert.ok(catalogue.places.reduce((n,p)=>n+(p.photos||[]).length,0)>=11);
});
