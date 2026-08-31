import { isListItemBlockType, isNestableBlockType } from "@cp949/geul-model";
import { Extension, type Editor } from "@tiptap/core";
import { Fragment, type Node } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";

import { resolveSelectionAwareState } from "./selection-aware-state.js";

// blockContainer의 content model은 "blockContent blockGroup?"다(D19,
// block-container-extension.ts). Tiptap 기본 splitBlock은 canSplit(doc, pos,
// depth=1, ...)로 depth 1 split만 시도한다 — 컨테이너까지 함께 쪼개야 하는
// depth 2 split을 절대 하지 않아, 자식 유무와 무관하게 Enter가 완전
// 무동작이었다(실측, D21 전제 반증 — DELTA-02c 배경 참고). PM 표준
// tr.split(pos, 2, typesAfter)를 그대로 쓰면 커서 뒤의 기존 blockGroup(자식
// 전부)이 새 컨테이너로 통째로 넘어가 원본이 자식을 잃는다 — 이 형태는 쓰지
// 않는다(D23). 대신 컨테이너를 직접 재구성해 새 블록을 원본의 첫 자식으로
// 삽입한다(D23, 사용자 결정 완료).
//
// 참조: BlockNote v0.54.0
// packages/core/src/api/blockManipulation/commands/splitBlock/(구조만
// 참조, 코드 미복제 — MPL 경계).
export const BlockSplitExtension = Extension.create({
  name: "blockSplit",
  // TableKeyboardNavigationExtension보다 먼저 DOM-derived selection을
  // 확인한다. live CellSelection 직후 표 밖 목록을 클릭하고
  // Enter를 누른 경우 stale 표 핸들러가 키를 선점하지 않는다.
  // 실제 표 selection에서는 아래 가드가 false를 반환해 표
  // Enter 계약에 그대로 양보한다.
  priority: 101,

  addKeyboardShortcuts() {
    return {
      Enter: () => splitBlockContainer(this.editor),
    };
  },
});

// 이 확장이 분할하거나 종료하는 콘텐츠 노드 — blockContainer의 blockContent
// 멤버(paragraph/heading/quote/bulletListItem/numberedListItem, D19). quote는
// 문단 동형 계약(spec §4.2 — inline* content, 차이는 타입뿐)이라 heading과
// 같은 분할 규칙을 받는다(Issue #38 슬라이스 3). 목록은 non-empty split과
// empty paragraph exit의 별도 규칙을 받는다(spec §5.1). divider는
// atom·콘텐츠 없음이라 대상이 아니다.
function isSplittableContent(node: Node): boolean {
  return isNestableBlockType(node.type.name);
}

function isListItemContent(node: Node): boolean {
  return isListItemBlockType(node.type.name);
}

