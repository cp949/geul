import type {
  DragState,
  InsertionGuide,
  StoredBlock,
} from "./block-side-menu-types.js";

// block-side-menu.tsx(진입점)의 드래그 제스처가 쓰는 순수 함수 모음이다.
// HTMLElement/tree 인자만 받고 React·에디터 마운트에는 의존하지 않는다 —
// table-handle-geometry.ts와 같은 층위 분리(01-계획.md).

// 거터 버튼(.geul-block-gutter__button)의 높이(px) — 1.5rem,
// _block-side-menu.scss와 동기화. use-clamped-menu-position.ts의
// ASSUMED_ROOT_FONT_SIZE_PX(16)와 같은 전제(루트 폰트 16px)를 쓴다.
const GUTTER_BUTTON_HEIGHT_PX = 24;

// block-side-menu.tsx가 거터 top 앵커(useClampedMenuPosition의
// leftOfAnchor, dy=0)에 더하는 오프셋. 문단·인용·목록 항목처럼 첫 줄
// line-height가 버튼과 비슷한 블록은 rect.top 그대로도 얼추 중앙처럼
// 보이지만, heading(h1~h6)은 font-size가 커 첫 줄 line-height가 버튼보다
// 훨씬 커 버튼이 줄 위쪽으로 쏠린다(사용자 스크린샷, h1: line-height
// 51.2px vs 버튼 24px). blockContainer는 항상 inline 콘텐츠를 첫
// 자식(h1~h6/p/blockquote/목록 항목 div)에 직접 담으므로
// (block-container-extension.ts) 그 자식이 heading일 때만 line-height
// 차이의 절반만큼 내린다 — 사용자 보고가 h1 한정이라 다른 블록 종류는
// 이 DELTA 범위 밖으로 남기고 오프셋 0(기존 top-align 그대로)을 유지한다.
// line-height를 유한수로 못 읽으면(atom 블록 등, computed style 부재)도
// 마찬가지로 0 — 차이가 음수(heading 폰트가 버튼보다 작은 h5·h6 조합)면
// 버튼이 줄 위로 넘치므로 0에서 클램프한다.
export const computeGutterTopOffset = (blockElement: HTMLElement): number => {
  const heading = blockElement.firstElementChild;
  if (heading === null || !/^H[1-6]$/.test(heading.tagName)) return 0;
  const lineHeightPx = parseFloat(getComputedStyle(heading).lineHeight);
  if (!Number.isFinite(lineHeightPx)) return 0;
  return Math.max(0, (lineHeightPx - GUTTER_BUTTON_HEIGHT_PX) / 2);
};

