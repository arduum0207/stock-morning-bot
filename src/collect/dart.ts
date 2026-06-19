/**
 * DART OpenAPI — 국내(KR) 공시 수집.
 * https://opendart.fss.or.kr/api/list.json
 * watchlist 항목에 dartCorpCode 가 있는 KR 종목만 대상.
 */
import type { WatchTicker, Filing, CollectResult, Collector } from '../types';
import { fetchJson, ymd8ToIso, daysAgo, isoDate, log } from './common';

interface DartListResp {
  status: string;
  message: string;
  list?: Array<{
    corp_code: string;
    corp_name: string;
    report_nm: string;
    rcept_no: string;
    rcept_dt: string; // YYYYMMDD
  }>;
}

const dart: Collector = async (tickers: WatchTicker[]): Promise<CollectResult> => {
  const key = process.env.DART_API_KEY;
  if (!key) {
    log('dart', 'DART_API_KEY 없음 — skip');
    return {};
  }
  const targets = tickers.filter((t) => t.market === 'KR' && t.dartCorpCode);
  if (targets.length === 0) {
    log('dart', 'dartCorpCode 가 있는 KR 종목 없음 — skip (뉴스는 네이버로 수집됨)');
    return {};
  }

  const bgn = isoDate(daysAgo(14)).replace(/-/g, '');
  const filings: Filing[] = [];

  for (const t of targets) {
    try {
      const url =
        `https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}` +
        `&corp_code=${t.dartCorpCode}&bgn_de=${bgn}&page_count=20`;
      const data = await fetchJson<DartListResp>(url);
      if (data.status !== '000' || !data.list) continue; // 013 = 조회 데이터 없음
      for (const item of data.list) {
        filings.push({
          ticker: t.ticker,
          market: 'KR',
          source: 'dart',
          formType: item.report_nm,
          title: `${item.corp_name} ${item.report_nm}`,
          url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${item.rcept_no}`,
          filedAt: ymd8ToIso(item.rcept_dt),
        });
      }
    } catch (e) {
      log('dart', `${t.ticker} 실패: ${(e as Error).message}`);
    }
  }

  log('dart', `공시 ${filings.length}건 수집`);
  return { filings };
};

export default dart;
