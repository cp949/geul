import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

// insertTable·insertDivider·insertMediaBlock 세 삽입 명령이 공유하는
// "슬래시 메뉴 트리거 블록 처리" 프리미티브(2026-09-12 버그 리포트).
//
// 예전엔 clearAfterBlockText가 항상 트리거 블록의 텍스트만 지우고 컨테이너
// (빈 문단)는 그대로 둔 채 그 뒤에 새 블록을 넣었다 — "/table" 입력 줄
// 자체는 빈 문단으로 남고 표는 항상 다음 줄에 생겨, 사용자가 매번 그 빈
// 줄을 지워야 했다.
//
// 트리거 컨테이너에 중첩 자식(blockGroup)이 없으면(D19 — blockContainer의
// content model은 "blockContent blockGroup?"이라 childCount 1 = 중첩 없음)
// 컨테이너 자체를 지우고 그 자리에 새 블록을 넣어도 데이터 손실이 없다 —
// 트리거 줄이 새 블록으로 "치환"된다. 중첩 자식이 있으면(리스트 항목 안에
// 하위 항목이 있는 경우 등) 컨테이너를 통째로 지우면 그 하위 트리도 함께
// 사라지므로, 하위 트리 보존을 "빈 줄 하나 없애기"보다 우선해 예전 방식
// (텍스트만 지우고 컨테이너는 보존, 새 블록은 하위 트리 전체 뒤에 삽입)
// 으로 물러선다.
//
// clearAfterBlockText를 넘기지 않는 일반 삽입(플러스 버튼 등)은 트리거
// 텍스트를 지울 이유가 없으므로 canReplaceContainer가 항상 false다 — 옛
// "삽입만" 경로와 동일하게 동작한다.
export interface TriggerBlockInsertPlan {
  transaction: Transaction;
  // `node`가 실제로 놓인 위치.
  insertPosition: number;
}

export const planTriggerBlockInsert = (
  transaction: Transaction,
  afterNode: ProseMirrorNode,
  afterPosition: number,
  node: ProseMirrorNode,
  clearAfterBlockText: boolean | undefined,
): TriggerBlockInsertPlan => {
  const insertPosition = afterPosition + afterNode.nodeSize;
  // content 삭제는 textblock에만 안전하다 — 표 같은 구조 노드의 content를
  // 지우면 노드 자체가 스키마에 맞지 않아 통째로 사라진다. afterNode가
  // blockContainer면 blockId는 컨테이너 attrs 소유라(D19) 지울 텍스트는
  // 컨테이너 자신이 아니라 내부 blockContent(문단/제목) 노드에 있다.
  const clearTarget =
    afterNode.type.name === "blockContainer" ? afterNode.firstChild : afterNode;

  const canReplaceContainer =
    clearAfterBlockText === true &&
    afterNode.type.name === "blockContainer" &&
    afterNode.childCount === 1 &&
    clearTarget !== null &&
    clearTarget.isTextblock;

  if (canReplaceContainer) {
    // delete 뒤 별도 insert로 나누면 그 사이 스텝에서 doc이 일시적으로
    // 비어 ProseMirror가 ContentMatch.defaultType으로 빈 blockContainer
    // (paragraph)를 자동 채워 넣는다(block-container-extension.ts의
    // BlockContainerExtension priority 1000 주석 — "block+" 채움 기본
    // 노드 경쟁을 그 확장이 쥔다). replaceWith 한 스텝으로 묶으면 그
    // 중간 상태 자체가 없어 채움이 끼어들지 않는다(실측: 나눠 하면 표
    // 앞에 원치 않는 빈 문단이 자동으로 하나 더 생겼다).
    const replaced = transaction.replaceWith(
      afterPosition,
      afterPosition + afterNode.nodeSize,
      node,
    );
    return {
      transaction: replaced,
      insertPosition: replaced.mapping.map(afterPosition),
    };
  }

  const clearPosition =
    afterNode.type.name === "blockContainer"
      ? afterPosition + 1
      : afterPosition;
  let next = transaction;
  if (
    clearAfterBlockText === true &&
    clearTarget !== null &&
    clearTarget.isTextblock &&
    clearTarget.content.size > 0
  ) {
    next = next.delete(
      clearPosition + 1,
      clearPosition + 1 + clearTarget.content.size,
    );
  }
  const mappedInsertPosition = next.mapping.map(insertPosition);
  return {
    transaction: next.insert(mappedInsertPosition, node),
    insertPosition: mappedInsertPosition,
  };
};
