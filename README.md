# 📈 stock-morning-bot

> 내가 보유하거나 관심 있는 종목의 **뉴스·공시·실적**을, 매일 아침 **텔레그램으로** 예쁘게 정리해서 보내주는 봇.

Claude Code의 **예약 작업**으로 돌아갑니다. 비용은 **각자 자기 Claude 구독 사용량**에서 차감돼요 (별도 API 충전·VM 과금 없음). 매일 아침 텔레그램으로 **HTML 파일**이 도착하고, 탭하면 종목별로 정리된 페이지가 열려요. 기사 제목을 누르면 **진짜 원문 기사/공시**로 연결됩니다.

> 🤖 **빠르게 셋업하기**: 레포를 클론해 그 폴더를 **Claude Code(Desktop)로 열고** 이렇게 말하세요 —
> *"README랑 SETUP.md 보고 셋업 도와줘. API 키는 내가 직접 발급해서 `.env`에 넣을게."*
> → Claude가 `npm install`·`watchlist.json` 편집·예약작업 생성까지 대신 해줍니다.
> **직접 해야 하는 건 딱 2가지**: ① [SETUP.md](SETUP.md) 따라 API 키 발급 ② 그 값을 `.env`에 입력.

---

## ⚙️ 먼저 — 두 가지 실행 모드 중 선택

| | 🖥️ 로컬 (Desktop 예약 작업) | ☁️ 클라우드 (예약 루틴) |
|---|---|---|
| 실행 위치 | 내 PC | Anthropic 클라우드 |
| PC 꺼도 됨? | ❌ 그 시각 PC 켜둬야 | ✅ 꺼도 됨 |
| **KR 종목**(네이버·DART) | ✅ 됨 | ❌ **차단됨** ↓ |
| US 종목 | ✅ | ✅ |
| 셋업 난이도 | **쉬움** (`.env` + 폴더 지정) | 복잡 (환경·도메인 allowlist) |

> ⚠️ **클라우드는 한국 금융 도메인(naver·DART)을 막습니다.** 프록시 정책(`x-block-reason: hostname_blocked`)이라 allowlist·Full로도 못 풀어요. → **KR 종목을 보려면 반드시 로컬 모드.** US만 보면 클라우드도 OK.

**고르기**: KR 종목 있음 → **로컬**(아래 🖥️). US만 + PC 끄고 싶음 → 클라우드(🚀).

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

## 🖥️ 로컬 모드 셋업 (KR 종목이면 이거 — 제일 쉬움)

내 PC의 Claude Code Desktop에서 매일 아침 자동 실행. 한국 IP라 네이버·DART 전부 정상.

1. **레포 받기**
   ```bash
   git clone https://github.com/<your-id>/stock-morning-bot
   cd stock-morning-bot && npm install
   ```
