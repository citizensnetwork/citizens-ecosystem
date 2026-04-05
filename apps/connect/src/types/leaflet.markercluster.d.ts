import "leaflet";

declare module "leaflet" {
  interface MarkerClusterGroupOptions {
    maxClusterRadius?: number;
    spiderfyOnMaxZoom?: boolean;
    showCoverageOnHover?: boolean;
    iconCreateFunction?: (cluster: MarkerCluster) => DivIcon | Icon;
  }

  interface MarkerCluster {
    getChildCount(): number;
  }

  class MarkerClusterGroup extends FeatureGroup {
    constructor(options?: MarkerClusterGroupOptions);
    addLayer(layer: Layer): this;
    removeLayer(layer: Layer): this;
    clearLayers(): this;
  }

  function markerClusterGroup(
    options?: MarkerClusterGroupOptions
  ): MarkerClusterGroup;
}
