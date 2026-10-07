import type { IdFactory } from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { CellSelection, isInTable } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";

import type { EditorController } from "./editor-controller-types.js";
import type { IframeEmbedConfig } from "./iframe-embed-config.js";
import { modelDepthAtPasteTarget } from "./indent-commands.js";
import { resolvePasteBlockPlacement } from "./paste-block-placement.js";
import {
  clampDepth,
  type PasteClipboard,
  type PastePlan,
  planDefaultPaste,
  planTableCellPaste,
} from "./paste-plan.js";
import {
  buildPlainMultilinePasteTransaction,
  normalizePasteText,
  plainTextClipboardParser,
  sanitizeSliceInlineText,
  splitPlainTextLines,
} from "./plain-text-paste.js";

// spec §7.3은 HTML 붙여넣기가 문서 HTML import와 같은 sanitizer·매핑을
// 재사용해야 한다고 못 박는다 — 개별 Tiptap 확장의 parseHTML을 하나씩
// 여는 대신, 클립보드에서 파싱한 Document를 modelToTiptap으로 인코드해
// editor.commands.insertContent로 삽입하면 슬라이스 2~9가 쌓은 전체
// 블록 타입을 한 경로로 커버한다. TablePasteExtension이 이미 같은
// handlePaste 가로채기 패턴으로 표를 처리하므로 이 확장은 그 패턴을
// 그대로 따르되 표가 아닌 콘텐츠만 다룬다.
//
// 목록·체크 목록·토글 목록(own-format `ul`/`li`와 RD-003이 편입한
// production 마커 둘 다)도 이 확장이 그대로 처리한다 — 목록을 배제하는
// 코드를 두지 않는다. 예전엔 등록 순서상 목록 전용 별도 확장(RD-004
// "## 결정" 당시 상태)이 목록 있는 HTML을 먼저 가로챘지만, 그 확장이
// 다루던 시나리오(중첩·ol[start]·깊이 상한)를 io.importHtml이 이미
// 동등하게 처리해 RD-005가 그 확장을 제거하고 이 확장 하나로 흡수했다.
//
// own export document HTML의 data-geul-children wrapper와 생산 편집기
// in-editor copy의 data-geul-block-group wrapper(RD-002가 io.importHtml
// 에서 이미 동등하게 인식) 둘 다 이 확장을 거치지 않고 io.importHtml에
// 원본 그대로 전달된다 — 이 확장은 두 형식을 구분하는 사전 정규화
// 코드를 갖지 않는다(G-CNV-002, 의미는 sanitize 이후 HAST에서만 만든다).
//
// 위치·형태 판정은 붙여넣기 계획(paste-plan.ts)이 한다. 이 확장은 PM hook
// 에서 클립보드 값을 읽어 계획을 받고 실행한다(Issue #306).

// enabledBlockTypes(spec §4.4 EXT-004, RD-002-DELTA-12)를 이 확장의 두
// modelToTiptap 호출부(아래)에 threading하지 않는다 — 착수 중
// "비활성 타입 붙여넣기가 insertContent에서 크래시할 것"이라는 가설을
// 세웠다가 실측(node_modules/@tiptap/core/src/commands/insertContentAt.ts)
// 으로 반증했다: `content = createNodeFromContent(...)`가 항상(editor
// 옵션과 무관) try/catch로 감싸여 있어 알 수 없는 노드 타입이면
// `emitContentError` 이벤트만 내고 `return false`로 조용히 끝난다 —
// uncaught exception이 없다. modelToTiptap이 미리 거절하든 안 하든
// 관찰 가능한 결과(붙여넣기가 아무것도 넣지 않는다)가 같아 이 스레딩은
// 검출 변이를 만들 수 없는 죽은 코드였다.
export type ClipboardPasteOptions = {
  createId: IdFactory;
  // spec §10(IO-008), RD-001-DELTA-01 — 등록된 pasteHandler가 아래
  // handlePaste의 기본 처리 직전에 호출된다. controllerFacade는
  // pasteHandler가 있을 때만 함께 온다(production-editor-assembly.ts
  // 배선 근거).
  pasteHandler?: (context: {
    event: ClipboardEvent;
    editor: EditorController;
    defaultPasteHandler: () => boolean;
  }) => boolean | undefined;
  controllerFacade?: EditorController;
  // Issue #215 RD-002 — host의 iframe URL 정책(whitelist·protocol·
  // private-network)이다. production-editor-assembly.ts가 construction-time
  // `options.iframeEmbed`를 그대로 전달한다(render 옵션 3필드 추출에 쓰는
  // 것과 같은 소스). 미지정이면 io.importHtml 자체 기본값(가장 보수적)이
  // 적용된다.
  iframeEmbed?: IframeEmbedConfig;
};

