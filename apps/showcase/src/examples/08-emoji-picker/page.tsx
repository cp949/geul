import { ExamplePage } from "../../example-shell/example-page.js";
import EmojiPickerExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const EmojiPickerPage = () => (
  <ExamplePage
    description="빈 줄에서 ':'를 입력하면 이모지 피커가 열린다. 계속 입력해 검색어를 좁혀 보라."
    source={exampleSource}
    title="Emoji picker"
  >
    <EmojiPickerExample />
  </ExamplePage>
);

export default EmojiPickerPage;
