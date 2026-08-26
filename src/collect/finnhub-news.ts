/**
 * Finnhub — 글로벌 금융 뉴스. FINNHUB_API_KEY 필요(무료, 60 calls/min).
 *   GET /api/v1/news?category=general
 *
 * Yahoo RSS 는 "배당 ETF 3선" 같은 개별 종목 홍보성 기사가 많이 섞이는데,
 * 이쪽은 Reuters·CNBC 등 통신사 헤드라인 위주라 시장 섹션 재료로 품질이 낫다.
 * 영어라 요약은 에이전트가 한국어로 옮긴다.
 */
import type { CollectResult, Collector, MarketNewsItem, MarketScope } from '../types';
import { fetchJson, log } from './common';

/** 최근 몇 시간 내 기사만. 아침 브리핑이라 하루치면 충분. */
const MAX_AGE_HOURS = 30;
/** 너무 많이 담으면 큐레이션 부담만 커진다. */
const LIMIT = 25;

/**
 * general 피드에는 CNBC 방송용 종목 추천 코너가 섞인다("Cramer's top 10...").
 * 시장 개요에 쓸 재료가 아니라 미리 버린다.
 */
const NOISE = /Jim Cramer|Cramer'?s|Mad Money|buying the dip|stocks to buy|top \d+ things to watch/i;

interface FinnhubArticle {
  category?: string;
  datetime?: number; // unix seconds
  headline?: string;
  source?: string;
  summary?: string;
  url?: string;
}

/**
 * 헤드라인으로 성격을 추정한다. 정확할 필요는 없다 —
 * 에이전트가 섹션을 나눌 때 쓰는 힌트일 뿐이고 최종 판단은 에이전트가 한다.
 */
const PATTERNS: Array<{ scope: MarketScope; re: RegExp }> = [
  {
    // 전쟁·지정학은 정책만큼이나 시장을 흔든다 (호르무즈 봉쇄 → 유가 → 인플레).
    scope: 'policy',
    re: /tariff|sanction|regulat|antitrust|export control|White House|Congress|senate|election|ban on|lawsuit|court|\bwar\b|conflict|missile|Hormuz|geopolit|ceasefire|strait/i,
  },
  {
    scope: 'macro',
    re: /\bFed\b|FOMC|inflation|\bCPI\b|\bPCE\b|rate cut|rate hike|interest rate|jobless|payroll|unemployment|\bGDP\b|recession|yield|dollar|\bECB\b|\bBOJ\b|central bank|treasury/i,
  },
  {
    scope: 'industry',
    re: /chip|semiconductor|\bAI\b|data ?cent(er|re)|oil|crude|\bOPEC\b|\bLNG\b|energy|automaker|\bEV\b|cloud|pharma|bank(ing)? sector/i,
  },
];

function scopeOf(headline: string, summary: string): MarketScope {
  const text = `${headline} ${summary}`;
  for (const { scope, re } of PATTERNS) {
    if (re.test(text)) return scope;
  }
  return 'global';
}

const finnhubNews: Collector = async (): Promise<CollectResult> => {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    log('finnhub', 'FINNHUB_API_KEY 없음 — skip');
    return {};
  }

  const cutoff = Date.now() - MAX_AGE_HOURS * 3_600_000;
  const news: MarketNewsItem[] = [];
  try {
    const data = await fetchJson<FinnhubArticle[]>(
      `https://finnhub.io/api/v1/news?category=general&token=${key}`
    );
    for (const a of Array.isArray(data) ? data : []) {
      if (!a.headline || !a.url || NOISE.test(a.headline)) continue;
      const at = (a.datetime ?? 0) * 1000;
      if (!at || at < cutoff) continue;
      const summary = a.summary ?? '';
      news.push({
        scope: scopeOf(a.headline, summary),
        source: `finnhub:${a.source ?? 'unknown'}`,
        title: a.headline,
        url: a.url,
        publishedAt: new Date(at).toISOString(),
        summary: summary || null,
      });
      if (news.length >= LIMIT) break;
    }
  } catch (e) {
    log('finnhub', `실패: ${(e as Error).message}`);
  }

  log('finnhub', `글로벌 뉴스 ${news.length}건 수집`);
  return { market: { news } };
};

export default finnhubNews;
