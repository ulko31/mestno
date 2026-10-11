export function placeLink(base,id,offerId=''){
  const url=new URL(base);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Mini App нужен HTTPS.');
  url.searchParams.set('place',id);if(offerId)url.searchParams.set('offer',offerId);
  return url.href;
}
export function linkedPlace({href='',startParam=''}={}){
  try{
    const url=new URL(href||'https://example.org');
    let id=url.searchParams.get('place'),offer=url.searchParams.get('offer')||'';
    if(!id&&startParam.startsWith('place_'))id=decodeURIComponent(startParam.slice(6));
    return typeof id==='string'&&id.length<=200?{id,offer}:null;
  }catch{return null;}
}
