import { KeyboardEvent, useRef } from "react";

type RatingScaleProps = {
  id: string;
  label: string;
  description?: string;
  labels: string[];
  value: number | "N/A" | null;
  allowNotApplicable?: boolean;
  onChange: (value: number | "N/A" | null) => void;
};

export function RatingScale({ id, label, description, labels, value, allowNotApplicable = false, onChange }: RatingScaleProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const options: Array<number | "N/A"> = allowNotApplicable ? [1, 2, 3, 4, 5, "N/A"] : [1, 2, 3, 4, 5];

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % options.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + options.length) % options.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = options.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    onChange(options[nextIndex]);
    buttonRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="question-card" id={`${id}-question`}>
      <div className="question-heading-row">
        <div>
          <h3 id={`${id}-label`}>{label}</h3>
          <p className="field-hint" id={`${id}-description`}>{description ?? "Choose the answer that best reflects today."}</p>
        </div>
        {value !== null && <button className="clear-control" type="button" onClick={() => onChange(null)}>Clear selection</button>}
      </div>
      <div className="rating-scale" role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`}>
        {options.map((option, index) => {
          const selected = value === option;
          const optionLabel = option === "N/A" ? "Not applicable" : labels[index] ?? `Rating ${option}`;
          return (
            <button
              key={option}
              ref={(node) => { buttonRefs.current[index] = node; }}
              id={index === 0 ? id : undefined}
              className={selected ? "rating-option selected" : "rating-option"}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${option}: ${optionLabel}`}
              tabIndex={selected || (value === null && index === 0) ? 0 : -1}
              onClick={() => onChange(option)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <strong>{option}</strong>
              <span>{optionLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
