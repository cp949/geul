# Issue #156 슬라이스2 RD-002 DELTA-14 — `core`: model→tiptap 경계에서 커스텀 inline 원소·마크 거절

## 목표

roadmap-workflow RD-002의 열네 번째 DELTA. `model`의 `InlineContent` 위젠(DELTA-13)으로 깨진 `core` src(`model-to-tiptap.ts`, 9곳)를 정리한다. 단순 캐스트가 아니다 — `customInlineContent`(EXT-002)/`customStyles`(EXT-003) registry가 아직 배선되지 않은 시점이라, model 계약상 유효한 `{type:"custom"}` inline 원소·`CustomTextMark`가 있는 문서를 core가 만나면 top-level `CustomBlock`(DELTA-04)과 동일하게 `EDITOR_FEATURE_UNAVAILABLE`로 명시 거절해야 한다.

## 확정 커밋

- `5b16574` — feat(core): model→tiptap 경계에서 커스텀 inline 원소·마크 거절(RD-002-DELTA-14)

## 변경한 계약과 파일

- `packages/core/src/model-to-tiptap.ts`:
  - `inlineContentViolation` 반환 타입을 `string | null`에서 `InlineContentViolation = {code: "DOCUMENT_INVALID" | "EDITOR_FEATURE_UNAVAILABLE"; reason: string} | null`로 확장. 커스텀 inline 원소(`!isTextRunItem`)는 루프 최상단에서 즉시 `EDITOR_FEATURE_UNAVAILABLE`로 분리하고, `CustomTextMark`(첫 `!isKnownTextMarkType` 발견 시)도 동일 코드로 분리한다. 기존 위반(빈 텍스트 런·유효하지 않은 텍스트·빈 mark 배열·미지원 링크·noncanonical 순서·인접 동일 mark)은 `DOCUMENT_INVALID`를 유지한다.
  - `validateEditableContent`의 두 호출부(top-level `block.content`, table `cell.content`)를 `invalid()` 헬퍼 재사용에서 `violation.code`로 직접 분기하는 인라인 `Result` 구성으로 변경.
  - `inlineContentToTiptap` — `validateEditableContent`가 이 시점 이전에 이미 커스텀 원소·마크를 거절했다는 계약을 전제로 `item as Extract<InlineContentItem, {text: string}>` 캐스트로 전환.
- `packages/core/src/table-paste-commands.ts` — 3개 호출부(`pasteTabularData`의 셀 검증 1곳, `validateOutOfTableContent`의 문단/heading·목록 항목 검증 2곳) 전부 `${violation}` → `${violation.reason}`로 변경, 기존 에러 코드(`TABULAR_DATA_INVALID`/`CLIPBOARD_CONTENT_INVALID`)는 그대로 유지.
- `packages/core/test/editor-feature-unavailable.test.ts` — 신규 describe 블록(5 tests): 문단 content의 커스텀 inline 원소 거절, table 셀 content의 커스텀 inline 원소 거절, text 런 marks의 `CustomTextMark` 거절, 중첩 children content의 커스텀 원소 재귀 거절, 기존 8종 마크·14종 block 회귀 없음(characterization).
- `packages/core/test/table-paste-commands.test.ts` — 신규 테스트 1건: `ClipboardContentBlock` 경로(문단)의 커스텀 inline 원소를 `CLIPBOARD_CONTENT_INVALID`로 거절, 메시지가 `violation.reason`을 그대로 담는지 확인.
- `packages/core/test/table-paste-validation.test.ts` — 순 테스트 변경 없음(주석만 추가) — 아래 "범위 조정" 참고.

## 검증

