// ════════════════════════════════════════════════════════════════════
//  Citizens Vision — root: session gate → Login | Shell + view router
// ════════════════════════════════════════════════════════════════════
(() => {
  const S = window.Screens;

  function App() {
    const auth = window.CV_STORE.useSession();
    const [view, setView] = React.useState("home");
    const [metric, setMetric] = React.useState("reach");
    const [filter, setFilter] = React.useState(undefined);
    const [theme, setTheme] = React.useState("light");
    const [depth, setDepth] = React.useState("basic");
    const [navHidden, setNavHidden] = React.useState({});

    React.useEffect(() => {
      document.documentElement.setAttribute("data-theme", theme === "noir" ? "noir" : "light");
    }, [theme]);

    const goView = React.useCallback((v, m, f) => {
      setView(v);
      setMetric(m !== undefined ? m : "reach");
      setFilter(f);
    }, []);

    if (auth.status === "loading") {
      return (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="spin" style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "3px solid var(--surface-sunk)", borderTopColor: "var(--brand)",
          }} />
        </div>
      );
    }

    if (auth.status !== "signedIn") {
      return <S.Login onDemo={auth.enterDemo} />;
    }

    const content =
      view === "home" ? <S.Home /> :
      view === "spaces" ? <S.Spaces goView={goView} filter={filter} /> :
      view === "configureSpaces" ? <S.ConfigureSpaces /> :
      view === "activities" ? <S.Activities /> :
      view === "timeline" ? <S.TimelineMap /> :
      view === "feed" ? <S.Feed /> :
      view === "analytics" ? <S.Analytics metric={metric} goView={goView} /> :
      view === "coverage" ? <S.Coverage /> :
      view === "advisories" ? <S.Advisories /> :
      view === "reports" ? <S.Reports /> :
      view === "objectives" ? <S.Objectives /> :
      view === "projects" ? <S.Projects /> :
      view === "visionStatements" ? <S.VisionStatements /> :
      view === "settings" ? (
        <S.Settings theme={theme} setTheme={setTheme}
          navHidden={navHidden} setNavHidden={setNavHidden}
          navTree={window.CV_NAV_TREE} />
      ) : <S.Home />;

    return (
      <S.Shell session={auth.session} view={view} metric={metric} filter={filter}
        goView={goView} theme={theme} setTheme={setTheme}
        navHidden={navHidden} setNavHidden={setNavHidden}
        depth={depth} setDepth={setDepth} onSignOut={auth.signOut}>
        {content}
      </S.Shell>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(<App />);
})();
