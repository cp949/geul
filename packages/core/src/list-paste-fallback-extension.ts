import {
  type IdFactory,
  MAX_NESTING_DEPTH,
  parseDocument,
} from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { DOMParser as PmDomParser, type Schema } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { isInTable } from "@tiptap/pm/tables";

import { modelDepthAtPasteTarget } from "./indent-commands.js";
import type { TiptapJsonNode } from "./model-to-tiptap.js";

// PM 기본 붙여넣기 폴백 경로(c)에서 외부 ul/ol의 목록 구조(마커 타입·중첩
// 계층·명시적 startNumber)를 보존한다(DELTA-03, Issue #143 (c)).
// TablePasteExtension과 같은 handlePaste 가로채기 패턴을 쓴다 — 표가
// 섞이면 TablePasteExtension이 먼저 처리하고(false를 반환하지 않으면
// 이 핸들러까지 오지 않는다), 표 없는 순수 목록만 이 핸들러가 잡는다.
//
// 애초 계획은 ProductionBulletListItemExtension/
// ProductionNumberedListItemExtension에 parseHTML을 열어 PM의 표준
// DOM→스키마 파싱(findWrapping 기반 자동 래핑)에 맡기는 것이었다. 실측
// 결과 이 경로는 중첩 목록에서 항상 실패한다: bulletListItem의 content가
// "inline*"뿐이라 중첩된 li를 만나면 ParseContext.findPlace가 조상
// 컨텍스트를 거슬러 올라가며 wrap 경로를 찾는데, blockGroup→blockContainer
// 2단 래핑(올바른 중첩)보다 최상위 doc에 blockContainer 1단만 씌우는
// 더 짧은 경로를 항상 우선한다(prosemirror-model ContentMatch.findWrapping이
// route.length가 더 짧은 후보를 덮어쓴다) — 그 결과 <ul><li>a<ul><li>b</li>
// </ul></li></ul>이 nested 상실 없이 a/b/c가 전부 최상위 형제로 평탄화된다.
// blockContainer/blockGroup은 parseHTML을 선언하지 않는 것이 확립된
// 설계(block-container-extension.ts D13)라 그쪽에서 우회할 수도 없다.
// 그래서 이 파일이 clipboard HTML을 직접 파싱해 blockContainer/blockGroup
// JSON을 조립하고 editor.commands.insertContent로 삽입한다 — 인라인
// 마크(bold/link 등) 파싱은 다시 구현하지 않고, li의 텍스트 조각을
// synthetic <p>에 담아 표준 PmDomParser로 위임해 뽑아낸다(paragraph도
// bulletListItem도 content가 동일하게 "inline*"라 Fragment를 그대로
// 재사용할 수 있다). production-editor-assembly.ts의 Production*ListItem
// 확장은 이 변경으로 parseHTML을 열 필요가 없다 — 그 파일의 "parseHTML은
// 열지 않는다" 주석은 이 사실(그리고 그 이유)을 반영해 정정한다.

export type ListPasteFallbackOptions = { createId: IdFactory };

const isListElement = (el: Element): boolean =>
  el.tagName === "UL" || el.tagName === "OL";

const containsListElement = (root: Element): boolean =>
  root.querySelector("ul, ol") !== null;

// li의 직접 자식을 content(첫 중첩 ul/ol 이전)와 nestedList(그 지점의
// ul/ol 자신, 없으면 null)로 나눈다. DELTA-03(Issue #143 (c))은 표 없는
// 순수 목록 폴백만 다룬다 — li 안 표·blockquote 등 다른 block-level
// 중첩은 범위 밖이다(표가 섞인 클립보드는 TablePasteExtension이 먼저
// 가로채 이 경로에 오지 않는다).
const splitListItemChildren = (
  li: Element,
): { contentNodes: ChildNode[]; nestedList: Element | null } => {
  const contentNodes: ChildNode[] = [];
  for (const child of Array.from(li.childNodes)) {
    if (child.nodeType === 1 && isListElement(child as Element)) {
      return { contentNodes, nestedList: child as Element };
    }
    contentNodes.push(child);
  }
  return { contentNodes, nestedList: null };
};

