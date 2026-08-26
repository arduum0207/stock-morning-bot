/**
 * FRED (세인트루이스 연준) — 매크로 시계열. FRED_API_KEY 필요(무료, 120 req/min).
 *   GET /fred/series/observations?series_id=DCOILWTICO&sort_order=desc&limit=N
 *
 * 네이버·FMP 가 못 주는 것만 메운다: 달러인덱스·미국채 2년·장단기 금리차.
 * 특히 T10Y2Y(10년-2년 스프레드)는 경기 신호라 매크로 브리핑에서 값이 크다.
 *
 * 유가·VIX 도 FRED 에 있지만 최대 일주일까지 밀려서 여기서 빼고 실시간 소스를 쓴다
 * (유가·금 → 네이버 시장지표, VIX → FMP). 남은 것들도 1~5영업일 지연이 있으므로
 * 관측일(asOf)을 함께 넘겨 브리핑에 "8/21 기준" 처럼 찍게 한다.
 */
import type { CollectResult, Collector, IndexQuote } from '../types';
import { fetchJson, log } from './common';

const SERIES: Array<{ id: string; name: string; unit: string | null }> = [
  { id: 'DTWEXBGS', name: '달러인덱스', unit: null },
  { id: 'DGS2', name: '미국 국채 2년', unit: '%' },
  { id: 'T10Y2Y', name: '장단기 금리차(10Y-2Y)', unit: '%p' },
];

/** 휴장일은 "." 로 오므로 유효값을 찾으려면 며칠치를 넉넉히 받아야 한다. */
const LOOKBACK = 8;

interface ObsResp {
  observations?: Array<{ date: string; value: string }>;
}

/** 금리·스프레드는 등락률(%)이 의미 없다 — 변화폭(%p)만 쓴다. */
function isRate(unit: string | null): boolean {
  return unit === '%' || unit === '%p';
}

const fred: Collector = async (): Promise<CollectResult> => {
  const key = process.env.FRED_API_KEY;
  if (!key) {
    log('fred', 'FRED_API_KEY 없음 — skip');
    return {};
  }

  const indices: IndexQuote[] = [];
  for (const { id, name, unit } of SERIES) {
    try {
      const data = await fetchJson<ObsResp>(
        `https://api.stlouisfed.org/fred/series/observations` +
          `?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=${LOOKBACK}`
      );
      const points = (data.observations ?? [])
        .map((o) => ({ date: o.date, value: Number(o.value) }))
        .filter((o) => Number.isFinite(o.value));
      const [latest, prev] = points;
      if (!latest) {
        log('fred', `${id} 유효 관측치 없음 — skip`);
        continue;
      }
      const change = prev ? latest.value - prev.value : null;
      indices.push({
        name,
        symbol: id,
        source: 'fred',
        price: Math.round(latest.value * 100) / 100,
        change: change === null ? null : Math.round(change * 100) / 100,
        changePercent:
          change === null || isRate(unit) || prev.value === 0
            ? null
            : Math.round((change / prev.value) * 10000) / 100,
        unit,
        asOf: latest.date,
      });
    } catch (e) {
      log('fred', `${id} 실패: ${(e as Error).message}`);
    }
  }

  log('fred', `매크로 지표 ${indices.length}건 수집`);
  return { market: { indices } };
};

export default fred;
