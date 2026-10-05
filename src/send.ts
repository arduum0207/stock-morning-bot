/**
 * CLI: HTML 파일을 텔레그램으로 발송.
 *   npm run send out/brief-2026-06-20.html "📈 오늘의 종목 브리핑"
 *
 * 첫 인자 = 보낼 HTML 경로(필수), 둘째 인자 = caption(선택).
 * caption 을 생략하면 파일명이 그대로 캡션으로 쓰인다.
 * 보내기 전에 기사 제목 옆 "링크 복사" 버튼을 넣어 파일에 다시 저장한다 (copy-links.ts).
 */
import { config } from 'dotenv';
config();

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { addCopyLinks } from './copy-links';
import { sendDocument } from './telegram';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('사용법: npm run send <html파일경로> [caption]');
    process.exit(1);
  }
  const caption = process.argv[3] || `📈 ${basename(file)}`;
  const html = await readFile(file, 'utf8');
  const withCopy = addCopyLinks(html);
  if (withCopy !== html) await writeFile(file, withCopy);
  await sendDocument(file, caption);
  console.log(`✅ 텔레그램 전송 완료: ${file}`);
}

main().catch((e) => {
  console.error('❌ 전송 실패:', (e as Error).message);
  process.exit(1);
});
