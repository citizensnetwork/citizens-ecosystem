// Default render for the @panel parallel slot — nothing is shown
// unless an intercepting route is matched. Required by Next.js for
// parallel routes; otherwise navigations to routes that don't have
// a matching @panel slot would 404.
export default function PanelDefault() {
  return null;
}
