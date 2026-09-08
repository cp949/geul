# Issue #162 BLK-017 RD-003 DELTA-06 — README/인벤토리/로드맵 문서 갱신 + 최종 검증

## 목표

RD-003(showcase 예제 5개 + README + 문서 갱신)의 마지막 DELTA이자 RD-003
자체의 완료 지점. `packages/react/README.md`에 구문 강조 연결 방법을
문서화하고, `docs/product/blocknote-free-feature-inventory.md`의
`BLK-017`을 `VERIFIED`로 갱신하고, `docs/product/current-status.md`·
`docs/product/roadmap.md`를 완료 사실로 동기화한 뒤 `pnpm test`/`pnpm
verify` 전체를 재확인한다.

## 확정 커밋

- `c14d377` — docs(readme): BLK-017 구문 강조 연결 방법 + 완료 사실 문서 동기화
- `f9c0529` — test(workspace): typecheck-coverage beforeAll hookTimeout 30s→60s 연장

## 변경한 계약과 파일

- `packages/react/README.md`: 신규 "## 코드 구문 강조 연결" 절(기존
  "## Next.js(SSR) 통합" 다음, "## 알려진 제약" 앞). spec
  `2026-09-08-blk-017-code-highlighting-seam-design.md` §1·§3·§5·§6을
  반영해 `SyntaxHighlighter`/`SyntaxHighlightToken` 타입, 미연결 시
  plain text 동작, `lowlight` 기반 최소 실행 가능 예제, `codeBlockLanguages`
  옵션을 문서화했다. 예제 코드는 `apps/showcase/src/`에 임시 파일로
  복사해 `pnpm --filter @cp949/geul-showcase typecheck`로 실제 타입
  대조 후 삭제했다(수동 검증). 나머지 4개 라이브러리(Prism/refractor·
  Shiki·CodeMirror/lezer·sugar-high) 예제는 `apps/showcase`의 5개
  example 폴더로 안내한다.
- `docs/product/blocknote-free-feature-inventory.md`: `BLK-017` 상태
  `PARTIAL`→`VERIFIED`. 근거 열을 seam 기반 아키텍처(공개
  `SyntaxHighlighter`/`SyntaxHighlightToken` 타입 + `prosemirror-highlight`
  내부 배관 + RD-001~003 구현 사실)로 다시 썼다. RD-004(language 선택·
  Tab 들여쓰기)가 이미 완료한 부분은 문구를 보존했다.
- `docs/product/current-status.md`: "다음 진행 단계" 줄에 `BLK-017`
  완료 사실을 추가하고, "## 현재 단계"의 기존 불릿 목록(R3/R4/R2/R1
  실행 상태)에 `R5 실행 상태` 항목을 새로 추가했다 — Issue #162
  (roadmap-workflow RD-001~003)의 seam 아키텍처·5개 라이브러리 예제·
  README 문서화를 요약한다.
- `docs/product/roadmap.md`: "### R5 — 고급 무료 콘텐츠" 절에 R4
  section과 동일한 관례로 실행 상태 문단을 추가하고, "## 6. 1차 릴리즈
  범위"의 `BLK-017` 항목에 완료·Issue 참조를 추가했다.
- `tests/workspace-typecheck-coverage.test.ts`: 계획 범위 밖 발견 →
  아래 "발견과 처리" 참고.

## 검증

- 문서만 변경(초안 단계)이라 `pnpm lint`/`git diff --check`를 먼저
  실행해 clean 확인.
- RD-003 완료 조건 4(`pnpm test`/`pnpm verify` 전체 통과) 재확인 중
  `tests/workspace-typecheck-coverage.test.ts`의 `beforeAll` hook이
  30초 타임아웃으로 실패(3505/3508 통과, 1 suite 실패)하는 것을
  발견했다. 이 DELTA(문서 4개 변경)와 무관함을 실측으로 확인 —
  이 세션의 모든 변경을 `git stash`로 제거한 깨끗한 `dev`
  HEAD(`157b294`)에서 동일하게 2회 연속 재현(30017ms/30016ms), 단독
  실행 시는 11.47초에 10/10 통과. 전체 스위트(313개 파일) 병렬 실행의
  CPU 경합으로 이 hook의 `git ls-files`+`tsc` 서브프로세스 다수가
  기존 30초 타임아웃(파일 자체 주석의 근거는 "단독 실행 8~9초")을
  넘긴 것으로 판단했다.
