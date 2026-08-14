# Current project status

## 현재 단계

- 마지막 완료 단계: R0 — 프로젝트 기반
- 다음 진행 단계: R1 — 강화 테이블 중심 MVP
- R1 실행 상태: 구현 계획 [Issue #3](https://github.com/cp949/geul/issues/3) 승인 완료, 슬라이스 1(Mark 토글과 서식 툴바)·슬라이스 2(링크 툴바)·슬라이스 3(슬래시 메뉴·블록 추가·블록 종류 변경)·슬라이스 4(블록 drag handle과 복제·삭제 메뉴) 완료, 슬라이스 5(`TableGrid` 연산 모듈) 착수 전

R0에서 문단, H1-H3와 지원 인라인 mark의 기본 편집은 구현됐고, R1 슬라이스 1-4로 Notion형 block UI(서식 툴바, 링크 툴바, 슬래시 메뉴, 블록 추가, drag 재정렬, 복제·삭제 메뉴)가 통합되어 `BLK-001`, `BLK-002`는 `VERIFIED`다. 전체 table 편집 계약(슬라이스 5-13)은 아직 완료되지 않았다.

기능별 정확한 상태는 `docs/product/blocknote-free-feature-inventory.md`, R1 범위와 완료 조건은 `docs/product/roadmap.md`를 기준으로 한다.

## 바로 다음 작업

[Issue #3](https://github.com/cp949/geul/issues/3)의 슬라이스 5(`TableGrid` 연산 모듈, core 내부·사용자 노출 기능 없음)부터 순서대로 구현한다.

슬라이스 1(Mark 토글 명령과 서식 툴바), 슬라이스 2(링크 툴바), 슬라이스 3(슬래시 메뉴, 블록 추가, 블록 종류 변경), 슬라이스 4(블록 drag handle과 복제·삭제 메뉴)를 완료했다. `INL-002`~`INL-007`, `UI-001`, `UI-002`, `UI-003`, `UI-005`, `UI-007`, `UI-008`, `UI-014`, `BLK-001`, `BLK-002`를 `VERIFIED`로 갱신했다. `@tiptap/extension-underline`은 `@tiptap/starter-kit`가 기본 포함하는 확장이라 신규 의존성 추가가 필요하지 않았다 — Issue #3 작성 시점의 판단은 틀렸었다. 슬라이스 4에서는 블록 drag 재정렬을 네이티브 HTML5 drag-and-drop이 아닌 Pointer Event로 구현했다 — 네이티브 drag는 Playwright(CDP) 자동화 환경에서 dragover 이후 입력이 전달되지 않고 멈추는 것을 확인해 방향을 바꿨다.

각 슬라이스는 회귀 테스트를 먼저 추가해 RED를 확인한 뒤 최소 구현으로 GREEN을 만들고, 슬라이스별 완료 기준과 검증 명령을 충족한 뒤 다음 슬라이스로 넘어간다.

R1 vertical slice 순서, 책임 경계와 확정 사항은 Issue #3이 원본이며 이 문서에 복제하지 않는다.

## 운영 경계

- 현재 문서는 다음 제품 작업의 진입점을 지정하며 구현 계획을 대신하지 않는다.
- 새 branch 또는 worktree 생성은 승인된 계획이나 사용자 요청이 있을 때만 수행한다.
- commit, merge, push, publish와 PR 생성은 각각 별도 요청이 필요하다.
- 프로젝트 자체 배포 라이선스 결정은 공개 배포 전 [GitHub Issue #2](https://github.com/cp949/geul/issues/2)에서 수행한다.
