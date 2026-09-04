# Issue #152 슬라이스 1 — 저장 모델 파운데이션 (RD-001·RD-002·RD-003 DONE, roadmap 완료)

## 목표

R3(파일·미디어 parity) 슬라이스1 — `model`에 4종(`file`/`image`/`video`/`audio`) leaf 블록 저장 계약을 추가하고, `core`에 PM schema·codec·production load/save를 연결한다(`BLK-013`~`016`). 사용자가 roadmap-workflow를 직접 지정했다.

## 확정 커밋

- `825e2a3` — feat(model): R3 슬라이스1 RD-001 — 파일·미디어 4종 leaf 블록 저장 계약 추가
- `0a92e52` — feat(core): R3 슬라이스1 RD-002 DELTA-01 — 파일·미디어 4종 PM schema·codec·production 연결
- `968f708` — fix(io): R3 슬라이스1 RD-003 — 파일·미디어 4종 컴파일 안전 최소 패치

## 변경한 계약과 파일

### RD-001(model 저장 계약)

- `packages/model/src/types.ts` — `MediaBlockCommon`(`url?`/`name?`/`caption?`/`backgroundColor?`), `FileBlock`(공통만), `ImageBlock`/`VideoBlock`(공통 + `showPreview?`/`previewWidth?`/`textAlignment?`), `AudioBlock`(공통 + `showPreview?`만) 추가, `Block` union 등록.
- `packages/model/src/media-block.ts`(신규) — `isValidMediaPreviewWidth(value): boolean`(`Number.isFinite(value) && value > 0`). 표 열 너비 검증(정수·상한 강제)과 계약이 달라 그 헬퍼를 재사용하지 않았다.
- `packages/model/src/schema.ts` — 4종 zod `.strict()` 스키마(`mediaBlockCommonShape` 공유), `blockSchema` discriminatedUnion·`BlockNode` union 등록, `validateBlocksAt`에 4종 조기 분기(`url`→`isSupportedLinkHref`, `backgroundColor`→`isCanonicalCellColor`, `previewWidth`(image/video)→`isValidMediaPreviewWidth`, `textAlignment`(image/video)→`isCanonicalCellAlign`), `visitTableBlocks`의 리프 제외 목록에 4종 추가.
- `packages/model/src/index.ts` — 신규 타입 5개·`isValidMediaPreviewWidth` export.
- 신규 테스트: `media-block.test.ts`, `document-media-block.test.ts`(45 assertions).

### RD-002(core PM schema·codec·production 연결)

- `packages/core/src/media-block-extension.ts`(신규) — `FileBlockExtension`/`ImageBlockExtension`/`VideoBlockExtension`/`AudioBlockExtension`. **PM 스키마 패턴 결정**: CodeBlock형(content node + `blockContainer` 래핑)이 아니라 Divider/Table형(비포장 `group: "block"` 직접 멤버, atom, `blockId` 자체 소유, `parseHTML` 미선언, `priority: 100 < blockContainer 1000`, G-EDT-003)을 채택했다 — 4종 prop이 전부 attrs로 표현 가능한 scalar이고 PM 텍스트 자식이 없다.
- `packages/core/src/production-editor-assembly.ts` — `extensions` 배열에 4종 등록.
- `packages/core/src/block-id-extension.ts` — `appendTransaction`의 `addNonBlockContainerIdentity` 대상에 4종 추가(divider/table과 동일 — blockContainer 자동 id 발급이 미디어 블록 id와 충돌하지 않도록).
- `packages/core/src/model-to-tiptap.ts` — `mediaBlockToTiptapJson`(encode) 신설, `blockToTiptapJson` early-return, `validateEditableContent` early-continue.
- `packages/core/src/tiptap-to-model.ts` — `mediaBlockFromTiptapJson`(decode) 신설, `decodeBlock`에 4종 인식 분기.
- `packages/core/src/editor-controller.ts` — `BlockTypeSource`에 4종 추가, `blockTypeDescriptorFromBlock`의 null 반환 조건(Turn into 비대상)에 4종 추가 — spec §2.2가 이미 확정한 결정의 구현. **구현 중 발견**: `react/block-side-menu.tsx`의 `findBlockTypeDescriptor`가 저장 `Block`을 좁히지 않고 그대로 넘기는 기존 구조 때문에, model union 확장만으로 `packages/react`가 소스 변경 없이도 typecheck에 실패했다(실측 `tsc` 확인) — 이 수정으로 react는 무변경인 채 다시 통과한다.
- 신규 테스트: `media-block-schema.test.ts`, `media-block-codec.test.ts`, `media-block-load-save.test.ts`, `block-type-descriptor.test.ts`(4종 null 케이스 추가) — 45건.

### RD-003(io 컴파일 안전 최소 패치)

