/**
 * CLI: HTML 파일을 텔레그램으로 발송.
 *   npm run send out/brief-2026-06-20.html "📈 오늘의 종목 브리핑"
 *
 * 첫 인자 = 보낼 HTML 경로(필수), 둘째 인자 = caption(선택).
 * caption 을 생략하면 파일명이 그대로 캡션으로 쓰인다.
 * 문서 다음에 "탭하면 링크 복사" 버튼 메시지를 이어서 보낸다 (copy-links.ts).
 */
import { config } from 'dotenv';
config();

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { copyButtons, extractTitleLinks } from './copy-links';
import { sendDocument, sendMessage } from './telegram';

const BUTTONS_PER_MSG = 60; // 인라인 키보드는 메시지당 버튼 수 제한(100)이 있어 넉넉히 나눈다

/** 기사 링크를 탭 한 번에 복사하는 버튼 메시지. 실패해도 브리핑 본문은 이미 갔으니 경고만 남긴다. */
async function sendCopyButtons(html: string): Promise<void> {
  const rows = copyButtons(extractTitleLinks(html));
  for (let i = 0; i < rows.length; i += BUTTONS_PER_MSG) {
    const head = i === 0 ? '🔗 <b>기사 링크</b> — 버튼을 누르면 링크가 바로 복사돼요' : '🔗 <b>기사 링크 (계속)</b>';
    await sendMessage(head, { inlineKeyboard: rows.slice(i, i + BUTTONS_PER_MSG) });
  }
  console.log(`🔗 링크 복사 버튼 전송 (${rows.length}줄)`);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('사용법: npm run send <html파일경로> [caption]');
    process.exit(1);
  }
  const caption = process.argv[3] || `📈 ${basename(file)}`;
  await sendDocument(file, caption);
  console.log(`✅ 텔레그램 전송 완료: ${file}`);
  try {
    await sendCopyButtons(await readFile(file, 'utf8'));
  } catch (e) {
    console.warn('⚠️ 링크 복사 버튼 전송 실패(브리핑은 전송됨):', (e as Error).message);
  }
}

main().catch((e) => {
  console.error('❌ 전송 실패:', (e as Error).message);
  process.exit(1);
});
