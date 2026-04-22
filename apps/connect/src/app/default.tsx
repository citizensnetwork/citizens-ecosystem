// Fallback for the implicit `children` slot. With parallel routes,
// Next.js requires a default for every slot that might not have a
// matching page during soft navigation. Since every app route has
// its own page.tsx, this is only hit when a soft-nav would leave
// children unmatched — returning null is safe.
export default function ChildrenDefault() {
  return null;
}