- 착수 전 재측정(`pnpm --filter @cp949/geul-model build` 후 `core`/`io`/`react`의 stale `tsbuildinfo` 삭제, 핵심 함정 2번): `core` src 정확히 9곳/`model-to-tiptap.ts` 1파일 — 계획서(`result/RD-002-DELTA-14.md`) 실측과 정확히 일치.
- RED→GREEN: "구현+테스트 작성 후 src 2파일만 `git stash`로 되돌려 RED 재현 → `stash pop`으로 복원해 GREEN" 순서로 확인 — 신규 6건 전부 계획대로 실패(`item.text`/`item.marks`의 `undefined` 접근 크래시, 이전 스키마 상 조용한 `ok:true` 통과)를 재현한 뒤 복원해 6/6 GREEN.
- **범위 조정(계획에 없던 발견)**: 완료 조건 5의 `TabularData`(`pasteTabularData`) 경로 테스트를 시도하다, `io`의 `validateTabularData`(`packages/io/src/clipboard/tabular-data.ts`)가 core의 `inlineContentViolation`보다 먼저 `item.text`에 무가드 접근해 `TypeError: value is not iterable`로 먼저 크래시함을 발견했다. 이 파일은 DELTA-13 실측 "io src 8파일/39곳"에 이미 포함된 기존 미해결 typecheck 에러 파일로 DELTA-14 "범위 밖"(io src — 후속 DELTA)에 명시적으로 해당해, 그 테스트는 추가하지 않고 io DELTA로 이월했다. 대신 `ClipboardContentBlock` 경로(io의 `validateTabularData`를 거치지 않는 core 로컬 `validateOutOfTableContent` 경로)로 완료 조건 5(메시지 포맷 재사용)를 검증했고, `TabularData` 경로의 기존 "빈 텍스트 런"·"미지원 링크" 테스트가 `violation.reason` 재사용을 이미 간접 검증한다(post-fix mutation C가 재확인).
- `pnpm --filter @cp949/geul-core test` — 1567 passed + 1 skipped(기존 1562 + 신규 6). `public-types.test.ts`(`tsc -b`) 1건만 계속 fail — 원인 전수 확인 결과 `core` src는 0건, 남은 원인은 `io` src 8파일(DELTA-13과 동일 목록)·`core` test 7파일뿐(회귀 아님, DELTA-13 실측 그대로).
- `pnpm --filter @cp949/geul-core exec tsc -p tsconfig.json --noEmit`(src, project reference) — 9→0건.
- `npx eslint`(변경 5파일) — 0 문제.
- `pnpm --filter @cp949/geul-io test`(639)·`pnpm --filter @cp949/geul-react test`(505) — 둘 다 변화 없음. `pnpm --filter @cp949/geul-react typecheck` — 0건.
- post-fix mutation 3건 전부 의도한 대로 정확히 실패 확인 후 원복:
  - A) `isTextRunItem` 가드 제거 → 문단·table 셀·중첩 children 3건 정확히 실패(`item.text` undefined 크래시).
  - B) `unregisteredMark` 가드 제거 → `CustomTextMark` 테스트 1건 실패 — 계획이 예상한 "markToTiptap이 undefined 반환"이 아니라 "`replaceDocument`가 `ok:true`로 조용히 통과"로 실측됨(사후 기록, 계획 문서 갱신).
  - C) `table-paste-commands.ts`의 `violation.reason` → `violation.code`(오타 상정) → 기존 "미지원 링크 마크" 테스트 2건이 메시지 불일치로 정확히 실패.

## 등록한 이슈

없음.

## 남은 위험

- `io`의 `TabularData` 경로(`validateTabularData`, `packages/io/src/clipboard/tabular-data.ts`)는 커스텀 inline 원소가 든 셀을 core에 도달하기 전에 `TypeError`로 크래시한다 — io src DELTA가 이 파일의 `item.text` 무가드 접근을 고치기 전까지, `pasteTabularData`로 커스텀 원소가 든 셀을 붙여넣으면 깔끔한 거절이 아니라 예외가 던져진다. 후속 io DELTA 우선순위에 반영할 것.
- `inlineContentToTiptap`의 캐스트 전제(설계 결정 3)는 새로 생긴 위험이 아니다 — `insertBlocks` 등 저수준 API가 계약을 우회해 커스텀 inline 원소를 담은 `Block`을 직접 만들어 넘기는 경로는 위젠 이전부터 있던 기존 위험 범주이고, 이 DELTA에서 막지 않는다(계획 그대로).
- RD-002는 아직 `ACTIVE`(DELTA-15+: `core` test 7파일·`io` src 8파일·`io` test 3파일 typecheck 정리 → `customInlineContent`/`customStyles` registry 배선 남음). 완료 조건 3개 중 "PM 노드가 스키마에 등록되지 않는다"만 DELTA-12로 충족, 나머지 둘은 미충족.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-002 전체 완료 기준 대비 부분 진행이다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 5b16574`. 위험: 낮음 — `inlineContentViolation`의 반환 타입 변경은 3개 소비처(model-to-tiptap.ts 2곳, table-paste-commands.ts 3곳) 전부를 같은 커밋에서 함께 갱신했고, 기존 텍스트 런/8종 마크 문서에 대한 판정 결과(코드·문구)는 그대로 보존된다(`pnpm --filter @cp949/geul-core test`가 기존 1562개 테스트 그대로 통과함을 확인). 되돌리면 `model-to-tiptap.ts` typecheck 9건이 다시 나타난다.
