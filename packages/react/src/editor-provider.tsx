import type { CreateEditorOptions, EditorController } from "@cp949/geul-core";
import { createEditor } from "@cp949/geul-core";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { EditorContext, EditorMountContext } from "./use-editor.js";

export type EditorProviderProps =
  | {
      children: ReactNode;
      editor: EditorController;
      initialDocument?: never;
      onChange?: never;
      onPasteRejected?: never;
      uploadFile?: never;
      onUploadStateChange?: never;
    }
  | {
      children: ReactNode;
      editor?: never;
      initialDocument: CreateEditorOptions["initialDocument"];
      onChange?: CreateEditorOptions["onChange"];
      onPasteRejected?: CreateEditorOptions["onPasteRejected"];
      // spec §4.1/§6.1 — 등록 여부(존재 vs undefined)는 initialDocument와
      // 같은 방식으로 마운트 시점에 고정한다(RD-003-DELTA-01.md "결정").
      // 런타임에 껐다 켰다 하는 것은 지원하지 않는다 — isUploadEnabled()가
      // 그 마운트 시점 값을 그대로 반영해야 File Panel Upload 탭 노출
      // 판정이 리렌더마다 흔들리지 않는다. 함수 자체(정체성)는 latest-ref로
      // 최신값을 따라간다(아래 latestUploadFile).
      uploadFile?: CreateEditorOptions["uploadFile"];
      onUploadStateChange?: CreateEditorOptions["onUploadStateChange"];
    };

export const EditorProvider = (props: EditorProviderProps) => {
  const latestOnChange = useRef<CreateEditorOptions["onChange"]>(undefined);
  const latestOnPasteRejected =
    useRef<CreateEditorOptions["onPasteRejected"]>(undefined);
  const latestUploadFile = useRef<CreateEditorOptions["uploadFile"]>(undefined);
  const latestOnUploadStateChange =
    useRef<CreateEditorOptions["onUploadStateChange"]>(undefined);
  if (props.editor === undefined) {
    latestOnChange.current = props.onChange;
    latestOnPasteRejected.current = props.onPasteRejected;
    latestUploadFile.current = props.uploadFile;
    latestOnUploadStateChange.current = props.onUploadStateChange;
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
      ownership: "internal",
    } as const;
  });
  const [internalEditor, setInternalEditor] = useState<EditorController | null>(
    null,
  );
  const [mountElement, setMountElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (configuration.ownership === "external") return;

    const controller = createEditor({
      initialDocument: configuration.initialDocument,
      onChange: (event) => latestOnChange.current?.(event),
      onPasteRejected: (reason) => latestOnPasteRejected.current?.(reason),
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
      <EditorMountContext.Provider
        value={{ element: mountElement, setElement: setMountElement }}
      >
        {props.children}
      </EditorMountContext.Provider>
    </EditorContext.Provider>
  );
};