// this.editor를 직접 받아 addKeyboardShortcuts 밖에서도 테스트 가능한
// 형태로 분리했다(export 안 함 — 공개 API가 아니다, G-WKS-001).
function splitBlockContainer(editor: Editor): boolean {
  const { view } = editor;
  const liveState = view.state;
  const selectionAwareState = resolveSelectionAwareState(editor, {
    allowNativeTextSelectionFromCellSelection: true,
  });
  const { selection } = selectionAwareState;

  const fromParent = selection.$from.parent;
  if (!isSplittableContent(fromParent)) {
    // 표 셀 등을 여기서 배제한다: 표 셀 content는 "inline*"라(D19,
    // table-extension.ts) $from.parent가 애초에 paragraph/heading/quote가
    // 될 수 없다 — 별도 isInTable 가드 불필요(직접 확인 완료, 즉시 리뷰가
    // 아래 blockContainer 검사가 아니라 이 지점이 실제 배제 지점임을
    // 정정). 범위 선택도 마찬가지다 — 셀 안 범위는 삭제조차 하지 않고
    // 즉시 물러난다.
    return false;
  }

  // 범위 선택은 dev(StarterKit splitBlock)의 의미론을 따른다: 선택을
  // 지우고 남은 캐럿 위치에서 아래 collapsed 규칙으로 분할한다. 삭제와
  // 분할을 같은 tr에 쌓아 단일 dispatch로 끝낸다(undo 1회 단위,
  // G-EDT-001). false를 반환해도 대신 처리해 줄 폴백이 없다는 사실은
  // 여전하다 — Tiptap 코어 keymap의 splitBlock도 이 스키마에서 depth-1
  // canSplit이 항상 실패해(D22와 같은 근본 원인) 어떤 핸들러도
  // preventDefault를 호출하지 않고, 실 브라우저에서는 이벤트가 소비되지
  // 않은 채 native contenteditable 기본 동작으로 흘러가 PM 모델과 DOM이
  // 어긋날 위험이 있다(jsdom은 이 기본 동작을 구현하지 않아 테스트로는
  // 드러나지 않음). 그래서 false는 위·아래 가드처럼 이 커맨드가 정말
  // 관여하지 않아야 하는 위치에서만 반환한다.
  // G-EDT-002의 파생 state는 selection 판정에만 쓴다. 문서 transaction은
  // 반드시 live state에서 만들고 DOM-derived selection만 같은 doc 위의 첫
  // step으로 옮긴다. 이어지는 delete/split과 단일 dispatch·undo 단위를
  // 유지하면서 mismatched transaction을 피한다.
  const tr = liveState.tr;
  if (!selection.eq(liveState.selection)) {
    tr.setSelection(selection);
  }
  if (!selection.empty) {
    tr.deleteSelection();
  }

  // 삭제 **후** 상태(tr.doc·tr.selection)에 collapsed 가드와 분할을
  // 적용한다. 가드에 걸리면 dispatch 없이 false — dispatch하지 않은 tr는
  // 그대로 폐기되므로 "삭제만 반영된 어중간한 상태"가 생기지 않는다.
  if (!splitAtCaret(tr)) {
    return false;
  }

  view.dispatch(tr);
  return true;
}

