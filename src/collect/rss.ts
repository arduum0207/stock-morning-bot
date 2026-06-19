/**
 * Yahoo Finance RSS — 미국(US) 종목 뉴스 수집. 키 불필요.
 * https://feeds.finance.yahoo.com/rss/2.0/headline?s=TICKER&region=US&lang=en-US
 * 의존성 없이 정규식으로 <item> 파싱.
 */
import type { WatchTicker, NewsItem, CollectResult, Collector } from '../types';
import { fetchText, SOURCE_UA, toIso, log } from './common';

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function field(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decode(m[1]) : null;
}

const rss: Collector = async (tickers: WatchTicker[]): Promise<CollectResult> => {
  const targets = tickers.filter((t) => t.market === 'US');
  if (targets.length === 0) return {};

  const news: NewsItem[] = [];
  for (const t of targets) {
    try {
      const xml = await fetchText(
        `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
          t.ticker
        )}&region=US&lang=en-US`,
        { headers: { 'User-Agent': SOURCE_UA } }
      );
      const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];
      for (const block of items) {
        const title = field(block, 'title');
        const link = field(block, 'link');
        if (!title || !link) continue;
        news.push({
          ticker: t.ticker,
          market: 'US',
          source: 'rss:yahoo',
          title,
          url: link,
          publishedAt: toIso(field(block, 'pubDate')),
          summary: field(block, 'description'),
        });
      }
    } catch (e) {
      log('rss', `${t.ticker} 실패: ${(e as Error).message}`);
    }
  }

  log('rss', `뉴스 ${news.length}건 수집`);
  return { news };
};

export default rss;
