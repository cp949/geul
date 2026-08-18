# Tiptap 블록 에디터 MVP 설계

## 1. 결정 요약

이 프로젝트는 Tiptap 3 오픈소스 코어를 편집 엔진으로 사용하는 블록 에디터 라이브러리다. 프레임워크 독립 코어와 React 어댑터를 제공하며, 별도 데모 앱에서 공개 API와 사용자 동작을 검증한다.

첫 번째 수직 MVP는 문단, 제목, Notion형 블록 조작, 완전한 문서형 테이블 편집, 독자 JSON 저장·복원, HTML/GFM Markdown 입출력, Excel 및 Google Sheets 클립보드 붙여넣기를 제공한다. 실시간 공동 편집, 파일 기반 Excel/CSV 입출력, iframe과 고급 블록은 후속 범위다.

이 명세는 전체 제품 로드맵의 R0과 R1을 구체화한다. 전체 기능 범위와 이후 순서는 다음 문서가 관리한다.

- `docs/product/blocknote-free-feature-inventory.md`
- `docs/product/roadmap.md`

전체 제품의 목표는 BlockNote v0.54.0의 MPL-2.0 제품 기능과 승인된 독자 기능의 합집합이다. 모든 `xl-*` 기능은 기준선에서 제외하고 iframe/p5.js는 마지막 R8에 구현한다.

## 2. 제품 및 소스 경계

### 2.1 제품 목표

- 다른 애플리케이션에 삽입할 수 있는 에디터 라이브러리와 통합 데모 앱을 제공한다.
- Notion과 유사한 블록 편집 흐름을 제공한다.
- BlockNote와 유사한 테이블 편집 인터랙션을 제공한다.
- 공개 API와 저장 포맷은 BlockNote 및 Tiptap의 공개 모델과 독립적으로 설계한다.
- 향후 iframe/p5.js 블록, CRDT 공동 편집, Excel/CSV 파일 입출력을 추가할 수 있는 경계를 둔다.

### 2.2 독립 구현 원칙

- BlockNote는 공개된 사용자 동작을 관찰하는 참고 제품으로만 사용한다.
- BlockNote의 소스 구조, 컴포넌트, 스타일, 아이콘과 코드를 이식하지 않는다.
- 조작 방식과 컨트롤 배치는 익숙하게 만들 수 있지만 색상, 아이콘, 간격, 애니메이션은 독자 디자인을 사용한다.
- Tiptap과 그 하위 ProseMirror 패키지는 허용된 오픈소스 의존성으로 사용한다.
- Tiptap Pro 또는 다른 유료 패키지는 사용하지 않는다.
- 채택하는 모든 런타임 의존성의 라이선스를 기록하고 배포 전에 검증한다.

이 문서는 법률 자문이 아니다. 실제 배포 라이선스가 정해질 때 의존성 고지와 배포 의무를 별도로 검토한다.

## 3. 범위

### 3.1 MVP 범위

- 문단 블록
- 제목 H1, H2, H3 블록
- 테이블 블록
- 굵게, 기울임, 밑줄, 취소선, 인라인 코드, 링크
- Notion형 슬래시 메뉴, 블록 추가, 블록 메뉴와 드래그 재정렬
- 테이블 셀 범위 선택, 병합과 분할
- 열 너비 드래그 조절
- 행과 열의 핸들, 추가, 삭제와 드래그 재정렬
- 첫 행과 첫 열의 헤더 전환
- 셀 글자색과 배경색
- 표 오른쪽과 아래쪽의 빠른 확장 컨트롤
- 키보드 셀 이동
- Excel 및 Google Sheets의 HTML/TSV 클립보드 붙여넣기
- 독자 JSON 포맷 저장과 복원
- 고충실도 HTML import/export
- GFM Markdown import와 strict/lossy export
- 단일 사용자 undo/redo
- 최신 데스크톱 Chromium, Firefox, WebKit
- 단일 표의 논리 격자 기준 최대 10,000셀

### 3.2 MVP 제외 범위

- 목록, 이미지, 코드 블록, iframe과 p5.js 블록
- 터치와 모바일 조작
- 실시간 공동 편집과 CRDT 구현
- XLSX 파일 import/export
- CSV 파일 import/export
- HTML 소스 편집 모드
- Tiptap Pro 또는 유료 기능
- BlockNote API 및 저장 포맷 호환
- 픽셀 단위 BlockNote 외형 복제