// usePointerDragGesture의 onMove 콜백에서 쓰는 순수 함수다. 원래는 그
// 4-listener 이펙트 안의 지역 함수였지만, 훅으로 옮기며 콜백이
// useCallback으로 안정화돼야 해서 element를 인자로 받는 모듈 스코프
// 함수로 뽑았다 — 로직 자체는 그대로다.
export const computeDragGuide = (
  element: HTMLElement,
  clientY: number,
  current: DragState,
): InsertionGuide | null => {
  const blockElements = Array.from(
    element.querySelectorAll<HTMLElement>("[data-geul-block-id]"),
  );
  const ids = blockElements.map((candidate) =>
    candidate.getAttribute("data-geul-block-id"),
  );
  const targetIndex = blockElements.findIndex((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  const sourceIndex = ids.indexOf(current.sourceBlockId);
  const effectiveTargetIndex = targetIndex === -1 ? ids.length : targetIndex;
  const isNoop =
    effectiveTargetIndex === sourceIndex ||
    effectiveTargetIndex === sourceIndex + 1;
  if (isNoop) return null;

  const guideElement =
    targetIndex === -1
      ? blockElements[blockElements.length - 1]
      : blockElements[targetIndex];
  if (guideElement === undefined) return null;

  const rect = guideElement.getBoundingClientRect();
  return {
    beforeBlockId: targetIndex === -1 ? null : (ids[targetIndex] ?? null),
    left: rect.left,
    top: targetIndex === -1 ? rect.bottom : rect.top,
    width: rect.width,
  };
};

// core generic-block-commands.ts의 findBlockInTree와 같은 모양의 로컬
// tree-walk다. core 내부 함수라 export되지 않아 import할 수 없다(Issue #38
// 슬라이스7 DELTA-03). own-rect hover 대상이 시작 블록의 실제 인접 형제인지,
// 같은 부모인지(조건1a — flat DOM 인덱스가 아니라 이 트리로 판정해야 한다)를
// 가리는 데 쓴다.
export const findBlockInTreeForDrag = (
  blocks: readonly StoredBlock[],
  blockId: string,
): { siblings: readonly StoredBlock[]; index: number } | null => {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index !== -1) return { siblings: blocks, index };
  for (const block of blocks) {
    if (!("children" in block) || block.children === undefined) continue;
    const found = findBlockInTreeForDrag(block.children, blockId);
    if (found !== null) return found;
  }
  return null;
};

// 이미 있는 blockSelection의 범위(from~to, 같은 부모 형제 구간) 안에 blockId가
// 포함되는지 실제 트리 구조로 판정한다. handlePointerDownOnHandle이 드래그
// 모드를 "range-move"로 시작할지 결정하는 데만 쓴다.
export const isBlockIdWithinBlockSelection = (
  blocks: readonly StoredBlock[],
  selection: { fromBlockId: string; toBlockId: string },
  blockId: string,
): boolean => {
  const from = findBlockInTreeForDrag(blocks, selection.fromBlockId);
  const to = findBlockInTreeForDrag(blocks, selection.toBlockId);
  const target = findBlockInTreeForDrag(blocks, blockId);
  if (from === null || to === null || target === null) return false;
  if (from.siblings !== to.siblings || from.siblings !== target.siblings) {
    return false;
  }
  const startIndex = Math.min(from.index, to.index);
  const endIndex = Math.max(from.index, to.index);
  return target.index >= startIndex && target.index <= endIndex;
};

// 포인터 클라이언트 좌표가 어느 블록의 own rect(top~bottom 전체) 안에 있는지
// 찾는다. computeDragGuide의 형제 사이 midpoint 판정과는 목적이 다르다 —
// 여기서는 "포인터가 지금 어느 블록 위에 있는가"만 본다(01-계획.md "재드래그로
// 범위 이동 판정 신호" 결정).
export const findOwnRectBlockId = (
  element: HTMLElement,
  clientY: number,
): string | null => {
  const blockElements = Array.from(
    element.querySelectorAll<HTMLElement>("[data-geul-block-id]"),
  );
  // 자식이 있는 블록은 자기 blockGroup을 DOM 안에 그대로 품는다
  // (blockContainer의 content hole, block-container-extension.ts) — 조상의
  // own rect가 모든 자손의 rect를 감싼다. querySelectorAll은 document
  // order(전위 순회)라 조상이 항상 자손보다 배열 앞에 오므로, 첫 매치를
  // 취하면 자손 영역을 가리켜도 항상 최상위 조상으로 뭉개진다. 형제는
  // 서로 겹치지 않게 세로로 쌓이므로 한 clientY가 속하는 매치들은 조상→
  // 자손 한 사슬뿐이다 — 마지막 매치가 그 사슬에서 가장 깊이 중첩된(가장
  // 구체적인) 블록이다(즉시 리뷰 발견, Issue #38 슬라이스7 DELTA-03).
  let hitId: string | null = null;
  for (const candidate of blockElements) {
    const rect = candidate.getBoundingClientRect();
    if (clientY >= rect.top && clientY < rect.bottom) {
      hitId = candidate.getAttribute("data-geul-block-id");
    }
  }
  return hitId;
};

// range-move 모드의 삽입 가이드다. computeDragGuide와 같은 형제 사이 midpoint
// 탐색을 재사용하되(그 함수 자체는 건드리지 않는다 — 단일 블록 재정렬에 계속
// 그대로 쓰인다), no-op 판정을 단일 sourceIndex가 아니라 선택 범위
// [startIndex, endIndex] 전체로 넓힌다 — 범위 안 임의 지점으로의 이동은 전부
// no-op이다(정확한 경계값은 core가 최종 가드, DELTA-03 범위 밖).
export const computeRangeMoveDragGuide = (
  element: HTMLElement,
  clientY: number,
  fromBlockId: string,
  toBlockId: string,
): InsertionGuide | null => {
  const blockElements = Array.from(
    element.querySelectorAll<HTMLElement>("[data-geul-block-id]"),
  );
  const ids = blockElements.map((candidate) =>
    candidate.getAttribute("data-geul-block-id"),
  );
  const targetIndex = blockElements.findIndex((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  const startIndex = ids.indexOf(fromBlockId);
  const endIndex = ids.indexOf(toBlockId);
  const effectiveTargetIndex = targetIndex === -1 ? ids.length : targetIndex;
  const isNoop =
    startIndex !== -1 &&
    endIndex !== -1 &&
    effectiveTargetIndex >= startIndex &&
    effectiveTargetIndex <= endIndex + 1;
  if (isNoop) return null;

  const guideElement =
    targetIndex === -1
      ? blockElements[blockElements.length - 1]
      : blockElements[targetIndex];
  if (guideElement === undefined) return null;

  const rect = guideElement.getBoundingClientRect();
  return {
    beforeBlockId: targetIndex === -1 ? null : (ids[targetIndex] ?? null),
    left: rect.left,
    top: targetIndex === -1 ? rect.bottom : rect.top,
    width: rect.width,
  };
};
