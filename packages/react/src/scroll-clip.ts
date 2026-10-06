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
 * `body`/`html`은 건너뛴다. 창 뷰포트는 이 함수의 대상이 아니다.
 * - absolute 오버레이: 창 스크롤은 page-relative 좌표(`readPageRect`)가 이미
 *   따라가고, 창 뷰포트 밖이면 어차피 보이지 않는다.
 * - fixed 오버레이: 뷰포트 가장자리로 clamp돼 뷰포트 밖에서도 남는다. 이쪽은
 *   `readViewportBox`를 앵커 점 판정에 더한다(Issue #277).
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
 * `element`가 속한 창의 레이아웃 뷰포트 `(0, 0, innerWidth, innerHeight)`를
 * 돌려준다. owner window가 없으면 `null`이다. 그러면 호출부는 판정에서
 * 제외한다.
 *
 * fixed 오버레이용이다(Issue #277). 창 스크롤로 앵커가 뷰포트 밖에 나가면
 * clamp된 오버레이가 가장자리에 남는다. 이 box를 `readScrollClipBoxes` 결과에
 * 더해 앵커 점 판정(`isPointInClipBoxes`)에만 쓴다. 박스 판정(`isRectInClipBoxes`)에는
 * 쓰지 않는다. clamp된 박스는 늘 뷰포트 안이라 무의미하다.
 *
 * `visualViewport`(키보드·핀치 줌)가 아니라 레이아웃 뷰포트다.
 */
export const readViewportBox = (element: HTMLElement): DOMRect | null => {
  const view = element.ownerDocument.defaultView;
  if (view === null) return null;
  return new DOMRect(0, 0, view.innerWidth, view.innerHeight);
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

/** 세로 구간. `top`·`bottom` 모두 같은 좌표계다. */
export type VerticalSpan = { top: number; bottom: number };

/**
 * 세로 구간 `span`(뷰포트 기준)을 `boxes` 전부와 교집합한다.
 *
 * - `boxes`가 비어 있으면 `span`을 그대로 돌려준다.
 * - 교집합이 비거나 경계에 닿기만 하면 `null`이다.
 *
 * 영역보다 긴 오버레이(표 열 리사이즈 strip)용이다. 그대로 두면
 * `isRectInClipBoxes`의 세로 완전 포함 규칙에 걸려 늘 숨는다. 잘라 그리면
 * 보이는 부분만 남는다.
 */
export const clipSpanToBoxes = (
  span: VerticalSpan,
  boxes: readonly DOMRect[],
): VerticalSpan | null => {
  if (boxes.length === 0) return span;
  let { top, bottom } = span;
  for (const box of boxes) {
    top = Math.max(top, box.top);
    bottom = Math.min(bottom, box.bottom);
  }
  return bottom > top ? { top, bottom } : null;
};

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

/**
 * 뷰포트 기준 점 `(x, y)`가 `boxes` 전부 안(경계 포함)인지 본다. `boxes`가
 * 비어 있으면 항상 true다.
 */
export const isPointInClipBoxes = (
  x: number,
  y: number,
  boxes: readonly DOMRect[],
): boolean =>
  boxes.every(
    (box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom,
  );

/**
 * 앵커 점이 clip 영역 안일 때만 `node`를 보인다. 선택에 붙는 popover
 * (서식·링크·표 선택·블록 선택 툴바)용이다. `syncClipVisibility`와 달리
 * 박스가 아니라 앵커를 본다 — popover는 앵커 위나 아래에 붙어 앵커가 영역
 * 안이어도 박스가 경계 밖으로 조금 삐져나올 수 있고, 그때 숨기면 첫 줄을
 * 선택할 때 popover가 사라진다. 앵커가 영역 밖으로 스크롤돼 나가면
 * popover는 뷰포트 가장자리로 clamp된 채 영역 밖에 남으므로 숨긴다.
 */
export const syncAnchorClipVisibility = (
  node: HTMLElement,
  anchorX: number,
  anchorY: number,
  boxes: readonly DOMRect[],
): void => {
  node.style.visibility = isPointInClipBoxes(anchorX, anchorY, boxes)
    ? ""
    : "hidden";
};
