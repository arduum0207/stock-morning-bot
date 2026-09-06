/**
 * 실행 게이트: 주말(KST 토·일)에는 브리핑을 돌리지 않는다.
 * 한국·미국 증시 모두 쉬는 날이라 수집해 봐야 새 재료가 없고, 구독 사용량만 먹는다.
 *
 * 마지막 줄에 `RUN` 또는 `SKIP` 을 찍는다 (commands.ts 의 CHANGED/NOCHANGE 와 같은 규약).
 * 예약 루틴은 SKIP 이면 아무것도 하지 않고 그 자리에서 끝낸다 — 텔레그램 발송도 없다.
 *
 * 기준 시각은 KST(Asia/Seoul) 고정. 클라우드 세션은 UTC 로 도니까 서버 로컬시각을 믿으면 안 된다.
 * 수동 테스트로 주말에도 돌려보고 싶으면 `FORCE_RUN=1 npm run gate`.
 */
const KST_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  weekday: 'short',
});
const KST_DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  dateStyle: 'medium',
});

const WEEKEND = new Set(['Sat', 'Sun']);

const now = new Date();
const day = KST_DAY.format(now); // 'Mon' ... 'Sun'
const isWeekend = WEEKEND.has(day);
const forced = process.env.FORCE_RUN === '1';

console.log(`· KST 기준 ${KST_DATE.format(now)} (${day})`);
if (isWeekend && forced) console.log('· 주말이지만 FORCE_RUN=1 → 강제 실행');
else if (isWeekend) console.log('· 주말 — 증시 휴장이라 브리핑을 건너뛴다');

console.log(isWeekend && !forced ? 'SKIP' : 'RUN');
