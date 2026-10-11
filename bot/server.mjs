import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {createBot} from './core.mjs';
import {telegramClient,configureTelegram} from './telegram.mjs';
import {validateCatalogue} from '../dist/search.mjs';
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.zip':'application/zip'};
function equalSecret(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
async function body(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>65536)throw new Error('payload_too_large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createServer({bot=null,call=null,secret='',serveApp=false}={}){
  const completed=new Map(),inFlight=new Map(),deliveries=new Map();
  async function deliver(update){
    const id=update?.update_id;if(!Number.isSafeInteger(id))throw new Error('bad_update');
    if(completed.has(id))return;
    if(inFlight.has(id))return inFlight.get(id);
    const work=(async()=>{
      let progress=deliveries.get(id);
      if(!progress){progress={actions:await bot.handle(update),index:0};deliveries.set(id,progress);}
      while(progress.index<progress.actions.length){const action=progress.actions[progress.index];await call(action.method,action.args);progress.index++;}
      deliveries.delete(id);
      completed.set(id,Date.now());if(completed.size>5000)completed.delete(completed.keys().next().value);
    })();inFlight.set(id,work);try{await work;}finally{inFlight.delete(id);}
  }
  return http.createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&pathname==='/healthz')return json(res,200,{status:'ok',bot_configured:Boolean(bot&&call&&secret)});
      if(pathname==='/telegram/webhook'){
        if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});
        if(!bot||!call||!secret)return json(res,503,{error:'bot_not_configured'});
        if(!equalSecret(req.headers['x-telegram-bot-api-secret-token'],secret))return json(res,403,{error:'forbidden'});
        let update;try{update=await body(req);}catch(err){return json(res,err.message==='payload_too_large'?413:400,{error:'invalid_payload'});}
        if(!Number.isSafeInteger(update?.update_id))return json(res,400,{error:'invalid_update'});
        await deliver(update);return json(res,200,{ok:true});
      }
      if(!serveApp||!['GET','HEAD'].includes(req.method))return json(res,404,{error:'not_found'});
      let relative;try{relative=decodeURIComponent(pathname).replace(/^\/+/, '')||'index.html';}catch{return json(res,400,{error:'invalid_path'});}
      const file=path.resolve(root,relative),extension=path.extname(file);
      if(!file.startsWith(root+path.sep)||!types[extension]||relative.split('/').some(p=>p.startsWith('.')))return json(res,404,{error:'not_found'});
      let info;try{info=await stat(file);}catch{return json(res,404,{error:'not_found'});}
      if(!info.isFile())return json(res,404,{error:'not_found'});
      const bytes=await readFile(file);
      res.writeHead(200,{'content-type':types[extension],'content-length':bytes.length,'cache-control':extension==='.json'?'no-cache':'public,max-age=300',
        'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch{return json(res,502,{error:'telegram_delivery_failed'});} // Do not log messages, coordinates or tokens.
  });
}
export async function start(env=process.env){
  const serveApp=env.SERVE_MINI_APP==='true';
  const origin=env.MINI_APP_URL||(serveApp?env.RENDER_EXTERNAL_URL:'');
  const token=env.BOT_TOKEN,secret=env.WEBHOOK_SECRET||'';
  const catalogue=validateCatalogue(JSON.parse(await readFile(path.join(root,'places.json'),'utf8')));
  const call=token?telegramClient({token}):null;
  const bot=call?createBot({catalogue,miniAppUrl:origin,allowedUserIds:(env.BOT_ALLOWED_USER_IDS||'').split(',').filter(Boolean)}):null;
  const server=createServer({bot,call,secret,serveApp});
  await new Promise(resolve=>server.listen(Number(env.PORT||10000),'0.0.0.0',resolve));
  console.log('HTTP server ready. Telegram:',bot?'configured':'not configured');
  if(bot&&env.AUTO_REGISTER_WEBHOOK==='true'){
    const webhookOrigin=env.WEBHOOK_ORIGIN||env.RENDER_EXTERNAL_URL;
    try{const result=await configureTelegram({call,appUrl:origin,webhookUrl:new URL('/telegram/webhook',webhookOrigin).href,secret,
      allowReplace:env.BOT_ALLOW_REPLACE_WEBHOOK==='true'});console.log('Telegram configured: @'+result.username);
    }catch(err){console.error(err.message);}
  }
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)start().catch(()=>{console.error('Server startup failed. Check BOT_TOKEN, WEBHOOK_SECRET and MINI_APP_URL.');process.exitCode=1;});
