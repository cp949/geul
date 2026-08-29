import type { Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Transaction } from "@tiptap/pm/state";

// 문서를 바꾸는 명령의 dispatch 마무리 프리미티브. 표 명령(table-commands.ts·
// table-paste-commands.ts)과 divider 명령(divider-commands.ts) 두 도메인이
// 똑같이 필요로 하므로 어느 한쪽 도메인 파일에 두지 않고 여기서 공유한다
// (block-position.ts와 같은 관례). 오류는 TRANSACTION_REJECTED 하나뿐이라
// 호출부의 오류 유니온(TableCommandError·DividerCommandError)에 그대로
// 대입된다 — Result의 error 자리는 공변이다.
type TransactionRejected = { code: "TRANSACTION_REJECTED" };

// dispatch 전후 editor.state.doc 참조 동일성으로 필터(LinkPolicyExtension
// 등)의 트랜잭션 거절을 감지한다. EditorState.applyTransaction은
// filterTransaction이 false를 반환하면 새 EditorState를 만들지 않고 이전
// state를 참조 그대로 돌려준다(실측:
// node_modules/.pnpm/prosemirror-state@1.4.4/.../dist/index.js:793-795).
// 이 저장소는 EditorView의 기본 dispatch 처리를 타지 않는다 — Tiptap이 자신의
// dispatchTransaction을 view prop으로 등록해 가로챈다. 거절되면 그 함수가
// view.updateState 호출 전에 조기 return해 editor.state 참조 자체가 안 바뀐다
// (실측: @tiptap/core@3.30.1/dist/index.js:7020-7046, rootTrWasApplied 체크).
// 결과적으로 editor.state.doc이 dispatch 전후 동일 참조로 남는다 — 이 동일성이
// "필터가 트랜잭션을 버렸다"는 신호다(G-EDT-001의 반대쪽 누락 예방).
// 주의: 이 신호는 트랜잭션에 문서를 바꾸는 스텝이 하나 이상 있을 때만
// 유효하다 — 스텝 없는(docChanged: false) 트랜잭션은 필터를 통과해도 doc
// 참조가 그대로라 오탐한다. 호출부(applyTableGridOperation·insertTable·
// pasteOutOfTable·insertDivider) 전부 dispatch 전에 문서를 바꾸는 스텝을
// 넣는다 — selection만 옮기는 트랜잭션(예: table-keyboard-extension.ts의
// goToNextCell)에는 이 헬퍼를 재사용하지 않는다.
const dispatchAndVerify = (
  editor: Editor,
  transaction: Transaction,
): Result<undefined, TransactionRejected> => {
  const before = editor.state.doc;
  editor.view.dispatch(transaction);
  if (editor.state.doc === before) {
    return { ok: false, error: { code: "TRANSACTION_REJECTED" } };
  }
  return { ok: true, value: undefined };
};

// 네이티브 명령들처럼 결과 selection이 화면 안에 오도록 표시하고(뷰포트
// 밖으로 커진 표에서 캐럿만 옮기면 no-op처럼 보인다) undo를 한 스텝으로 닫은
// 뒤 dispatchAndVerify로 넘긴다. applyTableGridOperation·insertTable·
// pasteOutOfTable·insertDivider 전부가 이 마무리를 공유해야 한다 — 예전엔
// 호출부마다 직접 closeHistory(tr.scrollIntoView())를 반복했는데, insertTable
// 한 곳이 scrollIntoView를 빠뜨려 실제 동작 drift가 났다(그릴링 C7,
// 2026-08-27).
export const finalizeAndDispatch = (
  editor: Editor,
  transaction: Transaction,
): Result<undefined, TransactionRejected> =>
  dispatchAndVerify(editor, closeHistory(transaction.scrollIntoView()));
