import { FC, Child } from "hono/jsx";
import { FormRow } from "../types";
import { Block, FormSchema, FormSchemaV2, isSchemaV2 } from "../blocks";
import { LogicContext, pipeText, resolveVariables } from "../logic";
import { CSS } from "../ui/styles";
import { escapeScriptJson } from "../util";

type Props = {
  form: FormRow;
  schema: FormSchema | null;
  origin: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
  /** Signed render-time tokens: response timing and the proof-of-work challenge. */
  trust?: { startToken: string; powChallenge: string; powBits: number };
};

type Theme = { font?: string; background?: string; text?: string; button?: string; radius?: number; logo?: string; cover?: string };

const PUBLIC_CSS = String.raw`
/* Respondent-facing surface. Theme variables (--form-*) are author-supplied and
   sanitised before render; everything else resolves to a product token. */
.public-wrap {
  min-height: 100vh; padding: var(--space-8) var(--space-4);
  background: var(--form-bg, #f8f8f7);
  color: var(--form-text, #1a1a1a);
  font-family: var(--form-font, var(--font-ui));
  display: flex; align-items: flex-start; justify-content: center;
}
.public-card {
  width: 100%; max-width: 640px; background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--form-radius, var(--radius-xl));
  box-shadow: var(--shadow-xs); overflow: hidden;
}
.public-cover { height: 120px; background: var(--form-button, var(--primary)) center/cover no-repeat; }
.public-logo { max-height: 38px; max-width: 180px; object-fit: contain; margin-bottom: var(--space-3); }
.public-head { padding: var(--space-6) var(--space-6) 0; }
.public-head h1 { font-size: var(--text-h1); line-height: var(--leading-h1); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-tight); }
.public-head p { font-size: var(--text-body-sm); color: var(--muted-foreground); margin-top: var(--space-1); }
.public-body { padding: var(--space-5) var(--space-6) var(--space-6); }
.public-foot {
  padding: var(--space-3) var(--space-6); border-top: 1px solid var(--border-subtle);
  background: var(--surface-subtle); font-size: var(--text-caption);
  color: var(--subtle-foreground); text-align: center;
}

.field-error { font-size: var(--text-caption); color: var(--danger); margin-top: 6px; }
.input.input-error, .textarea.input-error, .select.input-error { border-color: var(--danger); }
.input.input-error:focus, .textarea.input-error:focus { box-shadow: 0 0 0 3px var(--danger-subtle); }

.radio-group, .check-group { display: flex; flex-direction: column; gap: var(--space-2); margin-top: 2px; }
.rating-group { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; margin-top: 2px; }
.rating-group label { display: inline-flex; align-items: center; gap: var(--space-1); cursor: pointer; }

.heading-block { font-size: var(--text-h2); line-height: var(--leading-h2); font-weight: var(--weight-semibold); margin: var(--space-3) 0 var(--space-2); }
.paragraph-block { font-size: var(--text-body-sm); color: var(--muted-foreground); margin: 6px 0 var(--space-3); line-height: 1.6; }

.page-section { display: block; }
.page-section[hidden] { display: none; }
.progress-track { height: 4px; background: var(--muted); margin: 0 var(--space-6) var(--space-4); border-radius: var(--radius-full); overflow: hidden; }
.progress-fill { height: 100%; background: var(--form-button, var(--primary)); transition: width var(--motion-slow) var(--ease); }

.page-actions { display: flex; gap: var(--space-2); margin-top: var(--space-4); }
.page-actions .btn { flex: 1; }
.resume-note { font-size: var(--text-caption); color: var(--subtle-foreground); margin-top: var(--space-3); text-align: center; }
.closed-form { padding: var(--space-8) var(--space-6); text-align: center; }
.closed-form h2 { font-size: var(--text-h2); margin: 0 0 var(--space-2); }

@media (max-width: 600px) {
  .public-wrap { padding: 0; }
  .public-card { border-radius: 0; border-left: 0; border-right: 0; min-height: 100vh; }
  .public-head { padding-top: var(--space-8); }
}
`;

function parseTheme(raw: string | null | undefined): Theme {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      font: typeof value.font === "string" ? value.font : undefined,
      background: typeof value.background === "string" ? value.background : undefined,
      text: typeof value.text === "string" ? value.text : undefined,
      button: typeof value.button === "string" ? value.button : undefined,
      radius: typeof value.radius === "number" ? value.radius : undefined,
      logo: typeof value.logo === "string" ? value.logo : undefined,
      cover: typeof value.cover === "string" ? value.cover : undefined,
    };
  } catch { return {}; }
}

