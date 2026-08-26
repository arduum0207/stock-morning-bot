/**
 * 시장 지표(지수·환율·금리) 수집 — 브리핑 맨 앞 "오늘의 시장" 스트립용.
 *
 * 종목과 무관한 시장 전체 데이터라 watchlist 를 쓰지 않는다. 두 소스를 섞는다:
 *   - FMP  /stable/quote?symbol=^GSPC     → 미국 지수·VIX·비트코인 (FMP_API_KEY 필요)
 *       무료 티어에서 ^GSPC·^IXIC·^DJI·^VIX·BTCUSD 가 열린다. ^KS11·DX-Y.NYB 등은
 *       402 라 넣지 않는다 — 한국 쪽은 네이버가 대신 준다.
 *   - 네이버 m.stock  → 코스피·코스닥·원달러·미국채 10년 + WTI·브렌트·금 (키 불필요)
 *       원자재는 FRED 도 주지만 최대 일주일 지연이라, 실시간인 이쪽을 쓴다.
 *
 * 소스가 죽거나 키가 없으면 그 항목만 조용히 빠진다(부분 실패 허용).
 */
import type { CollectResult, Collector, IndexQuote } from '../types';
import { fetchJson, log } from './common';

/** FMP 무료 티어에서 실제로 열리는 심볼만. */
const FMP_SYMBOLS: Array<{ symbol: string; name: string }> = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: '나스닥' },
  { symbol: '^DJI', name: '다우' },
  { symbol: '^VIX', name: 'VIX' },
  { symbol: 'BTCUSD', name: '비트코인' },
];

/** 네이버 국내 지수 (m.stock /api/index/{code}/basic). */
const NAVER_INDEXES: Array<{ code: string; name: string }> = [
  { code: 'KOSPI', name: '코스피' },
  { code: 'KOSDAQ', name: '코스닥' },
];

/**
 * 네이버 시장지표 (front-api /marketIndex/productDetail).
 * reutersCode 는 네이버 시장지표 페이지에서 쓰는 코드 그대로다(WTI=CLcv1 등).
 */
const NAVER_MARKET: Array<{ category: string; code: string; name: string; unit: string | null }> = [
  { category: 'exchange', code: 'FX_USDKRW', name: '원/달러', unit: '원' },
  { category: 'bond', code: 'US10YT=RR', name: '미국 국채 10년', unit: '%' },
  { category: 'energy', code: 'CLcv1', name: 'WTI 유가', unit: '$' },
  { category: 'energy', code: 'LCOcv1', name: '브렌트유', unit: '$' },
  { category: 'metals', code: 'GCcv1', name: '국제 금', unit: '$' },
];

interface FmpQuote {
  symbol?: string;
  name?: string;
  price?: number;
  change?: number;
  changePercentage?: number;
}

/** 등락률은 소수점 둘째 자리까지만 (FMP 는 0.30015 처럼 길게 준다). */
function pct(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

/** 네이버는 숫자를 "1,382.70" 처럼 문자열로 준다. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

interface NaverBasic {
  stockName?: string;
  name?: string;
  closePrice?: string;
  /** 지수는 compareToPreviousClosePrice, 시장지표는 fluctuations 로 온다. */
  compareToPreviousClosePrice?: string;
  fluctuations?: string;
  fluctuationsRatio?: string;
  localTradedAt?: string;
}

/**
 * 네이버 응답 → IndexQuote.
 * 등락폭에 부호가 빠져 오는 경우가 있어(지수), 등락률 부호를 기준으로 맞춘다.
 */
function fromNaver(
  raw: NaverBasic,
  fallbackName: string,
  symbol: string,
  unit: string | null
): IndexQuote | null {
  const price = num(raw.closePrice);
  if (price === null) return null;
  const ratio = num(raw.fluctuationsRatio);
  let change = num(raw.compareToPreviousClosePrice ?? raw.fluctuations);
  if (change !== null && ratio !== null && ratio < 0 && change > 0) change = -change;
  return {
    name: raw.stockName || fallbackName,
    symbol,
    source: 'naver',
    price,
    change,
    changePercent: pct(ratio),
    unit,
    asOf: raw.localTradedAt ?? null,
  };
}

async function fromFmp(key: string): Promise<IndexQuote[]> {
  const out: IndexQuote[] = [];
  for (const { symbol, name } of FMP_SYMBOLS) {
    try {
      // 무료 티어는 batch(symbol=A,B) 가 막혀 있어 심볼별로 부른다.
      const data = await fetchJson<FmpQuote[]>(
        `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(
          symbol
        )}&apikey=${key}`
      );
      const q = Array.isArray(data) ? data[0] : null;
      if (!q || typeof q.price !== 'number') continue;
      out.push({
        name,
        symbol,
        source: 'fmp',
        price: q.price,
        change: q.change ?? null,
        changePercent: pct(q.changePercentage),
        unit: null,
        asOf: null,
      });
    } catch (e) {
      log('market-index', `FMP ${symbol} 실패: ${(e as Error).message}`);
    }
  }
  return out;
}

async function fromNaverAll(): Promise<IndexQuote[]> {
  const out: IndexQuote[] = [];
  for (const { code, name } of NAVER_INDEXES) {
    try {
      const raw = await fetchJson<NaverBasic>(
        `https://m.stock.naver.com/api/index/${encodeURIComponent(code)}/basic`
      );
      const q = fromNaver(raw, name, code, null);
      if (q) out.push(q);
    } catch (e) {
      log('market-index', `네이버 ${code} 실패: ${(e as Error).message}`);
    }
  }
  for (const { category, code, name, unit } of NAVER_MARKET) {
    try {
      const res = await fetchJson<{ result?: NaverBasic }>(
        `https://m.stock.naver.com/front-api/marketIndex/productDetail` +
          `?category=${category}&reutersCode=${encodeURIComponent(code)}`
      );
      const raw = res.result;
      if (!raw) continue;
      const q = fromNaver(raw, name, code, unit);
      if (q) out.push({ ...q, name }); // 네이버 표기("미국 USD")보다 우리 라벨이 명확
    } catch (e) {
      log('market-index', `네이버 ${code} 실패: ${(e as Error).message}`);
    }
  }
  return out;
}

const marketIndex: Collector = async (): Promise<CollectResult> => {
  const key = process.env.FMP_API_KEY;
  const [us, kr] = await Promise.all([
    key ? fromFmp(key) : Promise.resolve<IndexQuote[]>([]),
    fromNaverAll(),
  ]);
  if (!key) log('market-index', 'FMP_API_KEY 없음 — 미국 지수 skip');

  const indices = [...kr, ...us];
  log('market-index', `지표 ${indices.length}건 수집`);
  return { market: { indices } };
};

export default marketIndex;
