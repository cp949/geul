import { createEmptyDocument } from "@cp949/geul-model";
import {
  DEFAULT_DICTIONARY,
  EditorContent,
  EditorProvider,
  SlashMenu,
} from "@cp949/geul-react";
import { useState } from "react";

// spec §8(EXT-009) 문서화 패턴 — DEFAULT_DICTIONARY를 스프레드해 필요한
// key만 override한다. 자동 딥 병합은 없으므로 override하는 네임스페이스
// (여기서는 slashMenu) 전체를 스프레드해야 형제 key(divider/file/...)가
// 사라지지 않는다.
const dictionary = {
  ...DEFAULT_DICTIONARY,
  slashMenu: {
    ...DEFAULT_DICTIONARY.slashMenu,
    table: { ...DEFAULT_DICTIONARY.slashMenu.table, label: "Grid" },
  },
};

const DictionaryOverrideExample = () => {
  const [initialDocument] = useState(() =>
    createEmptyDocument(() => "showcase-dictionary-override-block-1"),
  );

  return (
    <EditorProvider dictionary={dictionary} initialDocument={initialDocument}>
      <SlashMenu />
      <EditorContent />
    </EditorProvider>
  );
};

export default DictionaryOverrideExample;
