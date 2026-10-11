import test from 'node:test';
import assert from 'node:assert/strict';
import {fromKudaGo,loadKudaGo,mergeCatalogues} from '../dist/providers.mjs';
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
