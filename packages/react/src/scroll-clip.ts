// overflow가 자식을 잘라내는 값. visible만 자르지 않는다.
const CLIPPING_OVERFLOW = new Set(["auto", "scroll", "hidden", "clip"]);

/**
 * `element`와 그 조상 중 내용을 잘라내는(overflow auto/scroll/hidden/clip)
 * 컨테이너의 뷰포트 기준 rect를 안쪽부터 바깥쪽 순서로 돌려준다.
 *
 * 오버레이(캡션, 미디어 툴바, 리사이즈 핸들)는 스크롤 컨테이너 바깥에 그려진다.
 * 그래서 컨테이너가 안쪽에서 스크롤돼 블록이 보이는 영역 밖으로 밀려나도 그
 * 오버레이는 잘리지 않고 컨테이너 밖에 떠 있다. 이 rect로 "블록이 아직
 * 보이는가"를 판정해 그 경우 오버레이를 그리지 않는다.
 *
 * `body`/`html`은 건너뛴다. 창 스크롤은 page-relative 좌표(`readPageRect`)가
 * 이미 따라가고, 창 뷰포트 밖 오버레이는 어차피 보이지 않는다.
 */
export const readScrollClipBoxes = (element: HTMLElement): DOMRect[] => {
  const ownerDocument = element.ownerDocument;
  const view = ownerDocument.defaultView;
  if (view === null) return [];
  const boxes: DOMRect[] = [];
  for (
    let node: HTMLElement | null = element;
    node !== null &&
    node !== ownerDocument.body &&
    node !== ownerDocument.documentElement;
    node = node.parentElement
  ) {
    const { overflowX, overflowY } = view.getComputedStyle(node);
    if (CLIPPING_OVERFLOW.has(overflowX) || CLIPPING_OVERFLOW.has(overflowY)) {
      boxes.push(node.getBoundingClientRect());
    }
  }
  return boxes;
};

/**
 * `rect`(뷰포트 기준)가 `boxes` 전부 안에서 보이는지 본다. `boxes`가
 * 비어 있으면(자르는 조상이 없으면) 항상 true다.
 *
 * 세로는 완전히 안쪽이어야 한다. 오버레이가 컨테이너 위·아래 경계에 걸쳐
 * 잘린 채 바깥으로 삐져나와 떠 있는 것을 막는다. 가로는 겹치기만 하면
 * 보인다. 핸들·툴바가 블록 모서리에 반쯤 걸치는 것이 정상 배치이기
 * 때문이다.
 */
export const isRectInClipBoxes = (
  rect: DOMRect,
  boxes: readonly DOMRect[],
): boolean =>
  boxes.every(
    (box) =>
      rect.top >= box.top &&
      rect.bottom <= box.bottom &&
      rect.right > box.left &&
      rect.left < box.right,
  );

/**
 * 오버레이 `node`의 실제 박스가 `boxes` 안이면 `visibility`를 비우고, 아니면
 * `hidden`으로 만든다. `exempt`면 항상 보인다(편집 중 입력이 사라지면
 * 포커스와 draft를 잃는다).
 *
 * `display: none`이나 unmount가 아니라 `visibility`다. 숨겨도 레이아웃
 * 박스와 실측 높이가 남는다(media caption이 이 높이를 문서 flow에
 * 되먹인다). React가 관리하는 `style`에 `visibility`가 없는 노드에만 쓴다.
 * 있으면 다음 렌더가 덮어쓴다.
 */
export const syncClipVisibility = (
  node: HTMLElement,
  boxes: readonly DOMRect[],
  exempt: boolean,
): void => {
  node.style.visibility =
    exempt || isRectInClipBoxes(node.getBoundingClientRect(), boxes)
      ? ""
      : "hidden";
};
