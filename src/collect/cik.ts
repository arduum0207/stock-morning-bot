/**
 * SEC ticker → CIK 자동 해석.
 * https://www.sec.gov/files/company_tickers.json (전체 매핑, 단일 호출)
 * watchlist 의 US 종목 중 secCik 가 비어있는 항목을 채운다(in-place).
 */
import type { WatchTicker } from '../types';
import { SOURCE_UA, fetchJson, log } from './common';

interface CompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

export async function resolveCik(tickers: WatchTicker[]): Promise<void> {
  const need = tickers.filter((t) => t.market === 'US' && !t.secCik);
  if (need.length === 0) return;

  try {
    const data = await fetchJson<Record<string, CompanyTickerEntry>>(
      'https://www.sec.gov/files/company_tickers.json',
      { headers: { 'User-Agent': SOURCE_UA, Accept: 'application/json' } }
    );
    const map = new Map<string, string>();
    for (const k of Object.keys(data)) {
      const e = data[k];
      if (e?.ticker) map.set(e.ticker.toUpperCase(), String(e.cik_str));
    }
    for (const t of need) {
      const cik = map.get(t.ticker.toUpperCase());
      if (cik) t.secCik = cik;
    }
    const ok = need.filter((t) => t.secCik).length;
    log('cik', `US CIK 자동 해석 ${ok}/${need.length}`);
  } catch (e) {
    log('cik', `CIK 해석 실패(SEC 공시 일부 누락 가능): ${(e as Error).message}`);
  }
}