function fieldError(errors: Record<string, string>, id: string): string | undefined { return errors[id]; }
function fieldValue(values: Record<string, string>, id: string): string { return values[id] ?? ""; }
function isChecked(values: Record<string, string>, id: string, option: string): boolean {
  const raw = values[id] ?? "";
  return raw.split(",").map((s) => s.trim()).includes(option);
}
/**
 * Theme values are also validated when saved, but they are re-validated here so a row
 * written by an older build (or edited directly in D1) cannot inject CSS into the
 * inline `style` attribute. Anything unrecognised is dropped rather than escaped.
 */
function safeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  if (/^(rgb|hsl)a?\(\s*[0-9a-z.,%\s/]+\)$/i.test(raw)) return raw;
  if (/^[a-z]{3,24}$/i.test(raw)) return raw;
  return undefined;
}

function safeFont(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!/^[a-z0-9 ,'"-]{1,60}$/i.test(raw)) return undefined;
  // Reject unbalanced quotes, which would otherwise swallow the declarations that follow.
  const quotes = (raw.match(/["']/g) ?? []).length;
  return quotes % 2 === 0 ? raw : undefined;
}

/** Only http(s) URLs, and only ones with no CSS-breaking characters. */
function safeCssUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (/["'()\;\s]/.test(raw)) return undefined;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? raw : undefined;
  } catch {
    return undefined;
  }
}

function themeStyle(theme: Theme): string {
  const parts: string[] = [];
  const font = safeFont(theme.font);
  const background = safeColor(theme.background);
  const text = safeColor(theme.text);
  const button = safeColor(theme.button);
  if (font) parts.push(`--form-font:${font}`);
  if (background) parts.push(`--form-bg:${background}`);
  if (text) parts.push(`--form-text:${text}`);
  if (button) parts.push(`--form-button:${button}`);
  if (theme.radius != null && Number.isFinite(theme.radius)) parts.push(`--form-radius:${Math.max(0, Math.min(32, theme.radius))}px`);
  return parts.join(";");
}
function starIcon(filled: boolean) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3 5h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z" /></svg>;
}

const BlockField: FC<{ block: Block; errors: Record<string, string>; values: Record<string, string>; context: LogicContext }> = ({ block, errors, values, context }) => {
  const err = fieldError(errors, block.id);
  const val = fieldValue(values, block.id);
  const hasError = !!err;
  const errClass = hasError ? " input-error" : "";
  const label = pipeText(block.label, context);
  const help = block.help ? pipeText(block.help, context) : "";
  const labelWithReq = <label for={block.id}>{label}{block.required ? <span style="color:var(--danger);margin-left:4px">*</span> : null}</label>;
  const helpAndError = <>{help ? <div class="hint">{help}</div> : null}{err ? <div class="field-error">{err}</div> : null}</>;
  const wrap = (content: Child) => <div class="field" data-block-id={block.id}>{content}</div>;
  switch (block.type) {
    case "heading": return <div data-block-id={block.id}><h3 class="heading-block">{label}</h3></div>;
    case "paragraph": return <div data-block-id={block.id}><p class="paragraph-block">{label}</p></div>;
    case "divider": return <div data-block-id={block.id}><hr class="divider" /></div>;
    case "page": return <div data-block-id={block.id}></div>;
    case "short_text": return wrap(<>{labelWithReq}<input class={`input${errClass}`} id={block.id} name={block.id} type="text" value={val} placeholder={block.placeholder ?? ""} aria-invalid={hasError ? "true" : undefined} />{helpAndError}</>);
    case "long_text": return wrap(<>{labelWithReq}<textarea class={`textarea${errClass}`} id={block.id} name={block.id} placeholder={block.placeholder ?? ""} aria-invalid={hasError ? "true" : undefined}>{val}</textarea>{helpAndError}</>);
    case "email": return wrap(<>{labelWithReq}<input class={`input${errClass}`} id={block.id} name={block.id} type="email" value={val} placeholder={block.placeholder ?? ""} aria-invalid={hasError ? "true" : undefined} />{helpAndError}</>);
    case "number": return wrap(<>{labelWithReq}<input class={`input${errClass}`} id={block.id} name={block.id} type="number" value={val} placeholder={block.placeholder ?? ""} min={block.min != null ? String(block.min) : undefined} max={block.max != null ? String(block.max) : undefined} aria-invalid={hasError ? "true" : undefined} />{helpAndError}</>);
    case "phone": return wrap(<>{labelWithReq}<input class={`input${errClass}`} id={block.id} name={block.id} type="tel" value={val} placeholder={block.placeholder ?? ""} aria-invalid={hasError ? "true" : undefined} />{helpAndError}</>);
    case "url": return wrap(<>{labelWithReq}<input class={`input${errClass}`} id={block.id} name={block.id} type="url" value={val} placeholder={block.placeholder ?? "https://"} aria-invalid={hasError ? "true" : undefined} />{helpAndError}</>);
    case "date": return wrap(<>{labelWithReq}<input class={`input${errClass}`} id={block.id} name={block.id} type="date" value={val} aria-invalid={hasError ? "true" : undefined} />{helpAndError}</>);
    case "select": return wrap(<>{labelWithReq}<select class={`select${errClass}`} id={block.id} name={block.id} aria-invalid={hasError ? "true" : undefined}><option value="">Select…</option>{(block.options ?? []).map((opt) => <option value={opt} selected={val === opt}>{opt}</option>)}</select>{helpAndError}</>);
    case "radio": return wrap(<>{labelWithReq}<div class="radio-group">{(block.options ?? []).map((opt) => <label class="checkbox-row"><input type="radio" name={block.id} value={opt} checked={val === opt} /><span>{opt}</span></label>)}</div>{helpAndError}</>);
    case "checkbox_choice": return wrap(<>{labelWithReq}<div class="check-group">{(block.options ?? []).map((opt) => <label class="checkbox-row"><input type="checkbox" name={block.id} value={opt} checked={isChecked(values, block.id, opt)} /><span>{opt}</span></label>)}</div>{helpAndError}</>);
    case "checkbox": return wrap(<><label class="checkbox-row"><input type="checkbox" name={block.id} checked={!!val && val !== ""} value="on" /><span>{label}{block.required ? <span style="color:var(--danger);margin-left:4px">*</span> : null}</span></label>{helpAndError}</>);
    case "rating": return wrap(<>{labelWithReq}<div class="rating-group">{[1, 2, 3, 4, 5].map((n) => { const s = String(n); const checked = val === s; return <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:1px solid var(--border);border-radius:6px;padding:6px 10px;background:var(--surface)"><input type="radio" name={block.id} value={s} checked={checked} /><span style={`display:inline-flex;color:${checked ? "var(--primary)" : "var(--subtle-foreground)"}`}>{starIcon(checked)}</span><span style="font-size:13px;font-weight:500">{s}</span></label>; })}</div>{helpAndError}</>);
    case "file": return wrap(<>{labelWithReq}<input class={`input${errClass}`} id={block.id} name={block.id} type="file" multiple={block.multiple ? true : undefined} accept={block.accept} aria-invalid={hasError ? "true" : undefined} />{helpAndError}</>);
    default: return null;
  }
};

/** Per-form config, emitted as a non-executable JSON data block the runtime reads. */
function runtimeConfig(schema: FormSchemaV2, endpoint: string): string {
  return escapeScriptJson(JSON.stringify({ endpoint, rules: schema.logic, pages: schema.pages, variables: schema.variables, endings: schema.endings, conversational: schema.settings.conversational === true }));
}

/**
 * Static form runtime, served from /assets/form-runtime.js rather than inlined, so the
 * CSP can keep script-src at 'self' with no per-request nonce. Everything form-specific
 * arrives through the #fr-config JSON block.
 */
export const FORM_RUNTIME_JS = String.raw`(function(){
var cfgEl=document.getElementById('fr-config');if(!cfgEl)return;
var cfg;try{cfg=JSON.parse(cfgEl.textContent||'{}')}catch(e){return}
var form=document.querySelector('form[data-smart-form]');if(!form)return;
var token=localStorage.getItem('fr_resume_'+location.pathname)||new URLSearchParams(location.search).get('resume')||'';var page=0;var convo=!!cfg.conversational;var convoIndex=0;
function applyConversation(){if(!convo)return;var fields=Array.from(form.querySelectorAll('[data-block-id]')).filter(function(w){return w.querySelector('input,select,textarea')&&!w.hidden});var prev=form.querySelector('[data-prev]'),next=form.querySelector('[data-next]'),submit=form.querySelector('[data-submit]');fields.forEach(function(w,i){w.hidden=i!==convoIndex});if(prev)prev.hidden=convoIndex===0;if(next)next.hidden=convoIndex>=fields.length-1;if(submit)submit.hidden=convoIndex<fields.length-1}
function values(){var out={};new FormData(form).forEach(function(v,k){if(k.charAt(0)==='_')return;if(out[k]!==undefined)out[k]=Array.isArray(out[k])?out[k].concat([String(v)]):[String(out[k]),String(v)];else out[k]=String(v)});return out}
function val(c){if(c.source==='answer')return values()[c.key];if(c.source==='url')return new URLSearchParams(location.search).get(c.key)||'';if(c.source==='meta')return c.key==='path'?location.pathname:'';var v={};cfg.variables.forEach(function(x){v[x.name]=x.defaultValue});return v[c.key]}
function arr(v){return Array.isArray(v)?v:[String(v==null?'':v)]}function match(c){var a=val(c),b=c.value,as=String(a==null?'':a).toLowerCase(),bs=String(b==null?'':b).toLowerCase();if(c.operator==='is_empty')return as==='';if(c.operator==='is_not_empty')return as!=='';if(c.operator==='equals')return as===bs;if(c.operator==='not_equals')return as!==bs;if(c.operator==='contains')return as.indexOf(bs)>=0;if(c.operator==='gt')return Number(a)>Number(b);if(c.operator==='lt')return Number(a)<Number(b);if(c.operator==='gte')return Number(a)>=Number(b);if(c.operator==='lte')return Number(a)<=Number(b);if(c.operator==='includes_any')return arr(a).some(function(x){return arr(b).indexOf(String(x))>=0});if(c.operator==='includes_all')return arr(b).every(function(x){return arr(a).indexOf(String(x))>=0});return false}
function apply(){var visible={};var required={};cfg.rules.forEach(function(r){var ok=r.match==='any'?r.conditions.some(match):r.conditions.every(match);if(!ok)return;r.actions.forEach(function(a){if(a.type==='show'||a.type==='show-section')visible[a.target]=true;if(a.type==='hide'||a.type==='hide-section')visible[a.target]=false;if(a.type==='require')required[a.target]=a.value!==false;if(a.type==='jump-to-page'){var pi=cfg.pages.findIndex(function(p){return p.id===a.target});if(pi>=0)page=pi}})});document.querySelectorAll('[data-block-id]').forEach(function(w){var id=w.getAttribute('data-block-id');if(visible[id]===false)w.hidden=true;else w.hidden=false;w.querySelectorAll('input,select,textarea').forEach(function(el){el.disabled=visible[id]===false;if(required[id]!==undefined)el.required=required[id]})});var sections=document.querySelectorAll('[data-page-id]');sections.forEach(function(s,i){s.hidden=i!==page});var prev=form.querySelector('[data-prev]'),next=form.querySelector('[data-next]'),submit=form.querySelector('[data-submit]');if(prev)prev.hidden=page===0;if(next)next.hidden=page>=sections.length-1;if(submit)submit.hidden=sections.length>1&&page<sections.length-1;var fill=document.querySelector('[data-progress-fill]');if(fill)fill.style.width=((page+1)/Math.max(1,sections.length)*100)+'%';if(convo)applyConversation();}
function save(){var d=values();if(Object.keys(d).length===0)return;fetch(cfg.endpoint+'/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:d,token:token})}).then(function(r){return r.ok?r.json():null}).then(function(x){if(x&&x.token){token=x.token;localStorage.setItem('fr_resume_'+location.pathname,token);var note=document.querySelector('[data-resume-note]');if(note)note.textContent='Saved. Continue later: '+location.origin+location.pathname+'?resume='+encodeURIComponent(token)}}).catch(function(){})}
var timer=0;form.addEventListener('input',function(){apply();clearTimeout(timer);timer=setTimeout(save,700)});form.addEventListener('change',function(){apply();clearTimeout(timer);timer=setTimeout(save,700)});var prev=form.querySelector('[data-prev]');if(prev)prev.addEventListener('click',function(){if(convo){convoIndex=Math.max(0,convoIndex-1);apply();return}page=Math.max(0,page-1);apply()});var next=form.querySelector('[data-next]');if(next)next.addEventListener('click',function(){if(convo){convoIndex=Math.min(form.querySelectorAll('[data-block-id] input,[data-block-id] select,[data-block-id] textarea').length-1,convoIndex+1);apply();return}page=Math.min(cfg.pages.length-1,page+1);apply()});form.addEventListener('submit',function(){window.parent!==window&&window.parent.postMessage({type:'formrelay:submitted'},'*');if(token){var h=form.querySelector('input[name="_resume"]')||document.createElement('input');h.type='hidden';h.name='_resume';h.value=token;form.appendChild(h);localStorage.removeItem('fr_resume_'+location.pathname)}});apply();window.parent!==window&&window.parent.postMessage({type:'formrelay:ready'},'*');})();`;

export const PublicFormPage: FC<Props> = ({ form, schema, origin, errors = {}, values = {}, trust }) => {
  const endpoint = `${origin}/f/${form.id}`;
  if (!schema) {
    return <html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{form.name} · FormRelay</title><style dangerouslySetInnerHTML={{ __html: CSS + PUBLIC_CSS }} /></head><body><div class="public-wrap"><div class="public-card"><div class="public-head"><h1>This form accepts submissions at {endpoint}</h1><p>Visual builder is not configured for this form — it still accepts submissions headlessly.</p></div><div class="public-body"><form method="post" action={endpoint} enctype="multipart/form-data"><input type="text" name="_gotcha" style="display:none" tabindex={-1} autocomplete="off" /><div class="field"><label for="name">Name</label><input class="input" id="name" name="name" type="text" placeholder="Your name" /></div><div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" placeholder="you@example.com" /></div><div class="field"><label for="message">Message</label><textarea class="textarea" id="message" name="message" placeholder="Your message"></textarea></div><button class="btn btn-primary" type="submit" style="width:100%;height:38px;margin-top:8px">Submit</button></form></div><div class="public-foot">FormRelay · {form.name}</div></div></div></body></html>;
  }
  const v2 = isSchemaV2(schema) ? schema : null;
  const pages = v2?.pages.length ? v2.pages : [{ id: "page_1", title: "Page 1" }];
  const pageBlocks = pages.map((page) => ({ page, blocks: schema.blocks.filter((block) => (block.page_id ?? "page_1") === page.id) }));
  const context: LogicContext = { answers: values, variables: v2 ? resolveVariables(v2.variables, values) : {}, url: {}, meta: {} };
  const theme = parseTheme(form.theme_json);
  const style = themeStyle(theme);
  const submitText = schema.settings.submitText?.trim() ? pipeText(schema.settings.submitText, context) : "Submit";
  return <html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{form.name} · FormRelay</title><style dangerouslySetInnerHTML={{ __html: CSS + PUBLIC_CSS }} /></head><body><div class="public-wrap" style={style}><div class="public-card">{safeCssUrl(theme.cover) ? <div class="public-cover" style={`background-image:url(${safeCssUrl(theme.cover)})`} /> : null}<div class="public-head">{safeCssUrl(theme.logo) ? <img class="public-logo" src={safeCssUrl(theme.logo)} alt="" /> : null}<h1>{form.name}</h1>{v2 && v2.settings.progressStyle !== "none" && pages.length > 1 ? <><p data-progress-label>Page 1 of {pages.length}</p><div class="progress-track"><div class="progress-fill" data-progress-fill style="width:100%" /></div></> : null}{schema.blocks.length === 0 ? <p>This form has no fields yet.</p> : null}</div><div class="public-body"><form method="post" action={endpoint} enctype="multipart/form-data" data-smart-form={v2 ? "true" : undefined}><input type="text" name="_gotcha" style="display:none" tabindex={-1} autocomplete="off" />{trust?.startToken ? <input type="hidden" name="_started" value={trust.startToken} /> : null}{trust && trust.powBits > 0 ? <input type="hidden" name="_pow_challenge" value={trust.powChallenge} /> : null}{trust && trust.powBits > 0 ? <input type="hidden" name="_pow_nonce" value="" data-pow-bits={String(trust.powBits)} /> : null}{pageBlocks.map(({ page, blocks }) => <section class="page-section" data-page-id={page.id}><h2 class="small t2" style="margin:0 0 12px">{page.title}</h2>{page.description ? <p class="hint" style="margin-top:-8px">{pipeText(page.description, context)}</p> : null}{blocks.map((block) => <BlockField block={block} errors={errors} values={values} context={context} />)}</section>)}<div class="page-actions">{v2 && pages.length > 1 ? <button class="btn btn-secondary" type="button" data-prev hidden>Previous</button> : null}{v2 && pages.length > 1 ? <button class="btn btn-secondary" type="button" data-next hidden>Next</button> : null}<button class="btn btn-primary" type="submit" data-submit style="width:100%;height:38px">{submitText}</button></div>{v2 ? <div class="resume-note" data-resume-note>Your progress is saved securely as you type.</div> : null}</form></div><div class="public-foot">FormRelay · Powered by {origin}</div></div></div>{v2 ? <script type="application/json" id="fr-config" dangerouslySetInnerHTML={{ __html: runtimeConfig(v2, endpoint) }} /> : null}{v2 ? <script src="/assets/form-runtime.js" defer /> : null}{trust && trust.powBits > 0 ? <script src="/assets/pow.js" defer /> : null}</body></html>;
};
