/**
 * A titled block of related settings.
 *
 * Module pages used to be a flat stack of identical cards, which gives staff no
 * way to find anything. Grouping the settings under a heading and a sentence of
 * plain English is the difference between "a settings dump" and a product.
 */
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** Optional control in the section's top-right (e.g. "Add rule"). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-zinc-400">{description}</p>}
        </div>
        {action && <div className="flex-none">{action}</div>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
