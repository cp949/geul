// 표 컬럼 폭을 인라인 style 문자열로 직렬화하는 규칙 하나를 export-html.ts
// (문서 생성)와 import-warnings.ts(raw warning 정확도 판정)가 공유한다 —
// text-block-props-style.ts·media-preview-width-style.ts와 같은 이유(2026-09-19,
// showcase 미리보기에 표 컬럼 폭이 반영되지 않는 버그 수정). 라이브 에디터
// (core table-extension.ts의 syncColgroup/renderHTML)와 정확히 같은 포맷을
// 써야 편집기와 exportHtml() 출력이 같은 폭으로 렌더링된다. TableColumn.width는
// model 필수 필드(항상 정의된 number)라 media previewWidth(선택 필드)와 달리
// undefined 분기가 없다.
export const tableColumnWidthStyle = (width: number): string =>
  `width: ${width}px`;
