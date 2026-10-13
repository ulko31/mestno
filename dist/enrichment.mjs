import {mergeCatalogues} from './providers.mjs?v=20261012';
import {validateCatalogue} from './search.mjs?v=20261012';
export function applyEnrichment(catalogue,incoming){
  validateCatalogue(incoming);const current=structuredClone(validateCatalogue(catalogue)),r=incoming.collection_report;
  // A complete official snapshot may remove cancelled or withdrawn library events.
  if(incoming.source_url==='https://lermontovka-spb.ru/events/'&&r?.fetched_events===r?.candidate_events&&Array.isArray(r?.errors)&&r.errors.length===0){
    for(const p of current.places)p.offers=(p.offers||[]).filter(e=>!e.id.startsWith('lermontovka:events/'));
  }
  return mergeCatalogues(current,incoming);
}
