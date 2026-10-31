"""Discover scholarly metadata; never crawl result URLs or infer findings."""
import argparse
from datetime import datetime, timezone
import json
import re
import ssl
import sys
from urllib.parse import urlencode, urlsplit
from urllib.request import urlopen

SCIENCE_ENGINES={'arxiv','pubmed','crossref','europepmc','openalex'}

def local_endpoint(value):
    p=urlsplit(value)
    if p.scheme!='http' or p.hostname not in ('localhost','127.0.0.1','::1') or p.username or p.password or p.query or p.fragment or p.path not in ('','/'):
        raise ValueError('SearXNG endpoint must be an HTTP loopback origin without credentials or path')
    return value.rstrip('/')

def read_json(url):
    context=ssl.create_default_context()
    try:
        import certifi
        context=ssl.create_default_context(cafile=certifi.where())
    except ImportError:pass
    with urlopen(url,timeout=20,context=context) as response:
        raw=response.read(2_000_001)
    if len(raw)>2_000_000:raise ValueError('Metadata response exceeds 2 MB')
    return json.loads(raw)

def science_engines(config):
    return sorted(e['name'] for e in config.get('engines',[]) if e.get('name') in SCIENCE_ENGINES and e.get('enabled',True))

def safe_url(value):
    if not isinstance(value,str) or len(value)>2000:return None
    try:p=urlsplit(value)
    except ValueError:return None
    return value if p.scheme in ('https','http') and p.hostname and not p.username and not p.password else None

def searx_sources(data,query=''):
    sources=[];seen=set()
    stopwords={'a','an','and','or','the','of','in','on','for','to','with','how','does','is','are'}
    terms=set(re.findall(r"[a-z0-9]+",query.lower()))-stopwords
    ranked=[]
    for result in data.get('results',[]):
        title=result.get('title','')
        words=set(re.findall(r"[a-z0-9]+",title.lower())) if isinstance(title,str) else set()
        score=len(terms & words)
        if terms and score<min(2,len(terms)):continue
        ranked.append((score,result))
    # A transparent lexical precision filter, not semantic relevance or claim verification.
    ranked.sort(key=lambda item:item[0],reverse=True)
    for _,result in ranked:
        url=safe_url(result.get('url'));title=result.get('title')
        if not url or url in seen or not isinstance(title,str) or not title.strip():continue
        # Search snippets are not article evidence; users select and fetch pages separately.
        sources.append({'title':title[:1000],'url':url,'abstract':'','year':None,'authors':[],
            'extraction':{'provider':'SearXNG scholarly discovery (metadata only)','retrieved_at':datetime.now(timezone.utc).isoformat()}})
        seen.add(url)
        if len(sources)==8:break
    return sources

def crossref_sources(data):
    sources=[];seen=set()
    for record in data.get('message',{}).get('items',[]):
        title=next((t for t in record.get('title',[]) if isinstance(t,str) and t.strip()),None)
        doi=record.get('DOI');url=safe_url('https://doi.org/'+doi if isinstance(doi,str) else record.get('URL'))
        if not title or not url or url in seen:continue
        abstract=record.get('abstract','');abstract=re.sub(r'<[^>]*>',' ',abstract) if isinstance(abstract,str) else ''
        abstract=re.sub(r'\s+',' ',abstract).strip()
        year=record.get('issued',{}).get('date-parts',[[None]])[0][0]
        sources.append({'title':title[:1000],'url':url,'abstract':abstract[:20000],
            'year':year if isinstance(year,int) else None,
            'authors':[' '.join(str(a.get(k,'')) for k in ('given','family')).strip() for a in record.get('author',[])][:100],
            'extraction':{'provider':'Crossref metadata','retrieved_at':datetime.now(timezone.utc).isoformat(),'truncated':len(abstract)>20000}})
        seen.add(url)
        if len(sources)==8:break
    return sources

def discover(query,endpoint='http://127.0.0.1:8889',provider='auto'):
    if not isinstance(query,str) or not query.strip() or len(query)>500:raise ValueError('Use explicit public search terms, 1–500 characters')
    warnings=[];sources=[];used='Crossref'
    if provider!='crossref':
        endpoint=local_endpoint(endpoint)
        try:
            engines=science_engines(read_json(endpoint+'/config'))
            if not engines:raise ValueError('No scholarly engines configured; general search results were not used')
            data=read_json(endpoint+'/search?'+urlencode({'q':query,'format':'json','engines':','.join(engines)}))
            sources=searx_sources(data,query)
            if data.get('unresponsive_engines'):warnings.append('Some scholarly engines failed: '+str(data['unresponsive_engines']))
            if not sources:raise ValueError('Scholarly search returned no usable metadata')
            used='SearXNG'
        except Exception as error:
            if provider=='searxng':raise
            warnings.append('SearXNG unavailable: '+str(error)+'. Used Crossref fallback.')
    if not sources:
        sources=crossref_sources(read_json('https://api.crossref.org/works?'+urlencode({'query.bibliographic':query,'rows':8})))
    return {'query':query,'provider':used,'warnings':warnings,'sources':sources,
        'limitations':['Discovery metadata is not a full-text review or claim verification.','SearXNG snippets are not imported as evidence. Select accessible pages and use collect.py separately.']}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query',help='Explicit public search terms; sent to upstream providers')
    parser.add_argument('--endpoint',default='http://127.0.0.1:8889')
    parser.add_argument('--provider',choices=['auto','searxng','crossref'],default='auto')
    parser.add_argument('--sources',action='store_true',help='Output only source array for Pocket PhD import; warnings go to stderr')
    args=parser.parse_args();result=discover(args.query,args.endpoint,args.provider)
    if args.sources:
        for warning in result['warnings']:print(warning,file=sys.stderr)
    print(json.dumps(result['sources'] if args.sources else result,ensure_ascii=False,indent=2))

if __name__=='__main__':
    try:main()
    except Exception as error:print('Discovery failed: '+str(error),file=sys.stderr);sys.exit(1)
