/**
 * CLI: 짧은 텍스트(HTML) 메시지를 텔레그램으로 전송.
 * 브리핑 HTML 첨부 전에 "오늘의 한 줄 요약"을 먼저 쏘는 용도 (안 열어도 한눈에 파악).
 *   npm run send-text "📈 오늘 7건 — 삼성: 특허소송·목표가↑ / NVDA: 8-K·실적 8/26"
 *
 * 텔레그램 parse_mode=HTML 이라 <b> <i> <a href> 등만 허용. < > 는 &lt; &gt; 로.
 */
import { config } from 'dotenv';
config();

import { sendMessage } from './telegram';

async function main() {
  const text = process.argv.slice(2).join(' ').trim();
  if (!text) {
    console.error('사용법: npm run send-text "<요약 메시지(HTML)>"');
    process.exit(1);
  }
  await sendMessage(text);
  console.log('✅ 텔레그램 텍스트 전송 완료');
}

main().catch((e) => {
  console.error('❌ 전송 실패:', (e as Error).message);
  process.exit(1);
});
