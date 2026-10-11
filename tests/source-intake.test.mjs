import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationDraft} from '../dist/source-intake.mjs';
import {priceFor} from '../dist/pricing.mjs';

const today=new Date('2026-10-11T12:00:00Z');
const input={url:'https://www.instagram.com/p/example/',title:' Студия глины ',note:'Общие занятия для новичков, можно прийти одной.',noteIsOriginal:true};
test('a social link becomes an attributed draft, with no invented reviews or prices',()=>{
  const row=recommendationDraft(input,today);
  assert.equal(row.title,'Студия глины');assert.equal(row.status,'pending_review');
  assert.equal(row.source_url,input.url);assert.equal(row.submitted_at,today.toISOString());
  assert.equal(row.reviews,undefined);assert.equal(row.price,undefined);
});
test('an unconfirmed original note, credentials and unsafe URLs cannot enter the review queue',()=>{
  for(const change of [{noteIsOriginal:false},{url:'javascript:alert(1)'},{url:'https://token:secret@example.org/'},{note:''}]){
    assert.throws(()=>recommendationDraft({...input,...change},today));
  }
});
test('a drink price cannot stand in for ceramic, painting or dance participation',()=>{
  const p={category:'cafe',prices:[{amount:290,currency:'RUB',scope:'visit',kind:'menu_order',checked_at:today.toISOString(),source_url:'https://example.org/menu'}]};
  for(const need of ['pottery','painting','cooking','improv','book_club','dance'])assert.equal(priceFor(p,{today,needs:[need]}),null);
  assert.equal(priceFor(p,{today,needs:['laptop_work']}).amount,290);
});
