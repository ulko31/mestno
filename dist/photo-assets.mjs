export function photoUrl(value){
  if(typeof value!=='string')return null;
  if(/^photos\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(value))return value;
  try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