## 4. 저장소와 패키지 구조

pnpm workspace와 Turborepo를 사용한다.

```text
apps/
  demo/                  공개 API만 사용하는 통합 데모
packages/
  model/                 독자 문서 타입, 검증, 직렬화, 버전 변환
  io/                    HTML/GFM Markdown/TabularData 변환과 sanitize
  core/                  Tiptap 기반 엔진, 블록/테이블 확장, 명령 API
  react/                 React Provider, 렌더러, 플로팅 UI와 스타일
```

아래 화살표는 왼쪽 패키지가 오른쪽 패키지에 의존한다는 뜻이다.

```text
io    -> model
core  -> model
react -> core
demo  -> react
demo  -> io
```

- `model`은 Tiptap, ProseMirror, React에 의존하지 않는다.
- `io`는 독자 모델과 외부 포맷 사이만 변환하며 Tiptap, ProseMirror, React에 의존하지 않는다.
- `core`는 Tiptap을 내부 구현으로 사용하지만 공개 API에서 Tiptap과 ProseMirror 타입을 노출하지 않는다.
- `react`는 상태를 직접 변경하지 않고 `core` 명령만 호출한다.
- `demo`는 `react`와 `io`의 공개 API만 사용하며 에디터 제품 로직을 두지 않는다.
- 초기 테마는 `react` 패키지의 스타일시트와 CSS 변수로 제공한다. 별도 디자인 시스템 패키지는 만들지 않는다.

Turborepo는 `build`, `typecheck`, `lint`, `test`, `dev` 작업 그래프와 캐시를 관리한다. 각 패키지는 루트 명령 없이도 자체 검증 명령을 실행할 수 있어야 한다.

## 5. 독자 문서 모델

### 5.1 문서 봉투

저장 원본은 HTML이나 Tiptap JSON이 아닌 버전형 JSON 문서다.

```ts
type Document = {
  formatVersion: 1;
  revision: number;
  blocks: Block[];
};
```

모든 블록, 행, 열과 셀에는 문서 안에서 안정적인 ID가 있다. `formatVersion`은 저장 포맷 마이그레이션에 사용하고, `revision`은 한 편집기 인스턴스 안에서 성공한 문서 변경마다 증가한다.

### 5.2 블록과 인라인 콘텐츠

```ts
type Block = ParagraphBlock | HeadingBlock | TableBlock;

type InlineContent = Array<{
  text: string;
  marks?: Array<
    | { type: "bold" | "italic" | "underline" | "strike" | "code" }
    | { type: "link"; href: string }
  >;
}>;
```

테이블 셀은 리치 인라인 콘텐츠만 포함한다. 셀 안에 다른 블록, 목록, 이미지, iframe이나 중첩 테이블을 넣지 않는다.

### 5.3 테이블 모델

```ts
type TableBlock = {
  id: string;
  type: "table";
  columns: Array<{ id: string; width: number }>;
  rows: Array<{
    id: string;
    cells: Array<{
      id: string;
      columnId: string;
      rowSpan: number;
      columnSpan: number;
      content: InlineContent;
      textColor?: string;
      backgroundColor?: string;
      align?: "left" | "center" | "right";
    }>;
  }>;
  headerRows: 0 | 1;
  headerColumns: 0 | 1;
};
```

- 병합으로 덮이는 논리 좌표에는 별도 가상 셀을 저장하지 않는다.
- 병합 영역의 좌상단 기준 셀에 `rowSpan`과 `columnSpan`을 저장한다.
- `columnId`는 기준 셀이 시작되는 열을 가리킨다.
- 열 너비는 셀이 아닌 열에 저장한다.
- 색상 값은 허용된 정규화 형식만 저장한다.
- `align`은 셀 단위로 저장하며 `left`/`center`/`right`만 허용한다. 미지정 셀은 키 자체를 두지 않는다(기본 정렬을 강제하지 않는다) — `textColor`/`backgroundColor`와 같은 optional 패턴.
- decoder는 겹친 셀, 빈 좌표, 존재하지 않는 열, 중복 ID, 10,000셀 초과를 거부한다.

