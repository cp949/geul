import type { CreateEditorOptions, EditorController } from "@cp949/geul-core";
import { createEditor } from "@cp949/geul-core";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  CodeBlockLanguagesProvider,
  type CodeBlockLanguageOption,
} from "./code-block-language-option.js";
import { EditorRevisionContext } from "./use-editor-revision.js";
import { EditorContext, EditorMountContext } from "./use-editor.js";

// commands/keyboardShortcuts 각각의 함수 값 타입(Record 값 하나) —
// latestCommands/latestKeyboardShortcuts ref와 wrapper 시그니처에서
// 반복 사용한다. `NonNullable`로 `| undefined`를 걷어내야 `[string]`
// 인덱스 타입 조회가 Record의 선언된 값 타입(Fn)만 돌려준다.
type CustomCommandFn = NonNullable<CreateEditorOptions["commands"]>[string];
type CustomKeyboardShortcutFn = NonNullable<
  CreateEditorOptions["keyboardShortcuts"]
>[string];

// spec §6(BLK-017), RD-002-DELTA-02(Issue #162) — `codeBlockLanguages`는
// 아래 discriminated union(editor 소유 여부)의 두 분기 모두에 공통으로
// 붙는 필드다. 다른 8개 옵션과 달리 `editor` 외부소유 분기에서
// `never`로 막지 않는다 — core 구성(`createEditor()`)에 전혀 관여하지
// 않는 순수 렌더 목록이라 소유 방식과 무관하게 유효하고, 콤보박스의
// 유일한 기존 test harness(`mount-editor.tsx`)도 예외 없이 외부소유
// 분기로 마운트한다(`RD-002.md` "## 결정" 참고). `(A | B) & C`로
// 구성해 `editor` discriminant로 좁히는 기존 narrowing은 그대로
// 유지한다.
export type EditorProviderProps = (
  | {
      children: ReactNode;
      editor: EditorController;
      initialDocument?: never;
      onChange?: never;
      onPasteRejected?: never;
      pasteHandler?: never;
      uploadFile?: never;
      onUploadStateChange?: never;
      customBlocks?: never;
      customInlineContent?: never;
      customStyles?: never;
      enabledBlockTypes?: never;
      commands?: never;
      keyboardShortcuts?: never;
      attributeOverrides?: never;
      dictionary?: never;
      syntaxHighlighter?: never;
    }
  | {
      children: ReactNode;
      editor?: never;
      initialDocument: CreateEditorOptions["initialDocument"];
      onChange?: CreateEditorOptions["onChange"];
      onPasteRejected?: CreateEditorOptions["onPasteRejected"];
      // spec §10(IO-008), RD-001-DELTA-02 — onPasteRejected와 동일 근거로
      // latest-ref threading한다(그릴링 결정, roadmap.md).
      pasteHandler?: CreateEditorOptions["pasteHandler"];
      // spec §4.1/§6.1 — 등록 여부(존재 vs undefined)는 initialDocument와
      // 같은 방식으로 마운트 시점에 고정한다(RD-003-DELTA-01.md "결정").
      // 런타임에 껐다 켰다 하는 것은 지원하지 않는다 — isUploadEnabled()가
      // 그 마운트 시점 값을 그대로 반영해야 File Panel Upload 탭 노출
      // 판정이 리렌더마다 흔들리지 않는다. 함수 자체(정체성)는 latest-ref로
      // 최신값을 따라간다(아래 latestUploadFile).
      uploadFile?: CreateEditorOptions["uploadFile"];
      onUploadStateChange?: CreateEditorOptions["onUploadStateChange"];
      // spec §4.4(EXT-001~004) — PM 스키마는 core.createEditor() 호출
      // 시점에 정적으로 고정된다(model-to-tiptap.ts, "마운트 이후 동적
      // 스키마 변경은 시도하지 않는다"). initialDocument와 동일하게 마운트
      // 시점 값만 읽는다 — latest-ref 대상이 아니다.
      customBlocks?: CreateEditorOptions["customBlocks"];
      customInlineContent?: CreateEditorOptions["customInlineContent"];
      customStyles?: CreateEditorOptions["customStyles"];
      enabledBlockTypes?: CreateEditorOptions["enabledBlockTypes"];
      // spec §5(EXT-005), 01-계획.md "## 결정" 1 — 혼합 패턴: 등록 key
      // 집합(Object.keys)은 uploadFile의 "존재 여부"와 같은 방식으로
      // 마운트 시점에 고정하고, 각 key의 함수 본체는 latest-ref로
      // 최신값을 따라간다. "## 결정" 2 — 마운트 후 key를 추가·제거해도
      // 조용히 무시된다(경고 없음): 추가된 key는 core에 애초에 등록되지
      // 않고, 제거된 key는 마지막으로 관측된 함수 본체를 계속 쓴다(아래
      // latestCommands/latestKeyboardShortcuts).
      commands?: CreateEditorOptions["commands"];
      keyboardShortcuts?: CreateEditorOptions["keyboardShortcuts"];
      // spec §7(EXT-008) — attributeOverrides.editor는 Tiptap
      // editorProps.attributes로, blockContainer/blockGroup는
      // renderHTML로 각각 에디터 생성 시점에 배선된다(core 계약).
      // customBlocks 등과 같은 이유로 마운트 시점 값만 읽는다.
      attributeOverrides?: CreateEditorOptions["attributeOverrides"];
      // spec §8(EXT-009) — customBlocks 등과 같은 이유로 마운트 시점 값만
      // 읽는다(dictionary는 core PM 스키마 급으로 생성 시점에 고정되는
      // 계약, RD-001.md "결정"). latest-ref 대상이 아니다.
      dictionary?: CreateEditorOptions["dictionary"];
      // spec §3(BLK-017), RD-002-DELTA-01 — core의
      // CodeBlockHighlightExtension이 이 함수를 addProseMirrorPlugins()
      // 호출 시점에 한 번 캡처해 클로저에 담는다(코어 안에 latest-ref
      // 래퍼가 없다) — customBlocks 등과 같은 이유로 마운트 시점 값만
      // 읽는다. `RD-002.md` "## 결정" 참고.
      syntaxHighlighter?: CreateEditorOptions["syntaxHighlighter"];
    }
) & {
  // 위 주석 참고 — 두 분기 공통. reactive threading(마운트 고정 아님,
  // `RD-002.md` "## 결정")이라 `configuration`을 거치지 않고
  // `EditorProvider` 본문이 매 렌더 `props.codeBlockLanguages`를 직접
  // 읽는다.
  codeBlockLanguages?: readonly CodeBlockLanguageOption[];
};