// content 노드들을 synthetic <p>에 옮겨 담아 표준 파서로 인라인 마크가
// 보존된 Fragment JSON을 얻는다 — bold/italic/link 등 마크 파싱을 다시
// 구현하지 않는다(paragraph의 parseHTML이 이미 이 일을 한다, content
// 계약이 bulletListItem/numberedListItem과 동일한 "inline*"라 그대로
// 재사용 가능함을 스파이크로 실측 확인했다).
const inlineJsonFromNodes = (
  schema: Schema,
  nodes: ChildNode[],
): TiptapJsonNode[] => {
  const wrapper = document.createElement("p");
  for (const node of nodes) wrapper.appendChild(node.cloneNode(true));
  const parsed = PmDomParser.fromSchema(schema).parse(wrapper);
  const paragraphNode = parsed.content.firstChild?.content.firstChild;
  const json = paragraphNode?.content.toJSON() as TiptapJsonNode[] | null;
  return json ?? [];
};

// numberedListItem.startNumber가 model schema 범위(min(0).max(999_999_999))
// 안인지 판정한다. table-paste-commands.ts의 isStartNumberInRange와 같은
// generic-block-commands.ts(setBlockType) 프로브 패턴이지만 이 파일은 io를
// 거치지 않는 독립 경로라 코드는 공유하지 않는다(explicitStartNumber
// 자신의 배경과 동일한 이유).
const isStartNumberInRange = (startNumber: number): boolean =>
  parseDocument({
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "list-paste-fallback-start-number-probe",
        type: "numberedListItem",
        content: [],
        startNumber,
      },
    ],
  }).ok;

// ol[start]는 그 ol의 첫 li에만 붙인다(형제 scope 재시작은 범위 밖) —
// io의 list-block-builder.ts:parseExplicitStartNumber와 같은 정책을
// DOM 입력에 다시 구현한다(이 파일은 io를 거치지 않는 독립 경로라 코드는
// 공유하지 않는다, DELTA-03 배경). model 범위를 벗어난 값(트랙-6 결함
// 탐지 BLOCKER — 검증 없이 insertContent되면 readEditorDocument가
// throw new TypeError로 모델↔에디터를 영구 desync시킨다)은 explicit
// start가 아예 없었던 것처럼 null로 접는다 — 비정수 start와 같은 처리.
const explicitStartNumber = (list: Element): number | null => {
  if (list.tagName !== "OL") return null;
  const raw = list.getAttribute("start");
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return null;
  return isStartNumberInRange(parsed) ? parsed : null;
};

// ul/ol 하나를 blockContainer(li) JSON 배열로 바꾼다. 각 li가
// blockContainer(bulletListItem|numberedListItem, blockGroup?(중첩
// 목록의 같은 조립 재귀 호출))를 만든다 — model-to-tiptap.ts의
// blockToTiptapJson과 같은 shape이지만 DOM 입력이라 코드는 공유하지
// 않는다.
const jsonFromListElement = (
  schema: Schema,
  list: Element,
  createId: IdFactory,
): TiptapJsonNode[] => {
  const markerType =
    list.tagName === "OL" ? "numberedListItem" : "bulletListItem";
  const startNumber = explicitStartNumber(list);
  const items: TiptapJsonNode[] = [];
  let itemIndex = 0;
  for (const child of Array.from(list.children)) {
    if (child.tagName !== "LI") continue;
    const { contentNodes, nestedList } = splitListItemChildren(child);
    const content = inlineJsonFromNodes(schema, contentNodes);
    const childrenItems =
      nestedList !== null
        ? jsonFromListElement(schema, nestedList, createId)
        : [];
    const itemContent: TiptapJsonNode[] = [
      {
        type: markerType,
        ...(markerType === "numberedListItem"
          ? { attrs: { startNumber: itemIndex === 0 ? startNumber : null } }
          : {}),
        content,
      },
    ];
    if (childrenItems.length > 0) {
      itemContent.push({ type: "blockGroup", content: childrenItems });
    }
    items.push({
      type: "blockContainer",
      attrs: { blockId: createId() },
      content: itemContent,
    });
    itemIndex += 1;
  }
  return items;
};

// 최상위 시퀀스 조립: ul/ol은 jsonFromListElement로 직접 조립하고, 그
// 사이사이 다른 요소(p/h1~h6/blockquote 등)는 표준 PmDomParser에
// 위임한다 — 마크·heading·quote 파싱을 다시 구현하지 않는다. 연속된
// "다른 요소"는 한 번에 모아 한 번만 파싱한다(요소 하나씩 파싱하면
// 인접 텍스트 병합 등 파서의 문서-단위 판단이 달라질 수 있다).
const topLevelNodesFromDom = (
  schema: Schema,
  root: Element,
  createId: IdFactory,
): TiptapJsonNode[] => {
  const result: TiptapJsonNode[] = [];
  let pendingOther: Element[] = [];

  const flushOther = (): void => {
    if (pendingOther.length === 0) return;
    const wrapper = document.createElement("div");
    for (const el of pendingOther) wrapper.appendChild(el.cloneNode(true));
    const parsed = PmDomParser.fromSchema(schema).parse(wrapper);
    const json = parsed.content.toJSON() as TiptapJsonNode[] | null;
    result.push(...(json ?? []));
    pendingOther = [];
  };

  for (const child of Array.from(root.children)) {
    if (isListElement(child)) {
      flushOther();
      result.push(...jsonFromListElement(schema, child, createId));
      continue;
    }
    pendingOther.push(child);
  }
  flushOther();
  return result;
};

