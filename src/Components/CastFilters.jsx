import { castDefaults, chipOptions, expOptions, rateOptions, ratingOptions, specialities } from "../lib/cast";
import FilterChips from "./FilterChips";

function Pick({ id, label, options, value, onChange }) {
  const on = value !== "any";
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`min-h-10 cursor-pointer rounded-full border bg-surface px-4 text-[0.9375rem] font-medium transition-colors focus:border-gold focus:outline-none ${on ? "border-gold/70 text-ink" : "border-[#3d3332] text-ink-soft hover:border-[#6a5a55]"}`}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </>
  );
}

// Filters for a list of developers: what they do, then how well rated, how much, how experienced.
export default function CastFilters({ devs, value, onChange, idPrefix = "cast" }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  const active = Object.keys(castDefaults).filter((k) => value[k] !== castDefaults[k]).length;
  return (
    <div className="space-y-3">
      <FilterChips label="Speciality" options={chipOptions(devs, specialities, "Everyone")} value={value.spec} onChange={set("spec")} />
      <div className="flex flex-wrap items-center gap-2">
        <Pick id={`${idPrefix}-rating`} label="Minimum rating" options={ratingOptions} value={value.rating} onChange={set("rating")} />
        <Pick id={`${idPrefix}-rate`} label="Hourly rate" options={rateOptions} value={value.rate} onChange={set("rate")} />
        <Pick id={`${idPrefix}-exp`} label="Experience" options={expOptions} value={value.exp} onChange={set("exp")} />
        {active > 0 && (
          <button type="button" onClick={() => onChange(castDefaults)} className="min-h-10 px-2 text-sm font-medium text-gold hover:underline">
            Clear {active} filter{active === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </div>
  );
}
