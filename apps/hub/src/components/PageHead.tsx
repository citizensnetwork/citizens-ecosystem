interface PageHeadProps {
  eyebrow: string;
  title: string;
  lead?: string;
}

/** The black band at the top of an inner page: a small label, the page's one h1 and a lead line. */
export function PageHead({ eyebrow, title, lead }: PageHeadProps) {
  return (
    <section className="page-head on-dark" aria-labelledby="page-title">
      <div className="wrap">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="page-title">{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
    </section>
  );
}
