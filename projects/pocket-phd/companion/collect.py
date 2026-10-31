"""Collect selected trusted public pages into Pocket PhD import JSON; no LLM."""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import os
import re
from pathlib import Path
import socket
import sys
from urllib.parse import urlsplit

ALLOWED_HOSTS = {'pmc.ncbi.nlm.nih.gov', 'arxiv.org', 'docs.crawl4ai.com'}
MAX_CONTENT_BYTES = 2_000_000
MAX_EXCERPT = 20_000


def validate_url(url, *, resolve=True):
    if not isinstance(url, str) or len(url) > 2000 or any(c.isspace() or ord(c)<32 for c in url):
        raise ValueError('Invalid or oversized URL')
    p = urlsplit(url)
    if (p.scheme != 'https' or p.hostname not in ALLOWED_HOSTS or p.username is not None
            or p.password is not None or p.port not in (None,443) or p.query or p.fragment or '\\' in url):
        raise ValueError('Use an allowlisted HTTPS URL without credentials, query, fragment, or custom port')
    if resolve:
        addresses = socket.getaddrinfo(p.hostname,443)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise ValueError('Non-public DNS destination rejected')
    return url


def source_record(result, requested_url):
    validate_url(requested_url, resolve=False)
    final_url = getattr(result,'redirected_url',None) or getattr(result,'url',None)
    validate_url(final_url, resolve=False)
    if not result.success or not isinstance(result.status_code,int) or not 200 <= result.status_code < 300:
        raise ValueError('Page failed or returned a non-success HTTP status')
    markdown = result.markdown
    text = markdown.raw_markdown if hasattr(markdown,'raw_markdown') else markdown
    if not isinstance(text,str): raise ValueError('Missing Markdown text')
    if len(text.encode('utf-8')) > MAX_CONTENT_BYTES or len((getattr(result,'html','') or '').encode('utf-8')) > MAX_CONTENT_BYTES:
        raise ValueError('Page exceeds post-fetch content byte limit')
    lowered = text.lower()
    if len(text.strip()) < 200 or any(s in lowered for s in ['verify you are human','checking your browser','access denied','just a moment...','enable javascript and cookies','captcha']):
        raise ValueError('Empty, short, or access-challenge page rejected; inspect source manually')
    metadata = getattr(result,'metadata',None) or {}
    title = metadata.get('title') or final_url
    if not isinstance(title,str): title=final_url
    selected = text
    # Known documentation banner precedes the real page h1. Match the document
    # title rather than selecting arbitrary text by scientific keywords.
    if urlsplit(final_url).hostname == 'docs.crawl4ai.com':
        page_title = title.split(' - Crawl4AI Documentation', 1)[0].strip()
        heading = re.search(r'^# ' + re.escape(page_title) + r'\s*$', text, re.MULTILINE)
        if not heading:
            raise ValueError('Documentation page heading missing; cannot select relevant main text')
        selected = text[heading.start():]
    excerpt = selected[:MAX_EXCERPT]
    return {'title':title[:1000], 'url':final_url,'abstract':excerpt,'year':None,'authors':[],
        'extraction':{'provider':'Crawl4AI','requested_url':requested_url,'final_url':final_url,
            'retrieved_at':datetime.now(timezone.utc).isoformat(),
            'content_sha256':hashlib.sha256(text.encode('utf-8')).hexdigest(),
            'excerpt_sha256':hashlib.sha256(excerpt.encode('utf-8')).hexdigest(),
            'truncated':len(selected)>MAX_EXCERPT}}


async def collect_pages(urls):
    for url in urls: validate_url(url)
    # Set these before importing Crawl4AI, which initializes its state directory.
    state = Path(__file__).resolve().parent / '.state'
    runtime = Path('/Users/sanjusrikanth/Documents/Codex/napolean-research')
    os.environ.setdefault('CRAWL4_AI_BASE_DIRECTORY',str(state))
    os.environ.setdefault('CRAWL4AI_NO_CLOUD_NOTICE','1')
    os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH',str(runtime/'browsers'))
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
    config = CrawlerRunConfig(check_robots_txt=True, page_timeout=25000, max_retries=0,
        cache_mode=CacheMode.BYPASS, verbose=False, remove_forms=True,
        excluded_tags=['nav','header','footer','aside','script','style','form'],
        exclude_all_images=True, process_iframes=False,
        markdown_generator=DefaultMarkdownGenerator(options={'ignore_links':True,'ignore_images':True}))
    browser = BrowserConfig(headless=True,verbose=False,ignore_https_errors=False,
        java_script_enabled=False,accept_downloads=False,text_mode=True)
    records=[]
    async with AsyncWebCrawler(config=browser,base_directory=str(state)) as crawler:
        for url in urls:
            result=await asyncio.wait_for(crawler.arun(url=url,config=config),timeout=30)
            # Final URL validation detects out-of-scope redirects after fetch, not before it.
            final_url=getattr(result,'redirected_url',None) or getattr(result,'url',None)
            validate_url(final_url)
            records.append(source_record(result,url))
    return records


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('urls',nargs='+',help='At most six explicitly selected allowlisted HTTPS page URLs')
    args=parser.parse_args()
    if len(args.urls)>6: parser.error('At most six explicit URLs')
    # Output only a complete validated batch; failures never create a partial JSON export.
    records=asyncio.run(asyncio.wait_for(collect_pages(args.urls),timeout=120))
    print(json.dumps(records,ensure_ascii=False,indent=2))

if __name__=='__main__':
    try: main()
    except Exception as error:
        print('Collection failed: '+str(error),file=sys.stderr)
        sys.exit(1)
