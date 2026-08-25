# R1 슬라이스 11 — 스프레드시트 클립보드 붙여넣기 설계

## 1. 결정 요약

Issue #3 슬라이스 11(`TBL-012`~`TBL-014`)의 구현 설계다. `ClipboardTableParser`(io) → `TabularData`(io) → 검증기(model 재사용) → `pasteTabularData`(core) 파이프라인을 만들고, 10,000셀 성능 benchmark를 기록한다. `docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md` 9절(붙여넣기 계약)·13절(성능 계약)을 구체화하며 그 문서의 계약을 바꾸지 않는다.

핵심 결정:

1. **`core`가 `io`에 의존하는 새 엣지를 추가한다**(`ADR-0002` 그래프 갱신). `ClipboardTableParser`/`TabularData`/검증기는 io 소유, `pasteTabularData`/`TableGrid.pasteInto`는 core 소유.
2. Issue #12(io 10,000셀 markdown 테스트 타임아웃)를 이 슬라이스에서 함께 닫는다. spec 13 기준선 최초 측정치는 이 슬라이스의 benchmark 결과로 겸한다.
3. 클립보드 HTML의 인라인 `style`(`color`/`background-color`/`text-align`)을 읽는다. 이 해석 로직은 클립보드 경로 전용이며 기존 `importHtml`(문서 HTML import) 동작은 바꾸지 않는다.

## 2. 패키지 배치와 의존성

```
io -> model        (기존)
core -> model       (기존)
core -> io          (신규 — 이 슬라이스에서 추가)
react -> core       (기존, 변경 없음)
demo -> react, io, model  (기존, 변경 없음)
```

- `packages/core/package.json`에 `"@cp949/geul-io": "workspace:*"` 추가.
- `docs/adr/0002-enforce-layered-package-boundaries.md`의 의존 방향 문장에 `core -> io`를 추가하고, 근거(클립보드 파서가 io의 HTML sanitizer·테이블 변환기를 재사용)를 기록한다.
- `scripts/check-package-boundaries.mjs`는 `model`/`io`만 headless(DOM/React/Tiptap 금지) 검사 대상이고 `core`의 의존성 방향 자체는 검사하지 않는다 — 이 변경으로 새로 실패하는 자동 검사는 없다. `core` 공개 `.d.ts`가 Tiptap/ProseMirror 타입을 계속 안 새는지는 기존 검사가 그대로 커버한다.
- `react`, `demo`는 이 슬라이스에서 변경 없음. React는 여전히 core의 명령 API(`pasteTabularData`)만 호출한다 — 클립보드 파싱을 직접 하지 않는다.

## 3. `TabularData` (io)

`packages/io/src/clipboard/tabular-data.ts`(신규):

```ts
export type TabularCell = {
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
  content: InlineContent;
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
};

export type TabularData = {
  columnCount: number;
  rows: Array<{ cells: TabularCell[] }>;
};
```

- 편집기 타입(Tiptap/ProseMirror)도 model의 안정 id(`TableBlock`의 `id`/`columnId`)도 참조하지 않는다 — 위치(`columnIndex`) 기반 스냅샷이다.
- 헤더 정보(`headerRows`/`headerColumns`)는 담지 않는다. 붙여넣기는 값·서식만 옮기고 헤더 여부를 추측하지 않는다(YAGNI, 기존 `toggleHeaderRow`/`toggleHeaderColumn` 명령과 별개 관심사).

## 4. `ClipboardTableParser` (io)

`packages/io/src/clipboard/clipboard-table-parser.ts`(신규), export명 `parseClipboardTable`:

```ts
export type ClipboardParseError =
  | { code: "NOT_TABULAR" }
  | { code: "CLIPBOARD_TABLE_INVALID"; message: string };

export const parseClipboardTable = (input: {
  html?: string;
  text?: string;
}): Result<TabularData, ClipboardParseError> => { ... };
```

위 반환 타입은 설계 시점의 것이다 — 현재 공개 계약은 `Result<ClipboardContent, ClipboardParseError>`다(§4.1 '구현 반영(무손실 시퀀스 계약, Issue #71)').

### 4.1 우선순위와 판정

```text
1. input.html에 <table>이 있으면 HTML 경로
2. 없으면 input.text에 탭 문자가 1개 이상 있으면 TSV 경로
3. 둘 다 아니면 NOT_TABULAR
```

`NOT_TABULAR`는 core의 붙여넣기 가로채기가 이벤트를 소비하지 않고 Tiptap 기본 붙여넣기로 넘기는 신호다. 탭 없는 일반 여러 줄 텍스트를 1열 표로 오인하지 않도록, TSV 경로는 탭 존재를 필수 조건으로 둔다.

