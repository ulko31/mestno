import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createBot} from '../bot/core.mjs';
import {createServer} from '../bot/server.mjs';
import {telegramClient,configureTelegram} from '../bot/telegram.mjs';
const catalogue=JSON.parse(fs.readFileSync(new URL('../dist/places.json',import.meta.url)));
const when=+new Date('2026-10-11T12:00:00Z'),app='https://example.org/';
const message=(text,extra={})=>({update_id:1,message:{chat:{id:123,type:'private'},from:{id:123,is_bot:false},text,...extra}});
test('bot and Mini App use the same reviewed scenario and link to a particular card',async()=>{
 const bot=createBot({catalogue,miniAppUrl:app,now:()=>when});
 const actions=await bot.handle(message('Мастер-класс, познакомиться с новыми людьми до 3500 рублей'));
 assert.ok(actions.length>=2);assert.ok(actions.some(x=>x.args.text.includes('Керамишная')));
 for(const a of actions){assert.equal(a.method,'sendMessage');const href=a.args.reply_markup.inline_keyboard[0][0].web_app.url;assert.ok(new URL(href).searchParams.get('place'));}
 assert.ok(actions.every(x=>!x.args.text.includes('CulinaryOn')));
});
test('unknown price is not silently sold as within budget and the bot gives an app fallback',async()=>{
 const bot=createBot({catalogue,miniAppUrl:app,now:()=>when});
 const actions=await bot.handle(message('Книжный клуб, познакомиться с людьми до 1000 рублей'));
 assert.equal(actions.length,1);assert.match(actions[0].args.text,/цена неизвестна/);
 assert.equal(new URL(actions[0].args.reply_markup.inline_keyboard[0][0].web_app.url).searchParams.get('query'),'Книжный клуб, познакомиться с людьми до 1000 рублей');
});
test('private beta IDs and private chats are respected',async()=>{
 const bot=createBot({catalogue,miniAppUrl:app,now:()=>when,allowedUserIds:[777]});
 assert.match((await bot.handle(message('/start')))[0].args.text,/закрытом/);
 const group=message('/start');group.message.chat.type='group';assert.deepEqual(await bot.handle(group),[]);
});
test('nearby asks for a one-time point and expires stored coordinates after ten minutes',async()=>{
 let now=when;const bot=createBot({catalogue,miniAppUrl:app,now:()=>now});
 const ask=await bot.handle(message('Кафе рядом со мной'));
 assert.equal(ask[0].args.reply_markup.keyboard[0][0].request_location,true);
 assert.equal(bot.sessionCount(),1);
 const actions=await bot.handle(message('',{location:{latitude:59.93,longitude:30.31}}));
 assert.ok(actions.some(x=>x.args.text.includes('км по прямой')));
 now+=11*60*1000;const after=await bot.handle(message('Кафе'));
 assert.ok(after.every(x=>!x.args.text.includes('км по прямой')));
 await bot.handle(message('/forget'));assert.equal(bot.sessionCount(),0);
});
test('live location does not become a tracking service',async()=>{
 const bot=createBot({catalogue,miniAppUrl:app,now:()=>when});
 assert.match((await bot.handle(message('',{location:{latitude:59.9,longitude:30.3,live_period:3600}})))[0].args.text,/разовая точка/);
});
test('a social link is acknowledged without pretending to have read the video',async()=>{
 const bot=createBot({catalogue,miniAppUrl:app,now:()=>when});
 const r=await bot.handle(message('https://www.instagram.com/reel/test/'));
 assert.match(r[0].args.text,/сбор Instagram\/TikTok пока не подключён/);
});
test('outgoing HTML escapes venue or source text',async()=>{
 const p={id:'x',title:'<script>bad</script>',city:'Санкт-Петербург',category:'cafe',features:[],sources:[{url:app}],address:'a'};
 const bot=createBot({catalogue:{places:[p]},miniAppUrl:app,now:()=>when});
 const text=(await bot.handle(message('кафе')))[0].args.text;
 assert.ok(!text.includes('<script>'));assert.ok(text.includes('&lt;script&gt;'));
});
test('Telegram transport redacts credentials from network failures and provider errors',async()=>{
 const token='123456:'+('a'.repeat(30));
 const call=telegramClient({token,fetcher:async url=>{throw new Error('failed '+url);}});
 await assert.rejects(call('sendMessage'),err=>!err.message.includes(token)&&err.message.includes('недоступен'));
 const reject=telegramClient({token,fetcher:async()=>({ok:false,status:401,json:async()=>({ok:false,error_code:401,description:token})})});
 await assert.rejects(reject('getMe'),err=>!err.message.includes(token)&&err.message.includes('401'));
});
test('webhook setup refuses an existing unrelated bot integration',async()=>{
 const calls=[];const call=async(method,args)=>{calls.push(method);return method==='getMe'?{username:'mestno_bot'}:method==='getWebhookInfo'?{url:'https://other.example.org/hook'}:true;};
 await assert.rejects(configureTelegram({call,appUrl:app,webhookUrl:'https://example.org/telegram/webhook',secret:'a'.repeat(32)}),/другой webhook/);
 assert.deepEqual(calls,['getMe','getWebhookInfo']);
});
test('webhook registration installs restricted updates, menu and commands without printing a token',async()=>{
 const calls=[];const call=async(method,args)=>{calls.push({method,args});return method==='getMe'?{username:'mestno_bot'}:method==='getWebhookInfo'?{url:''}:true;};
 await configureTelegram({call,appUrl:app,webhookUrl:'https://example.org/telegram/webhook',secret:'a'.repeat(32)});
 assert.deepEqual(calls.find(x=>x.method==='setWebhook').args.allowed_updates,['message']);
 assert.equal(calls.find(x=>x.method==='setChatMenuButton').args.menu_button.web_app.url,app);
});
async function withServer(options,run){
 const server=createServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
}
test('HTTP webhook requires the configured secret and rejects invalid input',async()=>{
 let handled=0;await withServer({bot:{handle:async()=>{handled++;return [];}},call:async()=>{},secret:'a'.repeat(32)},async base=>{
  let res=await fetch(base+'/telegram/webhook',{method:'POST',body:'{}'});assert.equal(res.status,403);assert.equal(handled,0);
  res=await fetch(base+'/telegram/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':'a'.repeat(32)},body:'{'});assert.equal(res.status,400);assert.equal(handled,0);
 });
});
test('duplicate concurrent Telegram updates do not send the same recommendations twice',async()=>{
 let handled=0,sent=0;await withServer({bot:{handle:async()=>{handled++;return [{method:'sendMessage',args:{chat_id:1,text:'test'}}];}},call:async()=>{sent++;},secret:'a'.repeat(32)},async base=>{
  const opts={method:'POST',headers:{'x-telegram-bot-api-secret-token':'a'.repeat(32)},body:JSON.stringify({update_id:11})};
  const r=await Promise.all([fetch(base+'/telegram/webhook',opts),fetch(base+'/telegram/webhook',opts)]);
  assert.ok(r.every(x=>x.status===200));assert.equal(handled,1);assert.equal(sent,1);
 });
});
test('a partial send failure retries the remaining cards rather than resending completed ones',async()=>{
 let calls=[],failure=true;await withServer({bot:{handle:async()=>[{method:'sendMessage',args:{text:'a'}},{method:'sendMessage',args:{text:'b'}}]},
  call:async(m,args)=>{calls.push(args.text);if(args.text==='b'&&failure){failure=false;throw new Error('temporary');}},secret:'a'.repeat(32)},async base=>{
  const opts={method:'POST',headers:{'x-telegram-bot-api-secret-token':'a'.repeat(32)},body:JSON.stringify({update_id:12})};
  assert.equal((await fetch(base+'/telegram/webhook',opts)).status,502);
  assert.equal((await fetch(base+'/telegram/webhook',opts)).status,200);assert.deepEqual(calls,['a','b','b']);
 });
});
test('an unconfigured deployment reports its state and never accepts bot messages',async()=>{
 await withServer({},async base=>{
  assert.equal((await (await fetch(base+'/healthz')).json()).bot_configured,false);
  assert.equal((await fetch(base+'/telegram/webhook',{method:'POST',body:'{}'})).status,503);
  assert.equal((await fetch(base+'/')).status,404);
 });
});
test('opt-in app hosting serves assets with correct MIME and does not expose the bot source or env files',async()=>{
 await withServer({serveApp:true},async base=>{
  const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/Местно/);
  const js=await fetch(base+'/pricing.mjs');assert.match(js.headers.get('content-type'),/javascript/);
  assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/../bot/server.mjs')).status,404);
  const data=await fetch(base+'/places.json');assert.equal((await data.json()).places.length,catalogue.places.length);
 });
});
