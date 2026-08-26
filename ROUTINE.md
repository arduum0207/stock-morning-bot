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
- `market`   : **종목과 무관한 시장 전체 재료** (브리핑 맨 앞 섹션용)
  - `market.news[]`         : `{ scope, source, title, url, publishedAt, summary, keyword }`
    `scope` = `macro`(금리·물가·환율) / `policy`(정책·규제·정치) / `industry`(업황) / `global`(그 외)
  - `market.indices[]`      : `{ name, symbol, price, change, changePercent, unit, asOf, source }`
    코스피·코스닥·원/달러·미국채10년·**WTI·브렌트·금**(네이버, 실시간)
    + S&P500·나스닥·다우·VIX·비트코인(FMP, 실시간)
    + 달러인덱스·미국채2년·**장단기 금리차(10Y-2Y)**(FRED)
    ⚠️ FRED 계열(`source:"fred"`)만 갱신이 늦다(1~5영업일). `asOf` 가 오늘이 아니면
    **"(8/21 기준)" 처럼 날짜를 붙여라.** 금리·스프레드는 `changePercent` 가 null 이고
    `change` 가 %p 단위다.
  - `market.economicEvents[]`: `{ date, time(GMT), country, event, importance, actual, consensus, previous }`
    어제~향후 3영업일. 주요국만, 국채 입찰류 노이즈는 이미 걸러져 있다.
    **`importance`(high/medium/low) 순으로 정렬돼 있다** — 위에서부터 집으면 된다.
  - `market.majorEarnings[]` : `{ symbol, name, eventDate, when, marketCap, epsEstimated }`
    향후 7일 이내 발표하는 시총 1,000억 달러 이상 대형주 (보유 종목 아니어도 포함)

### 3. 큐레이션 (네가 판단)

#### 3-0. 시장 개요 — **브리핑 맨 앞에 온다**
보유 종목 얘기를 하기 전에, 시장 전체를 먼저 짚는다. `market` 필드로 아래 4블록을 만든다.

1. **시장 지표 스트립** — `market.indices` 를 한 줄로. 코스피·코스닥·원달러·미국채10년·S&P500·나스닥 순,
   그 뒤에 WTI·금·VIX·장단기 금리차. **금리차가 마이너스(역전)면 반드시 짚어라.**
   유가가 크게 움직인 날(±2% 이상)은 헤드라인에서 원인을 함께 짚는다.
   등락률에 한국식 색(상승=빨강, 하락=파랑)을 입힌다. 값이 없는 지표는 그냥 뺀다.
2. **오늘의 시장 헤드라인 3~5개** — `market.news` 에서 고른다. 기준:
   - 세계적으로 중요한 사건 / 매크로 변동(금리·물가·환율·유가) / 금융시장에 영향을 줄 정책·정치
     변화 / 산업 생태계(반도체·AI·에너지 등) 지형 변화 — 이 넷 중 하나에 해당할 것.
   - **개별 종목 시황 기사·홍보성·"~ETF 추천" 류는 버린다.** `scope` 는 참고용 힌트일 뿐이고,
     실제 판단은 제목·요약을 보고 네가 한다(키워드 검색이라 엉뚱한 기사가 섞여 들어온다).
   - 같은 사건 중복 기사는 1개로 합치고, **한국어 2~3문장**으로 요약 + "왜 중요한지" 한 줄.
   - 보유 종목에 영향이 있는 항목은 그 종목명을 함께 적어 준다(예: "→ 삼성전자·SK하이닉스").
3. **주요 경제지표** — `market.economicEvents` 에서 **의미 있는 것만 3~6개**.
   - **`importance:"high"` 를 먼저 쓰고**, 자리가 남으면 medium 에서 채운다. low 는 웬만하면 버린다.
     (등급은 이벤트 이름으로 우리가 매긴 것이라 완벽하진 않다 — 명백히 사소하면 네가 빼라.)
   - 어제 발표(`actual` 있음)는 컨센서스 대비 어땠는지, 예정된 건 날짜·시각과 컨센서스를 적는다.
   - 같은 지표의 MoM/YoY 가 이름이 같은 채로 두 줄 오는 경우가 있다(예: PCE Price Index).
     한 항목으로 합쳐서 "전월비 +0.2% / 전년비 +3.3%" 처럼 쓴다.
   - 시각은 GMT 기준이다 — **한국시간(KST=GMT+9)으로 환산**해 표기한다.
4. **주요 기업 실적 일정** — `market.majorEarnings` 에서 이름 있는 곳 위주로 5개 내외.
   - 오늘/내일 발표하는 대형주(특히 엔비디아·브로드컴 등 보유 종목과 같은 섹터)는 강조한다.
   - 이미 `earnings[]` 에 있는 보유 종목 실적은 여기 중복해 넣지 말고 종목 섹션에서 다룬다.