구현 반영(혼합 클립보드 정책 결정, Issue #37 — **Issue #71로 대체됨**): 아래 단락이 서술하는 "표 밖에 실질 텍스트가 있으면 `NOT_TABULAR`" 판정은 더 이상 코드에 없다. 현재 계약은 아래 '구현 반영(무손실 시퀀스 계약, Issue #71)'이다 — 표 밖 콘텐츠는 거절 사유가 아니라 문단 블록이 된다. 이 단락은 sanitize의 unwrap/strip 동작과 `<title>` 처리 근거를 남기기 위해 보존한다(그 부분은 지금도 유효하다). HTML 경로는 찾아낸 데이터 표가 fragment의 유일한 실질 콘텐츠일 때만 표로 판정한다. `findDataTable`이 고른 표 요소를 제외한 나머지 트리(형제 노드, 감싸는 래퍼)에 공백이 아닌 텍스트가 하나라도 남아 있으면(`<p>intro</p><table>…</table><p>outro</p>` 등) `NOT_TABULAR`로 기본 붙여넣기에 전체를 넘긴다. "지배적" 같은 비율 기반 판정 대신 "표 이외 실질 텍스트 없음"이라는 이진 조건을 쓴다 — 비율 임계값은 근거 없는 매직 넘버가 되고 결정적으로 테스트할 수 없다. 이 판정은 sanitize를 이미 거친 트리를 검사한다: hast-util-sanitize는 스키마 `tagNames` 허용 목록에도 `strip` 목록에도 없는 태그를 벗겨내(unwrap) 그 자식(텍스트 포함)을 트리 위로 그대로 끌어올리므로, `<html>`/`<head>`/`<body>` 같은 래퍼에 있던 텍스트도 살아남으면 그대로 판정에 걸린다 — 구조적 래퍼가 통째로 면제되는 허용 목록이 따로 있는 게 아니다. `strip` 목록에 있는 태그만 태그와 텍스트가 함께 통째로 제거되고, 주석은 `allowComments: false`로 별도 제거된다. 클립보드 경로는 이 `strip` 목록에 `<title>`을 얹는다(`clipboardStrippedTagNames`) — `<title>`은 소스 문서 head의 메타데이터지 사용자가 선택한 본문이 아닌데, unwrap으로 텍스트가 fragment 최상위로 끌려 올라오면 "표 밖 실질 텍스트"로 오인돼 스프레드시트 표 붙여넣기가 통째로 막히기 때문이다. 문서 import 경로(`htmlSanitizeSchema`)는 import-warnings 계약이 걸려 있어 이 목록을 공유하지 않는다. 이 판정은 `isLayoutTable`/`findDataTable`이 재귀적으로 파고드는 레이아웃 표 래퍼(Gmail 서명 같은 `role="presentation"` 표)에도 그대로 적용된다 — 래퍼 표의 다른 셀에 있는 텍스트(서명 문구 등)도 안쪽 데이터 표 판정을 무효화한다. "표 밖 실질 텍스트를 조용히 버리지 않는다"는 이번 정책과 일관된 동작이며, 레이아웃 표 언래핑 기능 자체를 좁히는 회귀가 아니다.

구현 반영(판정이 쓰는 "실질 콘텐츠"의 정의, 2026-08-21 리뷰): 두 가지를 명시한다. (1) **데이터 표 후보**는 셀(`td`/`th`)이 하나라도 있는 표다 — `findDataTable`은 가장 안쪽 표를 고르므로, Outlook/Gmail HTML 메일이 여백용으로 심는 빈 중첩 `<table>`을 후보로 집으면 같은 행의 진짜 셀들이 "표 밖 텍스트"가 돼 클립보드 전체가 거절된다. 셀 없는 표는 건너뛰고 계속 내려간다(`hasDataCells`). 이 규칙 덕에 `tabularDataFromTable`은 빈 표를 볼 일이 없고, `sawTable`을 오류 코드에서 유도하지 않아도 된다. (2) **표 밖 실질 텍스트**는 눈에 보이는 문자다 — Issue #71 이후 이 판정(`hasSubstantialText`)은 클립보드를 거절할지가 아니라 그 텍스트로 문단 블록을 만들지를 결정한다(보이지 않는 문자만 남은 문단은 만들지 않는다). 아래 근거는 판정 기준 자체에는 그대로 유효하다 — 공백류(NBSP 포함)에 더해 제로폭 문자(U+200B~U+200D, U+2060, U+FEFF)와 soft hyphen(U+00AD)도 실질 콘텐츠로 세지 않는다. Slack/Notion/Docs가 블록 경계에 심는 U+200B 한 글자로 표 붙여넣기가 막히면 사용자는 원인도 모르고 되돌릴 수도 없다(`sawTable` 때문에 TSV 짝으로도 폴백하지 못한다). 이 정의는 `cell-text.ts`의 `HTML_WHITESPACE_RUN`(NBSP를 공백에서 제외)과 다르지만 질문이 다르기 때문이다 — 거기서는 "셀 안 이 문자를 접을까", 여기서는 "이게 사용자가 고른 콘텐츠인가"를 묻는다.

구현 반영(HTML 경로 판정 이후 TSV 폴백 금지, Issue #37): 위 우선순위 의사코드의 2번은 "HTML 경로가 실패하면 TSV"가 아니라 **"거절할 데이터 표를 애초에 찾지 못했으면 TSV"**다. HTML 경로가 데이터 표를 찾아 그 내용을 보고 거절했다면(Issue #71 이후로는 `CLIPBOARD_TABLE_INVALID` 하나뿐이다 — 혼합 콘텐츠는 더 이상 거절 사유가 아니다) 함께 온 `text/plain` 짝이 우연히 표와 같은 탭 구조를 가져도 TSV 경로로 폴백하지 않는다 — 폴백하면 방금 내린 거절 판정이 그대로 무력화된다(문단 텍스트 자체에 탭이 섞인 클립보드에서 재현). `parseHtmlTable`이 모듈 내부 전용 `sawTable` 판별 필드로 두 경우를 구분하고, `parseClipboardTable`이 반환 직전에 벗겨내 공개 `ClipboardParseError` 모양은 그대로 유지한다. 예외는 셀도 `<col>`도 없는 빈 표(`<table></table>`)뿐이다 — 거절할 데이터 자체가 없어 무력화될 판정도 없으므로 표 후보를 못 찾은 것과 똑같이 취급하고 TSV 짝을 막지 않는다.

폴백은 이슈 #37이 옵션 (a)의 전제로 제기한 위험(blockId/cellId 없는 표 노드)을 만들지 않는다: `table`/`tableRow`/`tableCell` 세 노드는 의도적으로 노드 레벨 `parseHTML`을 정의하지 않으므로(`table-extension.ts` L54-59 주석) ProseMirror 기본 `DOMParser`가 `<table>`을 커스텀 표 노드로 만드는 경로 자체가 없다.

정정(2026-08-21 리뷰): 그렇다고 폴백이 **무손실은 아니다**. ProseMirror의 `blockTags`에는 `table`은 있지만 `tr`/`td`/`th`/`tbody`는 없어서, 표의 모든 셀이 구분자 없이 하나의 인라인 런으로 이어 붙는다. 실제 브라우저에서 확인: `<p>intro</p><table>12|34 / 56|78</table><p>outro</p>`를 붙이면 문서에 `intro` / `12345678` / `outro` 세 문단이 생긴다 — 셀 경계뿐 아니라 행 경계도 사라지고, 숫자 셀에서는 조용한 값 손상이 된다. 즉 이 정책은 "표 밖 문단 유실"과 "표 구조·셀 경계 유실"을 맞바꾼 것이지 손실을 없앤 것이 아니다. 당시 e2e(`e2e/table-paste.spec.ts`)는 `toContainText`가 아니라 병합된 정확한 문자열을 assert해 이 동작을 고정했다 — `toContainText("cellA")`는 `cellAcellB`에도 통과해 병합을 감췄다. 이 e2e 고정은 Issue #71 구현으로 대체됐다(바로 아래 '구현 반영' 단락과 현재 `e2e/table-paste.spec.ts` 참고).

구현 반영(무손실 시퀀스 계약, Issue #71): 위 정정이 지적한 손실은 `parseClipboardTable`의 반환 타입을 바꿔 해소한다. 표를 찾은 뒤에는 표 밖 콘텐츠를 거절하지 않고, 표 앞뒤 문단을 문단 블록으로 옮겨 담아 `ClipboardContent`(`ClipboardContentBlock[]`, `packages/io/src/clipboard/clipboard-content.ts`) 시퀀스로 반환한다 — `{type:"paragraph"; content: InlineContent} | {type:"table"; data: TabularData}`. 표를 찾지 못한 HTML과 TSV 경로는 `[{type:"table", data}]`(1개짜리 시퀀스)로 반환해 계약을 하나로 통일한다. `core`의 `pasteClipboardContent`(`table-commands.ts`)가 이 시퀀스를 순서대로 조립해 한 트랜잭션으로 삽입한다 — 표는 `buildPasteTableSkeleton`+`pasteInto`로 안정 id를 배정하고, 문단은 id 없이 삽입해 `BlockIdExtension.appendTransaction`이 같은 dispatch 안에서 사후 배정한다(ADR-0001, G-EDT-001). 단일 표 시퀀스는 `pasteTabularData`에 그대로 위임해 기존 표 안/밖 계약(TBL-012~014)을 바꾸지 않는다 — 새 경로는 문단이 섞인 시퀀스에서만 탄다. 표 안(커서가 이미 표 셀)에서 문단이 섞인 시퀀스를 받으면 표 부분은 기존 grid-paste 경로로 붙이고, 문단 텍스트는 `withParagraphsMergedIntoCells`가 셀 인라인 콘텐츠에 합친다 — 표 셀은 블록 자식을 가질 수 없으므로(model `TableCell.content: InlineContent`) 문단을 블록으로 끼울 자리가 없지만, 버리면 조용한 텍스트 손실이 된다(변경 전에는 같은 클립보드가 `NOT_TABULAR`로 Tiptap 기본 붙여넣기에 넘어가 텍스트가 셀에 남았다). 읽기 순서를 지켜 표 앞 문단은 붙여넣은 표의 좌상단 셀 앞에, 표 뒤 문단은 마지막 셀 뒤에 LF 하나로 구분해 붙인다(셀 안 줄바꿈을 LF로 표현하는 것은 `<br>` → LF와 같은 기존 셀 텍스트 계약이다). 1×1 표에서는 두 셀이 같으므로 앞뒤 문단이 한 셀에 순서대로 쌓인다. 표 밖 텍스트의 인라인 마크는 서식 요소가 표의 형제든 표를 감싼 조상이든 같게 보존한다 — 조상인 경우 시퀀스 변환이 그 요소를 통과해 내려가므로 `wrapInAncestors`가 조상 체인을 얕은 클론으로 다시 씌워 마크(link의 `href` 포함)를 살린다. 여러 개의 독립된 데이터 표가 한 클립보드에 섞인 경우는 범위 밖으로 남는다 — `findDataTable`은 여전히 표 하나만 고르고, 고르지 않은 다른 `<table>`은 레이아웃 래퍼와 동일하게 취급돼 그 안 텍스트가 셀 경계 없이 인라인 콘텐츠로 흡수된다.

구현 반영(Issue #73): 다중 표 지원. 바로 위 문단 끝의 "여러 개의 독립된 데이터 표가 한 클립보드에 섞인 경우는 범위 밖으로 남는다 — `findDataTable`은 여전히 표 하나만 고르고…"는 TBL-012를 근거로 든 오독이었다. TBL-012의 실제 정의는 "단일 표 10,000 논리 셀 보장"(성능 계약, `docs/product/blocknote-free-feature-inventory.md`)이지 "클립보드당 표 1개" 제품 계약이 아니다 — 다중 표 지원은 TBL-012와 충돌하지 않는다. `findDataTable`은 `findDataTables`(배열 반환)로 교체됐다: 형제 최상위 데이터 표를 문서 순서(기존 pre-order DFS 순회 순서를 그대로 쓴다, 별도 정렬 없음)대로 모두 찾아 각각 독립된 `{type:"table"}` 블록으로 시퀀스에 담는다. 중첩 표는 기존 innermost wins(표를 품은 바깥 표 자신은 후보에서 제외)를 그대로 유지한다 — model이 중첩 표를 표현하지 못하는 것은 여전하므로, 표를 품은 바깥 `<table>`은 여전히 래퍼로 취급돼 그 안 텍스트가 인라인 콘텐츠로 흡수된다(바뀐 것은 "형제" 최상위 표 사이의 관계뿐이다). 표 안(커서가 이미 표 셀)에서 붙여넣는 경로(`pasteClipboardContent`의 `isInTable` 분기)는 이 DELTA의 변경 범위 밖이다 — 별도 DELTA가 이 경로를 다중 표 시퀀스에 대해 `CLIPBOARD_CONTENT_INVALID`로 명시 거절(뮤테이션 없음)하도록 바로 고쳤으므로, "첫 표만 붙고 나머지는 조용히 버려진다"는 이 문단 작성 시점의 임시 상태였을 뿐 최종 동작이 아니다(트랙-6 결함 탐지에서 spec-코드 불일치로 발견, 정정). 표 밖 붙여넣기(이 DELTA가 다루는 경로)만 표 여러 개를 모두 문서에 남긴다.

구현 반영(Issue #72): `blockSequenceFromNodes`가 `p`/표 외에 `h1`~`h6`도 블록 경계로 인식한다. h1~h3는 model `HeadingBlock.level`(1~3)을 그대로 만족하므로 새 `ClipboardContentBlock` variant `{type:"heading"; level:1|2|3; content:InlineContent}`로 분리한다 — `import-html.ts`의 `parseBlock`이 이미 하는 h1~h3→heading 변환(태그명 마지막 문자에서 level 추출)과 같은 방식이다. h4~h6는 model에 대응하는 Block variant가 아예 없어 heading으로 만들 수 없으므로 문단으로 다운그레이드한다 — 다만 여전히 블록 경계로는 인식해 인접 h4~h6나 문단과 병합하지 않는다(다운그레이드는 "블록 분리 포기"가 아니라 "표현 타입만 문단으로 낮춤"이다). 이 인식은 sanitize 단계에 먼저 걸린다: 문서 import 공유 목록(`htmlAllowedTagNames`)은 `h1`~`h3`뿐이라 h4~h6는 `hast-util-sanitize`가 unwrap해 태그 자체가 파서에 도달하지 못한다. 그래서 clipboard 전용 `clipboardAllowedTagNames`(`sanitize-schema.ts`)를 `[...htmlAllowedTagNames, "h4", "h5", "h6"]`로 신설해 `clipboardSanitizeSchema.tagNames`에만 적용한다 — 문서 import 경로(`htmlSanitizeSchema`/`importHtml`)는 이 확장과 무관하게 그대로다: `importHtml("<h4>x</h4>")`은 여전히 h4가 unwrap돼 문단으로 흡수되고 `SAFE_BLOCK_DOWNGRADED`(`element:"h4"`) 경고가 그대로 난다. heading/h4~h6 텍스트도 셀 텍스트와 같은 정규화(`collapseHtmlWhitespace`+`normalizeCellContent`)를 거친다 — `flush()`가 쓰던 정규화 로직을 `normalizedInlineContent` 헬퍼로 뽑아 문단 분기와 heading 분기가 공유한다. `core`가 새 `heading` variant를 실제로 소비(표 밖 삽입, 표 안 병합)하는 것은 범위 밖으로 남는다 — 뒤따르는 DELTA가 다룬다.

구현 반영(표 직속 비섹션 자식 보존, Issue #70): 위 무손실 시퀀스 계약은 표 서브트리 **바깥**(형제·조상)의 텍스트만 다뤘다. 표 서브트리 **안쪽**, 즉 `<table>` 직속 자식 중 `thead`/`tbody`/`tfoot`/`tr`/`colgroup`이 아닌 나머지에도 실질 텍스트가 남을 수 있다 — 대표 사례는 `caption`이다. `caption`은 `htmlAllowedTagNames`에 없어 sanitize가 unwrap하고(`sanitize-schema.ts`), 그 텍스트는 `<table>`의 직속 텍스트 노드가 된다. 이 빈틈은 위와 같은 정책(표 밖 문단)으로 흡수한다: `table-layout.ts`의 `tableNonSectionChildren`이 이 노드들을 뽑아내고(텍스트 노드를 포함한 `table.children` 원본을 순회한다 — 요소만 통과하는 `childElements`를 쓰면 unwrap된 caption 텍스트가 걸러져 사라진다), `hasSubstantialText`(같은 파일로 이관, clipboard·import 공유)가 실질 텍스트 여부를 판정한다. clipboard 경로(`clipboard-table-parser.ts`의 `walk()`)는 기존 `pending`을 `flush()`로 먼저 내보낸 뒤 caption을 담아 한 번 더 `flush()`한다 — 그래서 표 앞 기존 문단(intro)과 순서가 뒤바뀌지 않고, caption 텍스트도 `collapseHtmlWhitespace`/`normalizeCellContent`(셀 텍스트와 같은 정규화)를 그대로 거친다. import 경로(`import-html.ts`의 `documentFromRoot`)는 같은 헬퍼로 뽑은 노드에 실질 텍스트가 있으면 `parseTable` 결과 앞에 문단 블록을 삽입한다 — caption→문단 다운그레이드에 `SAFE_BLOCK_DOWNGRADED`류 warning은 붙지 않는다(범위 밖, `import-warnings.ts` 미변경).

### 4.2 HTML 경로 — 테이블 변환기 재사용

`io/html/import-html.ts`의 `parseTable`이 쓰는 hast 트리 순회 로직 중 id 배정과 무관한 부분(`layoutRows`, `inferredColumnCount`, `columnElements`, `tableRows`, `layoutColumnSpan`, `childElements`, `tableNonSectionChildren`, `hasSubstantialText`)을 `packages/io/src/html/table-layout.ts`(신규)로 뽑아 두 소비자가 공유한다:

- `import-html.ts`의 `parseTable`: 레이아웃 + id 배정 → `TableBlock`.
- `clipboard-table-parser.ts`의 새 함수: 레이아웃(id 없이) → `TabularData`.

셀 콘텐츠(인라인 마크 포함)는 기존 `inlineContentFromNodes`(`inline-content.ts`)를 그대로 재사용한다.

sanitizer는 `htmlSanitizeSchema`를 그대로 쓰되 `htmlAllowedAttributes.td`/`.th`에 `style`을 추가한다. 이 allowlist 확장은 공유 스키마라 `importHtml` 경로도 `style` 속성이 sanitize에서 살아남게 되지만, `import-html.ts`의 `parseTable`은 여전히 `style`을 읽지 않으므로(`data-be-*`만 읽음) `importHtml`의 관찰 가능한 동작은 바뀌지 않는다. 이 "관찰 가능한 동작 비영향"은 `style` 속성에 한정된 서술이다 — caption 보존(위 §4.1 '구현 반영(표 직속 비섹션 자식 보존, Issue #70)')은 `documentFromRoot`가 `tableNonSectionChildren`/`hasSubstantialText`를 같은 파일에서 가져다 써 `importHtml`의 `Document.blocks` 산출을 실제로 바꾼다(표 앞 문단 블록 추가).

**style 파싱(클립보드 경로 전용, 신규 코드)**: `style` 속성 문자열에서 `color`/`background-color`/`text-align` 세 선언만 최소 정규식으로 추출한다. `color`/`background-color` 값은 `isCanonicalCellColor`(model)를 통과할 때만(대문자 `#RRGGBB`로 정규화 후) 반영하고, `text-align` 값은 `isCanonicalCellAlign`을 통과할 때만 반영한다. 나머지 CSS 선언, 통과하지 못한 값은 조용히 버린다(파싱 실패로 전체를 거절하지 않는다). `data-be-text-color`/`data-be-background-color`/`data-be-align`(자기 복사)가 있으면 그걸 `style`보다 우선한다. **`data-be-*` 값도 `style` 값과 똑같이 `isCanonicalCellColor`/`isCanonicalCellAlign`을 통과해야 하고, 통과하지 못하면 조용히 버린다** — 통과시키면 클립보드 HTML이 임의 값을 문서로 밀어넣어 `parseDocument`가 커밋 시점에 거절하고 모델과 에디터가 영구 desync된다. 클립보드 sanitize 스키마는 `importHtml` 스키마와 분리해서 쓴다(`clipboardSanitizeSchema`) — 공유하면 `style`/`role` 허용이 `importHtml`의 속성 제거 경고까지 없애버린다.

구현 반영(과대 colspan 거절, Issue #35): `tabularDataFromTable`이 `columnCount`(colgroup과 실제 셀 중 넓은 쪽)를 산출하기 전에, 표가 이미 실제로 보여준 열 수보다 넓게 뻗는 셀이 있으면 패딩으로 감추지 않고 `CLIPBOARD_TABLE_INVALID`로 거절한다. "표가 이미 보여준 열 수"는 colgroup 선언 열 수(`cols.length`)와 실제 셀들의 distinct 시작 `columnIndex` 개수 중 큰 쪽이다 — 이 개수는 각 셀의 `colspan` 크기를 반영하지 않고 오직 몇 개의 서로 다른 위치에서 셀이 시작하는지만 센다. 그래야 과대 `colspan` 셀 자기 자신이 이 상한을 부풀리지 못한다. 어떤 셀의 `layoutColumnSpan(colSpan)`이든 이 상한을 초과하면 거절한다. §4.1의 "비율 임계값은 근거 없는 매직 넘버가 되고 결정적으로 테스트할 수 없다" 원칙에 따라 비율이 아니라 "표 자신이 실제로 보여준 구조" 하나로 판정하는 이진 조건이다: `colspan="500"`인 단일 셀만 있는 표(colgroup 없음)는 상한이 1(그 셀 자신의 시작 위치 하나뿐)이라 거절되지만, 같은 표에서 `colspan` 없이(=1) 셀 하나뿐인 평범한 표는 상한도 1, span도 1이라 통과한다 — colgroup·다른 셀·다른 행이 전혀 없어도 이 둘이 구분된다. colgroup보다 실제 셀이 많아 넓히는 기존 동작(`clipboard-table-normalization.test.ts`의 "colgroup보다 실제 셀이 많으면 넓은 쪽을 열 수로 잡는다")은 그 넓히는 셀들의 `colspan`이 각각 1이라 이 조건에 걸리지 않아 그대로 유지된다. `MAX_TABLE_COLUMNS`/`MAX_TABLE_LOGICAL_CELLS` 상한 검사(값 변경 없음)는 이 거절 다음에 그대로 실행된다. `rowSpan`의 동일 구조 위험과 `import-html.ts` 쪽 동일 정책 적용은 이번 범위 밖이다(각각 별도 이슈).

구현 반영(rowSpan 대칭성 조사 결론, Issue #114): 위 문단이 "범위 밖"으로 남긴 `rowSpan`의 동일 구조 위험을 조사한 결과, **재현되지 않는다** — colspan과 대칭이 아니다. colspan이 선제 검사(`oversizedColumnSpanCell`)를 필요로 했던 이유는 `columnCount = Math.max(cols.length, inferredColumnCount(layouts))`이고 `inferredColumnCount`(`table-layout.ts:161-173`)가 "표가 이미 보여준 열 수" 자체를 각 셀의 `columnSpan` 값으로 계산하는 자기 강화 구조라, 과대 `colspan` 셀 자신이 자기를 걸러낼 상한까지 함께 부풀렸기 때문이다. `rowSpan`에는 이 자기 강화 구조가 없다 — 행 수(`rowCount = layouts.length`)는 실제 `<tr>` 개수로 고정이고(`layoutRows`, `table-layout.ts:85-118`), 어떤 셀의 `rowSpan` 값도 이 `rowCount` 자체를 바꾸지 않는다. 그래서 model의 `validateGridCoverage`(`table-grid-validation.ts:82-84`)가 파생되지 않은 고정 `rowCount`를 기준으로 `rowEnd(=row+rowSpan) > rowCount`를 이미 `SPAN_OUT_OF_BOUNDS`로 거절하며, `rowSpan` 쪽에는 colspan과 같은 선제 검사가 필요 없다. 이 결론은 `layoutRowSpan`(`table-layout.ts:25-45` 주석)과 `clipboard-table-normalization.test.ts`의 "이슈 114: rowSpan 열/행 수 부풀림 대칭성 조사" characterization 테스트 두 개(과대 rowSpan이 `inferredColumnCount`를 부풀리지 않음, 과대 rowSpan이 `SPAN_OUT_OF_BOUNDS`로 거절됨)로 고정한다. `import-html.ts` 쪽 동일 정책 적용은 여전히 범위 밖이다(114 완료 기준에 없음, colspan 쪽은 Issue #115가 별도로 다룬다).

구현 반영(import-html.ts colspan 정책 통일, Issue #115): `import-html.ts`의 `parseTable`도 같은 자기 강화 구조를 갖는지 재현 확인했다 — colgroup 없는 `<table><tbody><tr><td colspan="500">X</td></tr></tbody></table>`을 `importHtml`에 넣으면(수정 전) `columnCount = inferredColumnCount(layouts)`(`cols.length === 0`이라 colgroup을 안 씀)가 그 셀 자신의 `columnSpan`을 반영해 500으로 부풀고, 단일 행·단일 셀이 그 500열을 전부 덮어 model의 `validateGridCoverage`도 통과하므로 `ok: true`로 500열 표가 그대로 만들어졌다(재현 확정 — `html-round-trip.test.ts`에 이 입력으로 `HTML_DOCUMENT_INVALID`를 기대하는 테스트를 먼저 추가해 구현 전 RED로 고정). 그래서 `clipboard-table-parser.ts`의 `oversizedColumnSpanCell`과 같은 판별식(자기 자신을 제외한 다른 모든 셀의 reach 최댓값과 자기 위치 중 큰 쪽을 상한으로 삼아, 이를 넘는 `colspan`을 패딩으로 감추지 않고 거절)을 `parseTable`에 이식했다 — 삽입 위치는 `columnCount` 계산 이전(`cols.length > MAX_TABLE_COLUMNS` 체크 다음, `columnCount`/`MAX_TABLE_COLUMNS`/`MAX_TABLE_LOGICAL_CELLS` 체크보다 앞)이고, 원본이 `Result` 실패를 반환하는 대신 기존 `parseTable` 관례대로 `HtmlDocumentInvalidError`를 throw하게 어댑트한 점만 다르다. 단, `import-html.ts`는 `columnCount = cols.length > 0 ? cols.length : inferredColumnCount(layouts)`로 colgroup을 우선하는 정책이라(clipboard 쪽의 `Math.max(cols.length, inferredColumnCount(layouts))`와 다름) 이 선제 검사는 `cols.length === 0`일 때만 돈다 — colgroup이 있으면 애초에 `inferredColumnCount`를 쓰지 않아 `columnCount`가 `cols.length`로 고정되고 셀 span에서 파생되지 않으므로 자기 강화 구조 자체가 없고, 과대 `colspan`은 이미 model의 `validateGridCoverage`(`SPAN_OUT_OF_BOUNDS`)가 막는다(기존 `html-round-trip.test.ts`의 "가져온 표 그리드가 잘못되면 HTML_DOCUMENT_INVALID로 감싼다" 테스트가 이미 이 경로를 고정하며, 이번 변경 뒤에도 그대로 통과한다). 그래서 colgroup이 있는 경로는 이번 변경이 코드 경로 자체를 타지 않으며(새 선제 검사가 조건문 밖에 있음), colgroup 있는 표에서 뒷받침 셀 없이 `colspan`이 `colgroup` 열 수와 정확히 일치하는 경계 케이스가 여전히 정상 표로 가져와짐도 새 테스트로 고정한다.

(단계-3 결함 탐지 수정) 위 판별식을 원본 그대로 이식하면 rowSpan으로 여러 행을 정당하게 덮는 셀이 "자기 혼자 최대 reach를 주장"으로 오인돼 정상 colspan까지 거절되는 회귀가 있었다(예: `<td>A</td><td colspan="3" rowspan="2">B</td>` 다음 행에 `<td>C</td>` — 완전한 격자인데도 `B`의 `colspan=3`이 거절됨. `dev` 기준 diff 대조로 이 diff가 만든 회귀임을 확인). `maxReachCount`를 "그 reach를 달성한 셀 개수"가 아니라 "그 reach를 달성한 셀들의 `layoutRowSpan(rowSpan)` 합"으로 가중해 고쳤다 — rowSpan으로 여러 행에 걸친 셀은 물리적으로 그만큼 반복 등장하는 것과 같은 근거를 표에 남기기 때문이다. `rowSpan=1`(기본값)인 셀은 가중치 1이라 "홑 셀 colspan=500만 있으면 거절"하는 기존 보장은 그대로 유지된다. 이 가중치가 위조된 rowSpan(실제 `<tr>` 수를 넘는 값)에 악용되지 않는 이유는 model의 `validateGridCoverage`가 이 선제 검사와 무관하게 `rowEnd(=row+rowSpan) > rowCount`를 항상 `SPAN_OUT_OF_BOUNDS`로 거절하기 때문이다(Issue #114와 같은 안전망) — `html-round-trip.test.ts`에 두 테스트로 고정했다: rowSpan으로 뒷받침되는 정당한 colspan은 통과, 실제 행 수를 넘는 위조 rowSpan은 이 선제 검사를 통과해도 그리드 검증이 거절.

구현 반영(clipboard-table-parser.ts colspan 정책 대칭 수정, Issue #116): `import-html.ts`가 이식 당시 이미 걷어낸(위 단계-3 결함 탐지 수정) 것과 같은 결함이 정작 원본인 `clipboard-table-parser.ts`의 `oversizedColumnSpanCell`에는 그대로 남아 있는지 재현 확인했다 — **재현 확정**. 재현 입력 `<table><tbody><tr><td>A</td><td colspan="3" rowspan="2">B</td></tr><tr><td>C</td></tr></tbody></table>`(수정 전)을 `parseClipboardTable`에 넣으면, `maxReachCount`가 "그 reach를 달성한 셀 개수"만 셌기 때문에 rowSpan=2로 두 행에 걸쳐 반복 등장하는 `B`의 근거를 세지 못하고 `B`를 reach 4의 "유일한 소유자"로 오판해 `othersMaxReach`를 `secondMaxReach`(=`A`의 reach 1)로 좁혔다 — 그 결과 상한이 2(`B.columnIndex + 1`)로 잡혀 `colspan=3`이 `CLIPBOARD_TABLE_INVALID`("Table cell colspan exceeds the table's own column bound 2")로 오탐 거절됐다(완전한 격자인데도 거절 — `clipboard-table-normalization.test.ts`의 "[Issue #116] rowSpan=2로 두 행에 걸친 셀의 colspan=3은..." 테스트로 이 RED를 먼저 고정했다).

구현 반영(단계-3 결함 탐지 수정, BLOCKER, Issue #116): 첫 시도는 위 단계-3 결함 탐지 수정(`import-html.ts`)을 그대로 따라 `maxReachCount`를 셀 개수 대신 각 셀의 `layoutRowSpan(rowSpan)` **값 자체**로 가중했다(`cellRowWeight` 헬퍼). 읽기 전용 subagent 결함 탐지가 이 방향 자체를 반박했다 — 가중치가 다른 셀의 독립된 증거가 아니라 검사 대상 셀 **자기 자신**의 `rowSpan`에서만 나오므로, `rowSpan >= 2`인 셀은 뒷받침하는 다른 셀이 전혀 없어도(rowSpan이 덮는 행이 완전히 빈 `<tr></tr>`) 자기 `rowSpan` 값만으로 `maxReachCount`를 1 넘겨 "혼자 주장"이 아닌 것으로 위장했다. 재현: `<table><tbody><tr><td rowspan="2" colspan="3">X</td></tr><tr></tr></tbody></table>`(표에 셀이 `X` 하나뿐이고 두 번째 행은 완전히 비어 있음)을 그 시도로 넣으면 `ok: true`로 통과했다(`columnCount: 3`) — `othersMaxReach`가 진짜 다른 근거인 `secondMaxReach` 대신 자기 자신의 reach인 `globalMaxReach`로 쓰이고, `reach(=columnIndex+colspan) >= colspan`은 항상 참이라 이 셀에 대해서는 검사가 자기 자신과 비교하는 항등식이 되어 어떤 `colspan`(500 등)도 통과했다 — Issue #35가 막으려던 "뒷받침 없는 홑 셀 과대 colspan"을 `rowSpan` 하나만 붙이면 그대로 우회하는 셈이라 원래 결함보다 더 나쁜 새 결함이었다.

수정: 근거를 "`rowSpan` 값 자체"에서 "`rowSpan`이 덮는 다른 행에 자기 자신이 아닌 다른 셀이 실제로 있는가"로 바꿨다. `layouts`는 행 단위 배열이라 셀은 자신이 시작한 행에만 나타나므로(rowSpan으로 덮는 다른 행에는 같은 셀이 다시 나타나지 않는다), `hasIndependentRowBacking`이 후보 셀이 덮는 다른 행 중 원소가 하나라도 있는 행을 찾으면(표 범위를 벗어나는 행은 제외) 가중치를 2로(맥락상 1보다 크기만 하면 되므로 `layoutRowSpan` 크기를 그대로 쓸 필요가 없다 — `maxReachCount`는 `=== 1` 여부만 쓰인다), 없으면 `rowSpan = 1`과 똑같이 1로 준다. `rowSpan` 값의 크기(위조 여부 포함)는 이 선제 검사가 검증하지 않는다 — model의 `validateGridCoverage`(`SPAN_OUT_OF_BOUNDS`)가 별도 안전망이다(Issue #114 조사 결론과 같은 근거). 이를 `<table><tbody><tr><td>A</td><td colspan="3" rowspan="10">B</td></tr><tr><td>C</td></tr></tbody></table>`(rowSpan=10이 실제 행 수 2를 훨씬 넘지만 두 번째 행에 `C`라는 진짜 다른 셀이 있어 선제 검사는 통과)로 확인했다 — 선제 검사는 통과하지만 `rowEnd(=0+10) > rowCount(2)`를 `SPAN_OUT_OF_BOUNDS`로 최종 거절한다. `import-html.ts`와의 차이는 이번에도 하나뿐이다: `import-html.ts` 쪽은 이 선제 검사 전체가 `cols.length === 0`(colgroup 없음) 조건 안에서만 돌지만, clipboard 쪽은 `columnSpanBoundFor`가 `Math.max(cols.length, othersMaxReach, cell.columnIndex + 1)`로 `cols.length`를 상한 후보 중 하나로 항상 포함하는 clipboard 고유 정책(Issue #35 원안)이라 이 검사 자체가 colgroup 유무와 무관하게 항상 실행된다. `clipboard-table-normalization.test.ts`의 "이슈 116" describe 블록 세 테스트(정당한 rowSpan 뒷받침 colspan 통과, 뒷받침 없는 rowSpan은 여전히 거절, 뒷받침 있어도 위조된 rowSpan 크기는 그리드 검증이 거절)로 재현→BLOCKER 발견→수정→위조 방어를 모두 고정했고, 기존 "colgroup 없음: 단일 셀의 colspan이... 초과하면 거절한다"(홑 셀, rowSpan=1) 케이스는 회귀 없이 그대로 거절된다(rowSpan<=1이면 가중치가 항상 1이라 원래 판정과 동일).

**남은 위험(범위 밖).** `import-html.ts`(Issue #115)의 `cellRowWeight`는 이번에 걷어낸 것과 같은 "자기 자신의 rowSpan 값 자체로 가중"하는 방식을 그대로 쓰고 있어 같은 BLOCKER(뒷받침 없는 rowSpan>=2 홑 셀이 과대 colspan 검사를 우회)를 안고 있을 가능성이 높다 — 이번 diff는 `import-html.ts`를 건드리지 않으므로 별도 이슈로 분리한다.

이 이진 조건은 뒷받침하는 다른 셀·행이 전혀 없는 표(colgroup 없음 + 셀 1개)에서는 "과대"와 "그냥 2 이상"을 구분하지 못한다 — `colspan="2"`도 `colspan="500"`과 똑같이 상한 1을 넘겨 거절된다. 이 표가 실제로 몇 열인지 판정할 근거(colgroup, 다른 행의 셀)가 아예 없는 상태에서는 비율 임계값 없이 크기만으로 "과대"를 가려낼 방법이 없기 때문이다(§4.1 원칙). 이슈 #35 자체가 실제 클립보드 fixture 없이 보고됐으므로(재현 사례 없음), 정상 표를 오탐 거절하는 위험을 낮추는 쪽(경계에서 보수적으로 거절)을 택했다 — 다중 셀·다중 행으로 뒷받침되는 정상 범위 colspan은 이 경계에 걸리지 않는다.

### 4.3 TSV 경로

탭으로 셀, 개행으로 행을 나눈다. rowSpan/colSpan/색상/정렬 없음(전부 기본값: `rowSpan: 1, columnSpan: 1`, 색상/정렬 없음). 가장 긴 행 기준으로 `columnCount`를 정하고, 짧은 행은 빈 문자열 셀로 패딩해 항상 직사각형을 만든다(뒤 단계 검증기가 항상 통과하도록).

구현 반영(2차 리뷰 후 계약 변경): 짧은 행 패딩을 하지 않는다. TSV 경로는 **모든 줄의 탭 개수가 같고 열이 2개 이상일 때만** 표로 인정하고, 들쭉날쭉하면 `NOT_TABULAR`로 기본 붙여넣기에 넘긴다. 끝 개행 하나가 만든 빈 줄만 버리고 중간 빈 줄은 버리지 않는다(버리면 행 인덱스가 조용히 밀린다 — 중간 빈 줄은 탭 개수 검사가 걸러낸다).

이유: `text.includes("\t")` 하나로 판정하면 탭 들여쓰기 코드나 탭이 섞인 로그가 전부 표가 되고, §7.2 계약대로 확장이 이벤트를 소비하므로 사용자가 기본 붙여넣기를 되찾을 방법이 없다. 스프레드시트 클립보드는 항상 직사각형이므로 이 조건이 실제 대상 입력을 잃지 않는다. HTML 표의 짧은 행 패딩은 그대로 유지한다 — 진짜 표 마크업은 정상적으로 들쭉날쭉하다.

구현 반영(TSV whitespace 정책, Issue #34): TSV 경로의 셀 whitespace는 HTML 경로와 의도적으로 비대칭 유지한다 — **보존**하고 collapse/trim하지 않는다. `parseTsv`(`clipboard-table-parser.ts:485-528`)는 셀 텍스트에 `sanitizeCellText`(`cell-text.ts:16-17`, `:517`에서 호출)만 적용한다 — model의 `sanitizeInlineText`(`string-invariants.ts:39-46`) 위임이라 LF를 제외한 C0 제어문자·DEL·짝없는 surrogate만 제거하고 공백은 건드리지 않는다. 반면 HTML 경로(§4.2)는 `collapseHtmlWhitespace`(`cell-text.ts:22-32`)로 연속 공백 run을 하나로 접고 `normalizeCellContent`(`cell-text.ts:82-111`)로 셀 앞뒤 공백까지 trim한다. 비대칭 근거는 둘이다. (1) TSV 전용 경로(HTML 표현이 없는 클립보드)로 들어오는 실제 입력은 탭 들여쓰기 코드나 로그처럼 공백 자체가 원문의 의미인 텍스트일 가능성이 높다 — 바로 위 단락의 "탭 들여쓰기 코드/로그" 판정 근거와 같은 소스다. collapse/trim은 이런 원문을 조용히 훼손한다. (2) 실사용 스프레드시트(Excel, Google Sheets 등) 붙여넣기는 대부분 `text/html`을 함께 담아 오므로 §4.1 우선순위 규칙에 따라 HTML 경로로 처리되고 이미 collapse/trim을 거친다 — TSV whitespace 정책은 그 경로에 영향을 주지 않는다. 이 (2)는 브라우저 실측이 아니라 클립보드 payload 구성에 대한 합리적 추정이다. 이 비대칭 동작은 `clipboard-table-normalization.test.ts:77-84`가 이미 회귀 테스트로 고정한다.

## 5. 검증기 — model의 그리드 커버리지 재사용

`packages/model/src/table-grid-validation.ts`를 리팩터한다:

```ts
export const validateGridCoverage = (
  rowCount: number,
  columnCount: number,
  cells: Array<{ row: number; column: number; rowSpan: number; columnSpan: number }>,
): Result<undefined, TableGridValidationError> => { ... };

export const validateTableGrid = (table: TableBlock) =>
  validateGridCoverage(
    table.rows.length,
    table.columns.length,
    /* columnId -> index 매핑 후 generic cells로 변환 */
  );
```

동작(겹침/구멍/범위 밖 판정)은 100% 동일하게 유지 — 순수 리팩터, 기존 `table-grid.property.test.ts`/`table-grid-validation` 테스트가 회귀를 잡는다. `validateGridCoverage`와 그 타입을 model의 공개 API(`index.ts`)로 새로 export한다.

io의 `TabularData` 구조 검증(직사각형, 0셀 아님, 좌표 범위 안)은 `validateGridCoverage`를 그대로 호출한다 — `io -> model`은 이미 있는 엣지라 새 의존성이 없다. 이 검증은 `parseClipboardTable`이 결과를 반환하기 직전에 내부적으로 수행한다(TSV 경로는 구성상 항상 통과, HTML 경로는 원본이 `rowSpan`/`colSpan` 교차로 깨진 표일 때를 여기서 걸러 `CLIPBOARD_TABLE_INVALID`로 거절한다).

## 6. `TableGrid.pasteInto` (core)

`packages/core/src/table-grid.ts`에 추가하는 새 격자 연산 하나:

```ts
export const pasteInto = (
  table: TableBlock,
  anchor: { row: number; column: number },
  data: TabularData,
  createId: IdFactory,
): Result<TableBlock, TableGridError> => { ... };
```

### 6.1 절차

1. 목표 크기 계산: `requiredRows = anchor.row + data.rows.length`, `requiredColumns = anchor.column + data.columnCount`.
2. 확장은 **기존 `insertRow`/`insertColumn`을 표 끝(현재 길이 인덱스)에 반복 호출**해서 수행한다 — 끝에 추가하는 삽입은 기존 span과 절대 교차하지 않으므로 새 격자 계산 코드가 필요 없다(G-TBL-001 — 격자 연산의 단일 권위는 계속 `TableGrid`).
3. 확장 후 논리 셀 수(`requiredRows * requiredColumns`)가 10,000을 넘으면 **뮤테이션 전에** `CELL_LIMIT_EXCEEDED`로 거절한다(G-EDT-001 — 실행 가능성을 먼저 판정).
4. 덮어쓰기 사각형(`[anchor.row, anchor.row+data.rows.length) x [anchor.column, anchor.column+data.columnCount)`) 안에 걸리는 기존 셀을 제거하고, `data`의 각 셀을 새 `cellId`로 그 위치에 꽂은 **후보 표**를 만든다.
5. 후보 표에 `validateTableGrid`(→ `validateGridCoverage`)를 돌린다. 실패하면(기존 병합 셀이 사각형 경계를 걸쳐서 삐져나옴) 후보를 버리고 `PASTE_MERGE_CONFLICT`로 전체 거절 — **겹침 탐지 로직을 새로 안 쓰고 기존 불변식 검사기를 그대로 재사용**한다. 성공하면 후보 표를 반환한다.

### 6.2 표 밖 붙여넣기(새 표 생성)

같은 함수를 재사용한다: `buildInitialTable({rows: data.rows.length, columns: data.columnCount}, createId)`로 빈 표를 만들고 `pasteInto(emptyTable, {row: 0, column: 0}, data, createId)`를 호출한다. 새 표 생성과 표 안 덮어쓰기가 격자 코드 레벨에서 완전히 하나의 경로다.

## 7. `pasteTabularData` 명령과 붙여넣기 가로채기 (core)

### 7.1 명령

`table-commands.ts`에 추가:

```ts
export const pasteTabularData = (
  editor: Editor,
  data: TabularData,
  createId: IdFactory,
): Result<{ blockId: string }, TableCommandError> => { ... };
```

호출자(명령·붙여넣기 확장 양쪽)는 항상 이 3개 인자만 넘긴다 — 표 안/밖 분기와 삽입 위치는 명령이 `editor.state.selection`에서 직접 유도한다(다른 표 명령들과 동일한 원칙, 호출자가 미리 판정해 넘기지 않는다).

- 캐럿/선택이 표 안(`isInTable`)이면: `getTableCellSelection()`/`selectedRect`로 anchor 셀의 논리 (row, column)을 구해 `applyTableGridOperation(editor, tableBlockId, (t) => pasteInto(t, anchor, data, createId), { selectCellId: ... })`를 호출한다. `selectCellId`는 붙여넣은 영역의 좌상단 셀로 캐럿을 이동시킨다(기존 옵션 재사용, 새 플러밍 없음).
- 표 밖이면: 현재 selection이 속한 최상위 블록을 `$from`에서 찾아(기존 `insertParagraphAfter`/`getCaretBlockContext`가 쓰는 최상위 블록 탐색과 같은 방식) 그 블록 뒤에 새로 만든 표를 끼운다(`insertTable`과 같은 삽입 경로).
- 성공한 생성/확장/값 입력/서식 적용은 `applyTableGridOperation`의 기존 단일 `replaceWith` + `closeHistory` 트랜잭션 경로를 그대로 타므로 원자성(G-EDT-001)이 자동으로 유지된다.
- `EditorController.commands.pasteTabularData(data)`로 공개 API에도 노출한다 — 유닛 테스트가 실제 `ClipboardEvent` 없이 직접 호출해 검증할 수 있게 한다(다른 표 명령과 같은 테스트 패턴).

구현 반영(표 밖 분기 계약 개정, Issue #29): 표 밖 붙여넣기는 다른 에디터와 같이 **선택을 대체한다**. selection이 비어있지 않으면 먼저 지우고, 삭제 후 캐럿이 놓인 최상위 블록 뒤에 표를 끼운 다음, 캐럿을 붙여넣은 표의 좌상단 셀 안으로 옮긴다(표 안 분기의 `selectCellId`와 대칭). 선택 삭제·표 삽입·캐럿 이동은 한 트랜잭션이라 undo 1회로 함께 복원된다. 블록 전체 내용을 선택해 지운 경우 남는 빈 문단은 그대로 둔다(블록 자체를 표로 교체하지 않는다 — 최소 변경, undo 예측 가능). 거절 경로(셀 한도 등)는 아무것도 dispatch하지 않으므로 선택도 보존된다(G-EDT-001).

구현 반영(선택 대체의 경계 규칙, 3차 리뷰): 선택 대체(삭제)는 **선택이 표를 부분적으로 걸치지 않을 때만** 적용된다. 끝점(`$from`/`$to`)이 표 안에 있는 범위를 지우면 ProseMirror ReplaceStep이 스키마 필러로 `cellId` 없는 셀을 만들어 모델과 에디터가 영구 desync되므로, 그런 혼합 선택은 지우지 않고 붙여넣기만 한다 — 표 안 분기(head가 표 안)도 선택된 표 밖 텍스트를 지우지 않으므로 "혼합 선택은 삭제하지 않는다"로 양 분기가 일관된다. 표를 통째로 포함하는 선택은 노드 단위로 깔끔하게 지워지므로 정상 대체된다. 삽입 위치는 blockId 조회가 아니라 "삭제 후 캐럿(to)이 안쪽에 닿은 마지막 최상위 블록 바로 뒤, 없으면 문서 맨 앞"의 단일 스캔으로 계산한다 — 전체 선택(Ctrl+A) 삭제가 남기는 blockId 없는 필러 문단 뒤에도, 첫 블록 앞 GapCursor 위치(그 블록 **앞**)에도 정상 삽입된다.

구현 반영(오류 보고, Issue #30): `validateTabularData` 실패는 `NOT_RECTANGULAR`가 아니라 `{ code: "TABULAR_DATA_INVALID"; message }`로 보고한다 — io가 만든 원인 message(빈 표/인라인 텍스트/서식 값/열 정렬/격자 커버리지)를 그대로 전달한다. `NOT_RECTANGULAR`는 병합 명령(비직사각형 선택) 전용이다.

### 7.2 붙여넣기 가로채기

`packages/core/src/table-paste-extension.ts`(신규), `table-keyboard-extension.ts`와 동일한 패턴(`Extension.create` + `.configure({ createId })` + `addProseMirrorPlugins`):

```ts
addProseMirrorPlugins() {
  return [new Plugin({
    props: {
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData("text/html");
        const text = event.clipboardData?.getData("text/plain");
        const parsed = parseClipboardTable({ html, text });
        if (!parsed.ok) return false; // NOT_TABULAR나 CLIPBOARD_TABLE_INVALID -> Tiptap 기본 처리
        const result = pasteTabularData(this.editor, parsed.value, this.options.createId);
        return result.ok; // true = 이벤트 소비
      },
    },
  })];
}
```

`editor-controller.ts`의 extension 목록에 `TableKeyboardNavigationExtension`과 같은 자리에 등록한다.

구현 반영(설계 시 pseudocode 수정): 기본 붙여넣기로 폴백하는 경우는 `NOT_TABULAR` 하나뿐이다. 클립보드가 표로 인식된 뒤에는 파서 거절(`CLIPBOARD_TABLE_INVALID`)이든 명령 거절(`PASTE_MERGE_CONFLICT`, `CELL_LIMIT_EXCEEDED`, `PASTE_TARGET_NOT_FOUND` 등)이든 항상 `true`를 반환해 이벤트만 소비한다. 폴백하면 TSV는 ProseMirror가 `preserveWhitespace`로 파싱해 탭이 그대로 문서에 들어가고(모델↔에디터 영구 desync), HTML은 표 구조가 소실된 텍스트로 뭉개진다 — 둘 다 "전체 거부" 계약 위반이다. 거절된 명령은 아무것도 dispatch하지 않으므로 문서·selection·stored mark는 그대로 보존된다(G-EDT-001).

구현 반영(혼합 클립보드 폴백, Issue #37): §4.1의 판정이 `NOT_TABULAR`를 반환하는 경우에는 표 앞뒤에 문단 등 실질 콘텐츠가 섞인 클립보드도 포함된다. 표 세 노드가 노드 레벨 `parseHTML`을 정의하지 않으므로(§4.1 구현 반영, `table-extension.ts`) Tiptap 기본 붙여넣기는 표 구조를 표 노드로 만들지 않고 셀 텍스트만 평문으로 흘려보낸다 — 문단은 보존되고 표 구조(행/열 경계)만 뭉개진다. 슬라이스 11 이전 기본 붙여넣기와 동일한 폴백 동작이다.

구현 반영(무손실 붙여넣기로 대체, Issue #71): 위 폴백 경로(문단은 보존하고 표 구조는 뭉개짐)는 표를 포함한 혼합 클립보드에는 더 이상 적용되지 않는다 — §4.1 구현 반영대로 `parseClipboardTable`이 표를 찾으면 항상 `ClipboardContent` 시퀀스로 성공을 반환하므로 `handlePaste`는 이벤트를 소비하고 `pasteClipboardContent`로 문단과 표를 모두 삽입한다. `NOT_TABULAR` 폴백은 표 후보 자체가 없는 클립보드(탭 없는 일반 텍스트 등)에만 남는다 — 그 경우 Tiptap 기본 붙여넣기는 원래도 무손실이었다(표 세 노드가 관련되지 않는다).

## 8. 오류 계약 확장

- `TableGridError`(core, `table-grid.ts`)에 `CELL_LIMIT_EXCEEDED`, `PASTE_MERGE_CONFLICT` 추가.
- `EditorError`(core, `errors.ts`)에 같은 두 코드 추가.
- `io/errors.ts`에 `ClipboardParseError` 추가: `{code: "NOT_TABULAR"} | {code: "CLIPBOARD_TABLE_INVALID"; message: string}`. io의 공개 `index.ts`에서 `parseClipboardTable`/`TabularData`/`ClipboardParseError`를 export한다.

## 9. Issue #12 처리

같은 세션에서:

1. 원인 분류 — (a) io 파서가 실제로 느린가, (b) vitest 기본 5000ms 타임아웃이 병렬 부하에서 비현실적인가. `pnpm exec vitest run packages/io/test/markdown-round-trip-limits.test.ts`(단독, 통과)와 `pnpm test`(병렬, 실패) 비교, 필요하면 실제 wall-clock을 측정해 원인을 근거로 남긴다.
2. (a)면 import/export 경로 최적화, (b)면 해당 테스트의 타임아웃 또는 fixture 크기를 근거와 함께 조정 — 근거 수치를 Issue #12에 댓글로 기록.
3. spec 13 기준선(10,000셀 로드·선택·붙여넣기·undo) 최초 측정치는 §10의 benchmark 결과로 기록 — Issue #12 완료 조건 3번과 중복 측정하지 않는다.
4. `pnpm test`/`pnpm verify`가 전체 병렬 실행에서 안정적으로 통과함을 확인.

## 10. 성능 benchmark (spec 13)

Playwright e2e에 10,000셀 fixture(예: 100×100)를 대상으로 로드, 셀 범위 선택, 붙여넣기, undo 각각의 wall-clock을 측정해 기록하는 시나리오를 추가한다(`performance.now()` 기준, 콘솔 로그 또는 test annotation). 결과를 `docs/product/performance-baseline.md`(신규)에 최초 측정치·측정 환경(로컬 vs CI, 브라우저 엔진)과 함께 적는다. CI 성능 게이트(중앙값 20% 회귀 판정)는 슬라이스 13 범위이며 이번엔 기록만 한다.

## 11. 기존 두 테스트 교체

계약이 실제로 바뀌므로(핸드오프 지시대로) 삭제가 아니라 교체하고 이유를 커밋 메시지에 남긴다.

- `packages/core/test/editor-controller-table.test.ts:696` "외부 HTML 표 붙여넣기는 표 노드로 파싱되지 않고 문서를 깨뜨리지 않는다" → "외부 HTML 표 붙여넣기가 표 노드로 파싱되고 undo 1회로 복원된다"로 교체.
- `e2e/table-handle.spec.ts:225` "외부 HTML 표를 붙여넣어도 에디터가 깨지지 않는다"(표 미생성을 단언) → 실제 표 생성 + 셀 값 확인 + undo로 교체.

## 12. 테스트 전략

- `packages/core/test/table-grid.property.test.ts`: `pasteInto` 불변식(확장 후에도 3개 불변식 유지, 200회 fast-check) 추가.
- `packages/model/test/`: `validateGridCoverage` 리팩터 회귀(기존 `validateTableGrid` 케이스 전부 그대로 통과) + 신규 제네릭 호출 유닛.
- `packages/io/test/`: `parseClipboardTable` 유닛 — html-table 우선순위, TSV 탭 감지(탭 없는 텍스트는 `NOT_TABULAR`), style 색상/정렬 파싱(유효/무효 값), sanitizer가 `script`/이벤트 핸들러를 계속 차단하는지, `importHtml` 기존 테스트 전부 회귀 없음.
- `packages/core/test/`: `pasteTabularData` 유닛 — 표 안 덮어쓰기, 표 밖 새 표 생성, 자동 확장, 병합 충돌 거절(문서 불변 확인), 10,000셀 초과 거절(문서 불변 확인), undo 1회 복원.
- `e2e/`: Excel/Google Sheets 대표 fixture(고정 HTML 문자열, 실제 두 도구의 클립보드 HTML 구조를 모사) 붙여넣기, TSV 붙여넣기, 10,000셀 benchmark 시나리오, §11 교체된 두 시나리오.

## 13. 완료 기준

Issue #3 슬라이스 11 완료 기준(그대로 인용, 원본은 Issue #3):

- Excel/Google Sheets 대표 fixture가 계약대로 붙는다(표 밖 신규 생성, 표 안 좌상단 기준 덮어쓰기, 부족한 행/열 자동 확장, 병합 충돌·10,000셀 초과 전체 거부).
- 성공한 생성·확장·값 입력·서식 적용이 하나의 트랜잭션이다.
- 검증: `pnpm --filter @cp949/geul-model test`, `pnpm --filter @cp949/geul-io test`, `pnpm --filter @cp949/geul-core test`, `pnpm test`, `pnpm test:e2e`, `pnpm check:boundaries`, `pnpm verify`.

추가(이 설계 문서가 확장한 것):

- Issue #12가 닫히고 `pnpm test`/`pnpm verify`가 병렬 실행에서 안정적으로 통과한다.
- `docs/product/performance-baseline.md`에 spec 13 최초 측정치가 기록된다.
- `ADR-0002`가 `core -> io` 엣지를 반영한다.

## 14. 범위 밖

- `model-to-tiptap.ts:89-94`의 문서 로드 차단 해제 — 슬라이스 12.
- CI 성능 회귀 게이트(20% 임계, 자동 실패) — 슬라이스 13.
- XLSX/CSV 파일 붙여넣기 — R2 이후(spec 14.1).
- 클립보드 HTML의 `mso-*` 전용 속성이나 `background-color` 외 테두리/폰트 등 나머지 서식 — 이번 슬라이스는 색상 2종 + 정렬만 다룬다.
