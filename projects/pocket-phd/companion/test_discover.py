import unittest
from unittest.mock import patch
import discover

class DiscoveryTests(unittest.TestCase):
    def test_scholarly_engine_selection(self):
        self.assertEqual(discover.science_engines({'engines':[{'name':'bing'},{'name':'pubmed'},{'name':'crossref'}]}),['crossref','pubmed'])
        self.assertEqual(discover.science_engines({'engines':[{'name':'bing'}]}),[])
    def test_local_endpoint_only(self):
        for url in ['https://evil.test','http://user:pw@localhost:8889','http://localhost:8889/?key=x','file:///tmp/test']:
            with self.assertRaises(ValueError):discover.local_endpoint(url)
        self.assertEqual(discover.local_endpoint('http://127.0.0.1:8889/'),'http://127.0.0.1:8889')
    def test_dedupe_and_no_snippet_as_evidence(self):
        data={'results':[{'title':'Study','url':'https://doi.org/10.1/abc','content':'Search snippet','engines':['pubmed']},{'title':'Duplicate','url':'https://doi.org/10.1/abc'},{'title':'Bad','url':'javascript:alert(1)'}]}
        sources=discover.searx_sources(data)
        self.assertEqual(len(sources),1);self.assertEqual(sources[0]['abstract'],'')
        self.assertIn('metadata only',sources[0]['extraction']['provider'])
    def test_crossref_metadata(self):
        data={'message':{'items':[{'title':['Study'],'DOI':'10.1/abc','abstract':'<jats:p>Known abstract</jats:p>','author':[{'given':'A','family':'B'}],'issued':{'date-parts':[[2020]]}}]}}
        source=discover.crossref_sources(data)[0]
        self.assertEqual(source['abstract'],'Known abstract');self.assertEqual(source['year'],2020)
        self.assertEqual(source['authors'],['A B'])
    def test_title_relevance_before_result_limit(self):
        data={'results':[{'title':'Unrelated dictionary definition','url':'https://example.com/'+str(i)} for i in range(10)]+[{'title':'Sleep and retrieval practice strengthen memory','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC1/'}]}
        sources=discover.searx_sources(data,'retrieval practice sleep memory')
        self.assertEqual(len(sources),1)
        self.assertIn('retrieval practice',sources[0]['title'])
    def test_auto_fallback_is_explicit(self):
        with patch('discover.read_json',side_effect=[{'engines':[{'name':'bing'}]},{'message':{'items':[]}}]):
            result=discover.discover('public query')
        self.assertEqual(result['provider'],'Crossref');self.assertTrue(result['warnings'])
    def test_query_and_response_limits(self):
        for query in ['', 'x'*501]:
            with self.assertRaises(ValueError):discover.discover(query)
        self.assertEqual(discover.searx_sources({'results':[]}),[])

if __name__=='__main__':unittest.main()
