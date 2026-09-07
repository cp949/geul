# production-editor-session.ts 업로드 상태 기계 분리

- 레인: qq-workflow (사용자 지시 — "가장 긴 소스코드 3개" 그릴링 후 분리 승인·실행 지시)
- 대상 이슈: 없음
- 작업 폴더: `_works/20260907-06-production-editor-session-upload-split/`(gitignore, 저장소에는 남지 않음)
- 확정 커밋: `1975fd4`(dev, `refactor(core): production-editor-session.ts 업로드 상태 기계 분리`)

## 목표

`packages/core/src/production-editor-session.ts`(735줄)에서 미디어 업로드 상태 기계(맵 2개 + 메서드 6개)를 분리한다. 이 파일은 세션 생명주기·문서 커밋 파이프라인·업로드 상태 기계·블록 선택영역 4개 관심사가 `tiptapEditor`/`currentDocument` 공유 상태로 섞여 있었는데, 그중 업로드 상태 기계만 세션 참조(host)를 주입하면 나머지와 달리 깨끗이 분리됐다. 나머지 세 관심사는 에디터 재구성·커밋 판정에 강결합돼 있어 이번 범위에서 제외했다.

이번 그릴링은 같은 날 앞서 완료한 `table-handles.tsx` 분리 선례(20260907-03~05)를 조사해 "줄 수는 트리거일 뿐, 구조적으로 뽑아낼 수 있는 비-행동적 요소만 분리하고 강결합된 로직은 통증 근거 없이 안 건드린다"는 판단 기준을 그대로 적용했다.

## 바꾼 계약과 파일

신규 파일 1개 + 축소된 세션(공개 API 무변경, thin wrapper 위임):

- `production-editor-media-upload.ts`(229줄) — `MediaUploadHost` 인터페이스(세션의 `isDestroyed`/`editor`/`uploadFile`/`runDocumentCommand` 기존 공개 표면 + 신규 `notifyUploadStateChange`로 구성) + `MediaUploadTracker` 클래스(맵 2개, `getMediaUploadState`/`getMediaUploadController`/`beginMediaUpload`/`endMediaUpload`/`applyUploadedMediaAttrs`/`uploadMediaFile` 이동). 로직·조건 분기·에러 코드는 이동 전과 동일(`this.` 참조를 `host.` 참조로 치환만). `commandNotApplicable`은 순환 의존을 피하려 로컬 사본을 뒀다 — `toggle-collapse-commands.ts` 등 기존 4개 파일과 같은 선례.
- `production-editor-session.ts` — 735줄 → 601줄. `mediaUpload: MediaUploadTracker` 필드 하나로 위 상태를 위임하고, 기존 공개 메서드(`getMediaUploadState`/`getMediaUploadController`/`beginMediaUpload`/`endMediaUpload`/`uploadMediaFile`, `uploadFile` getter) 시그니처는 그대로 유지했다 — `editor-controller.ts`/`block-attribute-commands.ts`/`file-panel.tsx`/`media-toolbar.tsx` 등 기존 소비처는 무수정.

계획서(2절) 스케치는 `MediaUploadHost` 필드명을 `destroyed`/`tiptapEditor`로 잡았으나, `new MediaUploadTracker(this)`로 세션을 어댑터 없이 그대로 주입하려면 TypeScript 구조적 타이핑상 세션의 실제 public getter 이름(`isDestroyed`/`editor`)과 정확히 일치해야 해 그 이름으로 확정했다(계획서 괄호 설명과는 정합, 리터럴 표기와는 다름). `packages/core/src/index.ts`는 신규 심볼을 재노출하지 않는다(ADR-0002 유지).

## 실행한 검증과 결과

- `pnpm --filter @cp949/geul-core test` — 131 files / 1579 tests pass
- `pnpm --filter @cp949/geul-core typecheck` — pass(복합 2단 스크립트, PIT-0038 준수)
- `pnpm --filter @cp949/geul-core build` — pass
- `pnpm --filter @cp949/geul-react test` — 38 files / 505 tests pass
- `pnpm --filter @cp949/geul-react typecheck` — pass
- 단계-3 결함 탐지(읽기 전용 subagent) — 확정 결함 0건. 이동 전(`git show dev:...`) 대비 로직·분기 순서·에러 코드 동일, 순환 의존 없음, `MediaUploadHost` 구조적 일치성(`as any` 등 타입 우회 없음)과 클래스 필드 초기화 순서 안전성, 기존 소비처 시그니처 불변, `commandNotApplicable` 로컬 사본 완전 동일, G-EDT-001(command 원자성)·ADR-0002·패키지 의존 방향 준수를 전수 확인.
- 병합 직전 `pnpm verify` 전량(lint, format, 전 패키지 build/typecheck, unit test, package boundary, license, E2E chromium 183건) — 최초 실행에서 `prettier --check`가 신규 파일 포맷 위반 1건을 잡아 실패(라인 길이 wrap 문제, 로직 무변경). `prettier --write`로 수정하고 커밋을 amend한 뒤 재실행해 전부 pass.

## 남은 제한

- 등록한 이슈 없음 — 순수 구조 리팩터이고 제품 동작·게이트 구멍·거짓 통과를 드러내지 않아 issue-tracker.md "등록 기준"을 통과하는 발견이 없었다.
- `production-editor-session.ts`는 여전히 601줄이고 세션 생명주기·문서 커밋 파이프라인·블록 선택영역 3개 관심사가 남아 있다(계획서 "범위 밖" — `tiptapEditor`/`currentDocument` 재구성에 강결합). 추가 분리 필요성은 이번 작업에서 판단하지 않았다.
- `MediaUploadHost.runDocumentCommand`의 `reason` 파라미터를 `"local"` 리터럴로 좁힌 설계는 TS 메서드 이변성(bivariant) 검사에 기대고 있다 — 현재는 이 모듈이 항상 `"local"`만 호출해 안전하지만, `ChangeReason` 유니온이 확장되거나 이 인터페이스를 다른 호출부가 재사용하면 재검토가 필요하다.

## "가장 긴 소스코드 3개" 재검토 경과

2026-09-07 최초 "가장 긴 소스코드 3개" 점검(20260907-01~05, `import-markdown.ts`/`block-side-menu.tsx`/`table-handles.tsx`) 완료 후 코드베이스가 바뀌어 순위가 갱신됐다. 재점검 결과 상위 3개(`production-editor-session.ts` 735줄, `media-toolbar.tsx` 724줄, `import-html-blocks.ts` 656줄)에 같은 그릴링 기준을 적용한 결과:

| 파일 | 판단 | 근거 |
|---|---|---|
| `production-editor-session.ts` | 부분 분리(이 작업) | 업로드 상태 기계만 세션 참조 주입으로 깨끗이 분리 가능 |
| `media-toolbar.tsx` | 분리 불필요 | 의도적으로 복제된 단일 selection 상태 기계, 통증 근거 없음 |
| `import-html-blocks.ts` | 분리 불필요 | 분리 가능한 부분은 이미 분리 완료, 남은 4개 함수는 설계 문서(Ruling-01)가 상호재귀 결합을 명시 |

`media-toolbar.tsx`/`import-html-blocks.ts`는 이번 재점검에서 작업 대상으로 등록하지 않는다.
