/**
 * One section of the workspace screen: a bordered block with a small heading
 * and an optional line under it. Every section of the screen uses it, the
 * Team settings of the Team workspace too, so they all look the same.
 */
export function WorkspaceSection({
  title,
  description,
  children,
  labelledBy,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  labelledBy: string;
}) {
  return (
    <section aria-labelledby={labelledBy} className="space-y-3 rounded-md border border-border p-4">
      <div className="min-w-0">
        <h3 id={labelledBy} className="text-sm font-medium">
          {title}
        </h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
