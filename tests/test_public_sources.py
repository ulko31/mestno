import importlib.util
from pathlib import Path
import unittest,json,urllib.parse
from datetime import datetime,timezone
from unittest.mock import patch
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,Path(__file__).resolve().parents[1]/'scripts'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
social=load('public_social','collect_public_recommendations.py');water=load('waterfronts','collect_waterfronts.py');TODAY=datetime(2026,10,13,20,tzinfo=timezone.utc)
def bubble(text,date='2026-10-06T07:32:01Z',link=True):
 return '<div class="bubble"><div class="caption"><span class="txt">'+text+'</span><span class="bmeta">'+('<a class="bt-link" href="/channel/gotoeatspb/7261">'if link else '')+'<time datetime="'+date+'">10:32</time>'+('</a>'if link else '')+'</span></div></div>'
class PublicSourcesTest(unittest.TestCase):
 def test_own_post_id_is_separate_from_links_to_older_posts(self):
  html=bubble('<a href="/channel/gotoeatspb/3575">Ранее</a> Уютная кофейня, кофе. 📍 Большая Конюшенная, 9')
  r=social.parse_posts(html,'gotoeatspb',TODAY)[0]
  self.assertEqual(r['id'],'public:gotoeatspb:7261');self.assertEqual(r['addresses'],['Большая Конюшенная, 9']);self.assertIn('cozy',r['signals']);self.assertEqual(r['status'],'pending_review')
  self.assertNotIn('text',r);self.assertNotIn('photos',r)
 def test_standalone_post_uses_the_observed_page_url(self):
  r=social.parse_posts(bubble('Бильярд бесплатно. 📍 улица Пестеля, 27',link=False),'gotoeatspb',TODAY,'https://list.tg/channel/gotoeatspb/6988')[0]
  self.assertEqual(r['source_url'],'https://t.me/gotoeatspb/6988');self.assertTrue(r['free_game_reported'])
 def test_unknown_future_and_old_dates_are_not_invented(self):
  for date in ['', '2026-11-10T10:00:00Z','2024-01-01T10:00:00Z']:
   self.assertEqual(social.parse_posts(bubble('Кофе',date),'gotoeatspb',TODAY),[])
 def test_free_drinks_and_parking_do_not_prove_a_free_game(self):
  r=social.parse_posts(bubble('Бесплатная парковка. Бильярд платный. Напиток бесплатно.'),'gotoeatspb',TODAY)[0]
  self.assertFalse(r['free_game_reported'])
 def test_roundup_is_a_queue_and_not_a_single_verified_venue(self):
  r=social.parse_posts(bubble('Дайджест сентября: уютные кафе. 📍 адрес 1 📍 адрес 2'),'gotoeatspb',TODAY)[0]
  self.assertTrue(r['multiple_venues']);self.assertEqual(r['status'],'pending_review')
 def test_waterfront_coordinates_are_taken_from_the_published_map(self):
  opts=urllib.parse.quote(json.dumps({'center':['59.948672','30.261709'],'x':'59.948672','y':'30.261709'}))
  html='<h1>Набережная реки Смоленки</h1><div id="map-opts" data-o="'+opts+'"></div><p>Водная преграда: р. Смоленка Общая длина: 123 м</p>'
  p=water.parse_place(html,water.ORIGIN+'/embankments/naberezhnaya-reki-smolenki',TODAY)
  self.assertEqual((p['lat'],p['lon']),(59.948672,30.261709));self.assertIn('р. Смоленка',p['notes']);self.assertEqual(p['prices'],[])
 def test_missing_map_coordinates_stay_unknown_and_off_domain_is_rejected(self):
  html='<h1>Набережная реки</h1>'
  p=water.parse_place(html,water.ORIGIN+'/embankments/example',TODAY);self.assertIsNone(p['lat']);self.assertIsNone(p['lon'])
  self.assertIsNone(water.parse_place(html,'https://example.org/embankments/example',TODAY))
 def test_collectors_never_follow_credentials_or_unrelated_domains(self):
  for url in ['http://list.tg/channel/test','https://user:pass@list.tg/channel/test','https://example.org/channel/test']:
   self.assertFalse(social.allowed(url))

if __name__=='__main__':unittest.main()
