import type { IdFactory, Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

import { findBlockPosition } from "./block-position.js";
import { finalizeAndDispatch } from "./dispatch.js";
import type { MediaBlockKind } from "./media-block-kind.js";

// 4종 미디어 블록(file/image/video/audio) 삽입 명령(삽입 전용 — setBlockType
// 대상이 아니다, spec §2.2 Turn into 제외·§5.1). kind별로 스키마 노드
// 타입만 다르게 선택하고 나머지 트랜잭션 구조는 동일하다 — 노드 이름이
// kind 문자열과 정확히 같다(media-block-extension.ts: name: "file" 등).
//
// - 비포장 atom: divider·table과 같은 "group: block 직접 멤버, blockId
//   자체 소유" 패턴이다(media-block-extension.ts). BlockIdExtension(
//   blockContainer 전용)의 사후 id 배정 대상이 아니라 이 명령이 createId()
//   로 명시 배정한다(divider-commands.ts::insertDivider와 동일 근거).
// - 삽입 위치: afterBlockId 노드의 nodeSize 뒤(divider·table과 동일 계산).
// - selection — divider와 다르다: divider는 atom 안에 캐럿을 둘 수 없어
//   다음 형제 텍스트 블록 선두로 옮기거나 빈 paragraph를 동반한다(캐럿
//   호스팅 목적). 미디어 블록은 그 반대로 삽입한 블록 자신을 NodeSelection
//   으로 선택해야 한다 — react File Panel(RD-003)이 "현재 selection이 url
//   없는 미디어 블록 위"를 자동 오픈 판정 기준으로 쓰기 때문이다(spec
//   §6.1). generic-block-commands.ts::duplicateBlock의 atom 분기
//   (NodeSelection.create(tr.doc, insertPosition))와 같은 선택 방식을
//   재사용한다. 문서 끝에 삽입해도 divider처럼 빈 paragraph를 직접 만들지
//   않는다 — TrailingBlockExtension이 table 삽입과 동일하게 별도
//   appendTransaction으로 처리하고, 그 append는 트리거 transaction과 같은
//   히스토리 이벤트로 묶인다(trailing-block-extension.ts 주석, R-8) — undo
//   1회로 함께 복원된다. 선택 위치(문서 끝 이전을 가리키는 insertPosition)
//   는 이 append로 다시 매핑될 필요가 없다(같은 파일 주석 — "삽입 위치가
//   문서 끝이라 기존 selection은 움직이지 않는다").
// - clearAfterBlockText: 슬래시 메뉴 "/file"·"/image"·"/video"·"/audio"
//   트리거 문단 비우기를 같은 트랜잭션에 담는다(divider·table과 동일
//   규칙 — 대상이 blockContainer면 내부 blockContent의 텍스트만 지운다).
// - 마무리는 dispatch.ts의 finalizeAndDispatch를 재사용한다(divider·table과
//   동일 근거 — closeHistory + "doc 참조 동일성 = 필터 거절" 판정).

export type InsertMediaBlockError =
  | { code: "BLOCK_NOT_FOUND"; blockId: string }
  | { code: "TRANSACTION_REJECTED" };

const blockNotFound = (
  blockId: string,
): Result<never, InsertMediaBlockError> => ({
  ok: false,
  error: { code: "BLOCK_NOT_FOUND", blockId },
});

export const insertMediaBlock = (
  editor: Editor,
  afterBlockId: string,
  kind: MediaBlockKind,
  createId: IdFactory,
  options?: { clearAfterBlockText?: boolean },
): Result<{ blockId: string }, InsertMediaBlockError> => {
  const mediaType = editor.schema.nodes[kind];
  // createTiptapEditor(editor-controller.ts)가 4종 확장 등록을 보장하므로
  // 이 부재는 도달 불가 방어선이다 — 명령 결과로 위장하지 않고 던진다
  // (insertDivider와 동일 근거).
  if (mediaType === undefined) {
    throw new TypeError(
      `${kind} 노드 타입이 스키마에 없다 — createTiptapEditor가 확장 등록을 보장한다`,
    );
  }

  const afterPosition = findBlockPosition(editor.state.doc, afterBlockId);
  if (afterPosition === null) return blockNotFound(afterBlockId);
  const afterNode = editor.state.doc.nodeAt(afterPosition);
  if (afterNode === null) return blockNotFound(afterBlockId);
  const insertPosition = afterPosition + afterNode.nodeSize;

  const blockId = createId();
  const mediaNode = mediaType.create({ blockId });

  let transaction = editor.state.tr;
  const clearTarget =
    afterNode.type.name === "blockContainer" ? afterNode.firstChild : afterNode;
  const clearPosition =
    afterNode.type.name === "blockContainer"
      ? afterPosition + 1
      : afterPosition;
  if (
    options?.clearAfterBlockText === true &&
    clearTarget !== null &&
    clearTarget.isTextblock &&
    clearTarget.content.size > 0
  ) {
    transaction = transaction.delete(
      clearPosition + 1,
      clearPosition + 1 + clearTarget.content.size,
    );
  }
  const mediaPosition = transaction.mapping.map(insertPosition);
  transaction = transaction.insert(mediaPosition, mediaNode);
  transaction.setSelection(
    NodeSelection.create(transaction.doc, mediaPosition),
  );

  const dispatched = finalizeAndDispatch(editor, transaction);
  if (!dispatched.ok) return dispatched;
  return { ok: true, value: { blockId } };
};
