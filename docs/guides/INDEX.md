# 개발 가이드 목록

반복 작업의 정상 구현·검증 경로다. ID, 제목과 적용 조건만으로 작업 조건과 맞는 가이드를 선택한다. 각 가이드는 적용 조건, 구현 규칙, 검증과 완료 기준만으로 실행할 수 있다.

가이드 ID는 `G-<카테고리>-<번호>` 형식이다. ID는 파일 이동·제목 변경·폐기 후에도 재사용하거나 다시 매기지 않는다. 대화에서는 `G-TST-002` 또는 “테스트 2번 가이드”로 지칭한다.

| ID | 제목 | 적용 조건 |
| --- | --- | --- |
| [`G-TST-001`](./G-TST-001-test-overlays-and-keyboard-interactions.md) | overlay·키보드 interaction 테스트 | menu·toolbar·popover의 닫기·초점·브라우저 interaction 변경 |
| [`G-TST-002`](./G-TST-002-own-shared-test-support.md) | 공용 test support 소유 | 두 번째 테스트 파일이 같은 fixture·helper·조립 지식을 사용 |
| [`G-TST-003`](./G-TST-003-clean-up-test-resources.md) | 테스트 자원 정리 | DOM 노드·Editor·observer 등 명시적 수명 자원 생성 |
| [`G-TST-004`](./G-TST-004-test-complexity-deterministically.md) | 복잡도 회귀 검증 | 성능 최적화 또는 성능 상한 테스트 변경 |
| [`G-WKS-001`](./G-WKS-001-prove-package-boundaries.md) | 패키지 경계 검증 | manifest·public type·package export·consumer 변경 |
| [`G-WKS-002`](./G-WKS-002-build-before-distribution-verification.md) | 배포 소비 검증 | consumer fixture·E2E·package export 검증 |
| [`G-WKS-003`](./G-WKS-003-typecheck-tests-and-non-package-sources.md) | TypeScript 소스 전량 typecheck | package test·config·e2e·script TS/JS 추가 |
| [`G-WKS-004`](./G-WKS-004-verify-lint-and-gate-changes.md) | lint·gate 변경 검증 | lint autofix·validator·copy detection 변경 |
| [`G-WKS-005`](./G-WKS-005-run-pnpm-inside-bind-mounted-containers.md) | 컨테이너 안 pnpm 실행 | 호스트 저장소를 bind-mount한 Docker 컨테이너 안에서 pnpm 명령 실행 |
| [`G-WKS-006`](./G-WKS-006-replace-unsupported-web-apis-at-the-floor-browser.md) | floor 미지원 Web API 대체 구현 | Geul 자기 소스가 호출하는 Web API가 Chrome75 floor에서 미지원 |
| [`G-EDT-001`](./G-EDT-001-keep-editor-commands-atomic.md) | 편집기 command 원자성 | document·selection·stored mark·revision 변경 command 구현 |
| [`G-EDT-002`](./G-EDT-002-resync-selection-before-reading-stale-state.md) | 클릭 직후 stale selection 재동기화 | 클릭 직후 실행될 수 있는 키보드 핸들러가 editor.state.selection을 판정에 쓰는 경우 |
| [`G-UI-001`](./G-UI-001-build-dismissible-overlays.md) | dismissible overlay 구현 | 바깥 클릭·Escape로 닫는 UI 구현 |
| [`G-UI-002`](./G-UI-002-key-reordered-ui-by-stable-id.md) | 재정렬 UI 식별자 | 안정 key를 가진 항목의 위치 변경·후속 이벤트 억제 |
| [`G-CNV-001`](./G-CNV-001-centralize-canonicalization-and-validation.md) | 변환 경계 중앙화 | model·importer·core의 정규화·검증 변경 |
| [`G-CNV-002`](./G-CNV-002-preserve-imported-meaning.md) | 외부 입력 의미 보존 | HTML·GFM importer·sanitize·warning 변경 |
| [`G-TBL-001`](./G-TBL-001-use-logical-table-grid.md) | 논리 table 격자 | table model·변환·command·selection·overlay 변경 |
| [`G-PRC-001`](./G-PRC-001-keep-scratch-work-outside-the-repository.md) | 임시 조사 파일 관리 | 재현·분석용 일회성 script 생성 |

## 카테고리

| 코드 | 영역 |
| --- | --- |
| `TST` | 테스트·fixture·성능 검증 |
| `WKS` | workspace·build·typecheck·gate |
| `EDT` | 편집기 command·transaction·selection |
| `UI` | React UI·overlay·interaction |
| `CNV` | HTML·Markdown·clipboard 변환 |
| `TBL` | table model·command·UI |
| `PRC` | 에이전트·Git·workflow 절차 |
| `L10N` | 다국어·번역·locale; 첫 가이드 생성 전까지 ID 없음 |

## 상태와 변경

- `ACTIVE`: 현재 작업에서 적용한다.
- `SUPERSEDED`: 새 가이드가 대신한다. 기존 ID 문서는 새 ID를 연결하는 짧은 문서로 보존한다.
- 교차 영역 가이드는 주 소유 카테고리 하나에만 둔다. 다른 행은 태그와 링크로 연결한다.
- 세부 절은 새 ID를 만들지 않고 Markdown heading으로 지칭한다.