export const EditorProvider = (props: EditorProviderProps) => {
  const latestOnChange = useRef<CreateEditorOptions["onChange"]>(undefined);
  const latestOnPasteRejected =
    useRef<CreateEditorOptions["onPasteRejected"]>(undefined);
  const latestPasteHandler =
    useRef<CreateEditorOptions["pasteHandler"]>(undefined);
  const latestUploadFile = useRef<CreateEditorOptions["uploadFile"]>(undefined);
  const latestOnUploadStateChange =
    useRef<CreateEditorOptions["onUploadStateChange"]>(undefined);
  // commands/keyboardShortcuts: key별 최신 함수 본체. 마운트 시 관측된
  // key(아래 configuration.commandKeys/keyboardShortcutKeys)만 wrapper가
  // 읽는다 — 마운트 후 추가된 key를 여기 써 넣어도 아무 wrapper도 읽지
  // 않는다("## 결정" 2, 회귀 테스트로 고정). 제거된 key는 다음 루프에서
  // 갱신되지 않아 마지막 값을 그대로 유지한다.
  const latestCommands = useRef<Record<string, CustomCommandFn>>({});
  const latestKeyboardShortcuts = useRef<
    Record<string, CustomKeyboardShortcutFn>
  >({});
  if (props.editor === undefined) {
    latestOnChange.current = props.onChange;
    latestOnPasteRejected.current = props.onPasteRejected;
    latestPasteHandler.current = props.pasteHandler;
    latestUploadFile.current = props.uploadFile;
    latestOnUploadStateChange.current = props.onUploadStateChange;
    for (const [key, fn] of Object.entries(props.commands ?? {})) {
      latestCommands.current[key] = fn;
    }
    for (const [key, fn] of Object.entries(props.keyboardShortcuts ?? {})) {
      latestKeyboardShortcuts.current[key] = fn;
    }
  }

  const [configuration] = useState(() => {
    if (props.editor !== undefined) {
      return { ownership: "external" } as const;
    }
    return {
      initialDocument: props.initialDocument,
      // uploadFile "등록 여부"만 고정한다 — 실제 호출은 항상
      // latestUploadFile.current를 거쳐 최신 함수로 간다.
      uploadEnabled: props.uploadFile !== undefined,
      customBlocks: props.customBlocks,
      customInlineContent: props.customInlineContent,
      customStyles: props.customStyles,
      enabledBlockTypes: props.enabledBlockTypes,
      attributeOverrides: props.attributeOverrides,
      dictionary: props.dictionary,
      syntaxHighlighter: props.syntaxHighlighter,
      // "## 결정" 1 — 등록 key 집합만 마운트 시 고정한다. 함수 본체는
      // latestCommands/latestKeyboardShortcuts를 거쳐 최신값으로 간다.
      commandKeys:
        props.commands === undefined ? undefined : Object.keys(props.commands),
      keyboardShortcutKeys:
        props.keyboardShortcuts === undefined
          ? undefined
          : Object.keys(props.keyboardShortcuts),
      ownership: "internal",
    } as const;
  });
  const [internalEditor, setInternalEditor] = useState<EditorController | null>(
    null,
  );
  const [mountElement, setMountElement] = useState<HTMLElement | null>(null);
  // Issue #141 — 내부 전용 document-change 알림(use-editor-revision.ts).
  // "internal" ownership에서만 갱신된다("external"은 아래 useEffect가 즉시
  // return해 이 state를 건드리지 않는다) — 그 경로는 EditorProvider가
  // 애초에 컨트롤러를 만들지 않아 onChange를 배선할 수 없다(같은 파일
  // 위 import 주석 참고).
  const [documentRevision, setDocumentRevision] = useState(0);

  useEffect(() => {
    if (configuration.ownership === "external") return;

    const controller = createEditor({
      initialDocument: configuration.initialDocument,
      onChange: (event) => {
        latestOnChange.current?.(event);
        setDocumentRevision(event.revision);
      },
      onPasteRejected: (reason) => latestOnPasteRejected.current?.(reason),
      pasteHandler: (context) => latestPasteHandler.current?.(context),
      onUploadStateChange: (blockId, state) =>
        latestOnUploadStateChange.current?.(blockId, state),
      ...(configuration.uploadEnabled
        ? {
            uploadFile: (file: File, signal: AbortSignal) => {
              const fn = latestUploadFile.current;
              // 마운트 뒤 prop이 undefined로 사라지는 이례적 사용에 대한
              // 방어 — 세션이 콜백 응답을 영원히 기다리지 않도록 취소로
              // 흡수한다(uploadEnabled는 마운트 시점에 고정돼 이 분기
              // 자체는 정상 경로에서 거의 밟히지 않는다).
              return fn === undefined
                ? Promise.resolve({ status: "cancelled" } as const)
                : fn(file, signal);
            },
          }
        : {}),
      // exactOptionalPropertyTypes(tsconfig.base.json) 아래 옵셔널 필드에
      // 값 자체가 아니라 `undefined`를 직접 대입할 수 없다 — 지정하지
      // 않았으면 필드 자체를 아예 생략한다(uploadFile 분기와 같은 패턴).
      ...(configuration.customBlocks === undefined
        ? {}
        : { customBlocks: configuration.customBlocks }),
      ...(configuration.customInlineContent === undefined
        ? {}
        : { customInlineContent: configuration.customInlineContent }),
      ...(configuration.customStyles === undefined
        ? {}
        : { customStyles: configuration.customStyles }),
      ...(configuration.enabledBlockTypes === undefined
        ? {}
        : { enabledBlockTypes: configuration.enabledBlockTypes }),
      ...(configuration.attributeOverrides === undefined
        ? {}
        : { attributeOverrides: configuration.attributeOverrides }),
      ...(configuration.dictionary === undefined
        ? {}
        : { dictionary: configuration.dictionary }),
      ...(configuration.syntaxHighlighter === undefined
        ? {}
        : { syntaxHighlighter: configuration.syntaxHighlighter }),
      ...(configuration.commandKeys === undefined
        ? {}
        : {
            // key 집합은 위에서 고정한 configuration.commandKeys뿐이다 —
            // 마운트 후 latestCommands에 새 key가 생겨도 여기 없으므로
            // core에 절대 등록되지 않는다. 각 key의 실제 실행은 항상
            // latestCommands.current[key]를 거쳐 최신 함수 본체로 간다.
            commands: Object.fromEntries(
              configuration.commandKeys.map(
                (key): [string, CustomCommandFn] => [
                  key,
                  (editor, ...args) =>
                    latestCommands.current[key]?.(editor, ...args) ?? {
                      // 마운트 시점에 있던 key가 이후 제거돼 함수 본체를
                      // 한 번도 못 읽은 경우의 방어(uploadFile의 취소
                      // 흡수와 동일 취지) — forward-only 갱신 루프(위)가
                      // key를 지우지 않으므로 정상 경로에서는 밟히지
                      // 않는다.
                      ok: true,
                      value: undefined,
                    },
                ],
              ),
            ),
          }),
      ...(configuration.keyboardShortcutKeys === undefined
        ? {}
        : {
            keyboardShortcuts: Object.fromEntries(
              configuration.keyboardShortcutKeys.map(
                (key): [string, CustomKeyboardShortcutFn] => [
                  key,
                  (editor) =>
                    // false: PM keymap 표준 폴스루로 내장 shortcut이
                    // 이어서 실행된다(core 계약) — 방어 분기의 자연스러운
                    // "처리 안 함" 신호라 commands처럼 별도 fallback 값을
                    // 만들 필요가 없다.
                    latestKeyboardShortcuts.current[key]?.(editor) ?? false,
                ],
              ),
            ),
          }),
    });
    setInternalEditor(controller);
    return () => controller.destroy();
  }, [configuration]);

  const controller =
    configuration.ownership === "external"
      ? (props.editor ?? null)
      : internalEditor;
  if (controller === null) return null;

  return (
    <EditorContext.Provider value={controller}>
      <EditorRevisionContext.Provider value={documentRevision}>
        <EditorMountContext.Provider
          value={{ element: mountElement, setElement: setMountElement }}
        >
          <CodeBlockLanguagesProvider value={props.codeBlockLanguages}>
            {props.children}
          </CodeBlockLanguagesProvider>
        </EditorMountContext.Provider>
      </EditorRevisionContext.Provider>
    </EditorContext.Provider>
  );
};