`model -> Tiptap` decoder와 `Tiptap -> model` encoder는 `core`의 입출력 경계에 둔다. ProseMirror 위치값과 Tiptap 노드는 저장 포맷에 포함하지 않는다.

## 6. 에디터 코어

### 6.1 Tiptap의 역할

Tiptap은 에디터 수명주기, 확장 호스트, 트랜잭션과 브라우저 편집 표면을 제공한다. `@tiptap/extension-table`의 기본 TableKit 동작을 제품 기능의 권위 있는 구현으로 사용하지 않는다.

테이블은 자체 Table/Row/Cell 노드, 플러그인과 명령 계층으로 구성한다. 필요한 선택과 격자 연산은 `@tiptap/pm/tables`의 저수준 API를 명시적으로 사용한다. 버전을 고정하고, 사용하는 각 저수준 동작을 통합 테스트로 감싼다.

### 6.2 TableGrid

`core` 내부의 `TableGrid`는 테이블 구조에 대한 단일 권위다.

- 저장 모델과 ProseMirror 테이블을 논리 좌표 격자로 투영한다.
- 모든 좌표가 정확히 한 기준 셀에 포함되는지 검증한다.
- 셀 범위가 직사각형인지 판정한다.
- 행/열 삽입, 삭제와 이동 후 span을 보정한다.
- 병합과 분할 결과를 계산한다. 병합은 사라지는 셀의 내용을 기준 셀 뒤에 논리 좌표 순서로 이어붙이고(비어 있지 않은 조각 사이에만 공백을 넣는다), 분할은 기준 셀만 내용을 유지하고 새 셀은 비운다.
- 붙여넣기 영역과 기존 병합 셀의 충돌을 사전 검사한다.
- 열 너비와 최소 너비를 검증한다.

React 컴포넌트와 클립보드 파서는 별도 격자 계산을 구현하지 않는다.

### 6.3 명령

테이블 명령은 다음을 포함한다.

- `resizeColumn`
- `moveRow`, `moveColumn`
- `insertRow`, `insertColumn`
- `deleteRow`, `deleteColumn`
- `mergeCells`, `splitCell`
- `toggleHeaderRow`, `toggleHeaderColumn`
- `setCellTextColor`, `setCellBackgroundColor`, `setCellAlign`
- `pasteTabularData`

`setCellTextColor`/`setCellBackgroundColor`/`setCellAlign`은 행, 열 또는 명시적 셀 id 목록을 대상으로 받는다. 셀 id 목록 대상은 셀 범위 선택(7.2)에서 온다.

블록 명령은 생성, 종류 변경, 이동, 복제, 삭제, 분할과 병합을 포함한다.

각 사용자 조작은 하나의 트랜잭션으로 커밋한다. 실행할 수 없는 명령은 문서를 일부 변경하지 않고 구조화된 실패 결과를 반환한다. 한 번의 undo는 한 번의 사용자 조작 전체를 복원한다.

### 6.4 향후 공동 편집 경계

MVP에는 CRDT를 구현하지 않는다. 명령은 결정적인 입력과 결과를 가지며 안정적인 노드 ID를 유지한다. 저장 모델, 명령 계층과 UI를 분리해 향후 Tiptap/Yjs 어댑터를 추가할 수 있게 한다. 현재 설계는 특정 CRDT 프로토콜이나 충돌 정책을 확정하지 않는다.

## 7. React 어댑터와 사용자 인터랙션

### 7.1 블록 UX

- 빈 블록 또는 `/` 입력 시 검색 가능한 슬래시 메뉴를 연다.
- 블록 왼쪽 hover 시 `+` 버튼과 드래그 핸들을 표시한다.
- `+`는 해당 위치에 새 블록을 만들고 슬래시 메뉴를 연다.
- 핸들 drag 시 삽입 가이드를 표시하고 블록을 이동한다.
- 핸들 click 시 종류 변경, 복제와 삭제 메뉴를 연다.
- 텍스트 선택 시 인라인 서식 툴바를 표시한다.
- `Enter`는 블록을 분할한다.
- 빈 블록의 `Backspace`는 앞 블록과 병합하거나 제목을 문단으로 바꾼다.

### 7.2 테이블 UX

