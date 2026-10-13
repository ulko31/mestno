import importlib.util
from pathlib import Path
import unittest
from datetime import datetime

spec=importlib.util.spec_from_file_location('library_collector',Path(__file__).resolve().parents[1]/'scripts/collect_library_events.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
TODAY=datetime(2026,10,13,12,tzinfo=module.MOSCOW)
URL='https://lermontovka-spb.ru/events/14_10_26_club/'
def page(title='Разговорный клуб на французском',text='Участие бесплатное. Нужна регистрация. Уровень B2. 12+',venue='Библиотека',path='/library/test/',date='14 октября'):
    return f'''<div class="event-detail"><h1>{title}</h1><div class="event-tags"><a href="{path}">{venue}</a></div>
    <div class="event-detail-time">18:00 – 19:30</div><div class="event-detail-date">{date}</div><div class="event-detail-adress">Адрес: ул. Тестовая, 1 Ст. м. Центр</div></div>
    <div class="person-detail-text">{text}</div><script>point={{lat: '59.9', lon: '30.3'}};</script>'''

class LibraryEventsTest(unittest.TestCase):
    def test_dated_free_club_has_coordinates_language_and_requirements(self):
        p=module.parse_event(page(),URL,TODAY);e=p['offers'][0]
        self.assertEqual(p['address'],'ул. Тестовая, 1');self.assertEqual((p['lat'],p['lon']),(59.9,30.3))
        self.assertEqual(e['price']['amount'],0);self.assertIn('french_club',e['activities']);self.assertIn('B2',e['requirements'])
        self.assertEqual(e['starts_at'],'2026-10-14T18:00:00+03:00');self.assertEqual(e['ends_at'],'2026-10-14T19:30:00+03:00')
    def test_historic_undated_off_domain_and_mismatched_dates_are_skipped(self):
        for url in ['https://lermontovka-spb.ru/events/14_10_24_club/','https://lermontovka-spb.ru/events/14_10_club/','https://example.org/events/14_10_26_club/']:
            self.assertIsNone(module.parse_event(page(),url,TODAY))
        self.assertIsNone(module.parse_event(page(date='15 октября'),URL,TODAY))
    def test_cancelled_online_and_nonparticipatory_events_are_skipped(self):
        for title in ['Отмена: Разговорный клуб','Онлайн разговорный клуб','Лекция об искусстве']:
            self.assertIsNone(module.parse_event(page(title=title),URL,TODAY))
        self.assertIsNone(module.parse_event(page(text='Встреча отменена.'),URL,TODAY))
    def test_free_entry_does_not_erase_a_material_fee(self):
        p=module.parse_event(page(title='Мастер-класс: коллаж',text='Вход свободный. Стоимость материалов 300 руб.'),URL,TODAY)
        self.assertIsNone(p['offers'][0]['price'])
    def test_childrens_programme_is_not_marked_as_an_adult_meetup(self):
        p=module.parse_event(page(title='Мастер-класс',venue='Детская библиотека'),URL,TODAY)
        self.assertEqual(p['offers'][0]['audience'],'children');self.assertIn('child_friendly',p['offers'][0]['activities'])
    def test_open_workshops_use_existing_venue_and_links_are_deduplicated(self):
        p=module.parse_event(page(title='Мастер-класс',path='/center/otkrytye-masterskie/'),URL,TODAY)
        self.assertEqual(p['id'],'seed:workshops')
        html=f'<a href="{URL}">1</a><a href="{URL}#x">2</a><a href="https://example.org/events/a">3</a>'
        self.assertEqual(module.links(html,'/events/'),[URL])

if __name__=='__main__':unittest.main()
