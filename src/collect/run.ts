/**
 * 수집 오케스트레이터.
 *   1. watchlist.json 로드
 *   2. US 종목 CIK 자동 해석
 *   3. 수집기 병렬 실행 (서로 독립, 일부 실패 허용)
 *   4. 병합·중복제거 후 out/collected.json 저장
 *
 * LLM 미사용. 순수 데이터 수집만 한다. 요약·HTML 생성은 예약 에이전트(구독)가 한다.
 * 로컬 테스트: `.env` 작성 후 `npm run collect`
 */
import { config } from 'dotenv';
config();

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadWatchlist } from '../config';
import { resolveCik } from './cik';
import type { Collected, Collector, MarketNewsItem } from '../types';
import dart from './dart';
import sec from './sec';
import naverNews from './naver-news';
import naverEarnings from './naver-earnings';
import fmp from './fmp';
import nasdaq from './nasdaq';
import rss from './rss';
import marketNews from './market-news';
import marketIndex from './market-index';
import econCalendar from './econ-calendar';

const OUT_DIR = process.env.OUT_DIR || 'out';

function dedupe<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

async function main() {
  const wl = await loadWatchlist();
  const tickers = wl.tickers;
  console.log(
    `📋 대상 ${tickers.length}종목 (KR ${tickers.filter((t) => t.market === 'KR').length} / US ${tickers.filter((t) => t.market === 'US').length})`
  );
  if (tickers.length === 0) {
    console.log('watchlist 비어있음 — 종료');
    return;
  }

  // US 종목 CIK 자동 해석 (SEC 공시용)
  await resolveCik(tickers);

  const collectors: Record<string, Collector> = {
    dart,
    sec,
    naverNews,
    naverEarnings,
    fmp,
    nasdaq,
    rss,
    // 종목과 무관한 시장 전체 재료 (브리핑 맨 앞 "오늘의 시장" 섹션)
    marketNews,
    marketIndex,
    econCalendar,
  };
  const entries = Object.entries(collectors);
  const settled = await Promise.allSettled(entries.map(([, fn]) => fn(tickers, wl)));

  const merged: Collected = {
    generatedAt: new Date().toISOString(),
    news: [],
    filings: [],
    earnings: [],
    market: { news: [], indices: [], economicEvents: [], majorEarnings: [] },
  };
  settled.forEach((r, i) => {
    const name = entries[i][0];
    if (r.status === 'fulfilled') {
      merged.news.push(...(r.value.news ?? []));
      merged.filings.push(...(r.value.filings ?? []));
      merged.earnings.push(...(r.value.earnings ?? []));
      const m = r.value.market;
      if (m) {
        merged.market.news.push(...(m.news ?? []));
        merged.market.indices.push(...(m.indices ?? []));
        merged.market.economicEvents.push(...(m.economicEvents ?? []));
        merged.market.majorEarnings.push(...(m.majorEarnings ?? []));
      }
    } else {
      console.error(`⚠️ ${name} 수집기 실패: ${r.reason}`);
    }
  });

  merged.news = dedupe(merged.news, (n) => n.url);
  merged.filings = dedupe(merged.filings, (f) => f.url);
  // 같은 실적을 두 소스(FMP·Nasdaq)가 함께 주는 경우가 있다.
  merged.earnings = dedupe(merged.earnings, (e) => `${e.ticker}|${e.eventDate ?? e.period ?? ''}`);
  // 시장 뉴스는 여러 키워드에 같은 기사가 걸린다 — URL 로 1건만 남긴다.
  merged.market.news = dedupe(merged.market.news, (n: MarketNewsItem) => n.url);
  merged.market.economicEvents = dedupe(
    merged.market.economicEvents,
    (e) => `${e.date}|${e.country}|${e.event}`
  );
  merged.market.majorEarnings = dedupe(merged.market.majorEarnings, (e) => `${e.symbol}|${e.eventDate}`);

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'collected.json');
  await writeFile(outPath, JSON.stringify(merged, null, 2), 'utf8');

  console.log(
    `🧺 수집 합계 — 뉴스 ${merged.news.length} / 공시 ${merged.filings.length} / 실적 ${merged.earnings.length}`
  );
  console.log(
    `🌐 시장 — 뉴스 ${merged.market.news.length} / 지표 ${merged.market.indices.length} / ` +
      `경제지표 ${merged.market.economicEvents.length} / 대형주실적 ${merged.market.majorEarnings.length}`
  );
  console.log(`✅ 저장: ${outPath}`);
}

main().catch((e) => {
  console.error('❌ run 예외:', e);
  process.exit(1);
});
