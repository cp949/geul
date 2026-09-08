# Issue #162 BLK-017 RD-001 DELTA-03 — edge case 5종 + package boundary 공식 검증(RD-001 DONE)

## 목표

RD-001의 세 번째이자 마지막 DELTA. spec §4의 나머지 edge case(범위 밖
token, 겹치는 token, 거절된 Promise, 미지원/빈 language — 비동기 stale
방지는 DELTA-02가 이미 끝냄)를 회귀 테스트로 고정하고, `pnpm
check:boundaries`를 최종 diff 위에서 다시 실행해 RD-001 완료 조건
5(package boundary 공식 검증)의 증거를 남긴다. 이 DELTA로 RD-001 완료
조건 1~5 전부가 충족돼 RD-001이 `DONE`이 됐다.

## 확정 커밋

- `c943c3c` — feat(core): 코드 블록 구문 강조 edge case 5종 처리 +
  무한 재시도 결함 수정

## 변경한 계약과 파일

- `packages/core/src/code-block-highlight-extension.ts`:
  - `toDecorations`가 `sourceLength`를 추가로 받아 각 token의
    `from`/`to`를 `[0, sourceLength]`로 clamp한다. `from > to`는
    swap하지 않고 `clampedTo = max(clampOffset(to), clampedFrom)`로
    zero-width 범위를 만든다(소비자가 의도하지 않은 새 의미를 만들지
    않는 보수적 선택). clamp가 실제로 값을 바꿨으면 `console.warn` 1회.
  - Promise 거절 처리를 `cache.delete(key)`(DELTA-02)에서
    `cache.set(key, {status:"resolved", decorations:[]})`로 교체 —
    **DELTA-02가 남긴 무한 재시도 결함을 이번 DELTA에서 발견해
    수정했다**(아래 "결함" 참고). `console.warn`으로 원인 에러도
    함께 알린다.
  - 겹치는 token·미지원/빈 language는 별도 코드 없이 이미 만족한다 —
    회귀 테스트로만 고정.
- `packages/core/test/code-block-highlight-extension.test.ts` — 5개
  케이스 추가: 범위 밖 token clamp+warn, `from > to` token clamp+warn,
  거절된 Promise catch+warn, 겹치는 token 병합 없이 렌더, 미지원/빈
  language plain text 유지.

## 결함 발견과 수정(이 DELTA에서 처음 드러남)

