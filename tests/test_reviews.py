import sys
import unittest
from datetime import datetime,timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from collect_reviews import aggregate_comments,extract_signals,review_documents,select_places
from import_signals import queue_signals
TODAY=datetime(2026,10,11,tzinfo=timezone.utc)
PLACE={'id':'kudago:1','sources':[{'url':'https://kudago.com/spb/place/example/'}]}
def comment(text,date='2026-10-10T12:00:00Z',user=None,**extra):
    return {'text':text,'date_posted':date,'user':user or {'display_name':'VISITOR NAME','avatar':'AVATAR URL'},**extra}

class ReviewTests(unittest.TestCase):
    def test_negation_does_not_turn_noise_into_quiet(self):
        self.assertIn(('quiet',False,None),extract_signals('Очень шумно, громкая музыка.'))
        self.assertNotIn(('quiet',True,None),extract_signals('Не тихо.'))
        self.assertIn(('quiet',True,None),extract_signals('Не шумно.'))
    def test_conditional_observation_is_never_unconditional(self):
        signals=extract_signals('В будни утром тихо, вечером шумно.')
        self.assertNotIn(('quiet',True,None),signals)
        self.assertTrue(all(s[2] is not None for s in signals if s[0]=='quiet'))
    def test_stale_future_deleted_and_reply_comments_are_excluded(self):
        rows=[comment('Тихо.',date='2025-01-01'),comment('Тихо.',date='2027-01-01'),
              comment('Тихо.',is_deleted=True),comment('Тихо.',reply_to=12)]
        self.assertEqual(aggregate_comments(PLACE,rows,TODAY),[])
    def test_duplicate_text_is_not_a_second_vote_and_no_identity_or_verbatim_is_saved(self):
        rows=[comment('Тихо. Есть розетки.'),comment('Тихо. Есть розетки.',user={'display_name':'OTHER'})]
        pending=aggregate_comments(PLACE,rows,TODAY)
        self.assertTrue(all(s['evidence_count']==1 for s in pending))
        encoded=str(pending)
        for text in ['VISITOR NAME','AVATAR URL','Есть розетки.','OTHER']:self.assertNotIn(text,encoded)
    def test_conflicting_reports_remain_separate_pending_signals(self):
        pending=aggregate_comments(PLACE,[comment('Тихо.'),comment('Очень шумно.')],TODAY)
        self.assertEqual({s['value'] for s in pending},{True,False})
        self.assertTrue(all(s['status']=='pending_review' and s['opposing_mentions']==1 for s in pending))
        self.assertEqual(len(queue_signals(pending)),2)
    def test_search_documents_contain_dated_prose_with_attribution_and_without_profile_fields(self):
        rows=[comment('Работала с ноутбуком. Email me@example.org. <script>bad()</script>',id=1)]
        docs=review_documents(PLACE,rows,TODAY)
        self.assertEqual(len(docs),1)
        self.assertIn('Работала с ноутбуком.',docs[0]['text'])
        self.assertEqual(docs[0]['kind'],'review')
        self.assertEqual(docs[0]['source_url'],PLACE['sources'][0]['url'])
        for word in ['VISITOR NAME','AVATAR URL','me@example.org','bad()']:self.assertNotIn(word,str(docs))
    def test_corpus_preserves_recent_and_historical_reviews_but_excludes_deleted_duplicate_and_future(self):
        rows=[comment('Работала с ноутбуком.',id=1),comment('Работала с ноутбуком.',id=2),
              comment('Старый отзыв.',id=3,date='2025-02-01'),comment('Удалённый.',id=4,is_deleted=True),
              comment('Из будущего.',id=5,date='2027-01-01')]
        docs=review_documents(PLACE,rows,TODAY)
        self.assertEqual(len(docs),2)
        self.assertEqual(docs[0]['id'],'kudago:comment:1')
    def test_review_collection_samples_different_formats_instead_of_only_top_landmarks(self):
        places=[{'id':'a','category':'museum','comments_count':100},
                {'id':'b','category':'museum','comments_count':90},
                {'id':'c','category':'cafe','comments_count':10}]
        self.assertEqual({p['id'] for p in select_places(places,2)},{'a','c'})

if __name__=='__main__':unittest.main()
