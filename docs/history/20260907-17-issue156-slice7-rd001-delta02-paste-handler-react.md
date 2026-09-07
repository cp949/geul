# Issue #156 슬라이스7 RD-001 DELTA-02 — react EditorProvider threading

## 목표

RD-001(custom paste handler, `IO-008`)의 두 번째이자 마지막 DELTA. DELTA-01의 `pasteHandler`를 `react`의 `<EditorProvider>`를 통해서도 등록·사용할 수 있게 한다(그릴링 결정 — 이슈 원문은 `core`만 명시했으나 `onChange`/`onPasteRejected`/`uploadFile`/`onUploadStateChange` 4개 콜백 전부의 threading 선례를 따름).

## 확정 커밋

- `2c81d9f` — feat(react): EditorProvider에 pasteHandler threading 추가

## 변경한 계약과 파일

- `packages/react/src/editor-provider.tsx` — `EditorProviderProps`에 `pasteHandler` 추가(외부-editor 분기는 `never`), `latestPasteHandler` ref, `createEditor()` 호출에 `onPasteRejected`와 동일 패턴으로 배선.
- `packages/react/test/editor-content.test.tsx` — latest-ref 검증 테스트 1건 추가.

## 구현 중 발견·재검토

- `uploadFile`과 달리 `pasteHandler`는 "등록 여부"가 별도 UI 분기(File Panel Upload 탭 노출 등)에 쓰이지 않는다 — 미등록이어도 wrapper가 `undefined`를 반환해 core의 `defaultHandlePaste()` 위임과 동일하게 접힌다. 조건부 스프레드 없이 `onChange`/`onPasteRejected`처럼 항상 무조건 threading하는 편이 더 단순했다.

## 검증

- RED 확인: 신규 테스트 추가 직후 1건 실패(`latestHandler` 호출 0회) — threading 미배선 상태 실측.
- GREEN: `pnpm --filter @cp949/geul-react test` 41 files / 560 tests 전부 통과.
- `tsc -p tsconfig.json --noEmit`, `tsc -p tsconfig.test.json --noEmit` clean.
- 변경 파일 대상 `eslint` clean.
- 전체 monorepo 재검증: `pnpm typecheck`(전 패키지+e2e+tests+scripts+configs) clean, `pnpm test`(전체) 290 files / 3379 tests 전부 통과.

## RD-001 진행 상태

DELTA-02 완료. **RD-001의 예상 DELTA 2개(01~02) 모두 완료 — RD-001 DONE, roadmap 전체(슬라이스7)도 완료.**

## 등록한 이슈

없음.

## 게시

Issue #156에 슬라이스7 완료 댓글 게시, 체크리스트 슬라이스7 항목 `[x]` 갱신(roadmap-workflow 완료 게이트 통과, `docs/agents/issue-tracker.md` "게시 승인" 넷째 bullet). 이슈는 닫지 않는다 — 슬라이스 8~11이 남아 있다.