// 이미 조립된 blockContainer JSON 배열의 절대 깊이가 MAX_NESTING_DEPTH를
// 넘지 않도록 평탄화한다. import-html.ts의 NESTED_CHILDREN_FLATTENED와
// 같은 취지 — 상한을 넘는 지점의 blockGroup을 지우지 않고 그 children을
// 부모의 형제로(같은 depth에서) 승격한다(부모 항목 자체는 유지). depth는
// indent-commands.ts의 modelDepthAt/subtreeHeight와 같은 정의(top-level=1)
// 를 쓴다 — startDepth는 이 nodes 배열이 삽입될 자리의 depth
// (modelDepthAtPasteTarget($from))다. PLAN-REVIEW-01 라운드 2 N1 — 붙여넣기
// 대상 위치가 이미 깊으면(예: 60) slice 자신의 내부 높이만으로는 못 잡는
// 합산 초과(60+5=65 > 64)를 이 함수가 잡는다.
const clampDepth = (
  nodes: TiptapJsonNode[],
  startDepth: number,
): TiptapJsonNode[] => {
  const result: TiptapJsonNode[] = [];
  for (const node of nodes) {
    if (node.type !== "blockContainer" || node.content === undefined) {
      result.push(node);
      continue;
    }
    const groupIndex = node.content.findIndex(
      (child) => child.type === "blockGroup",
    );
    const group = groupIndex === -1 ? undefined : node.content[groupIndex];
    if (group === undefined || group.content === undefined) {
      result.push(node);
      continue;
    }
    if (startDepth >= MAX_NESTING_DEPTH) {
      // 이 항목 자신은 유지하되 blockGroup을 통째로 지우고, 그 children을
      // 같은 depth(startDepth)의 형제로 뒤이어 승격한다 — children 자신도
      // 또 자식을 가질 수 있어 재귀 호출이 그대로 다시 클램프한다.
      result.push({
        ...node,
        content: node.content.filter((child) => child.type !== "blockGroup"),
      });
      result.push(...clampDepth(group.content, startDepth));
      continue;
    }
    const clampedChildren = clampDepth(group.content, startDepth + 1);
    result.push({
      ...node,
      content: node.content.map((child, index) =>
        index === groupIndex ? { ...child, content: clampedChildren } : child,
      ),
    });
  }
  return result;
};

export const ListPasteFallbackExtension =
  Extension.create<ListPasteFallbackOptions>({
    name: "listPasteFallback",

    addOptions() {
      return {
        createId: () => {
          throw new Error(
            "ListPasteFallbackExtension requires a createId option",
          );
        },
      };
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      const createId = this.options.createId;

      return [
        new Plugin({
          props: {
            handlePaste: (view, event) => {
              // 표 안에서는 손대지 않는다 — 목록은 표 셀의 블록 자식이 될
              // 수 없다는 기존 제약(model TableCell.content: InlineContent)
              // 위에 새 동작을 얹지 않는다(DELTA-03 범위 밖).
              if (isInTable(view.state)) return false;
              const clipboardData = event.clipboardData;
              if (clipboardData === null) return false;
              const html = clipboardData.getData("text/html");
              if (html.length === 0) return false;

              const dom = new DOMParser().parseFromString(html, "text/html");
              if (!containsListElement(dom.body)) return false;

              const schema = editor.schema;
              const nodes = topLevelNodesFromDom(schema, dom.body, createId);
              if (nodes.length === 0) return false;

              const targetDepth = modelDepthAtPasteTarget(
                view.state.selection.$from,
              );
              const clamped = clampDepth(nodes, targetDepth);

              // focus()를 별도로 호출하지 않는다 — paste 이벤트는 이미
              // 포커스된 editable에서만 발생하므로 불필요한 추가
              // 트랜잭션(undo 단계 분리 위험)을 만들지 않는다.
              editor.commands.insertContent(clamped);
              return true;
            },
          },
        }),
      ];
    },
  });