- 열 경계 hover 시 리사이즈 커서와 가이드를 표시한다.
- 드래그 중에는 시각 너비를 즉시 갱신하고 pointer-up에서 최종 너비를 한 번 커밋한다.
- 행 왼쪽과 열 위쪽에 대상별 핸들을 표시한다.
- 핸들 drag 시 삽입 위치 가이드와 함께 행 또는 열을 이동한다.
- 핸들 click 시 추가, 삭제, 헤더와 색상 메뉴를 연다.
- 표 오른쪽과 아래쪽에 빠른 열/행 추가 컨트롤을 표시한다.
- 셀 drag 선택(트리플클릭으로 만든 단일 셀 선택 포함)은 셀 선택 툴바를 연다. 선택이 서로 다른 기준 셀 2개 이상을 덮으면 병합을, 이미 병합된 셀 하나를 덮으면 분할을 노출한다. 선택 범위와 무관하게 글자색·배경색·정렬 컨트롤을 함께 노출한다.
- 셀 선택이 없어도 캐럿이 이미 병합된 셀 안에 있으면 같은 툴바에 분할과 글자색·배경색·정렬 컨트롤을 노출한다. 캐럿이 병합되지 않은 셀 안에 있을 때(일반 입력 중)는 툴바를 노출하지 않는다.
- `Tab`과 `Shift+Tab`은 다음/이전 셀로 이동한다.
- 마지막 셀의 `Tab`은 새 행을 추가한다.
- 셀 선택과 테이블 핸들 조작 중에는 블록 drag를 시작하지 않는다.

React 오버레이는 좌표 계산과 표시에만 책임이 있다. 문서 변경은 `core` 명령을 호출한다. 메뉴가 닫힌 뒤 편집 초점을 원래 대상에 복구한다.

## 8. 문서 입출력

### 8.1 포맷 역할

세 포맷의 역할을 구분한다.

| 포맷 | 역할 | 보존 수준 |
| --- | --- | --- |
| 독자 JSON | 저장·복원 원본 | 모든 지원 기능 완전 보존 |
| HTML | 외부 고충실도 교환 | 병합, 헤더, 색상과 열 너비 보존 |
| GFM Markdown | 휴대 가능한 텍스트 교환 | 단순 표만 무손실 보존 |

HTML이나 Markdown을 내부 저장 원본으로 사용하지 않는다. 모든 import는 외부 입력을 `model.Document`로 정규화하고, 모든 export는 검증된 `model.Document`에서 생성한다.

### 8.2 공개 API

```ts
const imported = importDocument(source, { format: "html" });
const markdown = exportDocument(document, {
  format: "markdown",
  mode: "strict",
});
```

지원 계약은 다음과 같다.

- `importDocument(source, { format: "html" })`
- `importDocument(source, { format: "markdown" })`
- `exportDocument(document, { format: "html" })`
- `exportDocument(document, { format: "markdown", mode: "strict" })`
- `exportDocument(document, { format: "markdown", mode: "lossy" })`

import 결과는 문서와 경고 목록을 반환한다. export 결과는 문자열과 경고 목록을 반환한다. 문서 전체를 만들 수 없는 오류에서는 부분 문서를 반환하지 않는다.

### 8.3 HTML 계약

- 문단, H1-H3, 지원하는 인라인 마크, 링크와 테이블을 읽고 쓴다.
- 테이블의 `rowspan`, `colspan`, `th`, 허용 색상, 허용 정렬 값과 열 너비를 독자 모델에 매핑한다.
- export는 표준 HTML 요소와 제한된 style/property만 사용한다.
- import는 script, event handler, 실행 가능한 URL, 임의 element/attribute/style을 제거한다.
- 링크 URL은 허용된 scheme 정책을 통과해야 한다.
- 지원하지 않는 안전한 요소는 가능한 경우 텍스트로 낮추고 경고한다. 위험한 요소는 제거하고 경고한다.
- sanitizer 이후 유효한 문서 모델을 만들 수 없으면 import 전체를 거부한다.

### 8.4 GFM Markdown 계약

Markdown dialect는 GitHub Flavored Markdown으로 고정한다.

