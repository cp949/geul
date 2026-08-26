// 블록 id·셀 id는 에디터가 만드는 임의 문자열이라 attribute selector에 값을
// 직접 보간하면(`[data-be-block-id="${id}"]`) 따옴표·백슬래시가 섞였을 때
// SyntaxError가 난다. CSS.escape로 이스케이프할 수도 있지만 jsdom 테스트
// 환경에 없어 회피 자체가 안 된다 — tag(+속성 존재)로만 후보를 좁히고
// getAttribute 비교로 값을 맞춘다. table-handles.tsx·table-selection-toolbar.tsx·
// block-side-menu.tsx 세 파일에 바이트 단위로 반복되던 탐색 로직이다.
export const findElementByAttribute = (
  root: HTMLElement,
  tagName: string | null,
  attr: string,
  value: string,
): HTMLElement | null =>
  Array.from(
    root.querySelectorAll<HTMLElement>(`${tagName ?? ""}[${attr}]`),
  ).find((candidate) => candidate.getAttribute(attr) === value) ?? null;
