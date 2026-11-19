// Shape the public directories for the Explore cards, using the map's category groups.
(function () {
  function listingsFrom(app) {
    const rows = [];
    const add = (type, item) => {
      const group = window.MapV2Explore.groupOf(item);
      const category = window.ConnectChrome.GROUPS.find((g) => g.id === group);
      rows.push({
        id: item.id, type, group, groupLabel: category?.name || '', color: category?.hex || 'var(--accent)',
        title: item.title || item.name, detail: item.description || item.about || item.bio || '',
        location: item.location || item.address || '',
        image: window.UI.safeUrl(item.coverPhoto || item.profilePhoto || ''),
      });
    };
    app.events.filter((e) => !window.DATA.isPastEvent(e, Date.now())).forEach((item) => add('event', item));
    app.places.forEach((item) => add('place', item));
    app.contributors.forEach((item) => add('contributor', item));
    return rows;
  }
  window.ConnectPreviews = { listingsFrom };
})();
