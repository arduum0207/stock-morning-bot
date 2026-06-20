/**
 * 네이버 금융 — 국내(KR) 실적 컨센서스 수집. 키 불필요.
 *   GET https://m.stock.naver.com/api/stock/{code}/finance/quarter
 *     → trTitleList 에서 isConsensus="Y" 인 분기(=추정 분기) 추출,
 *       rowList 의 매출액/영업이익/EPS 를 그 분기 컨센서스 값으로.
 *   GET https://m.stock.naver.com/api/stock/{code}/integration
 *     → consensusInfo.priceTargetMean (목표주가 컨센서스)
 *
 * 한국은 정확한 "다음 실적일"이 공개되지 않으므로 eventDate=null, period(예 "2026.06")로 표기.
 * 매출/영업이익 단위는 억원.
 */
import type { WatchTicker, EarningsEvent, CollectResult, Collector } from '../types';
import { fetchJson, log } from './common';

interface FinanceCell {
  value?: string;
}
interface FinanceRow {
  title: string;
  columns?: Record<string, FinanceCell>;
}
interface NaverFinance {
  financeInfo?: {
    trTitleList?: Array<{ isConsensus?: string; title?: string; key?: string }>;
    rowList?: FinanceRow[];
  };
}
interface NaverIntegration {
  consensusInfo?: { priceTargetMean?: string } | null;
}

const UA = { 'User-Agent': 'Mozilla/5.0' };

/** "1,701,570" → 1701570, "-"/빈값 → null */
function num(v: string | undefined): number | null {
  if (!v || v === '-') return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const naverEarnings: Collector = async (tickers: WatchTicker[]): Promise<CollectResult> => {
  const targets = tickers.filter((t) => t.market === 'KR');
  if (targets.length === 0) return {};

  const earnings: EarningsEvent[] = [];
  for (const t of targets) {
    const code = t.ticker;
    try {
      const q = await fetchJson<NaverFinance>(
        `https://m.stock.naver.com/api/stock/${code}/finance/quarter`,
        { headers: UA }
      );
      const titles = q.financeInfo?.trTitleList ?? [];
      const cons = titles.find((x) => x.isConsensus === 'Y');
      if (!cons?.key) {
        log('naver-earn', `${t.name} 컨센서스 분기 없음 — skip`);
        continue;
      }
      const rows = q.financeInfo?.rowList ?? [];
      const cell = (title: string) =>
        num(rows.find((r) => r.title === title)?.columns?.[cons.key as string]?.value);

      const revenue = cell('매출액');
      const op = cell('영업이익');
      const eps = cell('EPS');
      if (revenue == null && op == null && eps == null) {
        log('naver-earn', `${t.name} 컨센서스 값 비어있음 — skip`);
        continue;
      }

      // 목표주가 컨센서스 (best-effort)
      let targetPrice: number | null = null;
      try {
        const integ = await fetchJson<NaverIntegration>(
          `https://m.stock.naver.com/api/stock/${code}/integration`,
          { headers: UA }
        );
        targetPrice = num(integ.consensusInfo?.priceTargetMean);
      } catch {
        /* 목표주가 누락 허용 */
      }

      earnings.push({
        ticker: code,
        market: 'KR',
        eventDate: null,
        period: cons.title?.replace(/\.$/, '') ?? null, // "2026.06." → "2026.06"
        epsEstimated: eps,
        epsActual: null,
        revenueEstimated: revenue,
        revenueActual: null,
        currency: 'KRW',
        unit: '억원',
        operatingProfitEstimated: op,
        targetPrice,
      });
    } catch (e) {
      log('naver-earn', `${t.name} 실패: ${(e as Error).message}`);
    }
  }

  log('naver-earn', `KR 실적 컨센서스 ${earnings.length}건 수집`);
  return { earnings };
};

export default naverEarnings;