> 재료가 얇을 때(예: `market.news` 가 전부 잡음)는 **웹서치 1~2회로 보강**해도 된다
> ("오늘 글로벌 증시" · "간밤 뉴욕증시 마감" 등). 그래도 없으면 그 블록은 통째로 생략한다 —
> 억지로 채우지 마라.

#### 3-1. 종목별 큐레이션
- **종목별로 묶는다.** 종목 안에서 같은 사건의 중복 기사는 1개로 합친다.
- 종목당 **중요한 것 위주로 3~5개**만. 단순 시세 반복·홍보성 기사는 버린다.
- 각 항목에 **한국어 1~2문장 요약**을 단다 (원문 제목이 영어면 핵심을 한국어로).
- **영향 분류**: 긍정/부정/중립. 공시는 `공시` 태그.
- 보유 종목에 직접 영향이 큰 항목은 **상단·강조(relevant)**.
- 맨 위에 **오늘의 한 줄 시그널**(전체 흐름 요약)을 만든다.

#### 3-2. 감시포인트(watchPoints) 우선 확인
- `watchlist.json`에서 종목에 `watchPoints`(문자열 배열)가 있으면, 그 종목의 `news[]`/`filings[]`를 **그 항목들과 먼저 대조**한다. 이건 사용자가 MONEY_PROJECT `/intel` 논지 모니터에 등록해 둔 손절/재검토 트리거(가격이 아니라 펀더멘털 기준)와 동일하다.
- 매칭되는 기사가 있으면 `relevant` + 어떤 watchPoint와 관련되는지 한 줄 명시(예: "⚠️ 감시포인트: RPO 감소 여부 — 관련 기사").
- `collected.json`에 watchPoints 관련 기사가 전혀 없으면, **그 종목에 한해서만** 가볍게 웹서치 1~2회로 보강 확인한다(예: `"{회사명} {watchPoint 핵심어} news"`). 찾은 게 있으면 카드로 추가, 없으면 굳이 "특이사항 없음"을 매번 쓰지 않아도 된다 — 매칭 안 된 watchPoint는 조용히 넘어간다.
- watchPoints가 없는 종목(005930·000660·NBIS·MVIS·INVZ·AEVA)은 기존 방식 그대로, 보강 검색 없이 진행한다.
- 실적(earnings) 표기:
  - US: `eventDate`(발표 예정일) + EPS/매출 컨센 — 임박한 것만.
  - KR: `eventDate`는 null이다. `period`(예 "2026.06") + 컨센서스(매출·영업이익·EPS, **단위 `unit`="억원"** → 조 단위로 환산해 보여주면 가독성↑) + `targetPrice`(목표주가, 원).

### 4. HTML 생성
`out/brief-<YYYY-MM-DD>.html` 로 저장한다. 규칙:
- **`templates/sample-brief.html` 과 같은 톤·구조**로 만든다 (그 파일을 먼저 읽어 스타일을 맞춰라).
- **순서: ① 오늘의 한 줄 → ② 시장 개요(3-0의 4블록) → ③ 종목별 섹션.** 시장 개요가 종목보다 앞이다.
- **100% 자체완결형**: 외부 CSS/JS/폰트/이미지 금지. 모든 스타일은 `<style>` 인라인.
- **모든 제목은 실제 원문 URL 로 링크** (`collected.json` 의 `url`). `target="_blank" rel="noopener"`.
- 한국식 등락 색: 상승/긍정=빨강, 하락/부정=파랑, 중립=회색.
- 날짜·종목 수를 헤더에 표기.

### 5. 텔레그램 발송 — 요약 한 줄 먼저, 그다음 HTML
유저가 첨부를 안 열어도 한눈에 보게, **짧은 요약을 먼저** 보내고 HTML을 첨부한다.
```bash
npm run send-text "📈 <시장 한 줄> · 오늘 <N>건 — 삼성: <핵심1> / NVDA: <핵심2>"
npm run send out/brief-<YYYY-MM-DD>.html "📈 오늘의 종목 브리핑 · <월/일>"
```
- 요약 한 줄은 **시장 한 줄(지수·최대 이슈) + 종목별 가장 중요한 것만** 추려 1줄로
  (parse_mode=HTML, `<b>` 등만 허용, `<`·`>`는 `&lt;`·`&gt;`).
- 종목 재료가 0건이어도 **시장 개요가 있으면 HTML을 만들어 보낸다**(시장 섹션만 담아서).
  종목·시장 모두 0건일 때만 HTML 없이 `npm run send-text "📭 오늘은 보유 종목 관련 특이사항이 없습니다."` 만 보낸다.

### 6. 마무리
세션 로그에 보낸 항목 수와 HTML 경로를 남긴다. `out/` 은 커밋하지 않는다(.gitignore).

---

## 실패 대응
- `npm run collect` 가 throw → watchlist.json / 환경변수 / 네트워크 allowlist 를 점검(README 트러블슈팅 참고). 그래도 안 되면 그 사실을 텔레그램으로 1줄 알린다.
- 텔레그램 전송 실패 → `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 와 `api.telegram.org` allowlist 확인.
