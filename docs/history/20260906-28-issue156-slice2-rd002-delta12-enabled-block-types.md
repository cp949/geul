# Issue #156 슬라이스2 RD-002 DELTA-12 — `enabledBlockTypes` allow/deny

## 목표

roadmap-workflow RD-002의 열두 번째 DELTA. `CreateEditorOptions.enabledBlockTypes`(spec §4.4 EXT-004 "처음부터 구성")를 받아 기존 14종 block type 중 일부를 이 에디터 인스턴스의 PM 스키마에서 조건부로 제외한다. 착수 전 재조사로 기존 백로그 항목(구 DELTA-12, `customInlineContent`/`customStyles`/`enabledBlockTypes` 셋을 한 DELTA로 묶음)의 크기가 서로 완전히 다름을 확인해 `enabledBlockTypes`만 먼저 떼어 완결했다 — 나머지 둘은 `model`의 `InlineContent` 위젠(아직 착수 전, `Document`/`Block[]` 위젠과 같은 규모로 실측됨)이 선행돼야 해 DELTA-13+로 미뤘다.

## 확정 커밋

- `752e457` — feat(core): enabledBlockTypes allow/deny 필터(RD-002-DELTA-12)

## 변경한 계약과 파일

- `packages/core/src/model-to-tiptap.ts` — `EnabledBlockTypes` 타입과 `isBlockTypeEnabled(type, enabledBlockTypes?)` predicate 신설(옵션 미지정이면 항상 `true`). `modelToTiptap`에 `walkBlockTree`(`block-tree.ts`의 기존 재사용 프리미티브) 기반 재귀 거절 게이트를 추가 — 최상위든 임의 깊이 중첩 children이든 비활성화된 알려진 타입이 있으면 `EDITOR_FEATURE_UNAVAILABLE`로 즉시 거절한다(CustomBlock 거절은 top-level 전용이라 이 게이트가 별도로 필요, 7개 nestable 타입은 자식을 가질 수 있어서다).
- `packages/core/src/production-editor-assembly.ts` — `createProductionEditor` 옵션에 `enabledBlockTypes?` 추가, `modelToTiptap` 재검증 호출부에 threading(DELTA-11이 겪은 "숨은 두 번째 호출부" 재발 방지 차원에서 사전 그레핑으로 전 호출부 확인), 14종 매핑 확장을 `isBlockTypeEnabled` 조건부 스프레드로 전환(table/tableRow/tableCell은 표 기능 하나로 묶어 함께 켜고 끈다). **계획에 없던 구조적 결함**을 GREEN 시도 중 발견: `BlockContainerExtension.content`(`block-container-extension.ts`)가 `"(nestableBlockContent blockGroup?) | leafBlockContent"`로 고정돼 있어, `nestableBlockContent`(7종 그룹)나 `leafBlockContent`(codeBlock 단독 그룹) 중 하나라도 멤버가 전부 사라지면(`allow:["paragraph"]`가 대표 사례) `new Schema(...)`가 `SyntaxError: No node type or group 'X' found`로 즉시 죽는다. 두 그룹의 생존 여부를 계산해 `BlockContainerExtension.extend({content})`로 참조 가능한 그룹만 남기도록 동적화해 해소했다.
- `packages/core/src/production-editor-session.ts` — 생성자 옵션·`parseSupportedDocument`(세션 생성·`replaceDocument` 공용)·`createTiptapEditor`에 `enabledBlockTypes` threading.
- `packages/core/src/editor-controller.ts` — `CreateEditorOptions.enabledBlockTypes?: EnabledBlockTypes` 추가(spec §4.4 그대로), 재수출용 `export type { EnabledBlockTypes }`.
- `packages/core/src/index.ts` — `EnabledBlockTypes` 재수출.
- `packages/core/src/clipboard-paste-extension.ts` — **최종적으로 프로덕션 코드 변경 없음**. 착수 시 "붙여넣기 경로도 threading 필요(비활성 타입 붙여넣기가 `insertContent`에서 크래시)"라는 가설을 세워 구현했으나, Tiptap `insertContentAt`(`node_modules/@tiptap/core/src/commands/insertContentAt.ts`)의 `createNodeFromContent` 호출이 editor 옵션과 무관하게 항상 try/catch로 감싸여 있어 알 수 없는 노드 타입도 `emitContentError` 이벤트 + `return false`로 조용히 끝남을 실측으로 확인(uncaught exception 없음) — 관찰 가능한 결과가 threading 유무와 무관하게 같아 검출 변이를 만들 수 없는 죽은 코드였다. 시도했던 변경을 전부 되돌리고 이 사실을 주석으로 남겼다.
- `packages/core/test/enabled-block-types.test.ts`(신규, 7 tests) — deny/allow 스키마 미등록, table 3종 묶음 제거, 최상위·중첩 문서 로드 거절, `replaceDocument` 거절, 붙여넣기 안전성(characterization).

