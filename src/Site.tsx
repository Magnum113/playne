import App from "./App";
import Hub from "./Hub";
import CircleGame from "./CircleGame";
import ColorfleGame from "./ColorfleGame";
import GuidePage from "./GuidePage";
import { guides } from "./guides";

export default function Site({ path }: { path: string }) {
  const route = path.replace(/\/index\.html$/, "/").replace(/\/?$/, "/");
  if (route === "/") return <Hub />;
  if (route === "/naglaz/") return <App />;
  if (route === "/circle/") return <CircleGame />;
  if (route === "/colorfle/") return <ColorfleGame />;
  if (route === "/guides/") return <GuidePage />;
  const guide = guides.find((g) => route === `/guides/${g.slug}/`);
  return guide ? <GuidePage slug={guide.slug} /> : <GuidePage notFound />;
}
