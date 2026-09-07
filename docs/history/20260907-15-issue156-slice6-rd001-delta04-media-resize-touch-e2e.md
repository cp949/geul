# Issue #156 슬라이스6 RD-001 DELTA-04 — MediaResizeHandles touch e2e

## 목표

RD-001(mobile/touch 입력 지원, `UI-015`)의 네 번째이자 마지막 DELTA. `MediaResizeHandles`의 리사이즈가 touch 입력으로 동작함을 실제 브라우저(mobile project, Pixel 5)에서 검증한다. `media-resize-handles.tsx`는 이미 Pointer Events+`touch-action:none`을 완비했으므로(R3 슬라이스5) 이 DELTA는 e2e 신규 검증만 추가한다 — 프로덕션 코드 변경 없음.

## 확정 커밋

- `05425f9` — test(e2e): MediaResizeHandles touch 드래그 검증 추가

## 변경한 계약과 파일

- `e2e/media-resize-handle.spec.ts` — 신규 테스트 1건("touch로 오른쪽 핸들을 끌면 실제 touch 입력으로도 폭이 바뀐다 @mobile") + 지역 헬퍼 2개(`dragHandleWithTouch`, `insertFilledImageWithTap`).

## 구현 중 발견·재검토

- **Playwright `touchscreen`은 tap()만 지원한다**(공식 타입 주석: "This class is limited to emulating tap gestures"). 좌표 이동이 있는 드래그 재현에는 좌표 이동이 필요한데, `elementHandle.dispatchEvent`로 `TouchEvent`를 합성하면 비trusted라 브라우저의 touch→pointer 합성이 일어나지 않아 이 컴포넌트(순수 Pointer Events 기반, `pointerType` 분기 없음)의 리스너에 닿지 않는다. `touchscreen.tap()`이 내부적으로 쓰는 것과 같은 계층(CDP `Input.dispatchTouchEvent`)을 `page.context().newCDPSession(page)`로 직접 호출해 trusted touch 입력(touchStart/touchMove/touchEnd)을 재현했다 — RD-001-DELTA-03.md가 "range 밖"으로 미리 명시했던 "page.touchscreen 사용"이라는 계획 문구를 실측으로 구체화한 것이다.
- **mobile project(hasTouch:true)에서 `wrapper.click()`(mouse 이벤트)으로는 미디어 블록 selection이 안 선다** — 실측(디버그 재현)으로 확인. `wrapper.tap()`으로 바꾸면 정상 동작한다. 원인은 hasTouch 컨텍스트에서 mouse 이벤트만으로 selectionchange/mouseup 기반 재조회 경로가 충분히 트리거되지 않기 때문으로 보인다(정확한 근본 원인은 이 DELTA 범위 밖 — MediaToolbar 자체는 정상 작동해야 하므로 별도 조사 없이 헬퍼만 우회). desktop 12+개 spec이 의존하는 기존 `insertFilledImage`(support/demo.ts)는 건드리지 않고, 이 spec 전용 지역 헬퍼(`insertFilledImageWithTap`)로 tap() 기반 흐름을 따로 뒀다(사용처 1곳, 공용화 문턱 미달).
- 초기 렌더 폭(300px)은 `previewWidth` 미설정 상태라 인라인 `style` width가 없다(Escape 취소 테스트 F6 주석과 동일한 전제) — style attribute가 아니라 실제 bounding box로 사전 조건을 확인했다.
- 검증 방향은 축소(왼쪽으로 20px, 300→260px)만 썼다 — 자연 크기가 이미 렌더돼 있다는 것 자체가 래퍼 content 폭(상한) 이하라는 증거이므로, 줄이는 방향은 Pixel 5의 좁은 뷰포트에서도 상한 clamp와 무관하게 안전하다.

## 검증

- Mutation 확인(메인 세션 직접): `.geul-media-resize-handle`의 `touch-action: none`을 지우면 신규 테스트가 RED(브라우저가 터치 드래그를 스크롤 제스처로 가로채 리사이즈가 발동하지 않음) — 원복 후 GREEN 재확인.
- `pnpm typecheck:e2e` clean.
- `pnpm test:e2e`(chromium + mobile 전체) 188 passed, 0 failed — DELTA-04 신규 1건 + 같은 세션에서 발견·수정한 기존 회귀([[20260907-14 pointerup 레이스 수정]]) 8건 포함.
- 재그룹화: 커밋 2개(버그 수정 1개 + 본 DELTA 1개), 서로 다른 관심사라 논리 단위로 분리 — 선형 히스토리라 `git merge --ff-only`로 바로 이전.

## RD-001 진행 상태

DELTA-04 완료. **RD-001의 예상 DELTA 4개(01~04) 모두 완료.**

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스6)가 아직 완료 재대조 전이라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.
- mobile project에서 `wrapper.click()`이 selection을 못 세우는 정확한 근본 원인은 조사하지 않았다(우회만 함) — 후속에 다른 mobile e2e가 같은 패턴(mouse 이벤트로 selection 의존)을 새로 추가하면 같은 우회(`tap()`)가 필요할 수 있다.

## rollback

`git revert 05425f9`. 위험: 낮음 — e2e 테스트 신규 추가만, 프로덕션 코드 변경 없음.