"거절된 Promise" 회귀 테스트를 처음 작성한 그대로 실행했더니 **테스트
프로세스가 무한정 멈췄다**(`timeout 30`으로 강제 종료). 원인: DELTA-02가
채택한 "거절 시 `cache.delete(key)`로 재시도를 막지 않는다"는 설계가
실제로는 다음 사이클을 만든다 — 거절 → 우리 wrapper Promise가 catch로
정상 resolve → `prosemirror-highlight`의 `.then(refresh)` 발화 →
`refresh()`가 전체 코드 블록 재계산 transaction을 dispatch → 우리
캐시가 비어 있으니 같은 content로 하이라이터를 다시 호출 → 다시 거절 →
… 이 사이클이 매 microtask마다 새 microtask를 계속 만들어 event loop가
macrotask(`setTimeout`) 단계로 넘어가지 못했다(무한 microtask 루프).
수정: 거절된 키를 "resolved, 빈 배열"로 확정해 같은 content에 대해서는
다시 시도하지 않고 영구히 plain text로 남긴다(spec의 "처음이면 plain
text 유지" 충족) — content가 바뀌면(새 캐시 키) 여전히 새로 시도한다.
DELTA-02가 이미 `dev`에 병합된 상태로 이 결함이 남아 있었으나, 같은
파일·같은 함수를 이 DELTA가 다시 손대는 김에 즉시 고쳤다(범위 이탈이
아니라 판단해 별도 이슈로 분리하지 않았다).

## 검증

- RED: "거절된 Promise" 테스트가 (수정 전 코드로) 무한 hang, 강제
  종료로 확인. "범위 밖"·`from > to` 테스트가 clamp 미구현 상태에서
  `console.warn` 미호출로 실패 확인.
- 결함 수정 후 GREEN: `pnpm --filter @cp949/geul-core test` 141
  files/1637 tests passed(회귀 0건, 신규 5건), `typecheck`/`build`
  exit 0, `pnpm check:boundaries`("14 public core declarations" —
  조건 5의 공식 증거), `pnpm check:escompat`(Chrome ≥75, 213개 파일
  통과), eslint clean·prettier clean.
- 검출력 검증(돌연변이): `clampOffset`을 identity로 바꾸는 변이 →
  "범위 밖" 테스트만 실패 확인 → 원복. `clampedTo` 계산의
  `Math.max(..., clampedFrom)` 보호를 제거하는 변이 → `from > to`
  테스트만 실패 확인 → 원복. 두 경우 모두 ProseMirror 자신이
  out-of-range decoration을 조용히 흡수해 렌더는 안 깨지고
  `console.warn` 누락만으로 잡힌다 — spec이 요구하는 경고 계약이
  코드 없이는 지켜지지 않음을 직접 증명했다.
- "범위 밖"·`from > to` 두 테스트는 최초 `toHaveBeenCalledTimes(1)`로
  작성했으나 실행해보니 2회 호출됐다 — Tiptap이 마운트 생명주기 중(내부
  dummy self-mount 왕복 포함) 이 어댑터 closure를 여러 차례 재생성한다는
  DELTA-02의 실측과 일치하는 정상 동작이라 `toHaveBeenCalled()`(발생
  여부만 확인)로 완화했다.
- 재조립(ff-workflow "재그룹화 실행 명령"): 단일 커밋, 그룹 1개,
  `git diff <pre-squash> <tip> --stat` 빈 출력으로 무결성 확인, `dev`에
  `--ff-only` 병합 성공.

## RD-001 진행 상태 — `DONE`

완료 조건 1~5 전부 충족:

1. 동기 파서 연결 시 decoration 적용 — DELTA-01.
2. 비동기 파서 연결·stale 방지 — DELTA-02.
3. 미연결 시 plain text — DELTA-01.
4. 범위 밖 clamp+warn·거절 catch+warn·겹침 무처리 — DELTA-03(이 문서).
5. package boundary 공식 검증(`pnpm check:boundaries`) — DELTA-03(이
   문서).

RD-001을 `DONE`으로 전환한다. 다음은 RD-002(react threading +
`codeBlockLanguages` 언어 콤보박스 갱신) readiness probe.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(RD-001~003)가 미완료라 Issue #156 슬라이스1~11
전례대로 통합 완료 시점에 한 번만 Issue #162에 게시한다. RD-001
`DONE`은 RD-002·RD-003이 남아 있어 아직 게시 시점이 아니다.

## 남은 위험

- RD-001 범위 안에서는 없음.
- (참고, RD-001 밖) DELTA-02가 남긴 "어댑터 캐시가 무한정 자란다"(제거
  로직 없음) 관찰은 이 DELTA에서도 그대로 유효하다 — 코드 블록 하나의
  content가 아주 여러 번 바뀌는 매우 긴 편집 세션에서만 의미 있는 메모리
  사용량이 될 수 있다. 이슈로 등록하지 않았다(제품 동작 변경·게이트
  구멍·거짓 통과 아님, issue-tracker.md 등록 기준 미충족).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert c943c3c`. 위험: 중간 — DELTA-02(`61300cb`)의 거절 처리
버그(무한 루프)를 이 커밋이 고쳤다. 이 커밋만 단독으로 revert하면
DELTA-02의 무한 루프 결함이 `dev`에 다시 노출된다(거절하는
`syntaxHighlighter`를 연결하는 소비자가 있을 때만 실제로 트리거됨,
연결하지 않거나 거절하지 않는 소비자에게는 영향 없음) — revert할
경우 DELTA-02(`61300cb`)까지 함께 되돌리거나 거절 처리 수정만 별도로
재적용해야 한다.
