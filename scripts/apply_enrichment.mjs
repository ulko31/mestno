// Apply source-attributed enrichment to JSON and CSV without replacing OSM records.
import fs from 'node:fs';
import {applyEnrichment} from '../dist/enrichment.mjs';
import {validateCatalogue} from '../dist/search.mjs';
const target=new URL('../dist/places.json',import.meta.url);
let catalogue=validateCatalogue(JSON.parse(fs.readFileSync(target,'utf8')));
for(const input of process.argv.slice(2)){
  catalogue=applyEnrichment(catalogue,JSON.parse(fs.readFileSync(input,'utf8')));
}
const rows=catalogue.places;
fs.writeFileSync(target,JSON.stringify(catalogue)+'\n');
const columns=['id','title','city','category','address','lat','lon','price_max','price_scope','status','is_landmark','notes','source_urls','offer_count','photo_count'];
const cell=x=>{const s=String(x??'');return /[,"\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
fs.writeFileSync(new URL('../dist/places.csv',import.meta.url),[columns.join(','),...rows.map(p=>{const fields={...p,source_urls:p.sources.map(s=>s.url).join(' | '),offer_count:p.offers?.length||0,photo_count:p.photos?.length||0};return columns.map(k=>cell(fields[k])).join(',');})].join('\n')+'\n');
console.log(JSON.stringify({places:rows.length,offers:rows.reduce((n,p)=>n+(p.offers||[]).length,0),photos:rows.reduce((n,p)=>n+(p.photos||[]).length,0)}));
