import { type Block, type Document, isKnownBlockType } from "@cp949/geul-model";

import { walkBlockTree } from "./block-tree.js";
import type { EditorError } from "./errors.js";

// enabledBlockTypes(spec §4.4 EXT-004, RD-002-DELTA-12) — 기존 14종 대상
// allow/deny 목록. model에 "14종 전체 목록" export가 없고(만들 필요도
// 없다) allow 모드도 매 타입마다 predicate 호출로 판정한다(여집합을
// 미리 계산하지 않는다). 옵션 미지정이면 항상 true(회귀 없음).
export type EnabledBlockTypes = {
  mode: "allow" | "deny";
  types: readonly Block["type"][];
};

export const isBlockTypeEnabled = (
  type: Block["type"],
  enabledBlockTypes?: EnabledBlockTypes,
): boolean => {
  if (enabledBlockTypes === undefined) return true;
  const listed = enabledBlockTypes.types.includes(type);
  return enabledBlockTypes.mode === "allow" ? listed : !listed;
};

// enabledBlockTypes(RD-002-DELTA-12)로 비활성화한 알려진 타입이 문서
// 어디에라도(최상위든 임의 깊이 중첩 children이든) 있으면 그 블록을
// 반환한다 — 7개 nestable 타입(paragraph/heading/quote/목록 4종)은 자식을
// 가질 수 있어 top-level만으로는 부족하다(CustomBlock 거절과 다른
// 이유, CustomBlock은 leaf·top-level 전용). PM 스키마에 없는 노드
// 타입으로 Editor를 만들거나 insertContent하면 PM이 예외를 던지므로
// 로드 자체를 막는다. block-tree.ts의 기존 재사용 프리미티브를 그대로
// 쓴다 — 재귀를 여기서 다시 구현하지 않는다.
// 판정은 호출자가 넘기는 함수가 맡는다. modelToTiptap은 옵션 값으로,
// 범용 블록 조작 API(block-crud-commands.ts)는 session으로 판정한다
// (Issue #329).
export const findDisabledBlock = (
  blocks: Document["blocks"],
  isEnabled: (type: Block["type"]) => boolean,
): Document["blocks"][number] | undefined => {
  let found: Document["blocks"][number] | undefined;
  walkBlockTree(
    blocks,
    null,
    (block) => {
      if (isKnownBlockType(block.type) && !isEnabled(block.type)) {
        found = block;
        return false;
      }
    },
    false,
  );
  return found;
};

// 막은 타입 거절 EditorError. modelToTiptap(문서 로드)과 범용 블록 조작
// API가 같은 코드·메시지를 쓰도록 한곳에서 만든다(Issue #329, G-CNV-001).
export const disabledBlockError = (
  block: Document["blocks"][number],
): EditorError => ({
  code: "EDITOR_FEATURE_UNAVAILABLE",
  message: `Block ${block.id} has type "${block.type}" disabled via CreateEditorOptions.enabledBlockTypes`,
});

// 타입 이름만으로 만드는 막은 타입 거절 EditorError. 삽입 명령 래퍼
// (insertDivider·insertTable·pasteTabularData)는 블록 인스턴스가 없어
// disabledBlockError를 쓸 수 없다(Issue #330, G-CNV-001).
export const disabledBlockTypeError = (type: Block["type"]): EditorError => ({
  code: "EDITOR_FEATURE_UNAVAILABLE",
  message: `Block type "${type}" is disabled via CreateEditorOptions.enabledBlockTypes`,
});
