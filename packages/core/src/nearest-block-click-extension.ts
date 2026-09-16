import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  Selection,
  TextSelection,
} from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

// 그릴링 2026-09-17 발견 — 빈 에디터(paragraph 한 줄)의 min-height
// 여백(_editor.scss `.geul-editor [contenteditable="true"] { min-height:
// 12rem }`)을 클릭해도 커서가 안 생긴다. 이 저장소는 클릭→커서 배치를
// 직접 구현하지 않고 브라우저 native contenteditable 클릭에 전적으로
// 위임한다(fact 08) — `view.posAtCoords`가 hit-test 가능한 실제 렌더
// 콘텐츠 위에서만 성립하므로, 그 밖(min-height 여백, 마지막 블록 아래,
// 첫 블록 위)은 텍스트 노드가 없어 native든 posAtCoords든 실패한다.
// Notion처럼 빈 공간 클릭을 가장 가까운 블록으로 스냅한다 — 빈 에디터는
// 이 일반 규칙의 블록 1개짜리 자명한 부분집합이지 별도 특수 케이스가
// 아니다(그릴링 결정).
//
// posAtCoords가 성공하면(=실제 콘텐츠 위 클릭) 이 확장은 개입하지 않고
// false를 반환해 기존 native 클릭 동작에 맡긴다 — 정밀 클릭 회귀 없음.
// 실패했을 때만 가장 가까운 블록을 찾아 커서를 놓는다.

type BlockCandidate = { pos: number; node: ProseMirrorNode; rect: DOMRect };

// "블록"의 자격은 노드 타입명이 아니라 자기 blockId를 직접 소유하는가다.
// 텍스트 블록(paragraph/heading/quote/목록/codeBlock)은 blockContainer가
// blockId를 소유하고 감싸지만, media 4종(image/file/video/audio)·table·
// divider는 blockContainer로 감싸이지 않고 "group: block 직접 멤버,
// blockId 자체 소유" 패턴이라(media-block-extension.ts 주석, D19) 이
// 셋의 타입명은 각각 "image" 등·"table"·"divider"이지 "blockContainer"가
// 아니다. type.name으로 걸렀던 첫 구현은 이 세 종류를 후보에서 완전히
// 빠뜨렸다(그릴링 구현 중 실측 — media 전용 문서에서 hit이 항상 null).
const collectBlockCandidates = (view: EditorView): BlockCandidate[] => {
  const candidates: BlockCandidate[] = [];
  view.state.doc.descendants((node, pos) => {
    const blockId = node.attrs.blockId as unknown;
    if (typeof blockId !== "string" || blockId.length === 0) return true;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return true;
    const rect = dom.getBoundingClientRect();
    // 접힌 toggle 자식(display:none 조상, toggle-collapse-visibility-
    // extension.ts) 등 숨은 블록은 rect가 0x0으로 남는다 — 후보에서 제외.
    if (rect.width === 0 && rect.height === 0) return true;
    candidates.push({ pos, node, rect });
    return true; // 중첩 blockGroup 자식도 후보로 계속 순회한다
  });
  return candidates;
};

type NearestHit = {
  pos: number;
  node: ProseMirrorNode;
  bias: "start" | "end";
};

// clientY와 가장 가까운 블록을 찾는다. blockContainer의 중첩(자기 콘텐츠
// 뒤에 옵션으로 자식 blockGroup을 품는 content model, block-container-
// extension.ts)은 조상 rect가 자손 rect를 항상 감싸므로, clientY가 여러
// 후보의 [top, bottom) 범위에 동시에 들면 나중에 순회한(=더 깊이 중첩된)
// 쪽으로 덮어쓴다 — findOwnRectBlockId(block-side-menu-geometry.ts)의
// "마지막 매치가 가장 구체적인 블록"과 동일 근거다(media·table·divider는
// 서로 안에 중첩되지 않아 이 경합이 없다). 포함하는 후보가 없으면(첫 블록
// 위·마지막 블록 아래·모든 블록이 접혀 후보가 하나뿐인 경우 등) top/bottom
// 까지의 거리가 가장 작은 후보로 폴백한다.
const findNearestBlock = (
  view: EditorView,
  clientY: number,
): NearestHit | null => {
  let containing: BlockCandidate | null = null;
  let nearest: BlockCandidate | null = null;
  let nearestBias: "start" | "end" = "start";
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of collectBlockCandidates(view)) {
    const { rect } = candidate;
    if (clientY >= rect.top && clientY < rect.bottom) {
      containing = candidate;
      continue;
    }
    const isAbove = clientY < rect.top;
    const distance = isAbove ? rect.top - clientY : clientY - rect.bottom;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = candidate;
      nearestBias = isAbove ? "start" : "end";
    }
  }

  if (containing !== null) {
    const rect = containing.rect;
    const bias = clientY < rect.top + rect.height / 2 ? "start" : "end";
    return { pos: containing.pos, node: containing.node, bias };
  }
  return nearest === null
    ? null
    : { pos: nearest.pos, node: nearest.node, bias: nearestBias };
};

