import { createEmptyDocument } from "@cp949/geul-model";
import {
  EditorContent,
  EditorProvider,
  SlashMenu,
  type SlashMenuCustomItem,
} from "@cp949/geul-react";
import { useMemo, useState } from "react";

const SlashMenuExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-slash-menu-block-1"),
  );
  const [message, setMessage] = useState("");

  const customItems = useMemo<SlashMenuCustomItem[]>(
    () => [
      {
        id: "showcase-say-hello",
        label: "Say hello",
        description: "Show a friendly message",
        onSelect: () => setMessage("커스텀 슬래시 아이템이 실행됐다."),
      },
    ],
    [],
  );

  return (
    <EditorProvider initialDocument={initialDocument}>
      <SlashMenu items={customItems} />
      <EditorContent />
      <p role="status">{message}</p>
    </EditorProvider>
  );
};

export default SlashMenuExample;
