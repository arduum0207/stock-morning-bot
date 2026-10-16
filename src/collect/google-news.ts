/**
 * Google News RSS — US 종목 뉴스 보강. 키 불필요.
 *   https://news.google.com/rss/search?q=...&hl=en-US&gl=US&ceid=US:en
 *
 * Yahoo RSS(rss.ts)는 소형주일수록 기사 수가 적고 갱신이 몇 주씩 멈춘다.
 * 애널리스트 목표가 변경(예: "Goldman cuts AEVA target to $15")은 TheFly·MarketBeat·
 * Moomoo 등에만 실리는데 Yahoo RSS 에는 아예 안 들어온다. 여기서 그 공백을 메운다.
 * (Finnhub company-news 도 Yahoo 기사를 그대로 돌려줘서 대안이 못 된다 — DATA-SOURCES.md)
 */
import type { WatchTicker, NewsItem, CollectResult, Collector } from '../types';
import { fetchText, parseRssItems, toIso, log } from './common';

/** 월요일 아침에 금~일 기사까지 잡히도록 3일. */
const WINDOW = '3d';
/** 대형주(ORCL 등)는 하루 수십 건이라 종목당 상한을 둔다. */
const PER_TICKER = 12;
/** 기사 대신 자동 생성 차트 글만 찍어내는 곳. */
const NOISE_SOURCE = /Stock Traders Daily/i;
/**
 * 자동 생성 잡음 제목. 특히 MarketBeat 의 13F 보유 변동("X LLC Buys 1,234 Shares of ...")이
 * 대형주는 하루 수십 건이라 그대로 두면 상한(PER_TICKER)을 전부 차지한다.
 */
const NOISE_TITLE =
  /\bShares (of .+ )?(Bought|Sold|Purchased|Acquired)\b|\b(Buys|Sells|Acquires|Purchases) .*Shares\b|New (\$[\d.,]+ \w+ )?(Investment|Stake|Position) in|Stake (in .+ )?(Lessened|Raised|Boosted|Cut|Trimmed|Increased|Decreased|Lowered|Reduced)|Holdings? (Lifted|Raised|Boosted|Trimmed|Cut|Lowered|Reduced|Increased|Decreased)|Options Chain|Stock Forecasts|Quote & History|Technical Analysis|Form 144/i;
/** 애널리스트 의견·목표가 기사. Yahoo RSS 에 안 들어오는 핵심 재료라 상한에 밀리지 않게 앞에 세운다. */
const ANALYST =
  /price target|\btarget (price )?to\b|\b(cuts|raises|lifts|lowers|sets|boosts|trims)\b.*\btarget\b|\btarget\b.*\$\d|upgrade|downgrade|initiat|reiterat|maintains|\b(Buy|Hold|Sell|Neutral|Overweight|Underweight|Outperform) rating/i;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const googleNews: Collector = async (tickers: WatchTicker[]): Promise<CollectResult> => {
  const targets = tickers.filter((t) => t.market === 'US');
  if (targets.length === 0) return {};

  const news: NewsItem[] = [];
  for (const t of targets) {
    // "AEVA" 단독 검색은 호주 전기차협회(AEVA) 기사가 섞인다 → 회사명 또는 거래소:티커로만.
    const q = [t.enName && `"${t.enName}"`, `"NASDAQ:${t.ticker}"`, `"NYSE:${t.ticker}"`]
      .filter(Boolean)
      .join(' OR ');
    // 제목에 회사명 첫 단어나 티커가 있어야 "그 종목 기사"로 본다 (본문에만 스친 기사 제외).
    const firstWord = t.enName?.split(/\s+/)[0];
    const titleRe = new RegExp(
      `\\b(${[t.ticker, firstWord].filter(Boolean).map((w) => escapeRe(w!)).join('|')})\\b`,
      'i'
    );
    try {
      const xml = await fetchText(
        `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${WINDOW}`)}` +
          `&hl=en-US&gl=US&ceid=US:en`,
        { headers: { 'User-Agent': UA } }
      );
      const items = parseRssItems(xml)
        .filter((i) => !(i.source && NOISE_SOURCE.test(i.source)) && !NOISE_TITLE.test(i.title))
        .map((i) => ({
          ...i,
          // 제목 끝의 " - 언론사" 를 떼야 Yahoo 쪽 같은 기사와 제목으로 중복 제거된다.
          title: i.source && i.title.endsWith(` - ${i.source}`) ? i.title.slice(0, -(i.source.length + 3)) : i.title,
          at: toIso(i.pubDate),
        }))
        .filter((i) => titleRe.test(i.title))
        .sort((a, b) => Number(ANALYST.test(b.title)) - Number(ANALYST.test(a.title)) || b.at.localeCompare(a.at))
        .slice(0, PER_TICKER);
      for (const item of items) {
        news.push({
          ticker: t.ticker,
          market: 'US',
          source: `gnews:${item.source ?? 'unknown'}`,
          title: item.title,
          url: item.link,
          publishedAt: item.at,
          // Google News 의 description 은 제목 링크를 감싼 HTML 이라 요약 가치가 없다.
          summary: null,
        });
      }
    } catch (e) {
      log('gnews', `${t.ticker} 실패: ${(e as Error).message}`);
    }
  }

  log('gnews', `뉴스 ${news.length}건 수집`);
  return { news };
};

export default googleNews;
