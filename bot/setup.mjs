import {telegramClient,configureTelegram} from './telegram.mjs';
const env=process.env;
try{
  const call=telegramClient({token:env.BOT_TOKEN});
  const base=env.WEBHOOK_ORIGIN||env.RENDER_EXTERNAL_URL;
  const result=await configureTelegram({call,appUrl:env.MINI_APP_URL||base,webhookUrl:new URL('/telegram/webhook',base).href,
    secret:env.WEBHOOK_SECRET,allowReplace:env.BOT_ALLOW_REPLACE_WEBHOOK==='true'});
  console.log('Подключён @'+result.username);
}catch(err){console.error(err.message);process.exitCode=1;}
