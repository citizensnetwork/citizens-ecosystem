export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="fade-rise space-y-4">
        <div className="skeleton h-4 w-28 rounded-full" />
        <div className="skeleton h-10 w-64 rounded-md" />
        <div className="skeleton h-5 w-full max-w-xl rounded-md" />
        <div className="skeleton h-5 w-full max-w-lg rounded-md" />
      </div>
    </div>
  );
}
