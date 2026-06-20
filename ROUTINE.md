# ROUTINE — 매일 아침 종목 브리핑 (예약 에이전트용 지시문)

이 파일은 **Claude Code 예약 루틴**이 매일 실행할 작업 절차다.
`/schedule` 로 루틴을 만들 때, 프롬프트에 **"ROUTINE.md 를 읽고 그대로 수행하라"** 라고 적으면 된다.

> 핵심 원칙: **요약과 HTML 생성은 너(에이전트, 구독)가 직접** 한다.
> 외부 LLM API(`ANTHROPIC_API_KEY` 등)를 호출하지 마라 — 종량 과금이 발생한다.

---

## 단계

### 0. 텔레그램 명령 처리 (관심종목 추가/삭제)
```bash
npm run commands
```
→ 그동안 유저가 보낸 `/add`·`/remove`·`/list` 를 수거해 `watchlist.json` 을 갱신하고 결과를 회신한다.
- 출력 **마지막 줄이 `CHANGED`** 이면 `watchlist.json` 이 바뀐 것:
  - **로컬 모드**: working folder가 디스크에 그대로 남으므로 `npm run commands` 가 파일을 저장한 것으로 **영속화 끝.** 커밋 불필요.
  - **클라우드 모드**: 매 실행 새 clone이라 휘발 → **레포에 커밋·푸시해야** 다음 실행에 유지된다:
    ```bash
    git add watchlist.json && git commit -m "chore: watchlist 업데이트 (telegram)" && git push
    ```
    (push가 막히면 그 사실만 텔레그램으로 1줄 알리고 진행 — 변경은 다음 실행에서 재시도.)
- `NOCHANGE` 면 다음 단계로.

> getUpdates가 네트워크 오류로 실패해도(드묾) 치명적이지 않다 — 그 회차 명령만 다음 실행으로 미뤄질 뿐. 수집·발송은 계속 진행한다.

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
- 실적(earnings) 표기:
  - US: `eventDate`(발표 예정일) + EPS/매출 컨센 — 임박한 것만.
  - KR: `eventDate`는 null이다. `period`(예 "2026.06") + 컨센서스(매출·영업이익·EPS, **단위 `unit`="억원"** → 조 단위로 환산해 보여주면 가독성↑) + `targetPrice`(목표주가, 원).

### 4. HTML 생성
`out/brief-<YYYY-MM-DD>.html` 로 저장한다. 규칙:
- **`templates/sample-brief.html` 과 같은 톤·구조**로 만든다 (그 파일을 먼저 읽어 스타일을 맞춰라).
- **100% 자체완결형**: 외부 CSS/JS/폰트/이미지 금지. 모든 스타일은 `<style>` 인라인.
- **모든 제목은 실제 원문 URL 로 링크** (`collected.json` 의 `url`). `target="_blank" rel="noopener"`.
- 한국식 등락 색: 상승/긍정=빨강, 하락/부정=파랑, 중립=회색.
- 날짜·종목 수를 헤더에 표기.

### 5. 텔레그램 발송 — 요약 한 줄 먼저, 그다음 HTML
유저가 첨부를 안 열어도 한눈에 보게, **짧은 요약을 먼저** 보내고 HTML을 첨부한다.
```bash
npm run send-text "📈 오늘 <N>건 — 삼성: <핵심1> / NVDA: <핵심2>"
npm run send out/brief-<YYYY-MM-DD>.html "📈 오늘의 종목 브리핑 · <월/일>"
```
- 요약 한 줄은 **종목별 가장 중요한 것만** 추려 1줄로 (parse_mode=HTML, `<b>` 등만 허용, `<`·`>`는 `&lt;`·`&gt;`).
- 수집 결과가 전부 0건이면 HTML 없이 `npm run send-text "📭 오늘은 보유 종목 관련 특이사항이 없습니다."` 만 보낸다.

### 6. 마무리
세션 로그에 보낸 항목 수와 HTML 경로를 남긴다. `out/` 은 커밋하지 않는다(.gitignore).

---

## 실패 대응
- `npm run collect` 가 throw → watchlist.json / 환경변수 / 네트워크 allowlist 를 점검(README 트러블슈팅 참고). 그래도 안 되면 그 사실을 텔레그램으로 1줄 알린다.
- 텔레그램 전송 실패 → `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 와 `api.telegram.org` allowlist 확인.
