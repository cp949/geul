import type { IdFactory } from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { NodeSelection, Plugin } from "@tiptap/pm/state";

import { finalizeAndDispatch } from "./dispatch.js";
import { insertMediaBlock as insertMediaBlockCommand } from "./media-commands.js";
import { detectMediaBlockKind, filterUploadableFiles } from "./media-drop-paste-detection.js";
import type { MediaBlockKind } from "./media-block-kind.js";

// spec §5.2 — File drop/paste가 media 블록을 만드는 신규 확장(RD-002
// DELTA-01, roadmap `_works/roadmap/RD-002.md`). ClipboardPasteExtension·
// TablePasteExtension과 나란히 배선하되(production-editor-assembly.ts),
// session을 참조하지 않고 this.editor로 직접 트랜잭션을 낸다 —
// ProductionEditorSession.onTiptapUpdate의 activeReason===null 분기가
// session 우회 dispatch도 "local" 변경으로 커밋한다(readiness probe 확인
// 사실, RD-002.md "진입 조건"). 실제 업로드 콜백 호출은 이 확장의 책임이
// 아니다(DELTA-02) — 여기서 만든 media 블록은 항상 url: null로 남는다.

export type MediaDropPasteOptions = {
  createId: IdFactory;
  // uploadFile 콜백 등록 여부는 세션 생애주기 동안 불변이라(재설정 API
  // 없음) getBlockSelection류 live-closure가 필요 없다 — createProductionEditor
  // 생성 시점에 계산한 정적 boolean 하나로 충분하다(production-editor-session.ts
  // ::createTiptapEditor()가 계산해 넘긴다).
  isUploadEnabled: boolean;
  // RD-002 DELTA-02 — 삽입한 media 블록마다 실제 업로드를 트리거하는
  // 세션 클로저(production-editor-session.ts::createTiptapEditor()가
  // session.uploadMediaFile을 fire-and-forget으로 감싸 넘긴다). 이
  // 확장은 반환값을 기다리지 않는다 — isUploadEnabled===false면 이
  // 옵션이 호출되는 코드 경로 자체에 도달하지 않는다(두 핸들러 모두
  // 파일 존재 확인 전에 게이트에서 이미 return false).
  triggerMediaUpload: (blockId: string, file: File) => void;
};

type InsertOutcome = { blockId: string } | null;

/**
 * $pos에서 가장 가까운 조상 중 주어진 node 타입 이름을 가진 노드를 찾는다.
 * table 바이패스(D1)와 blockContainer 판정(빈 paragraph 교체·삽입 위치)
 * 양쪽에서 같은 "조상 훑기" 골격을 쓰므로 이름만 매개변수화해 공유한다.
 */
const findAncestor = (
  $pos: ResolvedPos,
  typeName: string,
): { position: number; node: ProseMirrorNode } | null => {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === typeName) {
      return { position: $pos.before(depth), node };
    }
  }
  return null;
};

// blockContainer의 첫 자식이 내용 없는 paragraph인지 판정한다(paste 전용
// "빈 paragraph 교체" 규칙). CodeBlock(D5)은 첫 자식 타입이 항상
// "codeBlock"이라 이 판정에서 자연히 false가 되어 별도 분기 없이 일반
// 규칙(삽입)을 탄다.
const isEmptyParagraphContainer = (container: ProseMirrorNode): boolean => {
  const first = container.firstChild;
  return (
    first !== null && first.type.name === "paragraph" && first.content.size === 0
  );
};

// media 노드를 position 자리에 새로 삽입한다(insertMediaBlock의 afterBlockId
// 조회 없이 이미 해석해 둔 raw position에 직접 넣는다 — table 뒤·blockContainer
// 앞/뒤 모두 이 하나의 함수로 표현된다). 거절되면(TRANSACTION_REJECTED, 희귀)
// null을 반환해 체이닝을 멈추게 한다.
const insertMediaAt = (
  editor: Editor,
  position: number,
  kind: MediaBlockKind,
  createId: IdFactory,
): InsertOutcome => {
  const mediaType = editor.schema.nodes[kind];
  if (mediaType === undefined) {
    throw new TypeError(
      `${kind} 노드 타입이 스키마에 없다 — createProductionEditor가 확장 등록을 보장한다`,
    );
  }
  const blockId = createId();
  const mediaNode = mediaType.create({ blockId });
  const transaction = editor.state.tr.insert(position, mediaNode);
  transaction.setSelection(NodeSelection.create(transaction.doc, position));
  const dispatched = finalizeAndDispatch(editor, transaction);
  return dispatched.ok ? { blockId } : null;
};