## 검증

- RED→GREEN: 신규 테스트 7개를 구현과 함께 작성 → 1차 실행에서 위 `BlockContainerExtension.content` 구조적 결함 발견 → 즉시 수정 → 7/7 GREEN.
- post-fix mutation 6건 전부 의도한 대로 정확히 실패 확인 후 원복: 확장 배열의 `heading` 조건부 스프레드 되돌림(완료 조건 1·2 실패) / `modelToTiptap`의 재귀 거절 게이트 무력화(완료 조건 4·5·6 실패, 스키마·characterization 테스트는 영향 없음 — 격리 확인) / table 3종 중 2종만 무조건 포함으로 되돌림(완료 조건 3 실패) / `BlockContainerExtension.extend` 동적화를 고정 확장으로 되돌림(완료 조건 2가 원래 발견과 동일한 `SyntaxError`로 재현 — 회귀 검출력 직접 확인) / `replaceDocument`의 threading 제거(`Result` 거절 대신 `TypeError` 크래시로 변질 — 1단계 게이트가 2단계 게이트의 예외를 막아 주는 방어 관계 확인) / `isBlockTypeEnabled`의 allow/deny 분기 반전(7개 테스트 전원 실패).
- `pnpm --filter @cp949/geul-core test`(전체) — 114 파일, 1562 tests passed(기존 1555 + 신규 7). 회귀 없음.
- `pnpm --filter @cp949/geul-core typecheck`(project reference 전량) — 0건.
- `pnpm --filter @cp949/geul-io typecheck`·`pnpm --filter @cp949/geul-react typecheck` — 둘 다 0건(회귀 없음, 이 DELTA는 `core`만 변경).
- `pnpm --filter @cp949/geul-io test`(639)·`pnpm --filter @cp949/geul-react test`(505) — 둘 다 변화 없음.
- `npx eslint`(변경 파일 전체) — 0 문제.

## 등록한 이슈

없음.

## 남은 위험

- `enabledBlockTypes`가 `nestableBlockContent`(7종)와 `leafBlockContent`(codeBlock)를 동시에 완전히 비우는 극단적 구성(예: 8종 전부 deny)에서 `blockContainer`를 스키마에서 빼는 처리까지만 했고, 그보다 더 극단적인 구성(14종 전부 비활성 등 "block" 그룹 자체가 텅 빔)은 검증하지 않았다 — spec이 이 극단값을 명시적으로 다루지 않는다.
- `paragraph`를 deny해도 되는지에 대한 정책적 판단(R0 "문서는 최소 1블록" 불변식과의 상호작용)은 spec이 예외를 두지 않아 그대로 허용했다. `TrailingBlockExtension`은 이미 `schema.nodes.paragraph === undefined` 방어가 있어 크래시는 없지만, "문서 끝 trailing paragraph 불변식(UI-010)" 자체는 이 구성에서 사실상 무력화된다.
- RD-002는 아직 `ACTIVE`(DELTA-13+: `model`의 `InlineContent` 위젠 → `customInlineContent`/`customStyles` registry 배선 남음). 완료 조건 3개 중 "PM 노드가 스키마에 등록되지 않는다"만 이 DELTA로 충족, 나머지 둘은 미충족.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-002 전체 완료 기준 대비 부분 진행이다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 752e457`. 위험: 낮음 — `enabledBlockTypes` 옵션 미지정 시 모든 조건부 필터가 `isBlockTypeEnabled`의 기본값(항상 `true`)으로 접혀 기존 14종 스키마·동작과 100% 동일함을 1562개 테스트 그대로 통과로 확인했다. 신규 export(`EnabledBlockTypes`)만 추가돼 기존 공개 계약을 깨지 않는다.
