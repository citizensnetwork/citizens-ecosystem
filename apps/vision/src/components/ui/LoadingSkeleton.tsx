export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface-alt ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
