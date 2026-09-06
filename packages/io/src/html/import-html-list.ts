// production 편집기가 own-content div로 내는 목록류 4종(bulletListItem/
// numberedListItem/checkListItem/toggleListItem)의 마커 판별과 블록 생성을
// 담당한다(RD-003). raw HAST sanitize 오탐 억제(consumePreservedAttributeWarning)
// 와 ol[start] 범위 판정(isStartNumberInRange)도 목록류가 공유하는 로직이라
// 함께 둔다.
import {
  type BulletListItemBlock,
  type CheckListItemBlock,
  type IdFactory,
  type NumberedListItemBlock,
  parseDocument,
  type ToggleListItemBlock,
} from "@cp949/geul-model";

import { propertyInteger, propertyString } from "./hast-properties.js";
import { paragraphContentFromNodes } from "./import-html-helpers.js";
import type { HtmlImportWarning } from "./import-warnings.js";
import type { HtmlElementNode } from "./inline-content.js";

// RD-003이 편입하는 목록류 4종. toggleListItem은 ListItemBlock 유니온
// 밖이지만(model D2 경계) production 마커 인식은 4종을 동일하게 다룬다.
type ProductionListItemType =
  "bulletListItem" | "numberedListItem" | "checkListItem" | "toggleListItem";

// 목록류 4종의 production own-content 존재 마커 — 값은 항상 빈 문자열이라
// (dataBeBlockGroup과 같은 이유) propertyString이 아닌 raw property 존재만
// 확인한다. RD-003.
const productionListItemMarkerProperty: Record<ProductionListItemType, string> =
  {
    bulletListItem: "dataBeBulletListItem",
    numberedListItem: "dataBeNumberedListItem",
    checkListItem: "dataBeCheckListItem",
    toggleListItem: "dataBeToggleListItem",
  };

// node가 목록류 production own-content div면 그 블록 타입을, 아니면
// undefined를 반환한다. tagName만으로는(전부 "div") own-content div와
// wrapper/children-container div를 구분할 수 없어 마커 속성으로 판정한다
// (isChildrenContainerMarker와 같은 원칙).
export const productionListItemType = (
  node: HtmlElementNode,
): ProductionListItemType | undefined => {
  if (node.tagName !== "div") return undefined;
  const entries = Object.entries(productionListItemMarkerProperty) as Array<
    [ProductionListItemType, string]
  >;
  for (const [type, property] of entries) {
    if (node.properties[property] !== undefined) return type;
  }
  return undefined;
};

// raw warning fact 중 sanitized 목록 변환이 실제로 소비해 보존한 속성 하나만
// 제거한다. 전역 필터와 달리 blocksFromListElement에 도달하지 않은 standalone
// li, 비-li ol, 표 셀 내부 목록의 속성 손실 warning은 그대로 남는다. li/ol
// 전용이었으나 RD-005-DELTA-01에서 details/summary까지 다뤄 이름과 매개변수
// 타입을 일반화했다.
export const consumePreservedAttributeWarning = (
  warnings: HtmlImportWarning[],
  element: string,
  attribute: string,
): void => {
  const index = warnings.findIndex(
    (warning) =>
      warning.kind === "UNSAFE_ATTRIBUTE_REMOVED" &&
      warning.element === element &&
      warning.attribute === attribute,
  );
  if (index >= 0) warnings.splice(index, 1);
};

// production 목록류 own-content div(findChildrenWrapper가 productionListItemType로
// 걸러 넘긴 것) 하나를 목록 블록으로 만든다. blocksFromListItem(li 기반
// own-format)과 같은 이유로 blocksFromSegments(범용 segmentBlocks)를 거치지
// 않는다 — segmentBlocks의 정책은 tagName 기반이라 generic div를 항상
// paragraph로만 보고, 목록류 4타입을 낼 수 없다(RD-003 readiness probe
// 확인). own-content div 자신은 production에서 id를 갖지 않는 것이 보통이라
// createId()로 임시 발급하지만, 호출부(blocksFromNodes)가 바깥 wrapper div의
// id로 즉시 덮어쓴다(own-export 동형 계약, findChildrenWrapper 소비부 참고).
export const buildProductionListItemBlock = (
  type: ProductionListItemType,
  ownNode: HtmlElementNode,
  createId: IdFactory,
):
  | BulletListItemBlock
  | NumberedListItemBlock
  | CheckListItemBlock
  | ToggleListItemBlock => {
  // TextBlockProps(textColor/backgroundColor/textAlignment)는 이 DELTA
  // 범위가 아니다 — Production*ListItemExtension이 아직 이 속성을 DOM에
  // 노출하지 않는다(production-editor-assembly.ts). div 허용 목록에도
  // 올리지 않았으므로 sanitize가 어차피 지운다.
  const id = propertyString(ownNode, "dataBeBlockId") ?? createId();
  const content = paragraphContentFromNodes(ownNode.children);
  switch (type) {
    case "numberedListItem": {
      const startNumber = propertyInteger(
        ownNode,
        "dataBeStartNumber",
        Number.NaN,
      );
      return {
        id,
        type,
        content,
        ...(Number.isNaN(startNumber) ? {} : { startNumber }),
      };
    }
    case "checkListItem":
      return {
        id,
        type,
        content,
        checked: propertyString(ownNode, "dataBeChecked") === "true",
      };
    case "toggleListItem": {
      const collapsedAttr = propertyString(ownNode, "dataBeCollapsed");
      return {
        id,
        type,
        content,
        ...(collapsedAttr === undefined
          ? {}
          : { collapsed: collapsedAttr === "true" }),
      };
    }
    case "bulletListItem":
      return { id, type, content };
  }
};

// numberedListItem.startNumber가 model schema 범위(min(0).max(999_999_999))
// 안인지 판정한다. table-paste-commands.ts의 isStartNumberInRange와 같은
// 방식으로 상수를 복제하지 않고 parseDocument 프로브에 위임한다 — 범위가
// 바뀌어도 이 판정은 갱신할 필요가 없다.
export const isStartNumberInRange = (startNumber: number): boolean =>
  parseDocument({
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "html-import-start-number-probe",
        type: "numberedListItem",
        content: [],
        startNumber,
      },
    ],
  }).ok;
