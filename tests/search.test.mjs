import test from 'node:test';
import assert from 'node:assert/strict';
import {searchPlaces,hasFeature,parseQuery,validateCatalogue,distanceKm} from '../dist/search.mjs';
const today=new Date('2026-10-11T12:00:00Z');
const feature=(key,value=true,date='2026-10-10T12:00:00Z')=>({key,value,status:'documented',source_url:'https://example.org/conditions',checked_at:date});
const place=(id,features=[])=>({id,title:'Тестовое место '+id,category:'other',status:'catalogue',sources:[{url:'https://example.org'}],features,address:null,lat:null,lon:null,price_max:null});
test('billiards presence and free entry never imply free game',()=>{
 const p=place('a',[feature('billiards'),feature('free_entry')]);
 assert.equal(searchPlaces([p],{query:'Бесплатный бильярд',today}).results.length,0);
});
test('explicit free billiards evidence matches',()=>{
 const p=place('a',[feature('billiards'),feature('free_billiards')]);
 assert.equal(searchPlaces([p],{query:'Бесплатный бильярд',today}).results.length,1);
});
test('unknown and stale conditions never meet a required constraint',()=>{
 assert.equal(hasFeature(place('a'), 'quiet',true,today),false);
 assert.equal(hasFeature(place('a',[feature('quiet',true,'2025-01-01')]),'quiet',true,today),false);
});
test('conflicting claims do not become a confirmed condition',()=>{
 assert.equal(hasFeature(place('a',[feature('quiet'),feature('quiet',false)]),'quiet',true,today),false);
});
test('budget excludes missing, stale, over-budget and per-hour prices',()=>{
 const a={...place('a'),price_max:1000,price_scope:'visit',price_source_url:'https://example.org/menu',price_checked_at:'2026-10-10'};
 const b={...a,id:'b',price_scope:'hour'};
 const c={...a,id:'c',price_checked_at:'2026-01-01'};
 assert.deepEqual(searchPlaces([a,b,c,place('d')],{budget:1500,today}).results.map(r=>r.place.id),['a']);
});
test('visited and closed venues are excluded',()=>{
 assert.equal(searchPlaces([place('a'),{...place('b'),status:'closed'}],{visited:['a'],hideVisited:true,today}).results.length,0);
});
test('radius excludes unknown coordinates',()=>{
 const a={...place('a'),lat:59.93,lon:30.3};
 assert.deepEqual(searchPlaces([a,place('b')],{location:{lat:59.93,lon:30.3},radius:2,today}).results.map(r=>r.place.id),['a']);
 assert.equal(distanceKm({lat:59,lon:30},{lat:59,lon:30}),0);
});
test('parser extracts ruble budget and exclusions',()=>{
 const q=parseQuery('Коворкинг до 1 500 рублей, не бар');
 assert.equal(q.budget,1500);assert.deepEqual(q.excludedCategories,['bar']);assert.deepEqual(q.requestedCategories,['coworking']);
 assert.equal(parseQuery('Бильярд, не обязательно бесплатно').needs.includes('free_billiards'),false);
});
test('unsafe URL or duplicate ID import is rejected',()=>{
 assert.throws(()=>validateCatalogue({schema_version:1,places:[{...place('a'),sources:[{url:'javascript:alert(1)'}]}]}));
 assert.throws(()=>validateCatalogue({schema_version:1,places:[place('a'),place('a')]}));
});
test('unsupported specific query returns no fake semantic recommendation',()=>{
 assert.equal(searchPlaces([place('a')],{query:'кафе с настольными играми',today}).results.length,0);
});

