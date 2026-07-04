// ── Tweaks bridge: drives store variations from the host Tweaks panel ──
(function () {
  const h = React.createElement;
  const { useEffect } = React;

  function CCtweaks() {
    const app = window.useApp();
    const [t, setTweak] = window.useTweaks({ creationFlow: 'wizard', mapPins: 'teardrop', broadcast: 'speech' });
    useEffect(() => { app.setCreationStyle(t.creationFlow); }, [t.creationFlow]);
    useEffect(() => { app.setPinStyle(t.mapPins); }, [t.mapPins]);
    useEffect(() => { app.setBubbleStyle(t.broadcast); }, [t.broadcast]);

    return h(window.TweaksPanel, { title: 'Tweaks' },
      h(window.TweakSection, { label: 'Create event / place' }),
      h(window.TweakRadio, { label: 'Form layout', value: t.creationFlow, options: ['wizard', 'modal', 'side'], onChange: (v) => setTweak('creationFlow', v) }),
      h(window.TweakSection, { label: 'Map markers' }),
      h(window.TweakRadio, { label: 'Pin style', value: t.mapPins, options: ['teardrop', 'dot', 'glass'], onChange: (v) => setTweak('mapPins', v) }),
      h(window.TweakRadio, { label: 'Broadcast', value: t.broadcast, options: ['speech', 'tag', 'minimal'], onChange: (v) => setTweak('broadcast', v) }));
  }
  window.CCtweaks = CCtweaks;
})();
