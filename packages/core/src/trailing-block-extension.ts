import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, type Transaction } from "@tiptap/pm/state";

// 마지막 최상위 블록이 "자식 없는 paragraph"인가(UI-010 판정 기준, R-6).
// doc 직하 자식은 blockContainer(content "blockContent blockGroup?")·
// table·divider(비포장 atom)뿐이라(block-container-extension.ts,
// divider-extension.ts), childCount 1 = blockGroup 없음이고 첫 자식 타입이
// paragraph/heading/quote를 가른다. table·divider는 컨테이너로 감싸이지
// 않아(D19) 첫 분기에서 걸러진다 — divider로 끝나는 문서에도 trailing
// paragraph가 붙는다.
const endsWithChildlessParagraph = (doc: ProseMirrorNode): boolean => {
  const lastBlock = doc.lastChild;
  return (
    lastBlock !== null &&
    lastBlock.type.name === "blockContainer" &&
    lastBlock.childCount === 1 &&
    lastBlock.firstChild?.type.name === "paragraph"
  );
};

// 문서 끝에 맨몸 paragraph를 넣는 transaction을 만든다(불필요하면 null).
// 맨몸 노드는 doc의 "block+" 자리에서 PM slice-fitting이 blockContainer로
// 자동 wrap하고(insertParagraphAfter와 같은 계약, editor-controller.ts),
// blockId는 같은 dispatch 안에서 BlockIdExtension.appendTransaction이 사후
// 배정한다 — 이 확장은 id를 만들지 않는다. 삽입 위치가 문서 끝이라 기존
// selection은 움직이지 않는다(G-EDT-001).
const createTrailingParagraphTransaction = (
  state: EditorState,
): Transaction | null => {
  if (endsWithChildlessParagraph(state.doc)) return null;
  const paragraphType = state.schema.nodes.paragraph;
  if (paragraphType === undefined) return null;
  return state.tr.insert(state.doc.content.size, paragraphType.create());
};

// 로드(초기 문서 설정) 시점 정규화. PM appendTransaction은 초기 state
// 생성에 실행되지 않고 tiptap "create" 이벤트는 setTimeout 비동기라
// (3.30.1 실측: Editor.mount()가 "mount"는 동기 emit, "create"는
// window.setTimeout 안에서 emit) editor-controller가 동기 onMount 옵션에서
// 이 함수를 호출한다. addToHistory:false로 히스토리 밖에 둔다 — 로드 직후
// undo가 정규화를 되돌리는 오염을 막는다(R-11). prosemirror-history는 이
// meta를 appended transaction(BlockIdExtension의 id 배정)까지 승계해
// 함께 제외한다.
export const ensureTrailingParagraphOnLoad = (editor: Editor): void => {
  const transaction = createTrailingParagraphTransaction(editor.state);
  if (transaction === null) return;
  transaction.setMeta("addToHistory", false);
  editor.view.dispatch(transaction);
};

// 문서 끝 trailing paragraph 불변식(UI-010, spec §6.4). 편집이 트리거한
// 추가는 그 트리거 transaction과 같은 dispatch에 append돼 한 히스토리
// 이벤트가 된다(R-8) — undo 1회로 트리거 편집과 함께 복원된다. 추가 직후
// 상태는 판정 술어를 만족하므로 append 재귀는 한 번에 끝난다(idempotent).
export const TrailingBlockExtension = Extension.create({
  name: "trailingBlock",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _previousState, nextState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          return createTrailingParagraphTransaction(nextState);
        },
      }),
    ];
  },
});
