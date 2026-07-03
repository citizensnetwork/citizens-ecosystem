// ── root mount ──
(function () {
  function App() {
    return React.createElement(window.AppProvider, null, React.createElement(window.Shell));
  }
  window.App = App;
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(App));
})();
