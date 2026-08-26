/**
 * Yahoo Finance RSS — 미국(US) 종목 뉴스 수집. 키 불필요.
 * https://feeds.finance.yahoo.com/rss/2.0/headline?s=TICKER&region=US&lang=en-US
 * XML 파싱은 common.ts 의 parseRssItems (의존성 없는 정규식 파서)를 쓴다.
 */
import type { WatchTicker, NewsItem, CollectResult, Collector } from '../types';
import { fetchText, parseRssItems, SOURCE_UA, toIso, log } from './common';

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
      for (const item of parseRssItems(xml)) {
        news.push({
          ticker: t.ticker,
          market: 'US',
          source: 'rss:yahoo',
          title: item.title,
          url: item.link,
          publishedAt: toIso(item.pubDate),
          summary: item.description,
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