2. **키 입력**: `.env.example` → `.env` 로 복사 후 값 채우기. 키 발급은 [SETUP.md](SETUP.md). (로컬은 `.env` 파일에 직접 넣음)
3. **종목 편집**: `watchlist.json` (아래 [3단계](#3단계--종목-리스트-편집) 참고)
4. **예약 작업 생성**: Claude Code Desktop → **Routines → New routine → `Local`** 선택
   - Instructions: `ROUTINE.md를 읽고 그대로 수행해.`
   - **Working folder**: 위 폴더 / Model: Sonnet / Schedule: **Daily 07:30** / Permission: 자동 실행(묻지 않음)
5. **첫 실행**: `Run now` → 뜨는 권한 프롬프트마다 **"always allow"** → 텔레그램 도착 확인
6. 그 시각 PC 깨어 있게: Settings → Desktop app → **Keep computer awake**

> 로컬은 **환경변수·네트워크 allowlist 설정이 없습니다.** `.env` 파일과 네 PC 네트워크를 그대로 쓰기 때문 — 그래서 쉬워요. (클라우드의 그 allowlist 지옥이 없음)

---

## 🚀 클라우드 모드 셋업 (US 전용, PC 꺼도 됨)

> ⚠️ 위에서 봤듯 **KR 종목은 클라우드에서 안 됩니다.** US 종목만 볼 때 쓰세요.
> 필요한 건 **① Claude 구독(Pro/Max) ② GitHub 계정 ③ 텔레그램**. Claude Code on the web(예약 루틴)은 Pro/Max/Team 리서치 프리뷰.

### 1단계 — 이 레포를 내 계정으로 Fork

GitHub에서 이 레포 우측 상단 **[Fork]** 버튼 클릭. 끝. (다운로드/재업로드 아님 — 내 계정에 복사본이 생깁니다.)

### 2단계 — API 키 발급 (전부 무료)

> 📋 **클릭 단위 상세 발급법은 [SETUP.md](SETUP.md) 를 보세요.** 아래는 요약표입니다.

| 무엇 | 어디서 | 받는 값 |
|---|---|---|
| **텔레그램 봇**(필수) | [@BotFather](https://t.me/BotFather) → `/newbot` | `TELEGRAM_BOT_TOKEN` |
| **내 chat_id**(필수) | 봇에게 말 건 뒤 `…/getUpdates` 또는 [@userinfobot](https://t.me/userinfobot) | `TELEGRAM_CHAT_ID` |
| **네이버 검색**(KR 뉴스) | https://developers.naver.com → 애플리케이션 등록 → "검색" | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` |
| **DART**(KR 공시) | https://opendart.fss.or.kr → 인증키 신청 | `DART_API_KEY` |
| **FMP**(US 실적) | https://financialmodelingprep.com → 무료 가입 | `FMP_API_KEY` |

> **꼭 필요한 건 텔레그램 2개뿐.** US 뉴스(Yahoo)·US 공시(SEC)·KR 실적 컨센(네이버 금융)은 키 불필요.
> **KR만** 보면 FMP 생략, **US만** 보면 네이버·DART 생략. 일부만 넣어도 그 소스만 동작합니다.

### 3단계 — 종목 리스트 편집

종목은 `watchlist.json` 에 들어갑니다. 추가/삭제 방법은 **3가지** — 편한 거 아무거나 쓰세요.

#### (A) 텔레그램으로 (폰에서 편함)
봇에게 메시지를 보내면 됩니다. **종목명만 말해도 티커를 자동으로 찾아줘요:**
```
/list                현재 목록 보기
/add 삼성전자         이름으로 추가 (자동완성으로 005930/KR 해석)
/add NVDA            티커로 추가
/remove NVDA         삭제 (/rm 도 됨)
/help                사용법
```
> 💡 입력창에 **`/` 만 쳐도 명령 메뉴가 뜹니다** (봇이 자동 등록).
> ⏰ **실시간이 아닙니다.** 봇은 실행될 때(아침 스케줄 또는 `Run now`)만 명령을 읽어요. 그때 watchlist를 갱신하고 **"➕ 추가: 삼성전자(005930)" 같은 확인 메시지로 답장**합니다. 오후에 `/add` 하면 다음 실행에 반영.

#### (B) 파일 직접 수정 — **로컬 모드면 이게 제일 빠름**
working folder의 `watchlist.json` 을 메모장/VSCode로 열어 고치고 저장하면 **다음 실행에 즉시 반영**됩니다(로컬은 커밋 불필요).
```json
{
  "tickers": [
    { "ticker": "005930", "name": "삼성전자", "market": "KR", "dartCorpCode": "00126380" },
    { "ticker": "000660", "name": "SK하이닉스", "market": "KR", "dartCorpCode": "00164779" },
    { "ticker": "NVDA", "name": "NVIDIA", "market": "US" }
  ]
}
```

#### (C) GitHub에서 직접 — **클라우드 모드용**
클라우드 루틴은 매 실행마다 GitHub에서 새로 clone하므로, 포크의 [`watchlist.json`](watchlist.json) 을 웹에서 편집(연필 아이콘) → **Commit** 해야 반영됩니다.

**필드 설명 (공통)**
- `ticker` / `name` / `market`(`"KR"` 또는 `"US"`) — 필수.
- `dartCorpCode`(KR, 선택): 있으면 그 종목 **공시(DART)** 도 수집. 없으면 뉴스·실적만. → [DART 고유번호 찾는 법](https://opendart.fss.or.kr/disclosureinfo/fnltt/dwld/main.do). (삼성전자 `00126380`, SK하이닉스 `00164779`)
- US 종목은 ticker만 넣으면 SEC 공시용 CIK가 자동 해석됩니다.
- ⚠️ 텔레그램 `/add`로 넣은 KR 종목은 `dartCorpCode` 가 자동으로 안 들어갑니다(공시 누락, 뉴스·실적은 정상). 공시까지 원하면 (B)/(C)로 그 줄에 직접 추가.

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
ac.stock.naver.com
m.stock.naver.com
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
- **텔레그램 `/add` 로 넣은 KR 종목은 공시가 빠집니다**: 자동완성은 종목코드만 채우고 `dartCorpCode` 는 못 채웁니다(뉴스·실적은 정상). 공시까지 원하면 GitHub에서 그 줄에 `dartCorpCode` 를 추가하세요 → [SETUP 4-1](SETUP.md).
- **텔레그램 명령(`/add`·`/remove`)의 영속화**는 루틴이 `watchlist.json` 을 **레포에 커밋**하는 방식입니다(ROUTINE.md 0단계). 클라우드 세션은 보통 현재 브랜치로 push가 되지만, 막히면 변경이 다음 실행에서 재시도됩니다. **GitHub 직접 편집(B안)은 이 영향 없이 항상 확실**합니다.

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