// tr.selection(범위 선택이었다면 deleteSelection이 남긴 캐럿)과 tr.doc
// 기준으로 컨테이너 분할 step들을 같은 tr에 쌓는다. 가드 실패 시 false를
// 반환하고 tr에 아무 step도 추가하지 않는다 — dispatch 여부는 호출부가
// 결정한다.
function splitAtCaret(tr: Transaction): boolean {
  const { $from } = tr.selection;
  const contentNode = $from.parent;
  if (!isSplittableContent(contentNode)) {
    return false;
  }

  const containerDepth = $from.depth - 1;
  if (containerDepth < 0) return false;
  const container = $from.node(containerDepth);
  if (container.type.name !== "blockContainer") {
    return false;
  }

  const containerStart = $from.before(containerDepth);
  const containerEnd = $from.after(containerDepth);
  const splitOffset = $from.parentOffset;

  // 빈 목록 Enter는 새 항목을 만들지 않고 현재 content node만 paragraph로
  // 바꾼다. blockContainer를 재구성하지 않으므로 원본 blockId, 기존
  // blockGroup(children), 부모 안 인덱스와 중첩 깊이가 그대로 남는다.
  // 타입 전환과 selection을 같은 tr에 담아 dispatch·revision/event·undo를
  // 각각 한 번으로 유지한다(G-EDT-001).
  if (isListItemContent(contentNode) && contentNode.content.size === 0) {
    const contentPosition = $from.before($from.depth);
    const paragraph = contentNode.type.schema.nodes.paragraph;
    if (paragraph === undefined) return false;
    tr.setNodeMarkup(contentPosition, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, contentPosition + 1));
    return true;
  }

  const beforeContent = contentNode.content.cut(0, splitOffset);
  const afterContent = contentNode.content.cut(splitOffset);

  const updatedContentNode = contentNode.type.create(
    contentNode.attrs,
    beforeContent,
    contentNode.marks,
  );
  // 블록 **끝** split(afterContent 없음)의 새 콘텐츠 노드는 원본 타입
  // 복사가 아니라 빈 paragraph다 — dev(StarterKit splitBlock +
  // defaultBlockAt)가 그랬다. heading 끝 Enter가 같은 level의 heading을
  // 복제하지 않고 본문 문단을 여는 흐름의 복원이다. 중간·시작 split은
  // 기존대로 원본 타입·attrs를 복사한다. quote도 같은 규칙이다 — 끝 Enter는
  // 인용을 닫고 문단을 열며, 중간 Enter는 앞뒤 모두 quote로 남는다.
  const newContentNode = isListItemContent(contentNode)
    ? // 목록은 캐럿 뒤가 비어도 같은 목록 타입을 유지한다. numbered의
      // startNumber는 명시 시작점이므로 파생된 새 항목에 복제하지 않고
      // schema 기본값(null)을 쓴다(spec §4.4/§5.1).
      contentNode.type.create(null, afterContent, contentNode.marks)
    : afterContent.size === 0
      ? contentNode.type.schema.nodes.paragraph!.create()
      : contentNode.type.create(
          contentNode.attrs,
          afterContent,
          contentNode.marks,
        );

  // 새 컨테이너는 blockId를 주지 않는다(null/미지정) — BlockIdExtension의
  // appendTransaction이 같은 dispatch 안에서 자동으로 채운다
  // (block-id-extension.ts, DELTA-02/02a가 이미 의존하는 패턴).
  const newContainer = container.type.create(null, newContentNode);

  // D24(D23 적용 범위 정정): D23("새 블록은 첫 자식")은 원본에 이미
  // 자식(blockGroup)이 있을 때만 적용된다 — 그 위험(PM 표준 depth-2
  // split이 기존 blockGroup 전체를 새 컨테이너로 이관)은 이관할 blockGroup이
  // 있을 때만 성립한다. 자식이 전혀 없던 블록은 이관 위험 자체가 없으므로
  // 새 블록을 형제로 삽입한다 — R1부터 있던 "Enter로 문단을 둘로 나눈다"는
  // 기본 동작이 사용자가 기대하는 형태(형제)를 되찾는다.
  const existingGroup = container.childCount > 1 ? container.child(1) : null;

  let replacement: Fragment;
  if (existingGroup === null) {
    // 원본은 자신의 attrs를 보존한 채 콘텐츠만 줄이고(blockGroup 없음),
    // 새 컨테이너를 그 형제로 바로 이어붙인다 — 두 노드를 한 Fragment로
    // replaceWith에 넘기면 원본 자리에 형제 둘이 들어간다.
    const rebuiltContainer = container.type.create(
      container.attrs,
      Fragment.from(updatedContentNode),
    );
    replacement = Fragment.from(rebuiltContainer).append(
      Fragment.from(newContainer),
    );
  } else {
    // D23: 기존 자식 그룹을 보존한 채 새 컨테이너를 맨 앞에 붙인 새
    // blockGroup을 만들어 원본의 첫 자식으로 삽입한다.
    const newGroup = existingGroup.type.create(
      null,
      Fragment.from(newContainer).append(existingGroup.content),
    );
    const rebuiltContainer = container.type.create(
      container.attrs,
      Fragment.from(updatedContentNode).append(Fragment.from(newGroup)),
    );
    replacement = Fragment.from(rebuiltContainer);
  }

  tr.replaceWith(containerStart, containerEnd, replacement);

  // 커서를 새 블록(새 컨테이너 안 newContentNode) 텍스트 시작 위치로
  // 옮긴다. 두 분기 모두 containerStart로부터 같은 4개의 구조 토큰(원본
  // 컨테이너 진입 또는 종료, 그룹 또는 형제 경계, 새 컨테이너 진입, 새
  // contentNode 진입)을 지나 새 텍스트 시작에 닿는다 — D24 배경 산술 참고.
  // containerStart + 1(컨테이너 진입) + updatedContentNode.nodeSize(첫
  // 자식) + 1(blockGroup 진입 또는 원본 컨테이너 종료) + 1(새 컨테이너
  // 진입) + 1(새 contentNode 진입) = 새 텍스트 시작.
  const newCaretPos =
    containerStart + 1 + updatedContentNode.nodeSize + 1 + 1 + 1;
  const resolvedCaret = tr.doc.resolve(
    Math.min(newCaretPos, tr.doc.content.size),
  );
  tr.setSelection(TextSelection.near(resolvedCaret));

  return true;
}
