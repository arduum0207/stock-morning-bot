/**
 * 수집 오케스트레이터.
 *   1. watchlist.json 로드
 *   2. US 종목 CIK 자동 해석
 *   3. 5종 수집기 병렬 실행 (서로 독립, 일부 실패 허용)
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
import type { Collected, Collector } from '../types';
import dart from './dart';
import sec from './sec';
import naverNews from './naver-news';
import fmp from './fmp';
import rss from './rss';

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

  const collectors: Record<string, Collector> = { dart, sec, naverNews, fmp, rss };
  const entries = Object.entries(collectors);
  const settled = await Promise.allSettled(entries.map(([, fn]) => fn(tickers)));

  const merged: Collected = {
    generatedAt: new Date().toISOString(),
    news: [],
    filings: [],
    earnings: [],
  };
  settled.forEach((r, i) => {
    const name = entries[i][0];
    if (r.status === 'fulfilled') {
      merged.news.push(...(r.value.news ?? []));
      merged.filings.push(...(r.value.filings ?? []));
      merged.earnings.push(...(r.value.earnings ?? []));
    } else {
      console.error(`⚠️ ${name} 수집기 실패: ${r.reason}`);
    }
  });

  merged.news = dedupe(merged.news, (n) => n.url);
  merged.filings = dedupe(merged.filings, (f) => f.url);

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'collected.json');
  await writeFile(outPath, JSON.stringify(merged, null, 2), 'utf8');

  console.log(
    `🧺 수집 합계 — 뉴스 ${merged.news.length} / 공시 ${merged.filings.length} / 실적 ${merged.earnings.length}`
  );
  console.log(`✅ 저장: ${outPath}`);
}

main().catch((e) => {
  console.error('❌ run 예외:', e);
  process.exit(1);
});
