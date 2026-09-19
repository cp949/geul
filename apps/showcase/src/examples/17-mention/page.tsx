import { ExamplePage } from "../../example-shell/example-page.js";
import MentionExample from "./example.js";
import exampleSource from "./example.tsx?raw";

const MentionPage = () => (
  <ExamplePage
    description="빈 줄에서 '@'를 입력하면 mention 후보 목록이 열린다. 계속 입력해 검색어를 좁히고, ↑/↓/Enter로 선택하거나 클릭하면 customInlineContent로 등록한 mention 노드가 삽입된다."
    source={exampleSource}
    title="Mention"
  >
    <MentionExample />
  </ExamplePage>
);

export default MentionPage;
