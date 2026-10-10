import { NAME_MAX } from "@/lib/account/names.mjs";

interface Props {
  firstName?: string;
  lastName?: string;
  errors?: { first_name?: string; last_name?: string };
}

// Shared by signup and /account. Validation is enforced server-side (validateNames);
// required/maxLength here are only a convenience.
export default function NameFields({ firstName, lastName, errors }: Props) {
  const fields = [
    { name: "first_name", label: "First name", autoComplete: "given-name", value: firstName, error: errors?.first_name },
    { name: "last_name", label: "Last name", autoComplete: "family-name", value: lastName, error: errors?.last_name },
  ] as const;
  return (
    <>
      {fields.map((f) => (
        <div key={f.name} className="field">
          <label htmlFor={f.name}>{f.label}</label>
          <input
            id={f.name}
            name={f.name}
            type="text"
            autoComplete={f.autoComplete}
            required
            maxLength={NAME_MAX * 2}
            defaultValue={f.value ?? ""}
            aria-invalid={f.error ? true : undefined}
            aria-describedby={f.error ? `${f.name}-error` : undefined}
          />
          {f.error && (
            <p id={`${f.name}-error`} className="error field-error">
              {f.error}
            </p>
          )}
        </div>
      ))}
    </>
  );
}
