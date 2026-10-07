import { isNestableBlockType } from "@cp949/geul-model";
import { type Selection, TextSelection } from "@tiptap/pm/state";

import { modelDepthAtPasteTarget } from "./indent-commands.js";
import { isCollapsedToggleContent } from "./toggle-collapse-hidden.js";

// 자식이 있는 블록의 끝에 붙이는 블록 삽입의 배치(Issue #290).
//
// insertContent는 캐럿에서 블록을 가른다. 끝 캐럿이면 뒤 조각이 빈 껍데기가
// 되고 기존 자식(blockGroup)이 그 껍데기로 넘어간다. 붙여넣은 블록 뒤에
// 빈 문단이 생기고 자식이 원래 부모에서 떨어진다.
//
// 이 모듈은 가르지 않고 블록 경계에 바로 넣을 위치를 계산한다.
// - 열린 블록: 자식 그룹의 첫 위치. 새 블록이 첫 자식이다(D23).
// - 접힌 toggle: 컨테이너 바로 뒤. 새 블록이 형제다(#252).
// 배치 기준은 Enter 분할 규칙이다(r2 스펙 5.1, 7.3).

export type PasteBlockPlacement = {
  // 먼저 지울 같은 텍스트블록 안 범위다. 비면 from === to다.
  deleteFrom: number;
  deleteTo: number;
  // 삽입 위치다. 범위 삭제 전 문서 기준이다.
  insertAt: number;
  // 삽입 위치에 놓이는 블록의 모델 깊이다. clampDepth의 시작 깊이다.
  depth: number;
};

// 배치를 계산한다. 아래 중 하나라도 아니면 null이다. 호출부는 현행
// insertContent를 쓴다.
// - TextSelection이다.
// - 시작과 끝이 같은 텍스트블록이고 중첩 가능한 타입이다.
// - 끝이 그 텍스트블록 내용의 끝이다.
// - 그 블록 컨테이너가 자식 blockGroup을 가진다.
export const resolvePasteBlockPlacement = (
  selection: Selection,
): PasteBlockPlacement | null => {
  if (!(selection instanceof TextSelection)) return null;
  const { $from, $to } = selection;
  // 노드 인스턴스는 공유될 수 있다. 위치 기준으로 같은 부모를 판정한다.
  if (!$from.sameParent($to)) return null;
  const textblock = $to.parent;
  if (!textblock.isTextblock || !isNestableBlockType(textblock.type.name)) {
    return null;
  }
  if ($to.parentOffset !== textblock.content.size) return null;
  if ($to.depth < 2) return null;

  const containerDepth = $to.depth - 1;
  const container = $to.node(containerDepth);
  if (container.type.name !== "blockContainer") return null;
  if (container.lastChild?.type.name !== "blockGroup") return null;

  const insertAt = isCollapsedToggleContent(textblock)
    ? $to.after(containerDepth)
    : $to.after() + 1;
  return {
    deleteFrom: $from.pos,
    deleteTo: $to.pos,
    insertAt,
    depth: modelDepthAtPasteTarget(selection.$to.doc.resolve(insertAt)),
  };
};
