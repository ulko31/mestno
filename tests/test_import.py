import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from import_places import kudago_places,osm_places,merge,base,source,validate
from import_signals import queue_signals

class ImportTests(unittest.TestCase):
    def test_closed_kudago_skipped_and_no_description_copied(self):
        records=list(kudago_places({'results':[{'id':1,'title':'Venue','address':'Street 1','coords':{'lat':59.9,'lon':30.3},'categories':['cafes'],'site_url':'https://kudago.com/spb/place/one/','description':'VERBATIM MUST NOT COPY'}, {'id':2,'title':'Closed','is_closed':True}]}))
        self.assertEqual(len(records),1)
        self.assertNotIn('description',records[0])
        self.assertEqual(records[0]['category'],'cafe')
    def test_osm_fee_is_entry_only(self):
        p=list(osm_places({'elements':[{'id':1,'type':'node','lat':59.9,'lon':30.3,'tags':{'name':'Venue','sport':'billiards','fee':'no'}}]}))[0]
        self.assertIn('free_entry',[f['key'] for f in p['features']])
        self.assertNotIn('free_billiards',[f['key'] for f in p['features']])
    def test_private_objects_skipped(self):
        self.assertEqual(list(osm_places({'elements':[{'id':1,'type':'node','tags':{'name':'Private','access':'private'}}]})),[])
    def test_branches_not_merged_by_name(self):
        a=base('a','Chain','cafe','Street 1',None,None,[source('https://example.org/a','X','Facts')])
        b=base('b','Chain','cafe','Street 2',None,None,[source('https://example.org/b','X','Facts')])
        self.assertEqual(len(merge([a],[b])),2)
        b['address']='Street 1'
        self.assertEqual(len(merge([a],[b])),1)
    def test_duplicate_import_idempotent(self):
        a=base('a','Name','cafe',None,None,None,[source('https://example.org/a','X','Facts')])
        self.assertEqual(len(merge([a],[a])),1)
        self.assertEqual(len(merge([a],[a])[0]['sources']),1)
    def test_invalid_coordinate_rejected(self):
        a=base('a','Name','cafe',None,999,30,[source('https://example.org/a','X','Facts')])
        with self.assertRaises(ValueError):validate([a])
    def test_social_signals_need_permission_and_are_pending(self):
        row={'place_id':'a','feature':'quiet','value':True,'source_url':'https://example.org/post','source_family':'author:one','use_permitted':True}
        self.assertEqual(queue_signals([row,row])[0]['status'],'pending_review')
        self.assertEqual(len(queue_signals([row,row])),1)
        with self.assertRaises(ValueError):queue_signals([{**row,'use_permitted':False}])

if __name__=='__main__':unittest.main()
