# 📈 stock-morning-bot

> 내가 보유하거나 관심 있는 종목의 **뉴스·공시·실적**을, 매일 아침 **텔레그램으로** 예쁘게 정리해서 보내주는 봇.

Claude Code 의 **예약 루틴(클라우드)** 으로 돌아갑니다. 노트북을 꺼놔도 Anthropic 클라우드에서 매일 알아서 실행돼요. 비용은 **각자 자기 Claude 구독 사용량**에서 차감됩니다 (별도 API 충전·VM 과금 없음).

매일 아침 텔레그램으로 **HTML 파일**이 도착하고, 탭하면 종목별로 정리된 페이지가 열립니다. 기사 제목을 누르면 **진짜 원문 기사/공시**로 연결돼요.

---

## 🧭 동작 방식

```
 [예약 루틴 매일 아침 실행 — Anthropic 클라우드]
        │
        ├─ 1. npm run collect      뉴스·공시·실적 수집 → out/collected.json
        ├─ 2. Claude(구독)가 요약·정렬 → 예쁜 HTML 생성
        └─ 3. npm run send         텔레그램으로 HTML 첨부 전송
                                          │
                                          ▼
                              📱 내 텔레그램에 도착
                              탭 → 페이지 → 기사 클릭 → 원문
```

- **요약·HTML 작성은 Claude 에이전트(구독)가 직접** 합니다. 외부 LLM API를 안 쓰므로 종량 과금이 없습니다.
- 데이터 수집(`collect`)은 LLM 없이 순수 API 호출입니다.

---

## 🚀 빠른 시작 (친구용 5단계)

> 필요한 건 **① Claude 구독(Pro/Max) ② GitHub 계정 ③ 텔레그램** 셋입니다.
> Claude Code on the web(예약 루틴)은 현재 Pro/Max/Team 대상 리서치 프리뷰입니다.

### 1단계 — 이 레포를 내 계정으로 Fork

GitHub에서 이 레포 우측 상단 **[Fork]** 버튼 클릭. 끝. (다운로드/재업로드 아님 — 내 계정에 복사본이 생깁니다.)

### 2단계 — API 키 발급 (전부 무료)