- 문단, H1-H3, 굵게, 기울임, 취소선, 인라인 코드, 링크와 GFM 표를 읽고 쓴다.
- GFM에서 직접 표현할 수 없는 밑줄은 import/export 무손실 범위에서 제외한다.
- GFM 표 정렬 구문(`:---`, `:---:`, `---:`)은 열 단위다. import는 각 열의 정렬 값을 그 열의 모든 셀 `align`에 동일하게 매핑한다. 정렬 구문이 없는 열은 `align`을 지정하지 않는다.
- 단순 표는 셀 병합이 없고, 셀 색상과 비기본 열 너비가 없고, 열 안의 모든 셀 정렬 값이 같으며(모두 미지정도 포함), 모든 셀이 GFM 인라인으로 표현 가능한 표다.
- `strict` export는 표현 불가능한 요소가 하나라도 있으면 실패한다. 실패에는 블록/셀 ID, 기능 종류와 오류 코드를 포함한다.
- `lossy` export는 셀 병합을 논리 격자로 펼친다. 기준 셀의 텍스트는 좌상단에 두고 병합으로 덮인 좌표는 빈 셀로 내보낸다.
- `lossy` export는 셀 색상과 열 너비를 버리고 각 손실을 경고 목록에 기록한다.
- `lossy` export는 열 안에서 셀 정렬 값이 일치하지 않으면 그 열의 GFM 정렬을 비우고 손실을 경고 목록에 기록한다. 열 안의 모든 셀 정렬 값이 같으면(모두 미지정 포함) 그 값으로 GFM 열 정렬을 쓴다.
- `lossy` export에서도 내용 의미를 안전하게 결정할 수 없는 구조는 실패한다.
- Markdown 안에 raw HTML을 삽입해 비표준 정보를 보존하지 않는다.
- Markdown import의 raw HTML은 실행하거나 고충실도 HTML 경로로 승격하지 않는다. 텍스트로 낮추거나 제거하고 경고한다.

## 9. 스프레드시트 클립보드

### 9.1 입력 우선순위

```text
ClipboardEvent
  1. text/html 안의 table
  2. text/plain의 TSV
       -> ClipboardTableParser
       -> TabularData
       -> validator
       -> pasteTabularData
```

특정 Excel namespace나 사용자 에이전트를 필수 조건으로 사용하지 않는다. Excel과 Google Sheets가 제공하는 HTML 표를 우선하고, 없으면 TSV를 사용한다.

### 9.2 정규화와 보안

- HTML의 script, event handler, URL 실행 요소와 임의 속성을 제거한다.
- 표 구조, `rowspan`, `colspan`, 일반 텍스트, 지원하는 인라인 마크와 허용된 색상만 읽는다.
- 수식은 실행하거나 저장하지 않고 클립보드에 제공된 표시값만 사용한다.
- TSV는 탭과 줄바꿈으로 격자를 만들며 병합과 서식을 표현하지 않는다.
- 정규화된 `TabularData`는 편집기 타입을 참조하지 않는다.
- 클립보드 HTML은 문서 HTML import와 동일한 sanitizer 정책과 테이블 변환기를 재사용한다.

### 9.3 붙여넣기 동작

- 표 밖에 붙이면 새 테이블 블록을 만든다.
- 기존 표 안에 붙이면 현재 셀을 좌상단으로 삼아 덮어쓴다.
- 대상 표가 작으면 필요한 행과 열을 자동 확장한다.
- 기존 병합 영역과 붙여넣기 영역이 안전하게 결합되지 않으면 전체 작업을 거부한다.
- 논리 격자가 10,000셀을 초과하면 전체 작업을 거부한다.
- 파싱 대상이 아니면 이벤트를 소비하지 않고 Tiptap의 일반 붙여넣기로 넘긴다.
- 성공한 생성, 확장, 값 입력과 서식 적용은 하나의 트랜잭션이다.

## 10. 공개 API와 상태 흐름

```ts
const editor = createEditor({
  initialDocument,
  onChange(event) {
    // event.revision, event.changedBlockIds, event.reason
  },
});

editor.getDocument();
editor.replaceDocument(nextDocument);
editor.commands.insertTable({ rows: 3, columns: 3 });
editor.commands.undo();
```