// blockContainer 전체(paragraph 포함)를 media 노드로 교체한다(paste 전용
// "빈 paragraph 교체" 규칙). insertMediaAt과 달리 대상 range를 지우고 그
// 자리에 media 노드를 넣는다 — 교체 뒤에는 빈 paragraph가 남지 않는다.
const replaceWithMedia = (
  editor: Editor,
  position: number,
  nodeSize: number,
  kind: MediaBlockKind,
  createId: IdFactory,
): InsertOutcome => {
  const mediaType = editor.schema.nodes[kind];
  if (mediaType === undefined) {
    throw new TypeError(
      `${kind} 노드 타입이 스키마에 없다 — createProductionEditor가 확장 등록을 보장한다`,
    );
  }
  const blockId = createId();
  const mediaNode = mediaType.create({ blockId });
  const transaction = editor.state.tr.replaceWith(
    position,
    position + nodeSize,
    mediaNode,
  );
  transaction.setSelection(NodeSelection.create(transaction.doc, position));
  const dispatched = finalizeAndDispatch(editor, transaction);
  return dispatched.ok ? { blockId } : null;
};

// D2 다중 파일 체이닝 — 첫 파일 이후는 항상 "직전 반환 blockId 뒤에 삽입"만
// 반복한다(기존 insertMediaBlock, session 무관). 앞선 삽입이 거절되면(희귀)
// 더 이상 유효한 anchor가 없으므로 남은 파일을 조용히 포기한다. 삽입이
// 성공한 파일마다(RD-002 DELTA-02) triggerUpload(blockId, file)을 그
// 자리에서 바로 호출한다 — 다음 파일의 anchor 삽입 실패와 무관하게 이미
// 성공한 블록은 업로드를 시작해야 한다.
const chainRemainingFiles = (
  editor: Editor,
  createId: IdFactory,
  files: readonly File[],
  first: InsertOutcome,
  triggerUpload: (blockId: string, file: File) => void,
): void => {
  let previous = first;
  for (let index = 1; index < files.length; index += 1) {
    if (previous === null) return;
    const file = files[index];
    if (file === undefined) continue;
    const result = insertMediaBlockCommand(
      editor,
      previous.blockId,
      detectMediaBlockKind(file),
      createId,
    );
    previous = result.ok ? result.value : null;
    if (result.ok) triggerUpload(result.value.blockId, file);
  }
};

// D1 표 바이패스 — paste·drop 공통. 대상이 표 셀 안(임의 깊이)이면 좌표·빈
// 문단 판정 없이 그 표 블록 바로 뒤에 삽입한다.
const resolveTableBypass = ($pos: ResolvedPos): { position: number } | null => {
  const table = findAncestor($pos, "table");
  return table === null ? null : { position: table.position + table.node.nodeSize };
};

type PasteTarget =
  | { mode: "insert"; position: number }
  | { mode: "replace"; position: number; nodeSize: number };

// paste 전용 위치 판정 — 좌표가 없어 "빈 paragraph면 교체, 아니면 뒤에
// 삽입"으로 가른다(spec §5.2 불릿 1·2). drop과 별개 규칙이다(RD-002.md
// "결정" — spec §5.2 재독해, 3개 불릿은 paste/drop 각자의 규칙이지 하나가
// 아니다).
const resolvePasteTarget = ($pos: ResolvedPos): PasteTarget => {
  const bypass = resolveTableBypass($pos);
  if (bypass !== null) return { mode: "insert", position: bypass.position };

  const container = findAncestor($pos, "blockContainer");
  if (container === null) return { mode: "insert", position: $pos.pos };

  return isEmptyParagraphContainer(container.node)
    ? { mode: "replace", position: container.position, nodeSize: container.node.nodeSize }
    : { mode: "insert", position: container.position + container.node.nodeSize };
};

// drop 전용 위치 판정 — F2(기존 block-side-menu.tsx의 `clientY < rect.top +
// rect.height / 2` 공식 재사용)로 대상 blockContainer 앞/뒤를 정한다. 빈
// paragraph여도 교체하지 않는다(spec §5.2 불릿 3 — drop은 좌표만 쓴다).
const resolveDropTarget = (
  view: { nodeDOM: (pos: number) => Node | null },
  $pos: ResolvedPos,
  clientY: number,
): { position: number } => {
  const bypass = resolveTableBypass($pos);
  if (bypass !== null) return bypass;

  const container = findAncestor($pos, "blockContainer");
  if (container === null) return { position: $pos.pos };

  const dom = view.nodeDOM(container.position);
  const rect = dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;
  const before = rect !== null && clientY < rect.top + rect.height / 2;
  return {
    position: before ? container.position : container.position + container.node.nodeSize,
  };
};

