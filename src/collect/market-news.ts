/**
 * 시장 전체 뉴스 수집 — 브리핑 맨 앞 "오늘의 시장" 섹션 재료.
 * 종목별 수집기와 달리 watchlist 종목이 아니라 "주제"로 모은다.
 *
 *   - 네이버 뉴스 검색 API : 매크로·정책·산업 키워드 (한국어 기사 → 요약이 쉽다)
 *       키워드는 watchlist.json 의 market.keywords 로 덮어쓸 수 있고,
 *       없으면 아래 DEFAULT_KEYWORDS 를 쓴다. (NAVER_CLIENT_ID/SECRET 필요)
 *   - Yahoo Finance RSS   : 미국 시장 전반 헤드라인 (키 불필요, 영어)
 *
 * 키가 없거나 소스가 죽으면 그쪽만 조용히 빠진다.
 */
import type {
  CollectResult,
  Collector,
  MarketNewsItem,
  MarketScope,
  Watchlist,
  WatchTicker,
} from '../types';
import { fetchJson, fetchText, parseRssItems, SOURCE_UA, toIso, log } from './common';

/** 기본 검색어. "키워드: scope" 로 성격을 함께 지정한다. */
const DEFAULT_KEYWORDS: Array<{ query: string; scope: MarketScope }> = [
  { query: '연준 기준금리', scope: 'macro' },
  { query: '미국 물가 지표', scope: 'macro' },
  { query: '원달러 환율', scope: 'macro' },
  { query: '국채 금리', scope: 'macro' },
  { query: '관세 통상 정책', scope: 'policy' },
  { query: '반도체 수출 규제', scope: 'policy' },
  { query: '반도체 업황', scope: 'industry' },
  { query: 'AI 데이터센터 투자', scope: 'industry' },
  { query: '뉴욕증시 마감', scope: 'global' },
];

/** 키워드당 가져올 기사 수. 큐레이션은 에이전트가 하므로 넉넉히 주되 과하지 않게. */
const PER_KEYWORD = 5;

/** 미국 시장 전반 헤드라인용 심볼(지수 ETF·지수). */
const MARKET_FEEDS = ['SPY', 'QQQ', '^GSPC'];
const PER_FEED = 6;

interface NaverNewsResp {
  items?: Array<{
    title: string;
    originallink: string;
    link: string;
    description: string;
    pubDate: string;
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

/** watchlist 의 market.keywords → 검색어 목록. 별도 scope 지정이 없으면 macro 취급. */
function keywordsOf(wl?: Watchlist): Array<{ query: string; scope: MarketScope }> {
  const custom = wl?.market?.keywords;
  if (!custom || custom.length === 0) return DEFAULT_KEYWORDS;
  return custom.map((query) => ({ query, scope: 'macro' as MarketScope }));
}

async function fromNaver(
  wl: Watchlist | undefined,
  news: MarketNewsItem[]
): Promise<void> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    log('market-news', 'NAVER_CLIENT_ID/SECRET 없음 — 국내 매크로 뉴스 skip');
    return;
  }
  for (const { query, scope } of keywordsOf(wl)) {
    try {
      const data = await fetchJson<NaverNewsResp>(
        `https://openapi.naver.com/v1/search/news.json` +
          `?query=${encodeURIComponent(query)}&display=${PER_KEYWORD}&sort=date`,
        { headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } }
      );
      for (const item of data.items ?? []) {
        const url = item.originallink || item.link;
        if (!url) continue;
        news.push({
          scope,
          source: 'naver',
          title: stripTags(item.title),
          url,
          publishedAt: toIso(item.pubDate),
          summary: stripTags(item.description) || null,
          keyword: query,
        });
      }
    } catch (e) {
      log('market-news', `네이버 "${query}" 실패: ${(e as Error).message}`);
    }
  }
}

async function fromYahoo(news: MarketNewsItem[]): Promise<void> {
  for (const symbol of MARKET_FEEDS) {
    try {
      const xml = await fetchText(
        `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
          symbol
        )}&region=US&lang=en-US`,
        { headers: { 'User-Agent': SOURCE_UA } }
      );
      for (const item of parseRssItems(xml).slice(0, PER_FEED)) {
        news.push({
          scope: 'global',
          source: 'rss:yahoo',
          title: item.title,
          url: item.link,
          publishedAt: toIso(item.pubDate),
          summary: item.description,
          keyword: symbol,
        });
      }
    } catch (e) {
      log('market-news', `Yahoo ${symbol} 실패: ${(e as Error).message}`);
    }
  }
}

const marketNews: Collector = async (
  _tickers: WatchTicker[],
  wl?: Watchlist
): Promise<CollectResult> => {
  const news: MarketNewsItem[] = [];
  await fromNaver(wl, news);
  await fromYahoo(news);
  log('market-news', `시장 뉴스 ${news.length}건 수집`);
  return { market: { news } };
};

export default marketNews;
