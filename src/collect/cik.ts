/**
 * SEC ticker → CIK 자동 해석.
 * https://www.sec.gov/files/company_tickers.json (전체 매핑, 단일 호출)
 * watchlist 의 US 종목 중 secCik·enName 이 비어있는 항목을 채운다(in-place).
 * enName 은 google-news 검색어로 쓴다 (watchlist 의 name 은 한국어라 영문 검색에 못 씀).
 */
import type { WatchTicker } from '../types';
import { SOURCE_UA, fetchJson, log } from './common';

interface CompanyTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

export async function resolveCik(tickers: WatchTicker[]): Promise<void> {
  const need = tickers.filter((t) => t.market === 'US' && (!t.secCik || !t.enName));
  if (need.length === 0) return;

  try {
    const data = await fetchJson<Record<string, CompanyTickerEntry>>(
      'https://www.sec.gov/files/company_tickers.json',
      { headers: { 'User-Agent': SOURCE_UA, Accept: 'application/json' } }
    );
    const map = new Map<string, CompanyTickerEntry>();
    for (const k of Object.keys(data)) {
      const e = data[k];
      if (e?.ticker) map.set(e.ticker.toUpperCase(), e);
    }
    for (const t of need) {
      const e = map.get(t.ticker.toUpperCase());
      if (!e) continue;
      t.secCik ??= String(e.cik_str);
      t.enName ??= shortName(e.title);
    }
    const ok = need.filter((t) => t.secCik).length;
    log('cik', `US CIK 자동 해석 ${ok}/${need.length}`);
  } catch (e) {
    log('cik', `CIK 해석 실패(SEC 공시 일부 누락 가능): ${(e as Error).message}`);
  }
}

/**
 * SEC 등록명 → 뉴스에 실제로 쓰이는 이름.
 * "Aeva Technologies, Inc." → "Aeva Technologies", "ORACLE CORP" → "Oracle"
 * (법인 접미사를 떼고, 전부 대문자인 등록명은 첫 글자만 대문자로)
 */
export function shortName(title: string): string {
  const base = title
    .replace(/[,.]?\s+(Inc|Corp|Corporation|Co|Ltd|Limited|PLC|N\.?V|S\.?A|AG|SE)\.?$/i, '')
    .trim();
  if (base !== base.toUpperCase()) return base;
  return base.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