- `initialDocument`는 생성 시 한 번 적용한다.
- 매 입력마다 외부 값을 다시 주입하는 controlled 모드는 제공하지 않는다.
- 서버 응답 또는 문서 전환은 `replaceDocument()`로 명시한다.
- `getDocument()`는 검증된 독자 문서 모델을 반환한다.
- `onChange`는 revision, 변경 블록 ID와 변경 원인을 알린다.
- 소비자는 `onChange`를 debounce한 뒤 `getDocument()`를 호출해 자동 저장한다.
- 모든 명령은 성공, 실행 불가와 검증 오류를 구분하는 `Result`를 반환한다.
- HTML/GFM 변환 함수는 `io` 패키지가 제공한다. 코어 에디터 인스턴스에 포맷별 파서를 내장하지 않는다.

React 어댑터는 다음 조합 API를 제공한다.

```tsx
<EditorProvider editor={editor}>
  <EditorContent />
  <EditorFloatingUI />
</EditorProvider>
```

React 언마운트는 코어 문서와 명령의 의미를 변경하지 않는다.

## 11. 오류 계약

오류는 예외 문자열에 의존하지 않고 안정적인 코드와 문맥을 갖는다.

- `DOCUMENT_FORMAT_UNSUPPORTED`
- `DOCUMENT_INVALID`
- `TABLE_GRID_INVALID`
- `TABLE_SELECTION_NOT_RECTANGULAR`
- `TABLE_MERGE_CONFLICT`
- `TABLE_PASTE_CONFLICT`
- `TABLE_PASTE_LIMIT_EXCEEDED`
- `TABLE_COMMAND_NOT_APPLICABLE`
- `IMPORT_PARSE_FAILED`
- `IMPORT_UNSAFE_CONTENT_REMOVED`
- `EXPORT_FORMAT_LOSS`
- `EXPORT_FORMAT_UNSUPPORTED`

셀 정렬 값 검증 실패는 셀 색상과 동일하게 `DOCUMENT_INVALID`를 재사용한다(전용 코드를 추가하지 않는다).

사용자 입력으로 예상 가능한 거부는 `Result` 실패로 반환한다. 프로그래밍 오류나 깨진 내부 불변식은 개발 환경에서 명시적으로 실패시키고, 소비자 콜백으로 진단 정보를 전달한다. 실패한 명령은 revision, selection과 문서를 변경하지 않는다.

## 12. 검증 전략

### 12.1 모델 단위 테스트

- 저장 포맷 validation과 round-trip
- `rowSpan`, `columnSpan`, 열 너비와 안정 ID 보존
- 겹친 셀, 빈 좌표, 범위 초과와 중복 ID 거부
- 버전 migration fixture

### 12.2 입출력 단위 테스트

- 독자 JSON -> HTML -> 독자 JSON round-trip
- 단순 문서의 독자 JSON -> GFM -> 독자 JSON round-trip
- HTML의 `rowspan`, `colspan`, `th`, 색상, 정렬과 열 너비 보존
- HTML sanitizer의 script, event handler와 위험 URL 제거
- GFM `strict`의 손실 위치 및 오류 코드
- GFM `lossy`의 병합 펼침과 색상/너비/정렬 불일치 경고
- GFM `strict`/`lossy`의 열 정렬 구문 import 매핑(열 전체 셀에 동일 적용)
- raw HTML이 포함된 Markdown의 안전한 처리
- Markdown parser/serializer fixture의 dialect 고정

### 12.3 TableGrid 속성 테스트

임의의 유효한 표에 삽입, 삭제, 이동, 병합과 분할을 연속 적용한다. 각 단계에서 다음을 검증한다.

- 모든 논리 좌표가 정확히 한 기준 셀에 포함된다.
- 셀이 겹치거나 표 범위를 벗어나지 않는다.
- 모든 행의 논리 열 수가 같다.
- 명령과 undo 후 문서가 원본과 같다.

### 12.4 코어 통합 테스트

- 공개 명령당 하나의 트랜잭션
- 실패한 명령의 무변경 보장
- 독자 모델과 Tiptap 문서의 양방향 변환
- 표 안/밖 스프레드시트 붙여넣기
- 자동 행/열 확장
- 병합 충돌의 원자적 거부
- 10,000셀 경계와 초과 거부

### 12.5 Playwright 브라우저 테스트

실제 포인터와 키보드 입력으로 다음을 검증한다.