- roadmap 작성 시점 실측(`tsc`)으로 model union 확장만으로 `packages/io`의 typecheck가 즉시 깨지는 것을 확인했다(`export-html.ts`/`export-markdown.ts`/`loss-analysis.ts`가 캐스트 없이 `.content`/`.children`/`.textColor`/`.textAlignment`에 직접 접근). Issue #152는 io HTML/GFM을 슬라이스6으로 이월했지만 이 컴파일 결합은 슬라이스 경계와 무관하게 즉시 발생해, 2026-09-04 AskUserQuestion으로 사용자가 최소 패치 포함을 확정했다.
- `packages/io/src/html/export-html.ts`의 `blockNode`, `packages/io/src/markdown/export-markdown.ts`의 `flattenBlocks`·`blockNode`, `packages/io/src/markdown/loss-analysis.ts`의 `collectBlockLosses`, `packages/io/test/html-depth-support.ts`·`html-list-import.test.ts` — 전부 divider/codeBlock과 같은 자리에서 4종을 early-return/continue로 걸러내는 placeholder만 추가했다. **실제 spec §7 HTML/GFM 매핑은 구현하지 않는다** — 슬라이스6이 이 분기를 교체한다.

## 구현 중 계획과 달랐던 사실

1. **`packages/react`의 `editor-controller.ts` `BlockTypeSource` 결합**(RD-002) — roadmap 작성 시점 3번째 조사(`tsc` 실측)로 발견. model만 바꿔도 react 소스 무변경으로 typecheck가 깨지는 것을 확인해 RD-002 범위에 흡수했다(별도 RD로 분리하지 않음 — core 파일 하나의 작은 확장).
2. **`packages/io`의 컴파일 결합**(RD-003 신설) — 같은 3번째 조사로 발견. Issue #152의 슬라이스1/슬라이스6 경계와 무관하게 즉시 발생하는 문제라 AskUserQuestion으로 사용자에게 포함 여부를 확인한 뒤 RD-003으로 로드맵에 추가했다.
3. **`packages/core`의 `tsc -b` project reference 결합**(RD-002 구현 중 발견, RD-003이 해소) — `core/tsconfig.json`이 `composite: true` + io 참조를 쓰고 `public-types.test.ts`가 `tsc -b`(build 모드)로 검증해, io의 컴파일 결함이 project reference 경계를 넘어 core의 빌드 그래프에 들어왔다. RD-002는 이 사실을 발견하고도 자기 코드 정확성만 확인(신규 테스트 45개, src 단독 typecheck)하고 패키지 전체 테스트 통과는 RD-003 완료 후로 미뤘다 — RD-003이 io를 고치자 함께 해소됐다.

## 검증

- RD-001: `pnpm --filter @cp949/geul-model test` 25 files / 382 tests(회귀 없음), `pnpm --filter @cp949/geul-model typecheck` clean.
- RD-002: 신규 테스트 45 passed, `pnpm --filter @cp949/geul-core test` 98 files / 1295 tests(RD-003 완료 후 재확인, `public-types.test.ts` 포함 전체 통과), `pnpm --filter @cp949/geul-core typecheck` clean, `pnpm --filter @cp949/geul-react typecheck` clean(react 소스 무변경).
- RD-003: `pnpm --filter @cp949/geul-io typecheck`(src+test) clean, `pnpm --filter @cp949/geul-io test` 64 files / 520 tests(회귀 없음).
- roadmap 전체 재대조: 위 5개 명령 전부 실측 재실행, 전부 통과.
- `pnpm exec eslint`·`pnpm exec prettier --check`(변경 파일 전체) — 발견 0건.

## 등록한 이슈

없음. Issue #152는 슬라이스 2~7이 남아 완료 댓글을 게시하지 않는다 — 슬라이스1 진행 댓글만 게시하고 체크박스를 갱신한다.

## 남은 제한

- 슬라이스1은 저장 파운데이션만 다룬다 — 사용자가 미디어 블록을 만들거나 편집하는 경로(명령·React UI·upload·drag/drop·resize·HTML/GFM)는 슬라이스2~7 잔여다.
- `packages/io`의 4종 처리는 컴파일 안전 placeholder다(실제 `<figure>`/`<img>`/GFM 계약 아님) — 슬라이스6이 교체할 때까지 관찰 가능한 사용자 경로가 없어 위험 없음(4종을 생성하는 어떤 경로도 슬라이스2 이전에는 존재하지 않는다).
- push, tag, PR, `dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 968f708 0a92e52 825e2a3`(역순). 위험: 낮음 — 3개 커밋이 계층별로 독립적이라(model → core → io) 부분 되돌리기도 안전하다. 되돌리면 `BLK-013`~`016`은 다시 `NOT_STARTED`로 봐야 하고(문서 갱신도 별도 되돌림 필요), 이후 슬라이스는 착수할 수 없다.
