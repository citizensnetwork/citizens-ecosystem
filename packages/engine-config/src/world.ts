/**
 * A world: one checked configuration, ready to answer the questions the app asks.
 *
 * This file imports no validation library, so the browser app can use it without carrying the
 * schema. It expects documents that `validateConfiguration` has already accepted; it does not
 * re-check them. As a second guard it still drops any feature the entitlements do not allow.
 */

import { FEATURE_KEYS, featureAvailableOn, type FeatureKey } from './features';
import {
  componentDefinition,
  type ComponentKey,
  controlDefinition,
  type ControlKey,
} from './registry';
import type { Configuration, Entitlements } from './schema';
import { themeCssVariables, type ColorScheme } from './theme';
import {
  MESSAGE_KEYS,
  messageDefinition,
  parseTemplate,
  renderParts,
  resolveAddressWords,
  resolveTerms,
  termForm,
  type AddressWordKey,
  type MessageKey,
  type MessageRenderer,
  type ResolvedAddressWords,
  type ResolvedTerms,
  type TemplatePart,
  type TermForm,
  type TermKey,
} from './vocabulary';

/** The home-screen app file (web manifest) a world serves. */
export interface WebManifest {
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly start_url: string;
  readonly display: string;
  readonly background_color: string;
  readonly theme_color: string;
  readonly orientation: string;
  readonly categories: readonly string[];
  readonly icons: readonly {
    readonly src: string;
    readonly sizes: string;
    readonly type: string;
    readonly purpose: string;
  }[];
}

export interface World {
  readonly configuration: Configuration;
  /** The features that are on: switched on by the tenant AND allowed by the engine owner. */
  readonly features: ReadonlySet<FeatureKey>;
  readonly terms: ResolvedTerms;
  readonly addresses: ResolvedAddressWords;
  /** The main navigation, in order, without anything whose feature is off. */
  readonly navigation: readonly ComponentKey[];
  hasFeature(feature: FeatureKey): boolean;
  /** One form of a term: `term('partner', 'Many')`. */
  term(key: TermKey, form?: TermForm): string;
  /** A message in this world's words, with its values filled in. */
  t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string;
  /** The word this world shows in a web address. */
  address(key: AddressWordKey): string;
  /** Is this component part of the world? */
  shows(component: ComponentKey): boolean;
  /** Is this control part of the world? */
  hasControl(control: ControlKey): boolean;
  /** "Group | Category" for an event card, or undefined when the category has no card group. */
  eventHeading(categoryId: string): string | undefined;
  /** The theme as CSS variables for one colour set. */
  cssVariables(scheme: ColorScheme): Record<string, string>;
  /** The home-screen app file. */
  manifest(): WebManifest;
  /**
   * Every message one renderer writes out, in this world's words, with `{$name}` values left
   * in place. This is how wording reaches code that cannot import this package: the result is
   * stored as rows (key, text) beside the configuration, and a database function or an edge
   * function reads its text by key.
   */
  wording(renderer: MessageRenderer): Record<string, string>;
}

export function createWorld(configuration: Configuration, entitlements: Entitlements): World {
  const features = new Set<FeatureKey>(
    FEATURE_KEYS.filter(
      (key) =>
        configuration.features[key] === true &&
        entitlements.features[key] === true &&
        featureAvailableOn(key, entitlements.schemaLine),
    ),
  );
  const featureOn = (feature: FeatureKey | undefined) =>
    feature === undefined || features.has(feature);

  const terms = resolveTerms(configuration.vocabulary.terms);
  const addresses = resolveAddressWords(configuration.vocabulary.addresses);
  const overrides = configuration.vocabulary.messages;
  const parsed = new Map<MessageKey, readonly TemplatePart[]>();
  const partsOf = (key: MessageKey): readonly TemplatePart[] => {
    let parts = parsed.get(key);
    if (!parts) {
      const definition = messageDefinition(key);
      const template = Object.hasOwn(overrides, key) ? overrides[key] : undefined;
      parts = parseTemplate(template ?? definition.default, definition.params ?? []).parts;
      parsed.set(key, parts);
    }
    return parts;
  };

  const listedComponents = new Set<ComponentKey>(configuration.layout.components);
  const listedControls = new Set<ControlKey>(configuration.layout.controls);
  const shows = (component: ComponentKey): boolean => {
    const definition = componentDefinition(component);
    if (!featureOn(definition.feature)) return false;
    return definition.core === true || listedComponents.has(component);
  };
  const hasControl = (control: ControlKey): boolean => {
    const definition = controlDefinition(control);
    return featureOn(definition.feature) && listedControls.has(control);
  };

  const { categories, app } = configuration;
  const t: World['t'] = (key, params) => renderParts(partsOf(key), terms, params);

  return {
    configuration,
    features,
    terms,
    addresses,
    navigation: configuration.layout.navigation.filter(shows),
    hasFeature: (feature) => features.has(feature),
    term: (key, form = 'one') => termForm(terms[key], form),
    t,
    address: (key) => addresses[key],
    shows,
    hasControl,
    eventHeading(categoryId) {
      const category = categories.events.find((event) => event.id === categoryId);
      const group = categories.cardGroups.find((entry) => entry.id === category?.cardGroup);
      return category && group ? `${group.label} | ${category.label}` : undefined;
    },
    cssVariables: (scheme) => themeCssVariables(configuration.theme, scheme),
    manifest: () => ({
      name: t('manifest.name'),
      short_name: t('manifest.shortName'),
      description: t('manifest.description'),
      start_url: app.startUrl,
      display: app.display,
      background_color: app.backgroundColor,
      theme_color: app.themeColor,
      orientation: app.orientation,
      categories: [...app.storeCategories],
      icons: app.icons.map((icon) => ({ ...icon })),
    }),
    wording(renderer) {
      const out: Record<string, string> = {};
      for (const key of MESSAGE_KEYS) {
        const definition = messageDefinition(key);
        if (definition.renderedBy !== renderer || !featureOn(definition.feature)) continue;
        out[key] = renderParts(partsOf(key), terms, {}, { keepParams: true });
      }
      return out;
    },
  };
}
