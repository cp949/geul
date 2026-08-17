# Current project status

## 현재 단계

- 마지막 완료 단계: R0 — 프로젝트 기반
- 다음 진행 단계: R1 — 강화 테이블 중심 MVP
- R1 실행 상태: 구현 계획 [Issue #3](https://github.com/cp949/geul/issues/3) 승인 완료, 슬라이스 1(Mark 토글과 서식 툴바)·슬라이스 2(링크 툴바)·슬라이스 3(슬래시 메뉴·블록 추가·블록 종류 변경)·슬라이스 4(블록 drag handle과 복제·삭제 메뉴)·슬라이스 5(`TableGrid` 연산 모듈)·슬라이스 6(Table/Row/Cell Tiptap 노드와 기본 명령) 완료, 슬라이스 7(표 handle UI: 재정렬·열 너비 조절·빠른 확장) 구현 완료(리뷰 라운드 반영, Issue #3 체크는 보류 중)

R0에서 문단, H1-H3와 지원 인라인 mark의 기본 편집은 구현됐고, R1 슬라이스 1-4로 Notion형 block UI(서식 툴바, 링크 툴바, 슬래시 메뉴, 블록 추가, drag 재정렬, 복제·삭제 메뉴)가 통합되어 `BLK-001`, `BLK-002`는 `VERIFIED`다. 슬라이스 5는 `core` 내부 `TableGrid` 연산 모듈(사용자 노출 기능 없음)을 완성했다. 슬라이스 6은 자체 Table/Row/Cell Tiptap 노드·플러그인과 표 삽입/행열 추가·삭제 명령을 추가했다.

슬라이스 7부터 `EDITOR_FEATURE_UNAVAILABLE` 게이트가 두 방향으로 분리됐다(사용자 승인 결정). 표 명령 6종(`insertTable`/`insertTableRow`/`insertTableColumn`/`moveTableRow`/`moveTableColumn`/`resizeTableColumn`)이 `EditorController`에 연결되고 Table 확장이 라이브 에디터 스키마에 등록되어, **에디터 안에서 슬래시 메뉴로 만든 표의 편집·`getDocument()` 저장**은 동작한다(`TBL-002`/`TBL-003`/`TBL-009`는 `VERIFIED`). 반면 **표가 든 문서의 로드**(`createEditor` 초기 문서, `replaceDocument`)는 여전히 `model-to-tiptap.ts`에서 차단되며, 해제는 슬라이스 12 범위다 — 즉 표를 만들어 저장한 문서는 슬라이스 12 전까지 다시 불러올 수 없다. 외부 HTML 표 붙여넣기는 표 노드로 파싱하지 않는다(id 정규화가 없는 상태에서 파싱을 허용하면 문서 검증이 영구 실패한다) — 정규화와 함께 여는 것은 R1 paste 슬라이스 범위다. `deleteTableRow`/`deleteTableColumn`은 core에 구현돼 있으나 `EditorController` 미연결이고, 담당 슬라이스는 Issue #3에 미지정이다. 전체 table 편집 계약(슬라이스 8-13)은 아직 완료되지 않았다.

기능별 정확한 상태는 `docs/product/blocknote-free-feature-inventory.md`, R1 범위와 완료 조건은 `docs/product/roadmap.md`를 기준으로 한다.

## 바로 다음 작업

[Issue #3](https://github.com/cp949/geul/issues/3)의 슬라이스 8(셀 범위 선택, 병합/분할, `TBL-004`/`TBL-005`)부터 순서대로 구현한다. 슬라이스 8 착수 시 `packages/react/src/table-handles.tsx`의 열 geometry가 첫 행 셀 rect 기준이라는 가정(첫 행에 `colspan>1` 병합 셀이 생기면 깨짐)을 반드시 재검토한다.

슬라이스 1(Mark 토글 명령과 서식 툴바), 슬라이스 2(링크 툴바), 슬라이스 3(슬래시 메뉴, 블록 추가, 블록 종류 변경), 슬라이스 4(블록 drag handle과 복제·삭제 메뉴), 슬라이스 5(`TableGrid` 연산 모듈), 슬라이스 6(Table/Row/Cell Tiptap 노드와 기본 명령)을 완료했다. `INL-002`~`INL-007`, `UI-001`, `UI-002`, `UI-003`, `UI-005`, `UI-007`, `UI-008`, `UI-014`, `BLK-001`, `BLK-002`를 `VERIFIED`로 갱신했다(슬라이스 5·6은 core 내부/미연결 모듈이라 기능 ID 상태는 갱신하지 않음). `@tiptap/extension-underline`은 `@tiptap/starter-kit`가 기본 포함하는 확장이라 신규 의존성 추가가 필요하지 않았다 — Issue #3 작성 시점의 판단은 틀렸었다. 슬라이스 4에서는 블록 drag 재정렬을 네이티브 HTML5 drag-and-drop이 아닌 Pointer Event로 구현했다 — 네이티브 drag는 Playwright(CDP) 자동화 환경에서 dragover 이후 입력이 전달되지 않고 멈추는 것을 확인해 방향을 바꿨다. 슬라이스 6은 `@tiptap/pm/tables`(기존 `@tiptap/pm` 의존성에 이미 포함, 신규 의존성 없음)의 `tableEditing` 플러그인과 `TableMap` 저수준 API를 사용해 자체 Table/Row/Cell 노드를 만들었고, 표 명령은 PM 서브트리를 `TableBlock`으로 디코드 → 슬라이스 5 `TableGrid` 연산 적용 → 재인코드 → 단일 트랜잭션 교체 방식으로 구현했다.

각 슬라이스는 회귀 테스트를 먼저 추가해 RED를 확인한 뒤 최소 구현으로 GREEN을 만들고, 슬라이스별 완료 기준과 검증 명령을 충족한 뒤 다음 슬라이스로 넘어간다.

R1 vertical slice 순서, 책임 경계와 확정 사항은 Issue #3이 원본이며 이 문서에 복제하지 않는다.

## 운영 경계

- 현재 문서는 다음 제품 작업의 진입점을 지정하며 구현 계획을 대신하지 않는다.
- 새 branch 또는 worktree 생성은 승인된 계획이나 사용자 요청이 있을 때만 수행한다.
- commit, merge, push, publish와 PR 생성은 각각 별도 요청이 필요하다.
- 프로젝트 자체 배포 라이선스 결정은 공개 배포 전 [GitHub Issue #2](https://github.com/cp949/geul/issues/2)에서 수행한다.
