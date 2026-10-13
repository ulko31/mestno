import {mergeCatalogues} from './providers.mjs?v=20261013b';
import {validateCatalogue} from './search.mjs?v=20261013b';
export function applyEnrichment(catalogue,incoming){
  validateCatalogue(incoming);const current=structuredClone(validateCatalogue(catalogue)),r=incoming.collection_report;
  // A complete official snapshot may remove cancelled or withdrawn library events.
  if(incoming.source_url==='https://lermontovka-spb.ru/events/'&&r?.fetched_events===r?.candidate_events&&Array.isArray(r?.errors)&&r.errors.length===0){
    for(const p of current.places)p.offers=(p.offers||[]).filter(e=>!e.id.startsWith('lermontovka:events/'));
  }
  const result=mergeCatalogues(current,incoming);
  // Curated enrichments replace placeholder descriptions and correct a known branch.
  // Browser imports still use the conservative generic catalogue merge.
  for(const next of incoming.places){
    const p=result.places.find(x=>x.id===next.id);if(!p)continue;
    if(next.updated_at&&new Date(next.updated_at)>=new Date(p.updated_at||0)){
      for(const key of ['title','notes','address','category','website','updated_at','discovery_priority','coordinate_source_url','coordinate_precision'])if(next[key]!==undefined&&next[key]!==null)p[key]=next[key];
      const primary=next.sources[0];p.sources=[primary,...p.sources.filter(s=>s.url!==primary.url)];
    }
  }
  return validateCatalogue(result);
}
