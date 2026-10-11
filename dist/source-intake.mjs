// Collect original descriptions and links for editorial review; never scrape a login wall.
export function recommendationDraft({url,title,address='',city='Санкт-Петербург',note='',noteIsOriginal=false},today=new Date()){
  let parsed;try{parsed=new URL(url);}catch{throw new Error('Нужна ссылка на публикацию или страницу места.');}
  if(!/^https?:$/.test(parsed.protocol)||parsed.username||parsed.password)throw new Error('Проверь ссылку на источник.');
  if(!String(title).trim()||String(title).length>250)throw new Error('Укажи название места, до 250 знаков.');
  if(!String(note).trim()||String(note).length>2000)throw new Error('Коротко опиши, почему это место интересно, до 2000 знаков.');
  if(!noteIsOriginal)throw new Error('Добавь собственное описание вместо копии публикации.');
  return {source_url:parsed.href,title:String(title).trim(),address:String(address).trim().slice(0,500),city:String(city).trim().slice(0,150),
    original_note:String(note).trim(),note_is_original:true,status:'pending_review',submitted_at:new Date(today).toISOString()};
}
