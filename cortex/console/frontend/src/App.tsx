import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import { Layout, ViewId } from "./Layout";
import { useBrokerEvents } from "./hooks/useBrokerEvents";
import { useBrokerMetrics } from "./hooks/useBrokerMetrics";
import { FabricOverview } from "./views/FabricOverview";
import { ArticleFeed } from "./views/ArticleFeed";
import { ArticleDetail } from "./views/ArticleDetail";
import { ProvenanceGraph } from "./views/ProvenanceGraph";
import { ScopeFilter } from "./views/ScopeFilter";
import { BenchPanel } from "./views/BenchPanel";
import { AttackMatrix } from "./views/AttackMatrix";

function wsUrl(path: string): string {
  if (typeof window === "undefined") return "";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

const PATH_TO_VIEW: Record<string, ViewId> = {
  "/": "overview",
  "/feed": "feed",
  "/provenance": "provenance",
  "/scope": "scope",
  "/bench": "bench",
  "/attack": "attack",
};

const VIEW_TO_PATH: Record<ViewId, string> = {
  overview: "/",
  feed: "/feed",
  detail: "/feed",
  provenance: "/provenance",
  scope: "/scope",
  bench: "/bench",
  attack: "/attack",
};

function HomePage({ articles, events }: { articles: any[]; events: any[] }) {
  const navigate = useNavigate();
  return (
    <FabricOverview
      tenants={[{ slug: "soc-alpha" }, { slug: "soc-beta" }]}
      events={events}
    />
  );
}

function FeedPage({ articles, onSelect }: { articles: any[]; onSelect: (id: string) => void }) {
  return <ArticleFeed articles={articles} onSelect={onSelect} />;
}

function DetailPage({ articles }: { articles: any[] }) {
  const { id } = useParams();
  const article = articles.find(a => a.id === id) || null;
  return (
    <ArticleDetail
      articleId={id || ""}
      article={article}
      fetchArticle={async (aid: string) => {
        const found = articles.find(a => a.id === aid);
        if (found) return found;
        // Wait briefly for WebSocket replay to deliver the article
        await new Promise(r => setTimeout(r, 2000));
        return articles.find(a => a.id === aid) || { id: aid, type: "finding", content: aid || "Loading...", payload: {} };
      }}
    />
  );
}

export function App() {
  const navigate = useNavigate();
  const location = window.location.pathname;
  const currentView = PATH_TO_VIEW[location] || "overview";
  const events = useBrokerEvents(wsUrl("/ws/events"));
  const metrics = useBrokerMetrics(wsUrl("/ws/metrics"));

  const handleNavigate = (view: ViewId) => navigate(VIEW_TO_PATH[view]);

  const articles = events.articles;

  return (
    <Layout current={currentView} onNavigate={handleNavigate} connected={events.connected}>
      <Routes>
        <Route path="/" element={<HomePage articles={articles} events={eventsToOverview(articles)} />} />
        <Route path="/feed" element={<FeedPage articles={articles} onSelect={(id) => navigate(`/article/${id}`)} />} />
        <Route path="/article/:id" element={<DetailPage articles={articles} />} />
        <Route path="/provenance" element={<ProvenanceGraph articles={articles} />} />
        <Route path="/scope" element={<ScopeFilter articles={articles} />} />
        <Route path="/bench" element={<BenchPanel byNode={metrics.byNode} />} />
        <Route path="/attack" element={
          <AttackMatrix
            counts={buildCounts(articles)}
            articlesFor={(id) => articles.filter(a => a.payload?.attack_id === id).map(a => ({ id: a.id, content: a.content }))}
          />
        } />
      </Routes>
    </Layout>
  );
}

function eventsToOverview(articles: any[]) {
  return articles.map(a => ({
    event: "article.published",
    data: { article: a, route: { from: "soc-alpha", to: "soc-beta" } },
  }));
}

function buildCounts(articles: any[]) {
  const c: Record<string, number> = {};
  for (const a of articles)
    if (a.type === "finding" && a.payload?.attack_id)
      c[a.payload.attack_id] = (c[a.payload.attack_id] ?? 0) + 1;
  return c;
}

export default App;
