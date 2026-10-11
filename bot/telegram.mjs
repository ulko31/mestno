export function telegramClient({token,fetcher=fetch}={}){
  if(!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token||''))throw new Error('Задай BOT_TOKEN в секретах сервера.');
  return async(method,args={})=>{
    if(!/^[A-Za-z]+$/.test(method))throw new Error('Неверный метод Telegram.');
    let response,data;
    try{response=await fetcher(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(25000)});
      data=await response.json();
    }catch{throw new Error('Telegram временно недоступен.');} // Never log the credential-bearing URL.
    if(!response.ok||!data.ok)throw new Error(`Telegram отклонил ${method} (${data.error_code||response.status}).`);
    return data.result;
  };
}
export async function configureTelegram({call,appUrl,webhookUrl,secret,allowReplace=false}={}){
  for(const value of [appUrl,webhookUrl])if(!value?.startsWith('https://'))throw new Error('Для Telegram нужны публичные HTTPS-адреса.');
  if(!/^[A-Za-z0-9_-]{32,256}$/.test(secret||''))throw new Error('WEBHOOK_SECRET должен содержать не менее 32 букв, цифр, _ или -.');
  const bot=await call('getMe'),info=await call('getWebhookInfo');
  if(info.url&&info.url!==webhookUrl&&!allowReplace)throw new Error('У бота уже другой webhook. Сначала проверь, что выбран нужный бот.');
  await call('setWebhook',{url:webhookUrl,secret_token:secret,allowed_updates:['message'],max_connections:2,drop_pending_updates:false});
  await call('setMyCommands',{commands:[{command:'start',description:'Найти своё место'},{command:'app',description:'Открыть приложение'},{command:'nearby',description:'Поиск рядом'},{command:'forget',description:'Удалить контекст и геопозицию'}]});
  await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Местно',web_app:{url:appUrl}}});
  return {username:bot.username};
}
