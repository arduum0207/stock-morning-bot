/**
 * 이름/티커 → 종목 후보 해석 (네이버 자동완성 API).
 * GET https://ac.stock.naver.com/ac?q=...&target=stock
 *   → { items: [{ code, name, nationCode, category, ... }] }
 * 키 불필요. KR+US 통합, 한글 검색("엔비디아"→NVDA)·티커 검색 모두 지원.
 * 텔레그램 /add 삼성전자 처럼 사람이 말로 넣은 종목을 watchlist 항목으로 바꾼다.
 */
import type { Market } from './types';

interface NaverAcItem {
  code?: string;
  name?: string;
  nationCode?: string;
  category?: string;
}

export interface ResolveCandidate {
  ticker: string;
  market: Market;
  name: string;
}

function nationToMarket(nationCode: string | undefined): Market | null {
  if (nationCode === 'KOR') return 'KR';
  if (nationCode === 'USA') return 'US';
  return null;
}

/** 이름 또는 티커로 종목 후보 검색. KR/US만 채택. 실패 시 빈 배열(에러 미노출). */
export async function resolveStock(query: string): Promise<ResolveCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: NaverAcItem[] };

    const out: ResolveCandidate[] = [];
    const seen = new Set<string>();
    for (const it of data.items ?? []) {
      if (it.category !== 'stock') continue;
      const market = nationToMarket(it.nationCode);
      if (!market || !it.code || !it.name) continue;
      const key = `${it.code}|${market}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ticker: it.code, market, name: it.name });
    }
    return out;
  } catch {
    return [];
  }
}
