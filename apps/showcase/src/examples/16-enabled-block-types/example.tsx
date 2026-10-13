import { createEmptyDocument, type Document } from "@cp949/geul-model";
import { EditorContent, EditorProvider, SlashMenu } from "@cp949/geul-react";
import { useState } from "react";

// paragraph를 막은 두 번째 편집기의 초기 문서. heading 뒤 빈 bullet 둘이다.
// 빈 bullet의 Backspace·Enter가 종료 규칙(paragraph로 전환) 대신 일반 병합·분할을
// 타는지 브라우저에서 확인하는 용도다(Issue #411).
const createParagraphBlockedDocument = (): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [
    {
      id: "showcase-enabled-block-types-blocked-heading",
      type: "heading",
      level: 2,
      content: [{ text: "Heading" }],
    },
    {
      id: "showcase-enabled-block-types-blocked-bullet-1",
      type: "bulletListItem",
      content: [],
    },
    {
      id: "showcase-enabled-block-types-blocked-bullet-2",
      type: "bulletListItem",
      content: [],
    },
  ],
});

const EnabledBlockTypesExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-enabled-block-types-block-1"),
  );
  const [paragraphBlockedDocument] = useState(createParagraphBlockedDocument);

  return (
    <>
      <EditorProvider
        enabledBlockTypes={{ mode: "deny", types: ["table"] }}
        initialDocument={initialDocument}
      >
        <SlashMenu />
        <EditorContent />
      </EditorProvider>
      <EditorProvider
        enabledBlockTypes={{ mode: "deny", types: ["paragraph"] }}
        initialDocument={paragraphBlockedDocument}
      >
        <EditorContent />
      </EditorProvider>
    </>
  );
};

export default EnabledBlockTypesExample;
