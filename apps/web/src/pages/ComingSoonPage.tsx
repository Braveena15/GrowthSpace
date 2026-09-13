type ComingSoonPageProps = {
  title: string;
  description: string;
};

export function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  const nextSteps: Record<string, string[]> = {
    Journal: ["Write freely and keep your thoughts in one calm place.", "Return to past moments whenever you need perspective."],
    "Weekly Reports": ["Spot the small wins that add up each week.", "Turn your check-ins into thoughtful, useful patterns."],
    Settings: ["Make GrowthSpace feel just right for your rhythm.", "Choose preferences that support your focus and privacy."],
  };
  return (
    <section className="page future-page" aria-labelledby="page-heading">
      <div className="future-hero">
        <span className="future-orb" aria-hidden="true">✦</span>
        <p className="eyebrow">Designed for your next chapter</p>
        <h1 id="page-heading">{title}</h1>
        <p>{description}</p>
      </div>
      <div className="coming-next">
        <span className="coming-next-label">In the works</span>
        <h2>A more thoughtful space is on its way.</h2>
        <ul>
          {(nextSteps[title] ?? []).map((step) => <li key={step}>{step}</li>)}
        </ul>
      </div>
    </section>
  );
}
