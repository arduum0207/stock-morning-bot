/**
 * SEC EDGAR submissions API — 미국(US) 공시 수집.
 * https://data.sec.gov/submissions/CIK{10자리}.json
 * secCik 가 있는 US 종목만 대상 (run.ts 의 resolveCik 가 ticker로 자동 채움).
 * User-Agent 헤더 필수, 10 req/s 제한.
 */
import type { WatchTicker, Filing, CollectResult, Collector } from '../types';
import { fetchJson, SOURCE_UA, daysAgo, log } from './common';

const WANTED_FORMS = new Set(['8-K', '10-Q', '10-K', '4', '6-K', '20-F']);

interface SecSubmissions {
  cik?: string;
  filings?: {
    recent?: {
      accessionNumber: string[];
      form: string[];
      filingDate: string[]; // YYYY-MM-DD
      primaryDocument: string[];
    };
  };
}

function pad10(cik: string): string {
  return cik.replace(/\D/g, '').padStart(10, '0');
}

const sec: Collector = async (tickers: WatchTicker[]): Promise<CollectResult> => {
  const targets = tickers.filter((t) => t.market === 'US' && t.secCik);
  if (targets.length === 0) {
    log('sec', 'CIK 매핑된 US 종목 없음 — skip');
    return {};
  }

  const since = daysAgo(14);
  const filings: Filing[] = [];

  for (const t of targets) {
    const cik10 = pad10(t.secCik as string);
    try {
      const data = await fetchJson<SecSubmissions>(
        `https://data.sec.gov/submissions/CIK${cik10}.json`,
        { headers: { 'User-Agent': SOURCE_UA, Accept: 'application/json' } }
      );
      const r = data.filings?.recent;
      if (!r) continue;
      const cikNum = String(Number(cik10)); // EDGAR URL은 zero-pad 없는 CIK 사용
      for (let i = 0; i < r.form.length; i++) {
        if (!WANTED_FORMS.has(r.form[i])) continue;
        if (new Date(r.filingDate[i]) < since) continue;
        const accNoDashless = r.accessionNumber[i].replace(/-/g, '');
        const doc = r.primaryDocument[i];
        const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDashless}/${doc}`;
        filings.push({
          ticker: t.ticker,
          market: 'US',
          source: 'sec',
          formType: r.form[i],
          title: `${t.ticker} ${r.form[i]} (${r.filingDate[i]})`,
          url,
          filedAt: r.filingDate[i],
        });
      }
      // rate limit 보호 (10 req/s)
      await new Promise((res) => setTimeout(res, 150));
    } catch (e) {
      log('sec', `${t.ticker} 실패: ${(e as Error).message}`);
    }
  }

  log('sec', `공시 ${filings.length}건 수집`);
  return { filings };
};

export default sec;
