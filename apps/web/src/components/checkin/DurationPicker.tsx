import { formatDuration } from "../../utils/checkins";

type DurationPickerProps = {
  id: string;
  label: string;
  value: number | null;
  maxMinutes: number;
  description?: string;
  onChange: (value: number | null) => void;
};

export function DurationPicker({ id, label, value, maxMinutes, description, onChange }: DurationPickerProps) {
  const hours = value === null ? "" : String(Math.floor(value / 60));
  const minutes = value === null ? "" : String(value % 60);
  const selectedMinutes = value === null ? 0 : value % 60;
  const selectedHours = value === null ? 0 : Math.floor(value / 60);

  function updateHours(raw: string) {
    if (raw === "" && minutes === "") return onChange(null);
    onChange(Number(raw || 0) * 60 + Number(minutes || 0));
  }

  function updateMinutes(raw: string) {
    if (raw === "" && hours === "") return onChange(null);
    onChange(Number(hours || 0) * 60 + Number(raw || 0));
  }

  return (
    <div className="question-card" id={`${id}-question`}>
      <div className="question-heading-row">
        <div>
          <h3 id={`${id}-label`}>{label}</h3>
          {description && <p className="field-hint" id={`${id}-description`}>{description}</p>}
        </div>
        {value !== null && <button className="clear-control" type="button" onClick={() => onChange(null)}>Clear duration</button>}
      </div>
      <div className="duration-picker" role="group" aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-description` : undefined}>
        <label>
          <span>Hours</span>
          <select id={id} aria-label={`${label} hours`} value={hours} onChange={(event) => updateHours(event.target.value)}>
            <option value="">—</option>
            {Array.from({ length: Math.floor(maxMinutes / 60) + 1 }, (_, hour) => (
              <option key={hour} value={hour} disabled={hour * 60 + selectedMinutes > maxMinutes}>{hour}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Minutes</span>
          <select aria-label={`${label} minutes`} value={minutes} onChange={(event) => updateMinutes(event.target.value)}>
            <option value="">—</option>
            {Array.from({ length: 60 }, (_, minute) => (
              <option key={minute} value={minute} disabled={selectedHours * 60 + minute > maxMinutes}>{minute}</option>
            ))}
          </select>
        </label>
        <output className="duration-total" aria-live="polite">
          <span>Total</span>
          <strong>{value === null ? "Not answered" : formatDuration(value)}</strong>
        </output>
      </div>
    </div>
  );
}