test('laptop work returns a cafe and a library, without turning them into coworkings',()=>{
 const cafe={...place('cafe',[feature('laptop_work')]),category:'cafe'};
 const library={...place('library',[feature('laptop_work')]),category:'library'};
 const office={...place('office',[feature('coworking')]),category:'coworking'};
 const r=searchPlaces([cafe,library,office],{query:'Поработать с ноутбуком в кафе или библиотеке',today});
 assert.deepEqual(new Set(r.results.map(x=>x.place.id)),new Set(['cafe','library']));
 assert.deepEqual(r.needs,['laptop_work']);
});
test('explicit cafe and not-a-coworking constraints survive natural wording',()=>{
 const cafe={...place('cafe',[feature('laptop_work'),feature('power_outlets')]),category:'cafe'};
 const office={...place('office',[feature('laptop_work'),feature('power_outlets')]),category:'coworking'};
 const r=searchPlaces([cafe,office],{query:'Хочу кафе для работы с ноутбуком и розеткой, не в коворкинге',today});
 assert.deepEqual(r.results.map(x=>x.place.id),['cafe']);
 assert.deepEqual(r.parsed.excludedCategories,['coworking']);
});
test('documented work area supports legacy imports, but a current laptop ban wins',()=>{
 const cafe={...place('cafe',[feature('coworking')]),category:'cafe'};
 const banned={...cafe,id:'banned',features:[feature('coworking'),feature('laptop_work',false)]};
 assert.deepEqual(searchPlaces([cafe,banned],{query:'поработать с ноутбуком',today}).results.map(x=>x.place.id),['cafe']);
});
test('changing mood actually changes the candidate set',()=>{
 const cafe={...place('cafe',[feature('quiet')]),category:'cafe'};
 const club={...place('club',[feature('dance')]),category:'club'};
 const gallery={...place('gallery',[feature('exhibitions'),feature('imaginative_exhibition')]),category:'gallery'};
 assert.deepEqual(searchPlaces([cafe,club,gallery],{mood:'calm',today}).results.map(x=>x.place.id),['cafe']);
 assert.deepEqual(searchPlaces([cafe,club,gallery],{mood:'party',today}).results.map(x=>x.place.id),['club']);
 assert.equal(searchPlaces([cafe,club,gallery],{mood:'dreamy',today}).results[0].place.id,'gallery');
});
test('explicit mood control can override a previous written mood and can clear it',()=>{
 const cafe={...place('cafe',[feature('quiet')]),category:'cafe'},club={...place('club',[feature('dance')]),category:'club'};
 assert.deepEqual(searchPlaces([cafe,club],{query:'Спокойно поговорить',mood:'party',today}).results.map(x=>x.place.id),['club']);
 assert.equal(searchPlaces([cafe,club],{query:'Спокойно поговорить',mood:'',today}).results.length,2);
});
test('quiet morning claim is not an all-day quiet guarantee',()=>{
 const p={...place('cafe',[{...feature('quiet'),scope:'weekday_morning'},feature('laptop_work')]),category:'cafe'};
 assert.equal(searchPlaces([p],{query:'Тихое кафе для работы утром в будни',today}).results.length,1);
 assert.equal(searchPlaces([p],{query:'Тихое кафе для работы вечером',today}).results.length,0);
 assert.equal(searchPlaces([p],{query:'Тихое кафе для работы утром в выходные',today}).results.length,0);
});
test('first meeting is distinct from meeting a new group by interests',()=>{
 const cafe={...place('cafe'),category:'cafe'};
 const social={...place('social',[feature('social_events'),feature('board_games')]),category:'anticafe'};
 const office={...place('office'),category:'coworking'};
 const first=searchPlaces([cafe,social,office],{query:'Место для первого знакомства',today});
 assert.equal(first.company,'first_date');assert.ok(first.results.some(x=>x.place.id==='cafe'));assert.ok(!first.results.some(x=>x.place.id==='office'));
 const group=searchPlaces([cafe,social,office],{query:'Познакомиться с новыми людьми, поиграть в настолки',today});
 assert.equal(group.company,'new_people');assert.deepEqual(group.results.map(x=>x.place.id),['social']);
});
test('meetups and English clubs are not inferred from any social event',()=>{
 const meetup={...place('meetup',[feature('social_events'),feature('meetups')]),category:'cafe'};
 const english={...place('english',[feature('social_events'),feature('speaking_club'),feature('english_club')]),category:'activity'};
 assert.deepEqual(searchPlaces([meetup,english],{query:'Познакомиться на митапе',today}).results.map(x=>x.place.id),['meetup']);
 assert.deepEqual(searchPlaces([meetup,english],{query:'Разговорный клуб на английском',today}).results.map(x=>x.place.id),['english']);
});
test('cafe OR exhibition does not require the cafe to host an exhibition',()=>{
 const cafe={...place('cafe',[feature('lounge')]),category:'cafe'};
 const gallery={...place('gallery',[feature('exhibitions'),feature('imaginative_exhibition')]),category:'gallery'};
 const space={...place('space'),category:'space'};
 const r=searchPlaces([cafe,gallery,space],{query:'Помечтать на выставке или в атмосферном кафе',today});
 assert.deepEqual(new Set(r.results.map(x=>x.place.id)),new Set(['cafe','gallery']));
});
test('a cafe category or a generic exhibition never implies a dreamy atmosphere',()=>{
 const cafe={...place('cafe'),category:'cafe'};
 const gallery={...place('gallery',[feature('exhibitions')]),category:'gallery'};
 const view={...place('view',[feature('panoramic_view')]),category:'restaurant'};
 const r=searchPlaces([cafe,gallery,view],{mood:'dreamy',today});
 assert.deepEqual(r.results.map(x=>x.place.id),['view']);assert.equal(r.unknownAtmosphere,2);
 assert.ok(r.results[0].reasons.some(x=>x.includes('панорамный вид')));
});
test('an exhibition only supports the mood during its published dates',()=>{
 const p={...place('gallery',[{...feature('imaginative_exhibition'),valid_from:'2026-10-12',valid_until:'2026-10-15'}]),category:'gallery'};
 assert.equal(searchPlaces([p],{mood:'dreamy',today}).results.length,0);
 assert.equal(searchPlaces([p],{mood:'dreamy',today:new Date('2026-10-13')}).results.length,1);
 assert.equal(searchPlaces([p],{mood:'dreamy',today:new Date('2026-10-16')}).results.length,0);
});
test('pending atmosphere and contradictory quiet claims do not support calm conversation',()=>{
 const pending={...place('pending',[{...feature('lounge'),status:'pending_review'}]),category:'cafe'};
 const loud={...place('loud',[feature('lounge'),feature('quiet',false)]),category:'cafe'};
 assert.equal(searchPlaces([pending,loud],{mood:'calm',today}).results.length,0);
});
test('landmarks are hidden by editorial choice but can be searched by name',()=>{
 const p={...place('landmark'),title:'Эрмитаж',category:'museum',is_landmark:true,city:'Санкт-Петербург'};
 assert.equal(searchPlaces([p],{hideLandmarks:true,today}).results.length,0);
 assert.equal(searchPlaces([p],{hideLandmarks:true,query:'Эрмитаж',today}).results.length,1);
 assert.equal(searchPlaces([p],{city:'Москва',today}).results.length,0);
});
test('expiry of an exhibition price excludes it from budget matches',()=>{
 const p={...place('a'),price_max:250,price_scope:'visit',price_checked_at:'2026-10-10',price_source_url:'https://example.org',price_valid_until:'2026-10-10T23:59:59Z'};
 assert.equal(searchPlaces([p],{budget:300,today}).results.length,0);
});
test('specific sports and roleplaying requests never silently become generic activities',()=>{
 const climb={...place('climb',[feature('sports'),feature('climbing')]),category:'sport'};
 const rink={...place('rink',[feature('sports'),feature('ice_skating')]),category:'sport'};
 const rpg={...place('rpg',[feature('board_games'),feature('rpg')]),category:'activity'};
 const board={...place('board',[feature('board_games')]),category:'anticafe'};
 assert.deepEqual(searchPlaces([climb,rink],{query:'Попробовать скалолазание',today}).results.map(x=>x.place.id),['climb']);
 assert.deepEqual(searchPlaces([rpg,board],{query:'Поиграть в D&D',today}).results.map(x=>x.place.id),['rpg']);
});
test('pending free-game claim remains a clearly separate alternative',()=>{
 const p=place('a',[feature('billiards'),{...feature('free_billiards'),status:'pending_review'}]);
 const r=searchPlaces([p],{query:'Бесплатный бильярд',today});
 assert.equal(r.results.length,0);assert.equal(r.alternatives.length,1);
 assert.ok(!r.alternatives[0].reasons.includes('Игра в бильярд без отдельной оплаты'));
});
test('free workplace never follows from free entry or from a cafe work area',()=>{
 const p={...place('cafe',[feature('laptop_work'),feature('free_entry')]),category:'cafe'};
 assert.equal(searchPlaces([p],{query:'Бесплатно поработать с ноутбуком',today}).results.length,0);
});
test('negated preferences do not become positive work or party requests',()=>{
 const q=parseQuery('Хочу спокойно посидеть, не хочу тусовку, без ноутбука и без баров');
 assert.equal(q.mood,'calm');assert.ok(!q.needs.includes('laptop_work'));assert.ok(q.excludedCategories.includes('bar'));
});
test('unknown requests are reported instead of being described as fully understood',()=>{
 const p={...place('cafe'),category:'cafe'};
 const r=searchPlaces([p],{query:'Кафе с живыми совами',today});
 assert.ok(r.unhandled.includes('совами'));assert.ok(r.unhandled.includes('живыми'));
});
test('expired event observation is not matched even within the 90-day freshness window',()=>{
 const p=place('a',[{...feature('social_events'),valid_until:'2026-10-10T23:59:59Z'}]);
 assert.equal(searchPlaces([p],{query:'Познакомиться с новыми людьми',today}).results.length,0);
});