- 열 리사이즈와 저장 너비
- 행/열 핸들 표시, 메뉴와 재정렬
- 셀 drag 선택, 병합과 분할
- 빠른 행/열 확장 컨트롤
- `Tab` 탐색과 마지막 셀의 새 행
- Excel형 HTML과 Google Sheets형 HTML/TSV 붙여넣기 fixture
- 모든 테이블 조작의 undo/redo
- 저장, 새 편집기 생성과 동일 문서 복원
- HTML/GFM import 결과 편집 및 재export

Chromium, Firefox와 WebKit에서 핵심 테이블 시나리오를 실행한다. 위치와 겹침이 중요한 플로팅 UI에는 제한적인 시각 회귀 테스트를 사용한다.

### 12.6 배포 계약 테스트

- 빌드 결과를 별도 fixture 앱에 설치한다.
- 공개 export, ESM과 타입 선언을 검증한다.
- 호스트 전역 스타일을 변경하지 않는지 확인한다.
- `model`, `io`, `core`는 React 없이 import할 수 있어야 한다.

## 13. 성능 계약

- 단일 표는 논리 격자 10,000셀까지 지원한다.
- drag 중에는 문서 전체를 독자 모델로 직렬화하지 않는다.
- 열 리사이즈는 pointer-move 동안 프레임 단위로 시각 업데이트를 제한하고, pointer-up에서 한 번 커밋한다.
- `onChange`는 전체 문서 대신 변경된 블록 ID를 알린다.
- 자동 저장 직렬화 주기는 소비자가 조절한다.
- 10,000셀 fixture의 로드, 선택, 붙여넣기와 undo를 브라우저 benchmark로 기록한다.
- 초기 기준 측정 이후 같은 CI 환경에서 중앙값이 20% 넘게 악화되면 성능 회귀로 처리한다.

## 14. 후속 확장 경계

### 14.1 파일 입출력

향후 파일 어댑터도 정규화된 `TabularData`를 경유한다.

- XLSX는 병합 셀, 표시값, 일부 서식과 열 너비를 보존하는 구조형 어댑터로 설계한다.
- CSV는 RFC 4180 인용 규칙을 사용하되 텍스트 값만 보존하는 손실 형식으로 명시한다.
- CSV는 병합, 리치 텍스트, 색상과 열 너비를 보존하지 않는다.
- import 미리보기와 손실 경고는 파일 어댑터 단계에서 제공한다.

### 14.2 iframe/p5.js

iframe은 별도 블록 타입과 보안 정책이 필요하다. 허용 origin, sandbox 권한, 크기 조절, 로딩 실패와 직렬화 계약을 별도 설계한 뒤 추가한다.

### 14.3 공동 편집

CRDT 구현 전에 테이블 명령의 동시 편집 의미, 안정 ID 매핑, 병합/이동 충돌 정책을 별도 설계한다. MVP의 안정 ID와 명령 경계는 이 확장을 막지 않아야 하지만 특정 해결책을 선결정하지 않는다.

## 15. MVP 완료 조건

- 문단, H1-H3와 테이블 블록을 생성, 편집, 이동, 저장하고 복원할 수 있다.
- 승인된 모든 테이블 인터랙션이 마우스와 키보드로 동작한다.
- 표 조작은 각각 한 번의 undo로 정확히 복원된다.
- Excel 및 Google Sheets의 대표 HTML/TSV fixture를 표 밖과 기존 표 안에 붙일 수 있다.
- 지원 문서를 HTML로 round-trip했을 때 테이블 구조와 표현 속성이 보존된다.
- 단순 문서를 GFM으로 round-trip할 수 있고, 고급 표의 strict/lossy 동작이 계약대로 검증된다.
- 10,000셀 경계가 테스트되고 초과 입력은 문서 변경 없이 거부된다.
- 공개 저장 JSON에 Tiptap/ProseMirror 전용 타입이나 위치값이 없다.
- `model`, `io`, `core`, `react`, `demo`의 의존 방향이 지켜진다.
- 핵심 브라우저 테스트가 Chromium, Firefox와 WebKit에서 통과한다.
- 빌드된 ESM 패키지와 타입 선언을 별도 fixture 앱에서 사용할 수 있다.
