# 🔑 SETUP — API 키 발급 & 세팅 상세 가이드

이 문서는 [README](README.md)의 **2단계(키 발급)** 를 클릭 단위로 풀어 쓴 것입니다.
필요한 키는 최대 6종이지만, **꼭 필요한 건 텔레그램 2개뿐**입니다. 나머지는 보고 싶은 시장(KR/US)에 맞춰 골라 넣으세요.

| 키 | 무엇에 쓰나 | 없으면 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | **봇 발송(필수)** | 아예 못 보냄 |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | KR 뉴스 | KR 뉴스 누락 |
| `DART_API_KEY` | KR 공시 | KR 공시 누락 |
| `FMP_API_KEY` | US 실적 일정 | US 실적 일정 누락 |
| `COLLECT_USER_AGENT` | SEC 공시 매너(권장) | 기본값으로도 동작 |

> US 뉴스(Yahoo)·US 공시(SEC)·KR 실적 컨센서스(네이버 금융)는 **키가 필요 없습니다.**

---

## 1. 텔레그램 봇 토큰 — `TELEGRAM_BOT_TOKEN`

봇을 하나 새로 만듭니다. (이미 쓰는 봇이 있으면 그 토큰을 재사용해도 됩니다.)

1. 텔레그램 앱에서 **`@BotFather`** 검색 (파란 체크 ✓ 있는 공식 계정).
2. 대화창에서 **`/newbot`** 전송.
3. **봇 표시 이름** 입력 — 아무거나. 예: `내 종목 브리핑`
4. **봇 사용자명(username)** 입력 — 반드시 `bot` 으로 끝나야 함. 예: `my_stock_brief_bot`
5. BotFather가 **토큰**을 줍니다. 이렇게 생겼어요:
   ```
   8123456789:AAFsm9kl...본인토큰...IzcD8
   ```
   이게 `TELEGRAM_BOT_TOKEN` 입니다.
6. (나중에 다시 보려면) BotFather에서 **`/mybots` → 해당 봇 → API Token**.

---

## 2. 내 챗 ID — `TELEGRAM_CHAT_ID`

봇이 **나에게** 메시지를 보내려면 내 chat_id가 필요합니다.

> ⚠️ **먼저 봇에게 말을 걸어야 합니다.** 텔레그램 봇은 먼저 말 건 적 없는 사람에게 메시지를 못 보냅니다.

1. 방금 만든 봇을 검색해 대화창을 열고 **아무 메시지나** 하나 보냅니다 (예: `hi`).
2. 웹브라우저 주소창에 아래를 입력 (`<토큰>` 자리에 1번 토큰):
   ```
   https://api.telegram.org/bot<토큰>/getUpdates
   ```
3. 나오는 JSON에서 **`"chat":{"id":12345678`** 의 숫자가 `TELEGRAM_CHAT_ID` 입니다.

**대안**: 텔레그램에서 `@userinfobot` 검색 → `/start` → 답해주는 `Id` 숫자가 chat_id (1:1 대화 기준).

---

## 3. 네이버 검색 API — `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`  (KR 뉴스)

1. **https://developers.naver.com** 접속 → 우상단 **로그인**(네이버 계정).
2. 상단 **Application → 애플리케이션 등록(API 이용신청)**.
3. **애플리케이션 이름** 입력 (예: `stock-morning-bot`).
4. **사용 API** 에서 **검색** 선택.
5. **환경 추가**: `WEB 설정` 선택 → 웹 서비스 URL에 `http://localhost` 입력(검색 API는 콜백이 불필요해 형식만 채우면 됨).
6. **등록** → 발급된 **Client ID** 와 **Client Secret** 복사.
   - `Client ID` → `NAVER_CLIENT_ID`
   - `Client Secret` → `NAVER_CLIENT_SECRET`

> 검색 API는 하루 25,000회 무료라 종목 몇 개로는 절대 부족하지 않습니다.

---

## 4. DART 인증키 — `DART_API_KEY`  (KR 공시)

1. **https://opendart.fss.or.kr** 접속.
2. 상단 **인증키 신청/관리 → 인증키 신청**.
3. 이름·이메일 등 입력하고 신청 (이메일 인증 필요).
4. 발급된 **40자리 인증키**가 `DART_API_KEY` 입니다. (마이페이지에서 다시 볼 수 있음.)

> 일 20,000회 무료.

### 4-1. (KR 공시용) `dartCorpCode` 채우기
DART 공시는 종목코드가 아니라 **DART 고유번호(8자리)** 로 조회합니다. `watchlist.json` 의 KR 종목에 `dartCorpCode` 를 넣어야 공시가 수집돼요. (없어도 **뉴스·실적은 정상**, 공시만 빠집니다.)

찾는 법: opendart.fss.or.kr → **공시정보 → 고유번호** 에서 회사 검색. 자주 쓰는 예:
| 종목 | 종목코드 | dartCorpCode |
|---|---|---|
| 삼성전자 | 005930 | `00126380` |
| SK하이닉스 | 000660 | `00164779` |

> ⚠️ 텔레그램 `/add 삼성전자` 로 추가하면 `dartCorpCode` 가 자동으로 안 들어갑니다(뉴스·실적은 됨). 공시까지 원하면 GitHub에서 `watchlist.json` 을 열어 그 줄에 `dartCorpCode` 를 직접 추가하세요.

---

## 5. FMP 키 — `FMP_API_KEY`  (US 실적 일정)

1. **https://financialmodelingprep.com** 접속 → **Sign Up**(무료).
2. 로그인 후 **Dashboard** → **API Keys** 에서 키 복사 → `FMP_API_KEY`.

> 무료 티어는 하루 호출 수 제한이 있지만 종목 몇 개 실적 조회엔 충분.
> **US 종목 실적 일정에만** 쓰입니다. KR만 보거나 US 실적이 필요 없으면 생략하세요.
> (KR 실적 컨센서스는 네이버 금융에서 키 없이 수집됩니다.)

---

## 6. SEC User-Agent — `COLLECT_USER_AGENT`  (권장, 키 아님)

SEC는 공시 조회 시 **연락처(이메일)가 든 User-Agent** 를 요구합니다.
```
COLLECT_USER_AGENT=홍길동 mymail@example.com
```
미설정 시 기본값으로도 동작하지만, 본인 이메일을 넣는 걸 권장합니다(SEC 공정이용 정책).

---

## 7. 다 모았으면 — 어디에 넣나?

### 클라우드 예약 루틴(실제 운영)
[claude.ai/code](https://claude.ai/code) → 환경(Environment) 설정 → **Environment variables** 에 `.env` 형식으로(따옴표 없이) 붙여넣습니다. 그리고 **Network access를 Custom** 으로 바꿔 도메인 허용 목록을 추가합니다. → [README 4단계](README.md#4단계--cloud-environment-설정-가장-중요) 참고.

### 로컬 테스트(선택)
레포 루트에 `.env` 파일을 만들고 같은 형식으로 넣습니다:
```
TELEGRAM_BOT_TOKEN=8123456789:AAF...
TELEGRAM_CHAT_ID=12345678
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
DART_API_KEY=...
FMP_API_KEY=...
COLLECT_USER_AGENT=홍길동 mymail@example.com
```
그 다음:
```bash
npm install
npm run collect                         # out/collected.json 생성 확인
npm run send out/collected.json "테스트"  # 텔레그램 도착 확인
```

> `.env` 는 `.gitignore` 에 있어 GitHub에 올라가지 않습니다. **키를 레포에 커밋하지 마세요.**
