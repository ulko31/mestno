import test from 'node:test';
import assert from 'node:assert/strict';
import {fromKudaGo,loadKudaGo,loadKudaGoReviews,mergeCatalogues} from '../dist/providers.mjs';
const row=(id,extra={})=>({id,title:'Место '+id,address:'улица, '+id,coords:{lat:59.93,lon:30.31},categories:['cafes'],
  site_url:'https://kudago.com/spb/place/test-'+id+'/',...extra});
const catalogue=places=>({schema_version:1,places});
test('API metadata never invents mood, prices, photos or free activities',()=>{
  const p=fromKudaGo({results:[row(1,{description:'UNUSED',images:[{image:'https://example.org/photo'}],is_free:true})]})[0];
  assert.equal(p.category,'cafe');assert.deepEqual(p.features,[]);assert.equal(p.price_max,null);
  assert.equal(p.city,'Санкт-Петербург');assert.equal(p.documents[0].text,'UNUSED');assert.ok(!p.images);
  assert.equal(p.documents[0].kind,'description');assert.equal(p.documents[0].source_url,p.sources[0].url);
});
test('closed or unattributed API records are excluded, actual coordinates are retained',()=>{
  const p=fromKudaGo({results:[row(1),row(2,{is_closed:true}),row(3,{site_url:null})]});
  assert.equal(p.length,1);assert.equal(p[0].lat,59.93);
});
test('pagination is bounded, reports progress and deduplicates repeated source IDs',async()=>{
  let calls=0;const progress=[];
  const result=await loadKudaGo({maxPages:2,fetcher:async url=>{
    assert.ok(url.startsWith('https://kudago.com/public-api/v1.4/places/'));
    calls++;return {ok:true,json:async()=>({count:1000,next:'https://kudago.com/public-api/v1.4/places/?page=3',results:[row(1),row(calls+1)]})};
  },onProgress:p=>progress.push(p)});
  assert.equal(calls,2);assert.equal(result.catalogue.places.length,3);assert.equal(result.truncated,true);assert.equal(progress.length,2);
});
test('a failed later page never returns a partial success to the interface',async()=>{
  let calls=0;
  await assert.rejects(loadKudaGo({fetcher:async()=>++calls===1?{ok:true,json:async()=>({results:[row(1)],next:'next'})}:{ok:false,status:403}}),/403/);
});
test('cancellation after a pending response prevents installing its records',async()=>{
  const controller=new AbortController();
  await assert.rejects(loadKudaGo({signal:controller.signal,fetcher:async()=>{
    controller.abort();return {ok:true,json:async()=>({results:[row(1)]})};
  }}),/отменена/);
});
test('fresh baseline evidence survives a previous cached catalogue',()=>{
  const p=fromKudaGo({results:[row(1)]})[0];
  const fresh={...p,features:[{key:'lounge',value:true,status:'documented',source_url:p.sources[0].url,checked_at:'2026-10-11'}]};
  const merged=mergeCatalogues(catalogue([fresh]),catalogue([p]));
  assert.equal(merged.places[0].features.length,1);assert.equal(merged.places.length,1);
  assert.equal(p.features.length,0);
});
test('same name and address in different cities never merges branches',()=>{
  const a=fromKudaGo({results:[row(1)]})[0];
  const b={...a,id:'kudago:2',city:'Москва'};
  assert.equal(mergeCatalogues(catalogue([a]),catalogue([b])).places.length,2);
});
test('duplicate source observations with different time scope are preserved',()=>{
  const p=fromKudaGo({results:[row(1)]})[0];
  const f={key:'quiet',value:true,status:'documented',source_url:p.sources[0].url,checked_at:'2026-10-11'};
  const result=mergeCatalogues(catalogue([{...p,features:[{...f,scope:'weekday_morning'}]}]),catalogue([{...p,features:[f]}]));
  assert.equal(result.places[0].features.length,2);
});
test('invalid API geometry and unsupported cities are rejected',async()=>{
  assert.throws(()=>fromKudaGo({results:[row(1,{coords:{lat:999,lon:30}})]}));
  await assert.rejects(loadKudaGo({city:'unsupported'}),/город/);
});
test('browser review import keeps attributed prose without author profiles or false verified facts',async()=>{
 const places=fromKudaGo({results:[row(1,{comments_count:3})]});
 const r=await loadKudaGoReviews({catalogue:catalogue(places),fetcher:async url=>{
   assert.ok(url.includes('/1/comments/'));assert.ok(!new URL(url).searchParams.get('fields').includes('user'));
   return {ok:true,json:async()=>({results:[{id:2,text:'Работала с ноутбуком. Есть розетки.',date_posted:'2026-10-10'},
     {id:3,text:'Удалено',date_posted:'2026-10-10',is_deleted:true}]})};
 }});
 assert.equal(r.reviewCount,1);assert.equal(r.catalogue.places[0].documents[0].kind,'review');
 assert.equal(r.catalogue.places[0].features.length,0);
});
test('a failed review endpoint preserves the catalogue and cannot return a fake completed import',async()=>{
 const cat=catalogue(fromKudaGo({results:[row(1,{comments_count:1})]}));const before=JSON.stringify(cat);
 await assert.rejects(loadKudaGoReviews({catalogue:cat,fetcher:async()=>({ok:false,status:403})}),/403/);
 assert.equal(JSON.stringify(cat),before);
});
test('a newer review snapshot removes old deleted reviews while preserving descriptions',()=>{
 const p=fromKudaGo({results:[row(1,{description:'Описание'})]})[0],ref=p.sources[0].url;
 const old={...p,documents:[...p.documents,{id:'r:1',kind:'review',text:'Удалённый отзыв',source_url:ref,observed_at:'2026-10-01',retrieved_at:'2026-10-01'}],review_snapshots:{[ref]:'2026-10-01'}};
 const fresh={...p,review_snapshots:{[ref]:'2026-10-10'}};
 const merged=mergeCatalogues(catalogue([old]),catalogue([fresh]));
 assert.equal(merged.places[0].documents.length,1);assert.equal(merged.places[0].documents[0].kind,'description');
 assert.equal(mergeCatalogues(merged,catalogue([old])).places[0].documents.length,1);
});
