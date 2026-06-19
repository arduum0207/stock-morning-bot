/**
 * 네이버 검색 API — 국내(KR) 종목 뉴스 수집.
 * https://openapi.naver.com/v1/search/news.json
 * 종목명으로 검색. X-Naver-Client-Id/Secret 헤더 필요.
 */
import type { WatchTicker, NewsItem, CollectResult, Collector } from '../types';
import { fetchJson, toIso, log } from './common';

interface NaverNewsResp {
  items?: Array<{
    title: string;
    originallink: string;
    link: string;
    description: string;
    pubDate: string; // RFC822
  }>;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim();
}

const naverNews: Collector = async (tickers: WatchTicker[]): Promise<CollectResult> => {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    log('naver', 'NAVER_CLIENT_ID/SECRET 없음 — skip');
    return {};
  }
  const targets = tickers.filter((t) => t.market === 'KR');
  if (targets.length === 0) return {};

  const news: NewsItem[] = [];
  for (const t of targets) {
    try {
      const url =
        `https://openapi.naver.com/v1/search/news.json` +
        `?query=${encodeURIComponent(t.name)}&display=15&sort=date`;
      const data = await fetchJson<NaverNewsResp>(url, {
        headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
      });
      for (const item of data.items ?? []) {
        const link = item.originallink || item.link;
        if (!link) continue;
        news.push({
          ticker: t.ticker,
          market: 'KR',
          source: 'naver',
          title: stripTags(item.title),
          url: link,
          publishedAt: toIso(item.pubDate),
          summary: stripTags(item.description) || null,
        });
      }
    } catch (e) {
      log('naver', `${t.name} 실패: ${(e as Error).message}`);
    }
  }

  log('naver', `뉴스 ${news.length}건 수집`);
  return { news };
};

export default naverNews;
