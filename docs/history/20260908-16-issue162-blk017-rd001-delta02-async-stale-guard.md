# Issue #162 BLK-017 RD-001 DELTA-02 — 비동기 파서 경로 + stale 방지 캐시

## 목표

RD-001의 두 번째 DELTA. DELTA-01이 남긴 임시 동작(비동기 `SyntaxHighlighter`
연결 시 빈 배열)을 실제 반영 로직으로 대체한다. Promise를 반환하는
`SyntaxHighlighter`가 resolve 후 실제로 decoration을 적용하고, 편집 중
오래된 Promise가 나중에 resolve해도 이미 바뀐 코드 블록 content를 덮지
않음을 회귀 테스트로 고정한다(RD-001 완료 조건 2, spec §4 "비동기 최신
결과만 반영").

## 확정 커밋

- `61300cb` — feat(core): 코드 블록 구문 강조 비동기 파서 경로 + stale
  방지 캐시

## 변경한 계약과 파일

- `packages/core/src/code-block-highlight-extension.ts` —
  `createParserFromHighlighter`를 캐시를 갖는 클로저로 재작성. 캐시 키는
  `language + content`(pos 아님) — 편집으로 content가 바뀌면 새 키로
  다시 계산하므로 옛 content에 대한 오래된 Promise가 나중에 resolve해도
  그 결과는 옛 키에만 쓰이고 현재 호출(새 키)이 조회하지 않는다. 캐시
  hit(resolved)은 호출 시점의 `pos`로 재계산해(저장된 pos가 아니라)
  코드 블록이 이동해도 정확하다. 캐시 hit(pending)은 저장된 Promise를
  그대로 반환해 중복 호출을 막는다. 동기 결과는 이 어댑터 캐시에
  쓰지 않는다(`prosemirror-highlight` 자신의 pos 기반 캐시가 이미
  저장한다). 거절된 Promise는 캐시 항목만 지워 재시도를 막지 않는다
  (console.warn·"이전 decoration 유지"는 spec §4 별도 edge case로
  DELTA-03이 다룬다).
- `packages/core/test/code-block-highlight-extension.test.ts` — 비동기
  happy path(연결 시 resolve 전 무강조 → resolve 후 강조) 1건, stale
  방지(편집 중 오래된 Promise가 최신 content를 덮지 않음) 1건 추가.

## 검증

- RED: 비동기 happy path 테스트가 DELTA-01의 "Promise면 빈 배열" 임시
  동작 아래서 실패 확인(`expected undefined to be 'const'`).
- GREEN: `pnpm --filter @cp949/geul-core test` 141 files/1632 tests
  passed(회귀 0건), `typecheck`/`build` exit 0, `check:boundaries`
  (14 public core declarations, 이번 DELTA는 공개 export 변경 없음),
  `check:escompat`(Chrome ≥75, 213개 파일 통과), eslint clean·prettier
  (1개 파일 재포맷 후 clean).
- 검출력 검증: 캐시 키를 `language`만으로(content 무시) 바꾸는 돌연변이를
  적용해 stale 테스트가 실제로 실패함을 확인한 뒤 원복 — 테스트가
  의도한 결함 클래스를 실제로 잡아낸다는 것을 직접 증명했다.
- 재조립(ff-workflow "재그룹화 실행 명령"): 단일 커밋, 그룹 1개,
  `git diff <pre-squash> <tip> --stat` 빈 출력으로 무결성 확인, `dev`에
  `--ff-only` 병합 성공.

## RD-001 진행 상태

DELTA-02 완료로 RD-001 완료 조건 2(비동기 연결·stale 방지)를 충족.
누적: 조건 1·2·3 충족, 조건 4(edge case 5종)·5(package boundary 공식
검증)만 남았다. RD-001은 `ACTIVE` 유지. 다음 DELTA(백로그, 확정 아님):
DELTA-03 — spec §4 나머지 edge case(범위 밖·겹침·거절된 Promise·미지원
language) 회귀 테스트 + package boundary 공식 검증.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(RD-001~003)가 미완료라 Issue #156 슬라이스1~11
전례대로 통합 완료 시점에 한 번만 Issue #162에 게시한다.

## 남은 위험

- Tiptap Editor가 마운트 생명주기 중(내부 dummy self-mount 왕복 포함)
  어댑터 closure(캐시 Map)를 여러 차례 재생성한다는 사실을 이 DELTA에서
  처음 실측했다 — 소비자가 `.mount()`/`.unmount()`를 반복 호출하는 극단
  패턴(React StrictMode 이중 호출 등)에서 진행 중이던 비동기 하이라이팅
  요청이 새 closure로 교체되며 버려질 수 있다. 정확성 결함은 아니다
  (새 closure가 현재 문서 기준으로 다시 계산해 항상 올바르게 수렴한다),
  낭비되는 재호출만 생긴다. 이번 완료 조건 어디에도 해당하지 않고
  재현하려면 별도 반복 마운트 시나리오가 필요해 이슈로 등록하지
  않았다(issue-tracker.md 등록 기준 미충족 — 제품 동작 변경·게이트
  구멍·거짓 통과 아님).
- 어댑터 캐시는 무한정 자란다(제거 로직 없음) — 코드 블록 하나의
  content가 아주 여러 번 바뀌는 매우 긴 편집 세션에서만 의미 있는 메모리
  사용량이 될 수 있다. 필요해지면 LRU 등을 추가한다(지금은 이슈로
  등록하지 않음, 같은 기준).
- `packages/core/src/code-block-highlight-extension.ts`에 공백 대신 NUL
  바이트(U+0000)가 섞여 들어간 것을 이 DELTA의 돌연변이 검증 도중(Edit
  도구가 문자열을 못 찾아) 우연히 발견해 즉시 수정했다 — 기존
  `write-tool-control-char-corruption` 함정과 같은 클래스의 손상이
  Edit 경로에서도 발생할 수 있다는 사례가 하나 추가됐다. 이 DELTA의
  다른 신규·수정 파일 전체를 바이트 단위로 재검사해 추가 오염이 없음을
  확인했다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 61300cb`. 위험: 낮음 — DELTA-01(`88ef8bc`) 위에 어댑터
내부 구현만 교체한 커밋이라 공개 API 변경이 없고, 이후 DELTA가 아직
이 위에 쌓이지 않았다(다음 DELTA는 이 세션 이후). revert하면 DELTA-01의
"Promise면 빈 배열" 임시 동작으로 되돌아간다(빌드·타입 깨짐 없음).
