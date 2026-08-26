import { FC } from "hono/jsx";
import { FormRow } from "../types";
import { Block, FormSchema } from "../blocks";
import { CSS } from "../ui/styles";

type Props = {
  form: FormRow;
  schema: FormSchema | null;
  origin: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

const PUBLIC_CSS = String.raw`
.public-wrap{min-height:100vh;background:#f7f7f5;display:flex;align-items:flex-start;justify-content:center;padding:32px 16px}
.public-card{width:100%;max-width:640px;background:#fff;border:1px solid var(--border);border-radius:10px;box-shadow:0 1px 2px rgba(15,15,15,.06);overflow:hidden}
.public-head{padding:22px 22px 0}
.public-head h1{font-size:22px;font-weight:650;letter-spacing:-.02em;line-height:1.25}
.public-head p{font-size:13.5px;color:var(--text-secondary);margin-top:4px}
.public-body{padding:18px 22px 22px}
.public-foot{padding:12px 22px;border-top:1px solid var(--border);background:var(--surface-secondary);font-size:12.5px;color:var(--text-muted);text-align:center}
.field-error{font-size:12.5px;color:var(--danger);margin-top:5px}
.input.input-error,.textarea.input-error,.select.input-error{border-color:var(--danger);box-shadow:0 0 0 2px rgba(196,69,61,.12)}
.radio-group{display:flex;flex-direction:column;gap:8px;margin-top:2px}
.check-group{display:flex;flex-direction:column;gap:8px;margin-top:2px}
.rating-group{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px}
.rating-group label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}
.heading-block{font-size:18px;font-weight:600;margin:10px 0 8px;letter-spacing:-.01em}
.paragraph-block{font-size:13.5px;color:var(--text-secondary);margin:6px 0 12px;line-height:1.6}
`;

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 2l3 5h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z" />
    </svg>
  );
}

function fieldError(errors: Record<string, string>, id: string): string | undefined {
  return errors[id];
}

function fieldValue(values: Record<string, string>, id: string): string {
  return values[id] ?? "";
}

function isChecked(values: Record<string, string>, id: string, option: string): boolean {
  const raw = values[id] ?? "";
  if (!raw) return false;
  // values stored as ", " joined for multi
  const parts = raw.split(",").map((s) => s.trim());
  return parts.includes(option);
}