export const ClipboardPasteExtension = Extension.create<ClipboardPasteOptions>({
  name: "clipboardPaste",

  addOptions() {
    return {
      createId: () => {
        throw new Error("ClipboardPasteExtension requires a createId option");
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const createId = this.options.createId;
    const pasteHandler = this.options.pasteHandler;
    const controllerFacade = this.options.controllerFacade;
    const iframeEmbed = this.options.iframeEmbed;
    // view.pasteText(sanitized, event) 재진입 가드(아래 sanitize 분기와
    // html 폴백 분기 전용) — prosemirror-view의 doPaste가 자체적으로
    // view.someProp("handlePaste", f => f(view, event, slice))를 한 번 더
    // 호출한다(EditorView.pasteText → doPaste 내부, 이 플러그인 등록
    // 시그니처와 별개 3-인자 호출). 그 재호출도 이 handlePaste로 들어와
    // 같은 event.clipboardData를 다시 읽으면 sanitize 결과가 매번
    // 원본과 달라 view.pasteText를 무한 재귀 호출한다(jsdom 테스트로
    // 실측: RangeError: Maximum call stack size exceeded). 이 플래그가
    // true인 동안은 즉시 false를 반환해 doPaste 내부 재호출을
    // 사실상 무시한다 — doPaste 자신은 이미 계산해 둔 slice로 계속
    // 진행하므로 삽입 자체는 그대로 된다.
    let sanitizedPasteInFlight = false;
    // drop 이벤트 안에서 PM이 부르는 transformPasted를 건너뛰는 플래그다(Issue #302).
    let dropInFlight = false;
    // PM이 이번 붙여넣기를 평문 경로로 만들었다는 신호다(Issue #303). PM은
    // handlePaste를 부르기 직전 같은 호출 스택에서 transformPasted의 3번째
    // 인자(asText)로 알려 준다. Ctrl+Shift+V뿐 아니라 평문 단독 클립보드와
    // 캐럿이 codeBlock 안인 붙여넣기에서도 참이다. 두 경우는 html이 비었거나
    // 아래 codeBlock 조기 반환이 먼저 처리해 영향이 없다. view.input.shiftKey는
    // PM 비공개라 쓰지 않는다. PM이 Shift+Insert를 평문으로 보지 않는 예외도
    // 이 인자에 이미 반영돼 있다.
    // transformPasted가 기록하고 handlePaste 진입에서 읽어 내린다. 다른
    // 플러그인이 붙여넣기를 먼저 소비하면 이 플러그인의 handlePaste가 불리지
    // 않으므로 microtask로도 내린다.
    let plainPasteRequested = false;

    // PM 자신의 평문 붙여넣기(doPaste)를 재진입 가드 안에서 호출한다.
    const pasteTextThroughPm = (
      view: EditorView,
      value: string,
      event: ClipboardEvent,
    ): void => {
      sanitizedPasteInFlight = true;
      try {
        view.pasteText(value, event);
      } finally {
        sanitizedPasteInFlight = false;
      }
    };

    // 붙여넣기 계획을 실행하고 handlePaste 반환값을 돌려준다.
    const runPastePlan = (
      view: EditorView,
      plan: PastePlan,
      event: ClipboardEvent,
    ): boolean => {
      switch (plan.kind) {
        case "pass":
        case "delegate":
          return false;
        case "consume":
          return true;
        case "pasteText":
          pasteTextThroughPm(view, plan.text, event);
          return true;
        case "dispatch":
          view.dispatch(plan.transaction);
          return true;
        case "insertBlocks": {
          const { nodes, placement } = plan;
          // 자식 있는 블록의 끝이면 블록 경계에 바로 넣는다(Issue #290).
          // 범위 삭제와 삽입은 한 transaction이다.
          if (placement.kind === "blockBoundary") {
            const { deleteFrom, deleteTo, insertAt, depth } =
              placement.placement;
            const deleteLength = deleteTo - deleteFrom;
            editor
              .chain()
              .command(({ tr }) => {
                if (deleteLength > 0) tr.delete(deleteFrom, deleteTo);
                return true;
              })
              .insertContentAt(
                insertAt - deleteLength,
                clampDepth(nodes, depth),
              )
              .run();
            return true;
          }
          // 다른 블록에서 시작해 자식 있는 블록의 끝에서 끝나는 범위는
          // 먼저 지운 뒤 캐럿 삽입 규칙을 적용한다(Issue #294). 삭제는
          // PM 기본 삭제라 끝 블록의 자식이 시작 블록의 자식이 된다.
          // 지운 뒤의 캐럿으로 배치를 다시 판정한다. 범위 삭제와 삽입은
          // 한 transaction이다.
          if (placement.kind === "afterRangeDelete") {
            editor
              .chain()
              .command(({ tr, commands }) => {
                tr.deleteSelection();
                const placed = resolvePasteBlockPlacement(tr.selection);
                if (placed !== null) {
                  return commands.insertContentAt(
                    placed.insertAt,
                    clampDepth(nodes, placed.depth),
                  );
                }
                return commands.insertContent(
                  clampDepth(
                    nodes,
                    modelDepthAtPasteTarget(tr.selection.$from),
                  ),
                );
              })
              .run();
            return true;
          }
          editor.commands.insertContent(clampDepth(nodes, placement.depth));
          return true;
        }
      }
    };

    return [
      new Plugin({
        props: {
          // handlePaste·handleDrop이 직접 삽입하지 않고 물러나는 경로의 여러
          // 줄 평문 배치(Issue #284). 한 줄이면 null이라 PM 기본이다.
          // 자식 있는 블록의 D23 배치는 이 경로로 만들 수 없다(spec 7.3).
          clipboardTextParser: plainTextClipboardParser,
          // 표 셀 안 캐럿·같은 셀 안 범위의 slice에서 무효 문자를 지운다(Issue
          // #302). 셀 안에서 html이 내용을 가지면 handlePaste가 PM 기본에
          // 맡기는데 PM 기본은 slice의 무효 문자를 거르지 않아 되돌림 guard가
          // 붙여넣기를 통째로 지운다. PM은 handlePaste 호출 전에 이 변환을
          // 적용한다. html 출처와 Ctrl+Shift+V 평문 출처 slice를 같은 코드가
          // 덮는다. 아래 handlePaste는 정리된 slice를 받는다.
          // - CellSelection은 유효 평문도 PM 기본이 되돌리는 별개 결함이라 제외한다.
          // - 표 밖은 아래 handlePaste의 기존 경로가 처리하므로 바꾸지 않는다.
          // - drop은 제외한다. PM이 drop에도 이 변환을 부르지만 그때
          //   view.state.selection은 drop 위치를 반영하지 않는다. 캐럿이 셀
          //   안이면 다른 위치 drop까지 정리해 codeBlock의 Tab을 지운다.
          // 같은 변환이 3번째 인자로 평문 요청을 기록한다(Issue #303). drop에도
          // 불리지만 drop은 handlePaste를 거치지 않아 기록하지 않는다.
          transformPasted: (slice, view, plain) => {
            if (dropInFlight) return slice;
            plainPasteRequested = plain;
            queueMicrotask(() => {
              plainPasteRequested = false;
            });
            return isInTable(view.state) &&
              !(view.state.selection instanceof CellSelection)
              ? sanitizeSliceInlineText(slice)
              : slice;
          },
          // drop 이벤트 처리 중에만 true다. PM은 drop 이벤트 안에서 slice를
          // 동기로 만든다. 같은 호출 스택이 끝나면 microtask가 내린다.
          handleDOMEvents: {
            drop: () => {
              dropInFlight = true;
              queueMicrotask(() => {
                dropInFlight = false;
              });
              return false;
            },
          },
          handlePaste: (view, event, slice) => {
            // 평문 요청을 가드보다 먼저 읽어 내린다(Issue #303). pasteText 재진입도
            // transformPasted를 다시 불러 요청을 켜므로 가드 뒤에서 읽으면 남는다.
            // 상수로 확정해 pasteHandler가 나중에 부른 defaultPasteHandler도 이
            // 붙여넣기의 요청을 따른다.
            const preferPlain = plainPasteRequested;
            plainPasteRequested = false;
            if (sanitizedPasteInFlight) return false;
            const clipboardData = event.clipboardData;
            const clipboard: PasteClipboard | null =
              clipboardData === null
                ? null
                : {
                    html: clipboardData.getData("text/html"),
                    text: clipboardData.getData("text/plain"),
                    plain: preferPlain,
                  };

            // 표 셀 안은 pasteHandler를 부르지 않는다(paste-plan.ts).
            const tableCellPlan = planTableCellPaste(
              view.state,
              clipboard,
              slice.size,
            );
            if (tableCellPlan !== null) {
              return runPastePlan(view, tableCellPlan, event);
            }

            // spec §10(IO-008) — 기본 처리 전체를 defaultPasteHandler로
            // 노출한다. pasteHandler가 undefined를 반환(기본 동작 위임)하면
            // 이 함수를 그대로 호출한다. 계획은 호출 시점의 state로 만든다.
            const defaultHandlePaste = (): boolean =>
              runPastePlan(
                view,
                planDefaultPaste(view.state, clipboard, {
                  createId,
                  ...(iframeEmbed === undefined ? {} : { iframeEmbed }),
                }),
                event,
              );

            if (pasteHandler === undefined || controllerFacade === undefined) {
              return defaultHandlePaste();
            }

            const result = pasteHandler({
              event,
              editor: controllerFacade,
              defaultPasteHandler: defaultHandlePaste,
            });
            if (result === undefined) return defaultHandlePaste();
            // true(처리됨)·false(취소) 둘 다 PM handlePaste 레벨에선 true를
            // 반환해야 한다 — false(취소)는 PM 기본 plain-text 붙여넣기까지
            // 억제해야 하므로 PM의 "위임" 신호(false)를 쓸 수 없다.
            return true;
          },

          // 여러 줄 text/plain drop을 drop 위치에 직접 삽입한다(Issue #285).
          // PM 기본 drop은 줄마다 문단 slice를 만들어 drop 위치 블록의 기존
          // 자식을 마지막 줄 블록으로 넘긴다. 배치는 붙여넣기와 같은 Enter
          // 분할 규칙이다(plain-text-paste.ts).
          // 아래 입력은 PM 기본(또는 미디어 확장)에 위임한다(false).
          // - 내부 드래그(view.dragging), 파일 동반, text/html 동반
          // - 정규화 뒤 한 줄인 평문
          // - 좌표를 못 푸는 위치, 줄을 놓을 수 없는 위치(표 셀·atom·블록
          //   사이). 위치를 보정하지 않는다.
          // 판정은 live view.state로 한다(G-EDT-002). drop은 현재 selection을
          // 지우지 않는다. 삽입 범위(drop 위치~마지막 줄 끝)를 선택한다. PM
          // 기본 drop과 같다.
          handleDrop: (view, event) => {
            if (view.dragging) return false;
            const dataTransfer = event.dataTransfer;
            if (dataTransfer === null) return false;
            if (dataTransfer.files.length > 0) return false;
            if (dataTransfer.getData("text/html").length > 0) return false;

            const lines = splitPlainTextLines(
              normalizePasteText(dataTransfer.getData("text/plain")),
            );
            if (lines.length < 2) return false;

            const coords = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            if (coords === null) return false;

            const dropTransaction = buildPlainMultilinePasteTransaction(
              view.state,
              lines,
              { position: coords.pos },
            );
            if (dropTransaction === null) return false;

            // paste meta를 달지 않는다. PM 기본 drop과 같은 uiEvent만 단다.
            dropTransaction
              .setSelection(
                TextSelection.create(
                  dropTransaction.doc,
                  coords.pos,
                  dropTransaction.selection.from,
                ),
              )
              .setMeta("uiEvent", "drop");
            view.dispatch(dropTransaction);
            view.focus();
            return true;
          },
        },
      }),
    ];
  },
});
