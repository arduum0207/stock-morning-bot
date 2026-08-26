# 데이터 소스 현황

수집기가 어떤 소스를 왜 쓰는지, 무료로 뭐가 되고 뭐가 안 되는지 정리한 문서.
전부 **실제로 호출해서 확인한 결과**다(2026-08 기준). 소스를 추가·교체할 때 여기부터 보면 된다.

## 지금 쓰는 소스

| 수집기 | 소스 | 키 | 비고 |
|---|---|---|---|
| `dart` | DART OpenAPI | `DART_API_KEY` | KR 공시 |
| `naver-news` | 네이버 검색 API | `NAVER_CLIENT_ID/SECRET` | KR 종목 뉴스 |
| `naver-earnings` | m.stock.naver.com | 불필요 | KR 실적 컨센서스 |
| `sec` | SEC EDGAR | 불필요(UA 필요) | US 공시 |
| `rss` | Yahoo Finance RSS | 불필요 | US 종목 뉴스 |
| `fmp` | FMP stable/earnings | `FMP_API_KEY` | 무료 티어는 대부분 402 → `nasdaq` 이 실질 담당 |
| `nasdaq` | api.nasdaq.com | 불필요(브라우저 UA) | US 실적 + 대형주 실적일정 |
| `market-news` | 네이버 키워드 검색 + Yahoo 시장 RSS | 네이버 키 | 매크로·정책·산업 뉴스 |
| `market-index` | 네이버 + FMP | FMP 키(일부) | 지수·환율·금리·유가·금 |
| `econ-calendar` | api.nasdaq.com | 불필요 | 경제지표 캘린더 |
| `fred` | FRED | `FRED_API_KEY` | 달러인덱스·미국채2년·장단기 금리차 |
| `finnhub-news` | Finnhub `news?category=general` | `FINNHUB_API_KEY` | Reuters·CNBC 글로벌 헤드라인 |

### 키 한도 (무료 티어)

| 서비스 | 한도 | 우리 사용량 |
|---|---|---|
| FRED | 120 req/min, **일일 한도 없음**, 유료 티어 자체가 없음 | 아침 3콜 |
| Finnhub | 60 calls/min, 일일 캡 명시 없음 | 아침 1콜 |
| 네이버 | 일 25,000회 | 아침 20콜 안팎 |

다른 프로젝트와 키를 공유해도 무방한 수준. 단, 상시 폴링하는 프로젝트와 같은 키를 쓰면
같은 분(minute)에 겹쳐 429 가 날 수 있다.

## 함정 — Nasdaq 경제지표 캘린더

`econ-calendar.ts` 주석에도 적어뒀지만 중요하니 한 번 더. **표기가 이름과 다르다.**

1. **응답의 `gmt` 필드는 GMT 가 아니라 미 동부시간(ET)이다.**
   - 주간 신규실업수당 08:30, EIA 원유재고 10:30 — 둘 다 ET 고정 발표 시각
   - 일본 BoJ Core CPI 01:00 = 14:00 JST / 한국 금통위 21:00 = 익일 10:00 KST
   - GMT 로 읽고 KST 로 환산하면 9시간이 어긋난다.
2. **`date` 파라미터는 이벤트 날짜 + 1 이다.**
   - `date=토요일` → 금요일 지표 23건(시카고 PMI·미시간 소비자심리)
   - `date=일요일` → 토요일 이벤트 1건(잭슨홀)
   - D일 지표를 받으려면 D+1 로 요청해야 한다.
3. 중요도 필드가 없다. CPI 든 국채 입찰이든 같은 무게로 온다 → 이벤트 이름·국가로
   `importance` 를 우리가 매긴다.

## 함정 — FRED 는 실시간이 아니다

시리즈마다 갱신이 다르다. 유가(`DCOILWTICO`)는 **최대 일주일** 밀린다.
실측: FRED 가 8/18자 $86.48 을 줄 때 실제 WTI 는 $83.14 였다(4% 차이).

→ 유가·금·VIX 는 FRED 에서 빼고 실시간 소스로 대체했다. 남은 FRED 항목도
`asOf`(관측일)를 함께 넘겨 브리핑에 "8/21 기준" 을 찍게 한다.

## 네이버 시장지표 코드

`m.stock.naver.com/front-api/marketIndex/productDetail?category=<cat>&reutersCode=<code>`

| category | code | 항목 |
|---|---|---|
| `exchange` | `FX_USDKRW` | 원/달러 |
| `bond` | `US10YT=RR` | 미국 국채 10년 |
| `energy` | `CLcv1` | WTI |
| `energy` | `LCOcv1` | 브렌트유 |
| `metals` | `GCcv1` | 국제 금 |

지수는 `m.stock.naver.com/api/index/<KOSPI|KOSDAQ>/basic`.
category 전체 목록은 잘못된 값을 넣으면 에러 메시지가 알려준다
(`major|exchange|exchangeWorld|bond|standardInterest|domesticInterest|energy|metals|agricultural|environmental|transport`).
코드를 모를 땐 해당 네이버 페이지 HTML 에서 `"reutersCode"` 를 grep 하면 나온다.

## FMP 무료 티어에서 열리는 심볼

되는 것: `^GSPC` `^IXIC` `^DJI` `^VIX` `BTCUSD`
막힌 것(402): `^KS11` `^TNX` `CL=F` `GC=F` `KRW=X` `DX-Y.NYB` `DXY`, ETF(`USO` `GLD` `UUP`),
그리고 `economic-calendar` · `news/general-latest` 엔드포인트 전체.

## 시도했지만 안 된 것들

| 소스 | 결과 |
|---|---|
| CNBC RSS | 403 (WAF 차단) |
| Stooq CSV | 프록시에서 연결 실패 |
| 공공데이터포털(apis.data.go.kr) | 프록시에서 연결 실패 |
| DBnomics FRED 미러 | 시리즈 구조가 달라 관측치를 못 꺼냄 |
| Yahoo `query1` 차트 API | 429 (`query2` 는 되지만 불안정) |
| FRED 금 시세 | `GOLDPMGBD228NLBM` 폐기됨 |

## 남은 구멍

- **달러인덱스 실시간**: 무료로 못 찾았다. FRED(주 단위 갱신)로 버티는 중.
  FMP·네이버 모두 없음. 필요하면 Finnhub 로 `UUP`(달러 ETF) 등락률을 대용으로 쓸 수는 있다.
- **필라델피아 반도체 지수(SOX)**: 네이버가 `.SOX` 를 갖고 있지만
  해외지수 엔드포인트를 아직 못 찾았다. 보유 종목 구성상 붙이면 값어치가 있다.
- **경제지표 중요도**: 우리가 이름으로 매기는 방식이라 완벽하지 않다.
  FMP Starter(월 $25 안팎)를 쓰면 등급 포함 캘린더가 열린다.