const BlockField: FC<{ block: Block; errors: Record<string, string>; values: Record<string, string> }> = ({ block, errors, values }) => {
  const err = fieldError(errors, block.id);
  const val = fieldValue(values, block.id);
  const hasError = !!err;
  const errClass = hasError ? " input-error" : "";
  const labelWithReq = (
    <label for={block.id}>
      {block.label}
      {block.required ? <span style="color:var(--danger);margin-left:4px">*</span> : null}
    </label>
  );

  switch (block.type) {
    case "heading":
      return <h3 class="heading-block">{block.label}</h3>;
    case "paragraph":
      return <p class="paragraph-block">{block.label}</p>;
    case "divider":
      return <hr class="divider" />;
    case "short_text":
      return (
        <div class="field">
          {labelWithReq}
          <input
            class={`input${errClass}`}
            id={block.id}
            name={block.id}
            type="text"
            value={val}
            placeholder={block.placeholder ?? ""}
            aria-invalid={hasError ? "true" : undefined}
          />
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "long_text":
      return (
        <div class="field">
          {labelWithReq}
          <textarea
            class={`textarea${errClass}`}
            id={block.id}
            name={block.id}
            placeholder={block.placeholder ?? ""}
            aria-invalid={hasError ? "true" : undefined}
          >{val}</textarea>
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "email":
      return (
        <div class="field">
          {labelWithReq}
          <input
            class={`input${errClass}`}
            id={block.id}
            name={block.id}
            type="email"
            value={val}
            placeholder={block.placeholder ?? ""}
            aria-invalid={hasError ? "true" : undefined}
          />
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "number":
      return (
        <div class="field">
          {labelWithReq}
          <input
            class={`input${errClass}`}
            id={block.id}
            name={block.id}
            type="number"
            value={val}
            placeholder={block.placeholder ?? ""}
            min={block.min != null ? String(block.min) : undefined}
            max={block.max != null ? String(block.max) : undefined}
            aria-invalid={hasError ? "true" : undefined}
          />
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "phone":
      return (
        <div class="field">
          {labelWithReq}
          <input
            class={`input${errClass}`}
            id={block.id}
            name={block.id}
            type="tel"
            value={val}
            placeholder={block.placeholder ?? ""}
            aria-invalid={hasError ? "true" : undefined}
          />
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "url":
      return (
        <div class="field">
          {labelWithReq}
          <input
            class={`input${errClass}`}
            id={block.id}
            name={block.id}
            type="url"
            value={val}
            placeholder={block.placeholder ?? "https://"}
            aria-invalid={hasError ? "true" : undefined}
          />
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "date":
      return (
        <div class="field">
          {labelWithReq}
          <input
            class={`input${errClass}`}
            id={block.id}
            name={block.id}
            type="date"
            value={val}
            aria-invalid={hasError ? "true" : undefined}
          />
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "select":
      return (
        <div class="field">
          {labelWithReq}
          <select class={`select${errClass}`} id={block.id} name={block.id} aria-invalid={hasError ? "true" : undefined}>
            <option value="">Select…</option>
            {(block.options ?? []).map((opt) => (
              <option value={opt} selected={val === opt}>{opt}</option>
            ))}
          </select>
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "radio":
      return (
        <div class="field">
          {labelWithReq}
          <div class="radio-group">
            {(block.options ?? []).map((opt) => (
              <label class="checkbox-row">
                <input type="radio" name={block.id} value={opt} checked={val === opt} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "checkbox_choice":
      return (
        <div class="field">
          {labelWithReq}
          <div class="check-group">
            {(block.options ?? []).map((opt) => (
              <label class="checkbox-row">
                <input type="checkbox" name={block.id} value={opt} checked={isChecked(values, block.id, opt)} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "checkbox":
      return (
        <div class="field">
          <label class="checkbox-row">
            <input type="checkbox" name={block.id} checked={!!val && val !== ""} value="on" />
            <span>{block.label}{block.required ? <span style="color:var(--danger);margin-left:4px">*</span> : null}</span>
          </label>
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "rating":
      return (
        <div class="field">
          {labelWithReq}
          <div class="rating-group">
            {[1, 2, 3, 4, 5].map((n) => {
              const s = String(n);
              const checked = val === s;
              return (
                <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:1px solid var(--border);border-radius:6px;padding:6px 10px;background:var(--surface)">
                  <input type="radio" name={block.id} value={s} checked={checked} />
                  <span style={`display:inline-flex;color:${checked ? "var(--accent)" : "var(--text-muted)"}`}>
                    <StarIcon filled={checked} />
                  </span>
                  <span style="font-size:13px;font-weight:500">{s}</span>
                </label>
              );
            })}
          </div>
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    case "file":
      return (
        <div class="field">
          {labelWithReq}
          <input class={`input${errClass}`} id={block.id} name={block.id} type="file" multiple={block.multiple ? true : undefined} aria-invalid={hasError ? "true" : undefined} />
          {block.help ? <div class="hint">{block.help}</div> : null}
          {err ? <div class="field-error">{err}</div> : null}
        </div>
      );
    default:
      return null;
  }
};

export const PublicFormPage: FC<Props> = ({ form, schema, origin, errors = {}, values = {} }) => {
  const endpoint = `${origin}/f/${form.id}`;

  if (!schema) {
    return (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{form.name} · FormRelay</title>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
          <style dangerouslySetInnerHTML={{ __html: CSS + PUBLIC_CSS }} />
        </head>
        <body>
          <div class="public-wrap">
            <div class="public-card">
              <div class="public-head">
                <h1>This form accepts submissions at {endpoint}</h1>
                <p>visual builder is not configured for this form — it still accepts submissions headlessly.</p>
              </div>
              <div class="public-body">
                <form method="post" action={endpoint} enctype="multipart/form-data">
                  <input type="text" name="_gotcha" style="display:none" tabindex={-1} autocomplete="off" />
                  <div class="field">
                    <label for="name">Name</label>
                    <input class="input" id="name" name="name" type="text" placeholder="Your name" />
                  </div>
                  <div class="field">
                    <label for="email">Email</label>
                    <input class="input" id="email" name="email" type="email" placeholder="you@example.com" />
                  </div>
                  <div class="field">
                    <label for="message">Message</label>
                    <textarea class="textarea" id="message" name="message" placeholder="Your message"></textarea>
                  </div>
                  <button class="btn btn-primary" type="submit" style="width:100%;height:38px;margin-top:8px">Submit</button>
                </form>
                <p class="hint small t2" style="margin-top:12px;text-align:center">This is a minimal fallback. Configure blocks in the admin builder and publish to show a polished form here.</p>
              </div>
              <div class="public-foot">FormRelay · {form.name}</div>
            </div>
          </div>
        </body>
      </html>
    );
  }

  const submitText = schema.settings.submitText?.trim() ? schema.settings.submitText : "Submit";

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{form.name} · FormRelay</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        <style dangerouslySetInnerHTML={{ __html: CSS + PUBLIC_CSS }} />
      </head>
      <body>
        <div class="public-wrap">
          <div class="public-card">
            <div class="public-head">
              <h1>{form.name}</h1>
              {schema.blocks.length === 0 ? <p>This form has no fields yet.</p> : null}
            </div>
            <div class="public-body">
              <form method="post" action={endpoint} enctype="multipart/form-data">
                <input type="text" name="_gotcha" style="display:none" tabindex={-1} autocomplete="off" />
                {schema.blocks.map((blk) => (
                  <BlockField block={blk} errors={errors} values={values} />
                ))}
                <button class="btn btn-primary" type="submit" style="width:100%;height:38px;margin-top:14px">{submitText}</button>
              </form>
            </div>
            <div class="public-foot">FormRelay · Powered by {origin}</div>
          </div>
        </div>
      </body>
    </html>
  );
};