// Selection.near/TextSelection.near는 textOnly 기본값이 false라, 찾는
// 방향에서 처음 만나는 atom을 그대로 NodeSelection으로 돌려주고 멈춘다
// (prosemirror-state findSelectionIn) — 인접 블록이 또 다른 atom이거나,
// 폴백 시작점 자체가 atom 바로 옆이면(아래 atom 분기) 그 atom 자신을 다시
// 돌려줘 무한히 제자리인 결과가 나온다. textOnly=true로 호출하는
// Selection.findFrom만 atom을 전부 건너뛰고 진짜 텍스트만 찾는다(찾는
// 방향에 텍스트가 전혀 없으면 null — near처럼 반대 방향으로 자동
// 재시도하지 않는다, 그 재시도는 아래에서 직접 한다).
const nearestTextOnlySelection = (
  doc: ProseMirrorNode,
  pos: number,
  dir: 1 | -1,
): Selection | null => Selection.findFrom(doc.resolve(pos), dir, true);

// hit이 미디어·divider처럼 그 자체로 atom이면 안에 텍스트 커서를 둘 수
// 없다 — 클릭 의도(입력 시작)에 맞춰 bias 방향의 인접 텍스트부터 찾고,
// 없으면 반대 방향을 본다. 인접 텍스트가 전혀 없으면(enabledBlockTypes가
// paragraph를 포함한 모든 텍스트 타입을 deny해 스키마에 텍스트 노드가
// 아예 없는 극단 설정 — 일반 설정은 TrailingBlockExtension이 항상 최소
// 1개의 문단을 보장한다) NodeSelection으로 최소한의 선택을 만든다.
// table은 atom이 아니다 — blockContainer처럼 실제 자식 콘텐츠(행·셀)가
// 있어 TextSelection.near가 그 안의 첫/마지막 셀 텍스트로 알아서
// 내려간다.
const resolveSelectionForHit = (
  doc: ProseMirrorNode,
  hit: NearestHit,
): Selection => {
  if (!hit.node.isAtom) {
    const boundary =
      hit.bias === "start" ? hit.pos + 1 : hit.pos + hit.node.nodeSize - 1;
    const dir = hit.bias === "start" ? 1 : -1;
    return TextSelection.near(doc.resolve(boundary), dir);
  }
  const boundary = hit.bias === "start" ? hit.pos : hit.pos + hit.node.nodeSize;
  const primaryDir: 1 | -1 = hit.bias === "start" ? -1 : 1;
  const oppositeDir: 1 | -1 = primaryDir === 1 ? -1 : 1;
  return (
    nearestTextOnlySelection(doc, boundary, primaryDir) ??
    nearestTextOnlySelection(doc, boundary, oppositeDir) ??
    NodeSelection.create(doc, hit.pos)
  );
};

export const NearestBlockClickExtension = Extension.create({
  name: "nearestBlockClick",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (!view.editable || event.button !== 0) return false;
              if (
                view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                }) !== null
              ) {
                return false;
              }

              const hit = findNearestBlock(view, event.clientY);
              if (hit === null) return false;

              const selection = resolveSelectionForHit(view.state.doc, hit);
              event.preventDefault();
              view.focus();
              view.dispatch(view.state.tr.setSelection(selection));
              return true;
            },
          },
        },
      }),
    ];
  },
});
