import {analyseText} from '../dist/text-analysis.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchPlaces} from '../dist/search.mjs';
import {fromKudaGo,mergeCatalogues} from '../dist/providers.mjs';
const today=new Date('2026-10-11T12:00:00Z');
const doc=(text,extra={})=>({id:'description:1',kind:'description',text,source_url:'https://example.org/cafe',observed_at:'2026-10-10',retrieved_at:'2026-10-10',...extra});
const place=(id,text,extra={})=>({id,title:'Кафе '+id,category:'cafe',city:'Санкт-Петербург',features:[],sources:[{url:'https://example.org/cafe'}],documents:[doc(text)],...extra});
const catalogue=places=>({schema_version:1,places});
test('a cafe without work labels is found from an attributed description',()=>{
 const p=place('a','Посетители приходят работать с ноутбуком. Есть розетки. Здесь тихо.');
 const r=searchPlaces([p],{query:'Тихое кафе для работы с ноутбуком и розеткой',today});
 assert.equal(r.results.length,1);assert.ok(r.results[0].evidence.length);assert.equal(p.features.length,0);
 assert.equal(r.results[0].evidence[0].source_url,'https://example.org/cafe');
});
test('an arbitrary descriptive term is searched in prose, not only in tags',()=>{
 const p=place('a','В зале стоит пианино, бывают камерные встречи.');
 const r=searchPlaces([p],{query:'пианино',today});
 assert.equal(r.results.length,1);assert.deepEqual(r.unhandled,[]);
});
test('a laptop ban in the description excludes the venue despite a coworking label',()=>{
 const p=place('a','Работать с ноутбуком нельзя.',{features:[{key:'coworking',value:true,status:'documented',source_url:'https://example.org/cafe',checked_at:'2026-10-10'}]});
 const r=searchPlaces([p],{query:'поработать с ноутбуком',today});
 assert.equal(r.results.length+r.alternatives.length,0);
});
test('an unverified negative note is treated as unknown, not a laptop ban',()=>{
 const r=searchPlaces([place('a','Работа с ноутбуком не подтверждена.')],{query:'поработать с ноутбуком',today});
 assert.equal(r.results.length+r.alternatives.length,0);
});
test('review opinions are considered and visibly require confirmation',()=>{
 const p=place('a','Работала с ноутбуком. Было тихо.',{documents:[doc('Работала с ноутбуком. Было тихо.',{kind:'review'})]});
 const r=searchPlaces([p],{query:'поработать с ноутбуком',today});
 assert.equal(r.results.length,0);assert.equal(r.alternatives.length,1);
 assert.equal(r.alternatives[0].evidence[0].kind,'review');assert.ok(r.alternatives[0].warnings.some(w=>w.includes('по отзывам')));
});
test('a morning review is not an evening recommendation',()=>{
 const p=place('a','',{documents:[doc('В будни утром тихо. Вечером шумно.',{kind:'review'})]});
 const morning=searchPlaces([p],{query:'тихое кафе утром в будни',today});
 const evening=searchPlaces([p],{query:'тихое кафе вечером',today});
 assert.equal(morning.alternatives.length,1);assert.equal(evening.results.length+evening.alternatives.length,0);
});
test('contradictory reviews are disclosed, never promoted to a verified quiet condition',()=>{
 const p=place('a','',{documents:[doc('Здесь тихо.',{id:'r:1',kind:'review'}),doc('Очень шумно.',{id:'r:2',kind:'review'})]});
 const r=searchPlaces([p],{query:'тихое кафе',today});
 assert.equal(r.results.length,0);assert.equal(r.alternatives.length,1);
 assert.ok(r.alternatives[0].warnings.some(w=>w.includes('противоречат')));
});
test('fresh price over budget excludes, while unknown price produces a labelled option',()=>{
 const a=place('a','Можно работать с ноутбуком.');
 const b={...a,id:'b',price_max:1500,price_scope:'visit',price_source_url:'https://example.org/menu',price_checked_at:'2026-10-10'};
 const r=searchPlaces([a,b],{query:'поработать с ноутбуком',budget:1000,today});
 assert.equal(r.results.length,0);assert.deepEqual(r.alternatives.map(x=>x.place.id),['a']);
 assert.ok(r.alternatives[0].warnings.some(w=>w.includes('бюджет до 1000 ₽ не подтверждён')));
});
test('free game cannot be proved by a positive free entry phrase in the text',()=>{
 const r=searchPlaces([place('a','Есть бильярд, вход бесплатный.')],{query:'бесплатный бильярд',today});
 assert.equal(r.results.length,0);assert.equal(r.alternatives.length,0);
});
test('old reviews remain explicit historical candidates; expired exhibition texts are ignored',()=>{
 const old=place('a','',{documents:[doc('Работала с ноутбуком.',{kind:'review',observed_at:'2025-11-01'})]});
 const event=place('b','',{documents:[doc('Выставка о мечтах и воображении.',{valid_until:'2026-10-01'})]});
 assert.ok(searchPlaces([old],{query:'поработать с ноутбуком',today}).alternatives[0].warnings.some(w=>w.includes('старые отзывы')));
 assert.equal(searchPlaces([event],{query:'помечтать',today}).results.length,0);
});
test('merging cached imports cannot replace newer prose or lose review documents',()=>{
 const base=place('a','Можно работать с ноутбуком.');
 const incoming=place('a','Старое описание',{documents:[doc('Старое описание',{retrieved_at:'2026-09-01'}),doc('Здесь тихо.',{id:'r:1',kind:'review'})]});
 const p=mergeCatalogues(catalogue([base]),catalogue([incoming])).places[0];
 assert.equal(p.documents.length,2);assert.equal(p.documents[0].text,'Можно работать с ноутбуком.');
});
test('an API description feeds retrieval without adding fixed work labels or scripts',()=>{
 const p=fromKudaGo({results:[{id:1,title:'Кафе',site_url:'https://kudago.com/spb/place/test/',categories:['cafes'],
 body_text:'<p>Можно работать с ноутбуком.</p><script>alert(1)</script>'}]},{checkedAt:'2026-10-10'})[0];
 assert.equal(p.features.length,0);assert.ok(!p.documents[0].text.includes('alert'));
 assert.equal(searchPlaces([p],{query:'поработать с ноутбуком',today}).results.length,1);
});
test('the screenshot filters use researched prices and keep an affordable work example',()=>{
 const places=JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url))).places;
 const r=searchPlaces(places,{query:'Поработать с ноутбуком в кафе или библиотеке',mood:'calm',category:'cafe',budget:1000,city:'Санкт-Петербург',today});
 assert.ok(![...r.results,...r.alternatives].some(x=>x.place.title==='Coffee 3'));
 assert.equal(r.alternatives.find(x=>x.place.title==='Бэнч').price.amount,290);
 assert.ok(r.alternatives.some(x=>x.place.title==='Бэнч'));
});

test('requests to verify an atmosphere do not become positive proof of it',()=>{
 const p={id:'uncertain',sources:[{url:'https://example.org'}],documents:[{kind:'description',text:'Тишина не обещана. Камерность и тишину уточни перед свиданием. Уютный зал с кофе.',source_url:'https://example.org',observed_at:'2026-10-10T12:00:00Z'}]};
 const a=analyseText(p,['quiet','chamber_space','cozy'],{},new Date('2026-10-11T12:00:00Z'));
 assert.equal(a.evidence.quiet.positive.length,0);assert.equal(a.evidence.chamber_space.positive.length,0);assert.equal(a.evidence.cozy.positive.length,1);
});
