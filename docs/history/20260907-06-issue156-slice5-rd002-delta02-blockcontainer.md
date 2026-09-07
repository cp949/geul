# Issue #156 슬라이스5 RD-002 DELTA-02 — `attributeOverrides.blockContainer` + 병합·충돌 규칙

## 목표

`attributeOverrides.blockContainer`를 신설해 블록 컨테이너 DOM(`data-geul-block-id`를 가진 div)에 임의 attribute를 주입할 수 있게 하고, class 병합(공백 join)과 예약 `data-geul-*`/이미 core가 채운 attribute 충돌 시 무시+`console.warn` 규칙을 구현·검증한다. `editor` 역할(DELTA-01)과 달리 blockContainer는 core가 직접 `renderHTML`을 작성해 ProseMirror의 네이티브 class 병합이 없다 — 이 DELTA가 병합 로직을 실제로 구현하는 첫 자리다.

## 확정 커밋

- `eefeb0a` — feat(core): attributeOverrides.blockContainer 신설 + 병합·충돌 규칙

## 변경한 계약과 파일

- `packages/core/src/attribute-override-merge.ts`(신규) — `mergeAttributeOverrides(base, overrides)` 공유 헬퍼. `class`는 공백 join, 그 외 키는 `base`에 이미 있거나 `data-geul-` 접두어면 무시+`console.warn`, 아니면 그대로 병합. `blockGroup`(DELTA-03)도 재사용한다.
- `packages/core/src/block-container-extension.ts` — `BlockContainerExtension`을 `addOptions`/`.configure()`로 옵션화, `renderHTML`이 `mergeAttributeOverrides`를 거쳐 `mergeAttributes`.
- `packages/core/src/production-editor-assembly.ts` — `BlockContainerExtension.extend({...}).configure({ attributeOverrides: options.attributeOverrides?.blockContainer ?? {} })`.
- `packages/core/src/editor-controller-types.ts`/`production-editor-session.ts` — `attributeOverrides.blockContainer` 필드 추가.
- `packages/core/test/attribute-override-merge.test.ts`(신규, 헬퍼 단위 6건), `packages/core/test/attribute-overrides-blockcontainer.test.ts`(신규, DOM 통합 3건).

## 결정(구현 중 확정, 재그릴링 불필요)

roadmap.md "결정"(attribute 병합·충돌 규칙)이 "개발 모드 `console.warn`"이라고 적었지만, 이 저장소에 이미 존재하는 유일한 선례(`custom-keyboard-shortcuts-extension.ts`의 keyboard shortcut 겹침 경고)는 `NODE_ENV` 게이팅 없이 무조건 경고한다. `core`는 브라우저 타깃이라 `process` 전역이 이 패키지 tsconfig에서 타입 선언조차 없다(실측: `tsc` `TS2591`). 기존 선례를 따라 무조건 경고로 구현했다 — roadmap.md 결정의 "실수를 알린다"는 의도는 그대로 유지되고(오히려 프로덕션에서도 알아챌 수 있어 더 안전), 틀렸을 때 비용은 낮다(경고 조건을 좁히는 것은 이후에도 additive).

## 검증

- RED: 헬퍼 단위 테스트(신규 파일이라 import 자체가 실패) + DOM 통합 테스트 2건(override 반영, 충돌 무시+경고) 구현 전 실패 확인.
- GREEN: `attribute-override-merge.test.ts` 6/6, `attribute-overrides-blockcontainer.test.ts` 3/3, `attribute-overrides-editor.test.ts`(DELTA-01) 3/3 회귀 없음 — 총 12/12.
- `pnpm --filter @cp949/geul-core typecheck`, `pnpm --filter @cp949/geul-react typecheck` clean.
- 패키지 전체: `pnpm --filter @cp949/geul-core test` 136 files / 1603 tests 통과.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-002 진행 상태

DELTA-01·DELTA-02 완료. 완료 조건 중 "`attributeOverrides.blockContainer` 지정 시 실제 렌더된 블록 DOM에 반영된다"와 "class 병합과 예약 `data-geul-*` 충돌 시 무시+경고 규칙이 검증된다" 충족. 남은 것은 DELTA-03(`blockGroup` 역할), DELTA-04(색상-전환 지점 겸용 시나리오 회귀 테스트).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스5)가 미완료라 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- 없음 — 신규 optional 필드, 미지정 시 기존 렌더 결과 100% 불변(characterization 테스트로 고정).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert eefeb0a`. 위험: 낮음.
