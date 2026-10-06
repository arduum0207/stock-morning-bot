/**
 * CLI: 브리핑 HTML 을 텔레그램으로 발송.
 *   npm run send out/brief-2026-06-20.html "📈 오늘의 종목 브리핑"
 *
 * 첫 인자 = 보낼 HTML 경로(필수), 둘째 인자 = caption(선택).
 * caption 을 생략하면 파일명이 그대로 캡션으로 쓰인다.
 *
 * 1) 기사 제목 옆 "🔗 복사" 버튼을 넣어 파일에 다시 저장 (copy-links.ts)
 * 2) GitHub Pages 에 올리고 "📖 브리핑 열기" 버튼 메시지로 보낸다 (publish.ts)
 *    — 텔레그램 첨부 미리보기는 JS 를 안 돌려서 복사 버튼이 안 먹기 때문. 인앱 브라우저에선 된다.
 * 3) 올리기가 실패하면 예전처럼 HTML 파일을 첨부로 보낸다 (복사 버튼은 안 먹지만 내용은 본다).
 */
import { config } from 'dotenv';
config();

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { addCopyLinks } from './copy-links';
import { publishToPages } from './publish';
import { sendDocument, sendMessage } from './telegram';

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

  let url: string;
  try {
    url = await publishToPages(file);
  } catch (e) {
    console.warn('⚠️ GitHub Pages 업로드 실패 → HTML 첨부로 대신 보냄:', (e as Error).message);
    await sendDocument(file, caption);
    console.log(`✅ 텔레그램 전송 완료(첨부): ${file}`);
    return;
  }
  await sendMessage(caption, { inlineKeyboard: [[{ text: '📖 브리핑 열기', url }]] });
  console.log(`✅ 텔레그램 전송 완료(링크): ${url}`);
}

main().catch((e) => {
  console.error('❌ 전송 실패:', (e as Error).message);
  process.exit(1);
});
