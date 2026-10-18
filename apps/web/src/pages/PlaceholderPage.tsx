export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-neutral-500">Coming in a later phase.</p>
    </section>
  );
}
