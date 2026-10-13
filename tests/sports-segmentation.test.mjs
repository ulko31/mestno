import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseQuery,searchPlaces,validateCatalogue} from '../dist/search.mjs';
import {sportsFor,sportDetails} from '../dist/sports.mjs';
import {analyseText} from '../dist/text-analysis.mjs';
import {mergeCatalogues} from '../dist/providers.mjs';
const today=new Date('2026-10-13T20:00:00Z'),source='https://example.org/sport',stamp='2026-10-13T12:00:00Z';
const all=r=>[...r.results,...r.alternatives];
const facility=(key='padel',extra={})=>({id:'court',activities:[key],source_url:source,booking_url:source,checked_at:stamp,environment:'indoor',season:'year_round',...extra});
const place=(id,f=facility())=>({id,title:id,city:'Санкт-Петербург',category:'sport',sources:[{url:source}],features:[],sport_facilities:[f]});
const catalogue=JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url)));

test('sports are recognized separately, including spoken padel and beach/table tennis',()=>{
 for(const [text,key] of [['вейк-парк','wakeboarding'],['покататься на вейкборде','wakeboarding'],['вейксерф','wakesurfing'],['горнолыжный склон','skiing'],['сноуборд','snowboarding'],['бадминтон','badminton'],['баскетбол','basketball'],['волейбол','volleyball'],['паддл','padel'],['падел-теннис','padel'],['большой теннис','tennis'],['настольный теннис','table_tennis'],['пляжный теннис','beach_tennis']]){
  const q=parseQuery(text);assert.ok(q.needs.includes(key),text);assert.ok(q.needs.includes('sports'));assert.ok(!q.needs.includes('laptop_work'));
  if(['padel','table_tennis','beach_tennis'].includes(key))assert.ok(!q.needs.includes('tennis'));
 }
 for(const q of ['Научиться паделу','Позаниматься теннисом','Учиться играть в баскетбол'])assert.ok(!parseQuery(q).needs.includes('laptop_work'));
});
test('a source about padel/table tennis cannot establish a large tennis court',()=>{
 const p={...place('table'),documents:[{kind:'description',text:'Крытый зал: настольный теннис и падел-теннис.',source_url:source,observed_at:stamp}]};
 assert.equal(analyseText(p,['tennis'],{},today).evidence.tennis.positive.length,0);
 assert.equal(all(searchPlaces([p],{query:'Большой теннис',today})).length,0);
});
test('a specific sports filter uses facility evidence, never the climbing category alias',()=>{
 const p=[place('padel'),place('basketball',facility('basketball')),place('climb',facility('climbing'))];
 assert.deepEqual(all(searchPlaces(p,{category:'sport',sport:'basketball',today})).map(x=>x.place.id),['basketball']);
 assert.equal(all(searchPlaces(p,{query:'Бадминтон',today})).length,0);
});
test('a bookable court and a public group lesson are different offers',()=>{
 const p=place('padel');p.offers=[{id:'wrong',title:'Волейбол',activities:['sports','volleyball'],format:'open_group',audience:'adults',source_url:source,booking_url:source,checked_at:stamp}];
 assert.equal(all(searchPlaces([p],{query:'Падел с друзьями',today})).length,1);
 assert.equal(all(searchPlaces([p],{query:'Падел, познакомиться с людьми',today})).length,0);
 p.offers.push({...p.offers[0],id:'right',title:'Падел для новичков',activities:['sports','padel']});
 const r=all(searchPlaces([p],{query:'Падел, познакомиться с людьми',today}));assert.equal(r.length,1);assert.equal(r[0].offer.id,'right');
});
test('court tariffs keep the unit, are not a person budget, and expire after 30 days',()=>{
 const f=facility('padel',{tariff:{amount:2500,unit:'корт / час',kind:'from'}}),p=place('padel',f);
 const r=all(searchPlaces([p],{query:'Падел до 1000 рублей',today}));assert.equal(r.length,1);assert.equal(r[0].price,null);assert.match(r[0].sport.cost,/2\s?500 ₽ \/ корт \/ час/);
 assert.ok(r[0].warnings.some(w=>w.includes('бюджет')));
 assert.equal(sportDetails(f,'2026-11-20T12:00:00Z').cost,null);
 assert.equal(all(searchPlaces([p],{query:'Падел до 1000 рублей',includeUnknownPrices:false,today})).length,0);
});
test('season and outdoor checks do not invent live availability',()=>{
 const p=[place('pool',facility('wakeboarding',{season:'winter',note:'1 октября — 1 мая'})),place('lake',facility('wakeboarding',{season:'summer',environment:'outdoor'}))];
 const r=all(searchPlaces(p,{query:'Вейкборд',today}));assert.equal(r.length,2);assert.ok(r.every(x=>x.warnings.length));
 assert.deepEqual(sportsFor(p[0],{needs:['wakeboarding'],outdoors:true,today}),[]);
 assert.deepEqual(all(searchPlaces(p,{query:'Вейкборд на улице',today})).map(x=>x.place.id),['lake']);
 assert.equal(sportsFor(p[0],{today:'2027-03-01'}).length,0);
});
test('sport facilities survive merges and reject unsupported protocols and missing price units',()=>{
 const p=place('court'),base={schema_version:1,places:[p]};
 const incoming={schema_version:1,places:[{...p,sport_facilities:[facility('padel',{id:'new'})]}]};assert.equal(mergeCatalogues(base,incoming).places[0].sport_facilities.length,2);
 assert.throws(()=>validateCatalogue({schema_version:1,places:[place('bad',facility('padel',{booking_url:'javascript:alert(1)'}))]}));
 assert.throws(()=>validateCatalogue({schema_version:1,places:[place('bad',facility('padel',{tariff:{amount:20}}))]}));
});
test('billiards payment choices are distinct and an explicit free request stays strict',()=>{
 const p=['free','with_order','paid','ticket','unknown'].map(mode=>({id:mode,title:mode,category:'bar',sources:[{url:source}],features:[{key:'billiards',value:true,status:'documented',source_url:source,checked_at:stamp}],billiards_terms:[{id:mode,mode,source_url:source,checked_at:stamp,verified:true}]}));
 assert.deepEqual(all(searchPlaces(p,{category:'billiards',billiardsPayment:'free',today})).map(x=>x.place.id).sort(),['free','with_order']);
 for(const mode of ['paid','ticket','unknown'])assert.deepEqual(all(searchPlaces(p,{category:'billiards',billiardsPayment:mode,today})).map(x=>x.place.id),[mode]);
 assert.equal(parseQuery('Бесплатный бильярд').billiardsPayment,'free');assert.equal(parseQuery('Платный бильярд').billiardsPayment,'paid');
 assert.equal(all(searchPlaces(p,{query:'Бесплатный бильярд',billiardsPayment:'paid',today})).length,0);
});
test('real catalogue contains restaurants, requested bars and different sourced sports',()=>{
 const bars=all(searchPlaces(catalogue.places,{query:'Бар с коктейлями',today}));assert.ok(bars.length>=15);for(const name of ['Цветочки','Cocos','Solids','Хоровод','Звонок'])assert.ok(bars.some(x=>x.place.title.includes(name)),name);
 const date=all(searchPlaces(catalogue.places,{query:'Первое свидание в ресторане, спокойно поговорить',today}));assert.ok(date.length>=10);assert.ok(date.every(x=>x.place.category==='restaurant'));assert.ok(date.some(x=>x.place.title==='Банщики'));
 for(const key of ['wakeboarding','wakesurfing','skiing','snowboarding','badminton','basketball','volleyball','tennis','padel']){
  const r=all(searchPlaces(catalogue.places,{category:'sport',sport:key,today}));assert.ok(r.length>=2,key);assert.ok(r.every(x=>x.sport||x.evidence.length));
 }
 const games=all(searchPlaces(catalogue.places,{query:'Поесть и поиграть в бильярд',today}));for(const name of ['Solids','Kiks','Schmaus'])assert.ok(games.some(x=>x.place.title.includes(name)),name);
});
test('melancholy mixes sourced formats, and cocktails alone do not establish a party',()=>{
 const r=all(searchPlaces(catalogue.places,{mood:'melancholy',company:'alone',today}));assert.ok(r.some(x=>x.place.category==='cafe'));assert.ok(r.some(x=>['park','space'].includes(x.place.category)));
 const first=searchPlaces(catalogue.places,{mood:'melancholy',today}).results.slice(0,12);assert.ok(new Set(first.map(x=>x.place.category)).size>=3);
 const p={...place('cocktails'),category:'bar',documents:[{kind:'description',text:'Лаунж с коктейлями и мягкими креслами.',source_url:source,observed_at:stamp}]};
 assert.equal(all(searchPlaces([p],{mood:'party',today})).length,0);
 assert.ok(all(searchPlaces([p],{mood:'melancholy',today})).length);
});
