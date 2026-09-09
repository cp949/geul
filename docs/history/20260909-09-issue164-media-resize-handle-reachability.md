# Issue #164 미디어 리사이즈 핸들 뷰포트 도달성 (qq-workflow)

## 목표

미디어 리사이즈 핸들 2개(좌/우)가 뷰포트 밖으로 밀려난 뒤에도 네이티브 scroll-into-view(또는 대체 수단)로 도달 가능하게 한다. Issue #163(표 핸들 오버레이 6종)과 같은 근본 원인(`position: fixed` + viewport-relative 좌표)을 `ADR-0012`가 이미 "후속 이슈"로 지목해둔 대상에 같은 전략을 적용했다. 레인은 qq-workflow 자동 선택(독립 완료 결과 1개, 예상 변경이 DELTA 하나 크기 안).

## 확정 커밋

- `dce7242` — fix(media-resize-handle): 리사이즈 핸들 뷰포트 도달성 확보 (Issue #164)

## 변경한 계약과 파일

- `packages/react/src/media-resize-handles.tsx`: `resolveRenderTarget`의 `mediaElement.getBoundingClientRect()`를 `table-handle-geometry.ts`의 `readPageRect(mediaElement)`로 교체(page-relative 전환, 신규 공유 모듈 추출 없이 직접 import). 좌/우 핸들 `style.position` `"fixed"`→`"absolute"`. `scroll` 이벤트 리스너(add/remove 양쪽) 제거 — absolute는 스크롤에 자동으로 따라오므로 강제 재렌더 불필요(`resize` 리스너는 유지).
- `packages/react/src/_media-resize-handles.scss`: `.geul-media-resize-handle`의 `position: fixed`→`absolute`.
- `packages/react/test/media-resize-handles.test.tsx`: 신규 단위 테스트 2건(두 핸들 `style.position === "absolute"`, `window.scrollX/scrollY`를 반영한 page-relative 좌표 렌더).
- `e2e/media-resize-handle.spec.ts`: 신규 e2e 1건(문서 하단에 이미지를 두고 스크롤 → 핸들이 뷰포트 밖에서 시작 → 명시적 `scrollIntoViewIfNeeded()`와 hover 자동 스크롤 양쪽 경로로 도달, 스크롤된 상태에서 실제 드래그로 폭이 정확히 바뀜까지 확인).
- `docs/product/ui-ux-checklist.md`: `QA-091` 신규 등록(`MED-007`, 기존 `QA-032`는 리사이즈 동작만 다루고 도달성은 다루지 않아 별도 항목).

`table-handle-geometry.ts`·`table-handle-overlays.tsx`는 읽기만 하고 수정하지 않았다(그릴링 세션 결정 — 재사용은 직접 import, 공유 모듈 추출은 세 번째 소비자가 생기면 재검토). 공개 계약(패키지 export shape) 변경 없음.

## 검증

- `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/media-resize-handles.test.tsx` — 18/18 통과.
- `pnpm exec playwright test e2e/media-resize-handle.spec.ts --project=chromium` — 6/6 통과(신규 도달성 e2e 포함).
- `grep -n "position: fixed" packages/react/src/_media-resize-handles.scss packages/react/src/media-resize-handles.tsx` — 빈 출력.
- `git diff --check docs/product/ui-ux-checklist.md` — clean.
- `pnpm verify`(전량, 병합 직전 1회) — lint·format·build·escompat·typecheck·unit(313 파일/3512건)·boundaries·licenses·e2e(201건) 전부 통과.

## 발견과 처리

읽기 전용 결함 탐지 subagent 1회 dispatch(단계-3) — `readPageRect` 시그니처·호출 정확성, `scroll` 리스너 완전 제거, `handleResizeMove`의 좌표계 비혼입, 잔존 `getBoundingClientRect` 호출(폭 계산 1건, 전환 불필요), DOM 트리의 "positioned ancestor 없음" 전제(데모·쇼케이스 앱 소스 직접 확인), 신규 테스트의 우회·위양성 가능성, scss 레이아웃 영향, `QA-091` 표 형식을 점검. BLOCKER·MAJOR·MINOR 0건.

## 완료 조건 대조 (01-계획.md, IMPL-REVIEW-01.md)

- [x] 조건 1: 좌/우 핸들 2개 모두 `position: fixed` 미사용.
- [x] 조건 2: 뷰포트 밖에서도 스크롤로 도달 가능(e2e).
- [x] 조건 3: page-relative 좌표 계산(`readPageRect`).
- [x] 조건 4: `ui-ux-checklist.md`에 QA 항목 추가.

4개 전부 충족.

## 등록한 이슈

없음. 범위 밖으로 남긴 두 항목(키보드 포커스 가능성 추가, `readPageRect` 공유 모듈 추출)은 제품 동작을 바꾸거나 게이트 구멍을 막는 항목이 아니라 등록 기준(`issue-tracker.md`)을 통과하지 못해 별도 이슈로 분리하지 않았다.

## 게시

완료 댓글 [issuecomment-5594035681](https://github.com/cp949/geul/issues/164#issuecomment-5594035681) 등록 후 이슈 종료(완료 기준 4개 전부 충족, 열린 sub-issue 없음, 미등록 초안 없음) — qq-workflow 단계-4 "workflow 완료" 게시 무확인 예외 적용.

## 남은 위험

`overflow: auto` 같은 별도 스크롤 컨테이너 안에 에디터를 두는 소비자 레이아웃에서는 `window.scrollX/scrollY` 기반 page-relative 계산이 그 컨테이너 자체의 스크롤을 반영하지 못한다. `ADR-0012`가 표 핸들에 이미 도입한 것과 동일한 기존 전제(문서 전체가 window 레벨로 스크롤된다는 가정)이고, 이번 변경이 새로 만든 문제가 아니다 — `apps/demo`(e2e 대상)는 nested scroll container가 없어 실측 커버리지와 무관.

push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert dce7242`. 위험: 낮음 — `packages/react/src` 내부 좌표계·CSS 변경과 테스트·문서뿐, 공개 계약이나 다른 패키지에 영향 없음. 되돌리면 Issue #164의 원 결함(네이티브 scroll-into-view no-op)이 재현된다.