| 무엇 | 어디서 | 받는 값 |
|---|---|---|
| **텔레그램 봇** | 텔레그램에서 [@BotFather](https://t.me/BotFather) → `/newbot` | `TELEGRAM_BOT_TOKEN` |
| **내 chat_id** | 만든 봇에게 아무 말이나 보낸 뒤 [@userinfobot](https://t.me/userinfobot) 에게 `/start` | `TELEGRAM_CHAT_ID` |
| **네이버 검색**(KR 뉴스) | https://developers.naver.com → 애플리케이션 등록 → "검색" API | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` |
| **DART**(KR 공시) | https://opendart.fss.or.kr → 인증키 신청 | `DART_API_KEY` |
| **FMP**(US 실적) | https://financialmodelingprep.com → 무료 가입 | `FMP_API_KEY` |

> US 뉴스(Yahoo)·US 공시(SEC)는 키가 필요 없습니다.
> **KR 종목만** 본다면 FMP는 생략 가능. **US 종목만** 본다면 네이버·DART 생략 가능.
> 키를 일부만 넣어도 그 소스만 동작합니다.

### 3단계 — 종목 리스트 편집

방법은 두 가지. **둘 중 아무거나** 써도 되고 섞어도 돼.

**(A) 텔레그램으로 (편함)** — 봇에게 말로 추가/삭제. 종목명만 말해도 자동으로 티커를 찾아줘:
```
/add 삼성전자       ← 이름으로 추가 (자동완성으로 005930/KR 해석)
/add NVDA          ← 티커로 추가
/remove 한화시스템   ← 삭제 (/rm 도 됨)
/list              ← 현재 목록 보기
```
> ⏰ 단, 봇은 **하루 한 번(아침 실행)만 깨어나서** 명령을 일괄 처리·회신해. 오후에 `/add` 하면 **다음 날 아침에 반영**되고 그때 확인 메시지가 와. (실시간 응답이 아니야 — 서버가 항상 켜져 있지 않으니까.)

**(B) GitHub에서 직접** — 내 포크의 [`watchlist.json`](watchlist.json) 을 웹에서 편집(연필 아이콘) → 종목 교체 → **Commit**. 즉시 다음 실행에 반영.

```json
{
  "tickers": [
    { "ticker": "005930", "name": "삼성전자", "market": "KR", "dartCorpCode": "00126380" },
    { "ticker": "000660", "name": "SK하이닉스", "market": "KR", "dartCorpCode": "00164779" },
    { "ticker": "NVDA", "name": "NVIDIA", "market": "US" },
    { "ticker": "AAPL", "name": "Apple", "market": "US" }
  ]
}
```
- `market`: `"KR"` 또는 `"US"`.
- `dartCorpCode`(KR, 선택): 있으면 그 종목 **공시**도 수집. 없으면 뉴스만. → [DART 고유번호 찾는 법](https://opendart.fss.or.kr/disclosureinfo/fnltt/dwld/main.do) (없어도 뉴스는 종목명으로 수집됨).
- US 종목은 ticker만 넣으면 SEC 공시용 CIK가 자동 해석됩니다.

### 4단계 — Cloud Environment 설정 (가장 중요)

[claude.ai/code](https://claude.ai/code) 에서 GitHub을 연결(GitHub App 승인 또는 터미널에서 `/web-setup`)한 뒤, **환경(Environment)** 을 만들고 두 가지를 설정합니다.

**(a) Environment variables** — `.env` 형식, 한 줄에 `KEY=value`, **따옴표 없이**:
```
TELEGRAM_BOT_TOKEN=123456789:AA...
TELEGRAM_CHAT_ID=123456789
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
DART_API_KEY=...
FMP_API_KEY=...
COLLECT_USER_AGENT=내이름 my-email@example.com
```

**(b) Network access → `Custom`** 으로 바꾸고 **Allowed domains** 에 아래를 추가
("Also include default list of common package managers" 체크 → `npm install` 유지):
```
api.telegram.org
openapi.naver.com
opendart.fss.or.kr
dart.fss.or.kr
financialmodelingprep.com
feeds.finance.yahoo.com
data.sec.gov
www.sec.gov
```
> ⚠️ **이걸 안 하면 봇이 조용히 실패합니다.** 기본 네트워크(Trusted)는 패키지 레지스트리만 허용해서 텔레그램·뉴스·공시 도메인이 전부 막혀 있어요. 위 목록을 꼭 추가하세요.

### 5단계 — 예약 걸기

Claude Code(터미널 또는 웹)에서:
```
/schedule
```
- 대상 레포: **내 포크**
- 환경: 4단계에서 만든 환경
- 시각: 매일 아침 (예: 평일 07:30)
- 프롬프트: **`ROUTINE.md 를 읽고 그대로 수행해.`**

끝! 다음 날 아침부터 텔레그램으로 브리핑이 옵니다.

---

## 🧪 로컬에서 먼저 테스트 (선택)

클라우드에 올리기 전에 내 PC에서 동작을 확인하려면:

```bash
npm install
cp .env.example .env      # .env 를 열어 키 입력
cp watchlist.example.json watchlist.json   # 종목 편집 (이미 watchlist.json 있으면 생략)

npm run collect           # out/collected.json 생성 확인
npm run send out/collected.json "테스트"   # 텔레그램 도착 확인(아무 파일이나 첨부 테스트)
```
> HTML 생성은 원래 Claude가 하는 단계라, 로컬에선 `collect` 와 `send`(전송 경로)만 확인하면 충분합니다.

---

## ⚠️ 알아둘 것

- **시크릿 가시성**: 현재 Claude Code 클라우드엔 전용 시크릿 저장소가 없어서, 환경변수는 *그 환경을 편집할 수 있는 사람에게 보입니다*. 혼자 쓰는 개인 계정이면 문제없지만, **환경(또는 키)을 남과 공유하지 마세요.**
- **요금**: 예약 루틴은 별도 VM 과금 없이 **내 Claude 구독의 사용량 한도**를 같이 씁니다. 하루 1회 아침 실행은 부담 적습니다.
- **자격**: Claude Code on the web/예약 루틴은 Pro/Max/Team 플랜 대상(리서치 프리뷰). 플랜에 따라 안 보일 수 있습니다.
- **종목 바꾸기**: 언제든 포크의 `watchlist.json` 만 수정·커밋하면 다음 실행부터 반영됩니다.

---

## 🩺 트러블슈팅

| 증상 | 원인/해결 |
|---|---|
| 아침에 아무것도 안 옴 | 십중팔구 **Network allowlist 누락**. 4단계 (b) 도메인 확인. 그다음 `TELEGRAM_*` 값 확인 |
| 뉴스가 KR만/US만 옴 | 해당 시장 키 미입력. 2단계 표 참고 |
| KR 공시가 안 옴 | `watchlist.json` 에 `dartCorpCode` 없음 (뉴스는 정상). 고유번호 추가하면 공시도 수집 |
| `watchlist 파일을 찾을 수 없습니다` | 포크에 `watchlist.json` 커밋 안 됨 |
| 예약 실행이 실패로 끝남 | 세션 로그에서 어느 단계인지 확인 → `npm install`(setup) / collect / send 순 |

---

## 🔧 직접 손보기

- 수집 소스 추가/수정: [`src/collect/`](src/collect/) — 각 파일이 독립 수집기. `run.ts` 의 `collectors` 에 등록.
- 발송 방식 변경: [`src/telegram.ts`](src/telegram.ts) (`sendDocument`/`sendMessage`).
- 브리핑 디자인: [`templates/sample-brief.html`](templates/sample-brief.html) 을 고치면 에이전트가 그 톤을 따릅니다.
- 매일 절차: [`ROUTINE.md`](ROUTINE.md).
