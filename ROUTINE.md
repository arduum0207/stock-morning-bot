# ROUTINE — 매일 아침 종목 브리핑 (예약 에이전트용 지시문)

이 파일은 **Claude Code 예약 루틴**이 매일 실행할 작업 절차다.
`/schedule` 로 루틴을 만들 때, 프롬프트에 **"ROUTINE.md 를 읽고 그대로 수행하라"** 라고 적으면 된다.

> 핵심 원칙: **요약과 HTML 생성은 너(에이전트, 구독)가 직접** 한다.
> 외부 LLM API(`ANTHROPIC_API_KEY` 등)를 호출하지 마라 — 종량 과금이 발생한다.

---

## 단계

### 1. 데이터 수집
```bash
npm run collect
```
→ `out/collected.json` 생성. 출력 로그로 뉴스/공시/실적 건수를 확인한다.
일부 수집기가 실패(키 없음 등)해도 정상이다. 전부 0건이면 5단계의 "특이사항 없음"으로 간다.

### 2. collected.json 읽기
`out/collected.json` 구조:
- `news[]`   : `{ ticker, market, source, title, url, publishedAt, summary }`
- `filings[]`: `{ ticker, market, source, formType, title, url, filedAt }`
- `earnings[]`: `{ ticker, market, eventDate, eps/revenue Estimated/Actual }`

### 3. 큐레이션 (네가 판단)
- **종목별로 묶는다.** 종목 안에서 같은 사건의 중복 기사는 1개로 합친다.
- 종목당 **중요한 것 위주로 3~5개**만. 단순 시세 반복·홍보성 기사는 버린다.
- 각 항목에 **한국어 1~2문장 요약**을 단다 (원문 제목이 영어면 핵심을 한국어로).
- **영향 분류**: 긍정/부정/중립. 공시는 `공시` 태그.
- 보유 종목에 직접 영향이 큰 항목은 **상단·강조(relevant)**.
- 맨 위에 **오늘의 한 줄 시그널**(전체 흐름 요약)을 만든다.
- 실적 일정(earnings)은 임박한 것만 간단히 언급.

### 4. HTML 생성
`out/brief-<YYYY-MM-DD>.html` 로 저장한다. 규칙:
- **`templates/sample-brief.html` 과 같은 톤·구조**로 만든다 (그 파일을 먼저 읽어 스타일을 맞춰라).
- **100% 자체완결형**: 외부 CSS/JS/폰트/이미지 금지. 모든 스타일은 `<style>` 인라인.
- **모든 제목은 실제 원문 URL 로 링크** (`collected.json` 의 `url`). `target="_blank" rel="noopener"`.
- 한국식 등락 색: 상승/긍정=빨강, 하락/부정=파랑, 중립=회색.
- 날짜·종목 수를 헤더에 표기.

### 5. 텔레그램 발송
```bash
npm run send out/brief-<YYYY-MM-DD>.html "📈 오늘의 종목 브리핑 · <월/일>"
```
- 수집 결과가 전부 0건이면 HTML 대신 짧은 알림만 보낸다. 예:
  Node 한 줄 또는 별도 스크립트로 `sendMessage("📭 오늘은 보유 종목 관련 특이사항이 없습니다.")` 를 호출.
  (`src/telegram.ts` 의 `sendMessage` 사용.)

### 6. 마무리
세션 로그에 보낸 항목 수와 HTML 경로를 남긴다. `out/` 은 커밋하지 않는다(.gitignore).

---

## 실패 대응
- `npm run collect` 가 throw → watchlist.json / 환경변수 / 네트워크 allowlist 를 점검(README 트러블슈팅 참고). 그래도 안 되면 그 사실을 텔레그램으로 1줄 알린다.
- 텔레그램 전송 실패 → `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 와 `api.telegram.org` allowlist 확인.
