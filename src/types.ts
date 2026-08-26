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
  /**
   * 시장 개요(브리핑 맨 앞 섹션)용 설정. 없으면 기본값으로 동작한다.
   * keywords: KR 매크로 뉴스를 검색할 키워드 (네이버 뉴스 API).
   */
  market?: {
    keywords?: string[];
  };
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
  /** US: 실제 발표(예정)일. KR: null — 네이버가 정확한 실적일을 주지 않음(추정 분기만). */
  eventDate: string | null;
  /** 추정 대상 기간 라벨. KR 컨센서스 분기 예: "2026.06". US는 보통 미사용. */
  period?: string | null;
  epsEstimated?: number | null;
  epsActual?: number | null;
  revenueEstimated?: number | null;
  revenueActual?: number | null;
  // ── KR 전용(네이버 컨센서스). 있으면 채워짐 ──
  currency?: 'USD' | 'KRW' | null;
  /** KR 매출/이익 단위 표기(예: "억원"). US는 USD 절대값이라 미사용. */
  unit?: string | null;
  operatingProfitEstimated?: number | null;
  /** 목표주가 컨센서스(KR, 원). */
  targetPrice?: number | null;
}

// ─────────────────────────────────────────────────────────────
// 시장 개요(Market Overview) — 특정 종목이 아니라 시장 전체에 대한 재료.
// 브리핑 맨 앞의 "오늘의 시장" 섹션을 만들 때 쓴다.
// ─────────────────────────────────────────────────────────────

/** 시장 뉴스의 성격. 에이전트가 섹션을 나눌 때 힌트로 쓴다. */
export type MarketScope =
  | 'macro' // 금리·물가·고용·환율 등 매크로
  | 'policy' // 정책·규제·정치(관세, 수출통제, 선거 등)
  | 'industry' // 산업 생태계(반도체·AI·에너지 등 업황)
  | 'global'; // 그 밖의 세계적으로 중요한 뉴스

export interface MarketNewsItem {
  scope: MarketScope;
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  summary?: string | null;
  /** 어떤 검색어/피드에서 걸렸는지 (큐레이션 힌트). */
  keyword?: string | null;
}

/** 지수·환율·금리 등 시세 한 줄. */
export interface IndexQuote {
  /** 표시용 한국어 이름 (예: "코스피", "S&P 500"). */
  name: string;
  symbol: string;
  source: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  /** 값의 단위. 지수는 null, 환율은 "원", 금리는 "%". */
  unit?: string | null;
  asOf?: string | null;
}

/**
 * 경제지표의 시장 파급력 등급. 무료 소스(Nasdaq)는 등급을 주지 않아서
 * 우리가 이벤트 이름·국가로 매긴다. 에이전트는 high 부터 훑으면 된다.
 */
export type Importance = 'high' | 'medium' | 'low';

/** 경제지표 발표 일정·결과 (미국 CPI, 한국 수출 등). */
export interface EconomicEvent {
  date: string;
  /** GMT 기준 시각 "13:30". 없을 수 있다. */
  time?: string | null;
  country: string;
  event: string;
  importance: Importance;
  actual?: string | null;
  consensus?: string | null;
  previous?: string | null;
}

/** 보유 종목이 아니어도 시장 전체에 영향을 주는 대형주 실적 일정. */
export interface MajorEarnings {
  symbol: string;
  name: string;
  eventDate: string;
  /** "장전" | "장마감 후" | null */
  when?: string | null;
  /** 시가총액(USD). 정렬·필터용. */
  marketCap?: number | null;
  epsEstimated?: number | null;
}

export interface MarketOverview {
  news: MarketNewsItem[];
  indices: IndexQuote[];
  economicEvents: EconomicEvent[];
  majorEarnings: MajorEarnings[];
}

/** 수집 결과 산출물 (out/collected.json). 에이전트가 이걸 읽어 HTML을 만든다. */
export interface Collected {
  generatedAt: string;
  news: NewsItem[];
  filings: Filing[];
  earnings: EarningsEvent[];
  /** 종목과 무관한 시장 전체 재료. 브리핑 맨 앞 섹션에 쓴다. */
  market: MarketOverview;
}

export type CollectResult = Partial<Pick<Collected, 'news' | 'filings' | 'earnings'>> & {
  market?: Partial<MarketOverview>;
};

/** 수집기. 대부분 종목 목록만 쓰지만, 시장 수집기는 watchlist 의 market 설정도 본다. */
export type Collector = (
  tickers: WatchTicker[],
  watchlist?: Watchlist
) => Promise<CollectResult>;
