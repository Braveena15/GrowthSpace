type ComingSoonPageProps = {
  title: string;
  description: string;
};

export function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  return (
    <section className="page" aria-labelledby="page-heading">
      <p className="eyebrow">GrowthSpace</p>
      <h1 id="page-heading">{title}</h1>
      <div className="coming-next">
        <h2>Coming next</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}
