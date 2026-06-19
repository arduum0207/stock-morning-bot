/**
 * FMP stable earnings — 미국(US) 실적 일정 수집 (종목별).
 * https://financialmodelingprep.com/stable/earnings?symbol=NVDA&apikey=..
 * 종목 수가 적어 종목별 호출이 무료 티어에 적합.
 */
import type { WatchTicker, EarningsEvent, CollectResult, Collector } from '../types';
import { fetchJson, daysAgo, isoDate, log } from './common';

interface FmpEarning {
  date: string;
  symbol: string;
  epsActual?: number | null;
  epsEstimated?: number | null;
  revenueActual?: number | null;
  revenueEstimated?: number | null;
}

const fmp: Collector = async (tickers: WatchTicker[]): Promise<CollectResult> => {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    log('fmp', 'FMP_API_KEY 없음 — skip');
    return {};
  }
  const usTickers = tickers.filter((t) => t.market === 'US').map((t) => t.ticker);
  if (usTickers.length === 0) return {};

  // 직전 분기 결과 + 향후 예정만 (과도한 과거 이력 제외)
  const since = isoDate(daysAgo(100));
  const earnings: EarningsEvent[] = [];

  for (const ticker of usTickers) {
    try {
      const url = `https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(
        ticker
      )}&apikey=${key}`;
      const data = await fetchJson<FmpEarning[]>(url);
      for (const e of Array.isArray(data) ? data : []) {
        if (!e.date || e.date < since) continue;
        earnings.push({
          ticker: e.symbol || ticker,
          market: 'US',
          eventDate: e.date,
          epsEstimated: e.epsEstimated ?? null,
          epsActual: e.epsActual ?? null,
          revenueEstimated: e.revenueEstimated ?? null,
          revenueActual: e.revenueActual ?? null,
        });
      }
    } catch (e) {
      log('fmp', `${ticker} 실패: ${(e as Error).message}`);
    }
  }

  log('fmp', `실적 ${earnings.length}건 수집`);
  return { earnings };
};

export default fmp;