// D7 range selection 삭제 — paste 전용(handlePaste에서만 호출). paste는
// selection 자체가 대상이라 위치 판정 전에 먼저 지운다. drop은 좌표가
// 대상을 정하므로 호출하지 않는다 — 드롭과 무관한 곳의 selection을 지우는
// 부작용을 막는다. 표 셀 선택은 D1 표 바이패스가 이미 흡수한다(선택이 셀
// 안이면 resolveTableBypass가 먼저 잡아 이 삭제와 무관하게 표 뒤로 간다).
const deleteNonEmptySelection = (editor: Editor): void => {
  if (!editor.state.selection.empty) {
    editor.commands.deleteSelection();
  }
};

// D8 디렉터리 필터 입력 조립 — dataTransfer.items(webkitGetAsEntry)가 있으면
// 그 판정을 쓰고, 없거나 비어 있으면(구형·비표준 환경) dataTransfer.files로
// 최선노력 폴백해 전부 파일로 취급한다. filterUploadableFiles(RD-001)가
// 실제 디렉터리 제외를 수행한다 — 이 함수는 판정된 isDirectory만 조립한다.
const collectDropEntries = (
  dataTransfer: DataTransfer,
): { file: File; isDirectory: boolean }[] => {
  const items = dataTransfer.items;
  if (items.length > 0) {
    const entries: { file: File; isDirectory: boolean }[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item === undefined || item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file === null) continue;
      const asEntry =
        typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
      entries.push({ file, isDirectory: asEntry?.isDirectory === true });
    }
    return entries;
  }
  return Array.from(dataTransfer.files).map((file) => ({ file, isDirectory: false }));
};

export const MediaDropPasteExtension = Extension.create<MediaDropPasteOptions>({
  name: "mediaDropPaste",

  addOptions() {
    return {
      createId: () => {
        throw new Error("MediaDropPasteExtension requires a createId option");
      },
      isUploadEnabled: false,
      triggerMediaUpload: () => {
        // isUploadEnabled===false 경로에서만 도달 가능한 기본값이라(위
        // MediaDropPasteOptions 주석) 실제로 호출되지 않는다 — no-op.
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const createId = this.options.createId;
    const isUploadEnabled = this.options.isUploadEnabled;
    const triggerUpload = this.options.triggerMediaUpload;

    return [
      new Plugin({
        props: {
          // spec §4 "drag/drop·paste의 파일 페이로드는 무시한다"(IO-007 own
          // 경계) — 업로드 콜백 미등록이면 파일 존재 여부조차 보기 전에
          // false를 반환해, 파일이 실제로 있어도 기존 Table/ClipboardPaste
          // 확장이 파일이 아예 없었던 것처럼 나머지 clipboard 데이터를
          // 그대로 처리한다.
          handlePaste: (_view, event) => {
            if (!isUploadEnabled) return false;
            const clipboardData = event.clipboardData;
            if (clipboardData === null) return false;
            const files = Array.from(clipboardData.files);
            if (files.length === 0) return false;

            deleteNonEmptySelection(editor);
            const $pos = editor.state.selection.$from;
            const target = resolvePasteTarget($pos);
            const firstFile = files[0];
            if (firstFile === undefined) return true;
            const firstKind = detectMediaBlockKind(firstFile);
            const first =
              target.mode === "replace"
                ? replaceWithMedia(editor, target.position, target.nodeSize, firstKind, createId)
                : insertMediaAt(editor, target.position, firstKind, createId);
            if (first !== null) triggerUpload(first.blockId, firstFile);
            chainRemainingFiles(editor, createId, files, first, triggerUpload);
            return true;
          },
          handleDrop: (view, event) => {
            if (!isUploadEnabled) return false;
            const dataTransfer = event.dataTransfer;
            if (dataTransfer === null) return false;
            const files = filterUploadableFiles(collectDropEntries(dataTransfer));
            if (files.length === 0) return false;

            // D7은 paste 전용이다 — drop 대상은 좌표가 정하므로 현재
            // selection(드롭 지점과 무관한 곳에 있을 수 있다)을 건드리지
            // 않는다. paste는 selection 자체가 대상이라 여기서 지운다(위
            // handlePaste), drop에서 지우면 드롭과 무관한 다른 위치의
            // selection이 사라지는 부작용이 된다.
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (coords === null) return false;
            const $pos = editor.state.doc.resolve(coords.pos);
            const target = resolveDropTarget(view, $pos, event.clientY);
            const firstFile = files[0];
            if (firstFile === undefined) return true;
            const first = insertMediaAt(
              editor,
              target.position,
              detectMediaBlockKind(firstFile),
              createId,
            );
            if (first !== null) triggerUpload(first.blockId, firstFile);
            chainRemainingFiles(editor, createId, files, first, triggerUpload);
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});
