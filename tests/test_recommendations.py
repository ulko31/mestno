import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from import_recommendations import parse_recommendations

class RecommendationImportTests(unittest.TestCase):
    def row(self,**kwargs):
        return dict(title='Студия',address='Улица, 1',city='Санкт-Петербург',source_url='https://example.org/post',
            original_note='Групповой мастер-класс для новичков.',note_is_original=True,submitted_at='2026-10-11T12:00:00Z',**kwargs)

    def test_duplicates_are_drafts_and_unverified_prices_are_discarded(self):
        row=self.row(price=10,photos=['unlicensed.jpg'],status='reviewed')
        result=parse_recommendations(dict(schema_version=1,recommendations=[row,row]))
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['status'],'pending_review')
        self.assertEqual(result[0]['price_status'],'not_checked')
        self.assertNotIn('price',result[0]);self.assertNotIn('photos',result[0])

    def test_invalid_sources_types_and_original_notes_are_rejected(self):
        for change in [dict(source_url='javascript:alert(1)'),dict(source_url='https://user:secret@example.org/'),
                dict(note_is_original=False),dict(title=123),dict(original_note=''),dict(submitted_at='yesterday')]:
            with self.subTest(change=change),self.assertRaises(ValueError):
                parse_recommendations(dict(schema_version=1,recommendations=[{**self.row(),**change}]))

    def test_invalid_export_does_not_become_a_catalogue(self):
        for payload in [[],dict(schema_version=2,recommendations=[]),dict(schema_version=1,recommendations=[{}]*5001)]:
            with self.assertRaises(ValueError):parse_recommendations(payload)

if __name__=='__main__':unittest.main()
