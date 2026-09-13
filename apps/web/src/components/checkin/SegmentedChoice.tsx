type SegmentedChoiceProps = {
  id: string;
  label: string;
  choices: string[];
  value: string | null;
  onChange: (value: string | null) => void;
};

export function SegmentedChoice({ id, label, choices, value, onChange }: SegmentedChoiceProps) {
  return (
    <div className="question-card" id={`${id}-question`}>
      <div className="question-heading-row">
        <h3 id={`${id}-label`}>{label}</h3>
        {value !== null && <button className="clear-control" type="button" onClick={() => onChange(null)}>Clear selection</button>}
      </div>
      <div className="segmented-choice" role="radiogroup" aria-labelledby={`${id}-label`}>
        {choices.map((choice, index) => (
          <button
            key={choice}
            id={index === 0 ? id : undefined}
            type="button"
            role="radio"
            aria-checked={value === choice}
            className={value === choice ? "selected" : undefined}
            onClick={() => onChange(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
}
