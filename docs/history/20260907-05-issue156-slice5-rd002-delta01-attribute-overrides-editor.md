# Issue #156 슬라이스5 RD-002 DELTA-01 — `attributeOverrides.editor` 신설

## 목표

RD-002(`attributeOverrides` 옵션, `EXT-008`)의 첫 DELTA. `CreateEditorOptions.attributeOverrides.editor`를 신설해 소비자가 에디터의 실제 편집 가능 DOM(ProseMirror가 생성하는 `contenteditable` 노드)에 임의 attribute를 주입할 수 있게 한다.

readiness probe(2026-09-07)로 이미 확인한 대로 `.geul-editor`(React `EditorContent.tsx`)는 Tiptap `mount()`의 부모 element일 뿐이고, 실제 편집 가능 DOM은 `createView()`가 별도 자식으로 만든다.

## 확정 커밋

- `e94827c` — feat(core): attributeOverrides.editor 신설 및 배선

## 변경한 계약과 파일

- `packages/core/src/editor-controller-types.ts` — `CreateEditorOptions.attributeOverrides?: { editor?: Record<string, string> }` 필드 신설. 필드명·구조는 BlockNote의 `domAttributes`를 그대로 쓰지 않고 geul 자체 이름(ADR-0004 대조 재검토, `roadmap.md` "결정").
- `packages/core/src/production-editor-assembly.ts` — `createProductionEditor` 옵션에 같은 필드 추가, `new Editor({...})`에 `editorProps: { attributes: options.attributeOverrides.editor }`를 조건부로 배선(`exactOptionalPropertyTypes` 제약으로 미지정 시 `editorProps` 자체를 생략).
- `packages/core/src/production-editor-session.ts` — 생성자 옵션 타입에 같은 필드 추가, `createTiptapEditor()`가 `replaceDocument()` 재구성 시에도 매번 다시 전달(`onPasteRejected` 등 기존 옵션과 동일 패턴).
- `packages/core/test/attribute-overrides-editor.test.ts`(신규) — 미지정 시 기존 동작 불변(characterization), 지정 시 반영·class 병합, `replaceDocument()` 후 유지 3건.

## 착수 전 실측(readiness probe 연장)

`prosemirror-view` dist 소스(`computeDocDeco()`)를 직접 확인해 roadmap.md "결정"의 class 병합 규칙(공백 join)이 ProseMirror 자체에 이미 네이티브로 구현돼 있음을 확인했다 — `attrs.class = "ProseMirror"`로 시작해 소비자 `attributes.class` 값을 공백으로 이어붙인다. Tiptap이 그 앞에 자기 `"tiptap"` 클래스를 한 번 더 prepend해 최종 className은 `"tiptap ProseMirror <소비자 class>"`다(실측 확인). 이 덕분에 이 DELTA는 별도 병합 로직을 만들지 않고 `editorProps.attributes`로 값을 그대로 넘기기만 한다.

## 검증

- RED: 3개 테스트 중 baseline(className) 1건은 최초 기대값이 실측과 달라("ProseMirror" 예상 → 실제 "tiptap ProseMirror") 스파이크로 정정한 뒤 override 2건이 배선 전 실패 확인.
- GREEN: `attribute-overrides-editor.test.ts` 3/3 통과.
- `pnpm --filter @cp949/geul-core typecheck`, `pnpm --filter @cp949/geul-react typecheck`(공개 타입 변경 영향 확인) 모두 clean.
- 첫 진입 패키지 전체 테스트: `pnpm --filter @cp949/geul-core test` 134 files / 1594 tests 통과.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-002 진행 상태

DELTA-01 완료. 완료 조건 중 "`attributeOverrides.editor` 지정 시 실제 렌더된 에디터 root DOM에 반영된다" 충족. 남은 것은 DELTA-02(`blockContainer` 역할 + class/속성 충돌 규칙), DELTA-03(`blockGroup` 역할), DELTA-04(색상-전환 지점 겸용 시나리오 회귀 테스트).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스5)가 미완료라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- editor 역할은 오늘 core가 관리하는 예약 attribute가 없어 "충돌 시 무시+`console.warn`" 규칙을 이 DELTA에서 검증하지 못했다 — `blockContainer`(`data-geul-block-id` 보유)를 다루는 DELTA-02에서 검증한다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert e94827c`. 위험: 낮음 — 신규 optional 필드, 미지정 시 기존 동작 100% 불변(characterization 테스트로 고정).