- RD-003 자체 범위(문서만)에는 없던 테스트 인프라 수정이 필요해
  사용자에게 보고하고 처리 방법을 확인받았다 — hookTimeout을
  30초→60초로 늘리는 안(assertion 변경 없음, 근거 주석 갱신)을
  승인받아 적용했다.
- 재검증: `pnpm test`(313 files/3508 tests 전부 GREEN), `pnpm
  verify`(lint/build/escompat/typecheck/test/boundaries/licenses/e2e
  chromium 전체)를 연속 2회 실행해 clean 통과 확인(3번째 실행은 exit
  code 0 명시 확인). 첫 `pnpm verify` 실행에서 `e2e/list-item.spec.ts`의
  무관한 keyboard-consumption 테스트 1건이 실패했으나 단독 재실행
  (883ms, 1 passed)과 전체 재실행(194 passed) 둘 다 통과해 전체 스위트
  병렬 실행 중 타이밍 flake였음을 확인했다(이 DELTA는 `list-item`
  관련 코드를 전혀 건드리지 않는다).

## 발견과 처리(메인 세션 직접 검증, subagent 미사용)

1. **범위 밖 발견 — hookTimeout**: 위 "검증" 참고. 사용자 확인 후
   `tests/workspace-typecheck-coverage.test.ts`만 수정(별도 커밋
   `f9c0529`).
2. **자체 리뷰 발견 — 마크다운 목록 분리**: `current-status.md`에 R5
   실행 상태 문단을 처음 삽입할 때 앞뒤 `- R4 실행 상태: ...`/`- R2
   실행 상태: ...` 불릿 사이에 빈 줄로 분리된 non-bulleted 문단으로
   넣어 마크다운 목록이 두 개로 쪼개지는 결함을 스스로 발견했다 —
   `- R5 실행 상태: ...` 형태의 단일 불릿 줄로 다시 써서 기존 목록
   구조를 복원했다.
3. **작성 중 자체 발견 — roadmap.md 오기**: R5 섹션에 실행 상태 문단을
   작성하던 중 관련 없는 spec 파일 경로(`2026-08-14-...`)를 대조 문구로
   잘못 끼워 넣은 것을 즉시 발견해 삭제했다(커밋 전 정정, diff에 남지
   않음).

## RD-003 완료 — `DONE`(완료 조건 4개 전부 충족)

- 조건 1(5개 예제 Playwright E2E 검증): DELTA-01~05가 5/5 충족.
- 조건 2(README 문서화): 이 DELTA가 충족.
- 조건 3(`BLK-017` `VERIFIED`): 이 DELTA가 충족.
- 조건 4(`pnpm test`/`pnpm verify` 전체 통과): 이 DELTA가 충족(위
  hookTimeout 수정 포함).

## roadmap(Issue #162) 전체 완료

`_works/roadmap/roadmap.md`의 진행 표(RD-001~003 전부 `DONE`)와 "전체
완료 조건" 3개(Issue 초안 완료 기준 8개 전부, `pnpm test`/`pnpm
verify` 통과, `BLK-017` `VERIFIED`)가 모두 충족돼 Issue #162 전체가
완료됐다.

## 등록한 이슈

없음(신규 제품 이슈). 위 "발견과 처리" 2건은 이 DELTA 안에서 직접
수정해 별도 이슈로 분리하지 않았다(등록 기준 — 제품 동작·게이트
구멍·거짓 통과가 아니면 등록하지 않는다).

## 게시

완료 댓글 초안(`pending-issues/06.md`)을 작성했다 — Issue #162
전체(RD-001~003) 완료를 요약한다. 게시·종료는 사용자 확인 후
수행한다.

## 남은 위험

- 이 DELTA 범위 안에서는 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert f9c0529 c14d377`(최신 커밋부터 역순). 위험: 낮음 — 문서
4개 변경과 테스트 hookTimeout 값 1곳뿐이라 다른 커밋에 영향을 주지
않는다. 단, `BLK-017` `VERIFIED` 갱신을 되돌리면 RD-003 완료 사실
서술과 다시 어긋나므로 revert 시 `RD-003.md`(git-ignored)의 완료 조건
체크 상태도 함께 재검토해야 한다.
