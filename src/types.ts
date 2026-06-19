/** 공통 타입 정의. 수집기·발송·설정이 모두 이 타입을 공유한다. */

export type Market = 'KR' | 'US';

/** watchlist.json 의 종목 1개 */
export interface WatchTicker {
  ticker: string;
  name: string;
  market: Market;
  /** KR 공시(DART)용. 없으면 해당 종목은 DART 공시 수집을 건너뛴다(뉴스는 종목명으로 수집됨). */
  dartCorpCode?: string;
  /** US 공시(SEC)용. 비워두면 ticker로 자동 해석(resolveCik)된다. */
  secCik?: string;
}

export interface Watchlist {
  tickers: WatchTicker[];
}

export interface NewsItem {
  ticker: string;
  market: Market;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  summary?: string | null;
}

export interface Filing {
  ticker: string;
  market: Market;
  source: string;
  formType: string;
  title: string;
  url: string;
  filedAt: string;
}

export interface EarningsEvent {
  ticker: string;
  market: Market;
  eventDate: string;
  epsEstimated?: number | null;
  epsActual?: number | null;
  revenueEstimated?: number | null;
  revenueActual?: number | null;
}

/** 수집 결과 산출물 (out/collected.json). 에이전트가 이걸 읽어 HTML을 만든다. */
export interface Collected {
  generatedAt: string;
  news: NewsItem[];
  filings: Filing[];
  earnings: EarningsEvent[];
}

export type CollectResult = Partial<Pick<Collected, 'news' | 'filings' | 'earnings'>>;

export type Collector = (tickers: WatchTicker[]) => Promise<CollectResult>;
