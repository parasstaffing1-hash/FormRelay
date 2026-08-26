import { FC } from "hono/jsx";
import { AppShell, CommandItem } from "../ui/shell";
import { PageHead } from "../ui/components";
import { FormRow } from "../types";
import { FormSchema, BlockType, BLOCK_DEFS, isSchemaV2 } from "../blocks";

type Props = {
  form: FormRow;
  schema: FormSchema;
  origin: string;
  toastMsg?: string;
  commands: CommandItem[];
  formCount: number;
  submissionCount: number;
  editId?: string;
};

const GROUP_ORDER: Array<"Basic" | "Choice" | "Content" | "Advanced"> = ["Basic", "Choice", "Content", "Advanced"];

export const BuilderPage: FC<Props> = ({ form, schema, origin: _origin, toastMsg, commands, formCount, submissionCount, editId }) => {
  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    types: (Object.keys(BLOCK_DEFS) as BlockType[]).filter((k) => BLOCK_DEFS[k].group === g),
  }));

  const schemaJson = JSON.stringify(schema, null, 2);
  const smart = isSchemaV2(schema) ? schema : null;

  return (
    <AppShell
      path={`/admin/forms/${form.id}/build`}
      crumbs={[
        { label: "Forms", href: "/admin/forms" },
        { label: form.name, href: `/admin/forms/${form.id}` },
        { label: "Build" },
      ]}
      toastMsg={toastMsg}
      commands={commands}
      formCount={formCount}
      submissionCount={submissionCount}
    >
      <PageHead
        title={`Build · ${form.name}`}
        sub={
          <span class="flex gap8">
            <span class={`badge ${form.status === "published" ? "badge-success" : "badge-neutral"}`}><span class="dot"></span>{form.status === "published" ? "Published" : "Draft"}</span>
            <span class="muted small">ID {form.id}</span>
            <a class="small" style="color:var(--accent)" href={`/admin/forms/${form.id}`}>Back to details</a>
          </span>
        }
        actions={
          <div class="flex gap8">
            <a class="btn btn-secondary btn-sm" href={`/f/${form.id}`} target="_blank" rel="noreferrer">Preview</a>
            {form.status === "published" ? (
              <form method="post" action={`/admin/forms/${form.id}/unpublish`} style="display:inline">
                <button type="submit" class="btn btn-secondary btn-sm">Unpublish</button>
              </form>
            ) : (
              <form method="post" action={`/admin/forms/${form.id}/publish`} style="display:inline">
                <button type="submit" class="btn btn-secondary btn-sm">Publish</button>
              </form>
            )}
            <button type="submit" form="builder-save-form" class="btn btn-primary btn-sm">Save</button>
          </div>
        }
      />

      <form id="builder-save-form" method="post" action={`/admin/forms/${form.id}/schema`}>
        <textarea name="schema_json" id="schema_json" style="display:none">{schemaJson}</textarea>
      </form>

      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
        {/* palette */}
        <div style="width:260px;flex-shrink:0">
          <div class="card">
            <div class="card-h">Add block</div>
            <div class="card-b" style="padding:10px 12px">
              {groups.map((g) => (
                <div style="margin-bottom:14px">
                  <div style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:.04em;text-transform:uppercase;margin-bottom:6px">{g.group}</div>
                  {g.types.map((t) => (
                    <div class="flex between gap8" style="padding:4px 0;border-bottom:1px solid var(--border)">
                      <span style="font-size:13px">{BLOCK_DEFS[t].label}</span>
                      <button type="button" class="btn btn-secondary btn-sm" data-add-type={t}>Add</button>
                    </div>
                  ))}
                </div>
              ))}
              <p class="hint small" style="margin-top:8px;color:var(--text-muted)">Blocks are added to the draft. Click Save to persist.</p>
            </div>
          </div>

          <div class="card mt16">
            <div class="card-h">Settings</div>
            <div class="card-b">
              <div class="field">
                <label for="st-submit">Submit button text</label>
                <input class="input" id="st-submit" data-settings-key="submitText" value={schema.settings.submitText} placeholder="Submit" />
              </div>
              <div class="field">
                <label for="st-success">Success message</label>
                <input class="input" id="st-success" data-settings-key="successMessage" value={schema.settings.successMessage} placeholder="Thank you!" />
              </div>
              <div class="field">
                <label for="st-redirect">Redirect URL</label>
                <input class="input" id="st-redirect" data-settings-key="redirectUrl" value={schema.settings.redirectUrl} placeholder="https://..." />
              </div>
              {smart ? <>
                <div class="field"><label for="st-progress">Progress style</label><select class="select" id="st-progress" data-settings-key="progressStyle"><option value="bar" selected={smart.settings.progressStyle === "bar"}>Bar</option><option value="steps" selected={smart.settings.progressStyle === "steps"}>Steps</option><option value="none" selected={smart.settings.progressStyle === "none"}>None</option></select></div>
                <label class="checkbox-row field"><input type="checkbox" data-settings-key="conversational" checked={!!smart.settings.conversational} /><span>One question at a time</span></label>
              </> : null}
              <p class="hint small">Saved with the schema.</p>
            </div>
          </div>
          {smart ? <>
            <div class="card mt16"><div class="card-h"><span>Pages</span><button type="button" class="btn btn-secondary btn-sm" data-page-add>Add page</button></div><div class="card-b" id="builder-pages">{smart.pages.map((p) => <div class="field flex gap6" data-page-row={p.id}><input class="input" data-page-id={p.id} value={p.title} /><button type="button" class="btn btn-danger btn-sm" data-page-delete={p.id}>Delete</button></div>)}</div></div>
            <div class="card mt16"><div class="card-h"><span>Variables &amp; calculations</span><button type="button" class="btn btn-secondary btn-sm" data-var-add>Add variable</button></div><div class="card-b" id="builder-variables">{smart.variables.map((v) => <div class="field" data-var-row={v.id}><div class="flex gap6"><input class="input" data-var-name={v.id} value={v.name} placeholder="name" /><select class="select" data-var-type={v.id}><option value="text" selected={v.type === "text"}>Text</option><option value="number" selected={v.type === "number"}>Number</option><option value="bool" selected={v.type === "bool"}>Boolean</option><option value="date" selected={v.type === "date"}>Date</option><option value="currency" selected={v.type === "currency"}>Currency</option></select><button type="button" class="btn btn-danger btn-sm" data-var-delete={v.id}>Delete</button></div><input class="input mt8" data-var-default={v.id} value={v.defaultValue == null ? "" : String(v.defaultValue)} placeholder="Default value" /><input class="input mt8" data-var-expression={v.id} value={v.expression ?? ""} placeholder="Optional calculation, e.g. quantity * price" /></div>)}</div></div>
            <div class="card mt16"><div class="card-h"><span>Conditional logic</span><button type="button" class="btn btn-secondary btn-sm" data-rule-add>Add rule</button></div><div class="card-b" id="builder-rules">{smart.logic.map((r) => { const condition = r.conditions[0]; const action = r.actions[0]; return <div class="card" style="padding:10px;margin-bottom:8px" data-rule-row={r.id}><div class="small muted" style="margin-bottom:6px">When</div><div class="flex gap6" style="flex-wrap:wrap"><select class="select" data-rule-match={r.id}><option value="all" selected={r.match === "all"}>all</option><option value="any" selected={r.match === "any"}>any</option></select><select class="select" data-rule-source={r.id}><option value="answer" selected={condition?.source === "answer"}>answer</option><option value="var" selected={condition?.source === "var"}>variable</option><option value="url" selected={condition?.source === "url"}>URL</option><option value="meta" selected={condition?.source === "meta"}>meta</option></select><input class="input" data-rule-key={r.id} value={condition?.key ?? ""} placeholder="field or variable id" /><select class="select" data-rule-op={r.id}><option value="equals" selected={condition?.operator === "equals"}>equals</option><option value="not_equals" selected={condition?.operator === "not_equals"}>not equals</option><option value="contains" selected={condition?.operator === "contains"}>contains</option><option value="gt" selected={condition?.operator === "gt"}>greater than</option><option value="lt" selected={condition?.operator === "lt"}>less than</option><option value="is_empty" selected={condition?.operator === "is_empty"}>is empty</option><option value="is_not_empty" selected={condition?.operator === "is_not_empty"}>is not empty</option></select><input class="input" data-rule-value={r.id} value={condition?.value == null ? "" : String(condition.value)} placeholder="value" /></div><div class="small muted" style="margin:10px 0 6px">Then</div><div class="flex gap6" style="flex-wrap:wrap"><select class="select" data-action-type={r.id}><option value="show" selected={action?.type === "show"}>show</option><option value="hide" selected={action?.type === "hide"}>hide</option><option value="require" selected={action?.type === "require"}>require</option><option value="jump-to-page" selected={action?.type === "jump-to-page"}>jump to page</option><option value="jump-to-ending" selected={action?.type === "jump-to-ending"}>jump to ending</option><option value="redirect" selected={action?.type === "redirect"}>redirect</option><option value="set-variable" selected={action?.type === "set-variable"}>set variable</option></select><input class="input" data-action-target={r.id} value={action?.target ?? ""} placeholder="target id or URL" />{action?.type === "set-variable" ? <input class="input" data-action-value={r.id} value={action.value} placeholder="expression" /> : null}<button type="button" class="btn btn-danger btn-sm" data-rule-delete={r.id}>Delete</button></div></div>; })}</div></div>
          </> : null}
        </div>

        {/* canvas */}
        <div style="flex:1;min-width:320px">
          <div class="card">
            <div class="card-h">
              <span>Canvas — {schema.blocks.length} block{schema.blocks.length === 1 ? "" : "s"}</span>
              <span class="badge badge-neutral">{form.status}</span>
            </div>
            <div id="builder-canvas" style="padding:12px">
              {schema.blocks.length === 0 ? (
                <div class="empty" style="padding:28px 12px">
                  <p class="t2 small">No blocks yet. Add one from the palette.</p>
                </div>
              ) : (
                schema.blocks.map((b, idx) => (
                  <div class="card" id={`blk-${b.id}`} style="margin-bottom:8px;border:1px solid var(--border)" data-blk-id={b.id}>
                    <div class="flex between gap8" style="padding:10px 12px;align-items:center">
                      <div style="min-width:0;flex:1">
                        <div class="cell-main truncate" style="max-width:360px">{b.label || "(untitled)"}</div>
                        <div class="flex gap6" style="flex-wrap:wrap;margin-top:4px;align-items:center">
                          <span class="badge badge-neutral">{BLOCK_DEFS[b.type]?.label ?? b.type}</span>
                          <span class="mono muted small">{b.type}</span>
                          {b.required ? <span class="badge badge-warning">required</span> : null}
                          <span class="mono muted small">{b.id}</span>
                        </div>
                      </div>
                      <div class="flex gap6" style="flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
                        <button type="button" class="btn btn-secondary btn-sm" data-move="up" data-id={b.id} disabled={idx === 0}>↑</button>
                        <button type="button" class="btn btn-secondary btn-sm" data-move="down" data-id={b.id} disabled={idx === schema.blocks.length - 1}>↓</button>
                        <button type="button" class="btn btn-secondary btn-sm" data-dup={b.id}>Duplicate</button>
                        <button type="button" class="btn btn-danger btn-sm" data-del={b.id}>Delete</button>
                        {editId === b.id ? (
                          <a class="btn btn-primary btn-sm" href={`/admin/forms/${form.id}/build`}>Done</a>
                        ) : (
                          <a class="btn btn-secondary btn-sm" href={`/admin/forms/${form.id}/build?edit=${b.id}`}>Edit</a>
                        )}
                      </div>
                    </div>

                    {editId === b.id ? (
                      <div style="border-top:1px solid var(--border);padding:12px;background:var(--surface-secondary)">
                        <div class="field">
                          <label>Label</label>
                          <input class="input" data-blk={b.id} data-key="label" value={b.label} />
                        </div>
                        <div class="field">
                          <label>Placeholder</label>
                          <input class="input" data-blk={b.id} data-key="placeholder" value={b.placeholder ?? ""} placeholder="Optional" />
                        </div>
                        <div class="field">
                          <label>Help text</label>
                          <input class="input" data-blk={b.id} data-key="help" value={b.help ?? ""} placeholder="Optional" />
                        </div>
                        <label class="checkbox-row field">
                          <input type="checkbox" data-blk={b.id} data-key="required" checked={!!b.required} />
                          <span>Required</span>
                        </label>
                        {smart ? <div class="field"><label>Page</label><select class="select" data-blk={b.id} data-key="page_id">{smart.pages.map((p) => <option value={p.id} selected={(b.page_id ?? smart.pages[0]?.id) === p.id}>{p.title}</option>)}</select></div> : null}
                        {(b.type === "select" || b.type === "radio" || b.type === "checkbox_choice") ? (
                          <div class="field">
                            <label>Options (one per line)</label>
                            <textarea class="textarea" data-blk={b.id} data-key="options" rows={4}>{(b.options ?? []).join("\n")}</textarea>
                          </div>
                        ) : null}
                        {b.type === "file" ? (
                          <label class="checkbox-row field">
                            <input type="checkbox" data-blk={b.id} data-key="multiple" checked={!!b.multiple} />
                            <span>Allow multiple files</span>
                          </label>
                        ) : null}
                        <div class="flex gap8">
                          <a class="btn btn-secondary btn-sm" href={`/admin/forms/${form.id}/build`}>Close</a>
                          <span class="muted small" style="align-self:center">Changes apply on Save.</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div class="card mt16">
            <div class="card-b">
              <p class="small t2">Endpoint for this form: <code class="mono">{_origin}/f/{form.id}</code></p>
              <p class="hint small">After saving, Publish to make the draft live at the public renderer.</p>
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: BUILDER_JS }} />
    </AppShell>
  );
};

const BUILDER_JS = String.raw`
(function(){
  var ta = document.getElementById('schema_json');
  if(!ta) return;
  var schema;
  try{ schema = JSON.parse(ta.value); }catch(e){ schema = {version:2, blocks:[], settings:{submitText:"Submit", successMessage:"", redirectUrl:"", progressStyle:"bar", conversational:false}, pages:[{id:"page_1",title:"Page 1"}], variables:[], logic:[], endings:[]}; }
  if(!schema.blocks) schema.blocks = [];
  if(!schema.settings) schema.settings = {submitText:"Submit", successMessage:"", redirectUrl:"", progressStyle:"bar", conversational:false};
  if(schema.version===2){ if(!schema.pages||!schema.pages.length) schema.pages=[{id:"page_1",title:"Page 1"}]; if(!schema.variables) schema.variables=[]; if(!schema.logic) schema.logic=[]; if(!schema.endings) schema.endings=[]; }

  function persist(){ ta.value = JSON.stringify(schema); }

  function genId(){
    var a="abcdefghijkmnopqrstuvwxyz23456789";
    var b=crypto.getRandomValues(new Uint8Array(10));
    var s="blk_";
    for(var i=0;i<b.length;i++) s+=a[b[i]%a.length];
    return s;
  }
  function defaultsFor(type){
    var labelMap = {short_text:"Short text", long_text:"Long text", email:"Email", number:"Number", phone:"Phone", url:"URL", date:"Date", select:"Dropdown", radio:"Single choice", checkbox_choice:"Multiple choice", checkbox:"Checkbox (consent)", rating:"Rating 1–5", file:"File upload", heading:"Section heading", paragraph:"Add some helpful text for respondents.", divider:"Divider"};
    var lbl = labelMap[type] || type;
    var blk = {id: genId(), type: type, label: lbl, required:false, page_id:(schema.pages&&schema.pages[0]?schema.pages[0].id:"page_1")};
    if(type==="select"||type==="radio"||type==="checkbox_choice") blk.options=["Option 1","Option 2"];
    if(type==="file") blk.multiple=false;
    return blk;
  }
  function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  function getEditId(){ try{ return new URLSearchParams(location.search).get("edit"); }catch(e){ return null; } }

  function render(){
    var canvas = document.getElementById('builder-canvas');
    if(!canvas) return;
    var editId = getEditId();
    if(schema.blocks.length===0){
      canvas.innerHTML = '<div class="empty" style="padding:28px 12px"><p class="t2 small">No blocks yet. Add one from the palette.</p></div>';
      persist();
      return;
    }
    var defLabels = {short_text:"Short text", long_text:"Long text", email:"Email", number:"Number", phone:"Phone", url:"URL", date:"Date", select:"Dropdown", radio:"Single choice", checkbox_choice:"Multiple choice", checkbox:"Checkbox (consent)", rating:"Rating 1–5", file:"File upload", heading:"Heading", paragraph:"Paragraph", divider:"Divider"};
    var html = "";
    for(var i=0;i<schema.blocks.length;i++){
      var b = schema.blocks[i];
      var typeLabel = defLabels[b.type] || b.type;
      var req = b.required ? '<span class="badge badge-warning">required</span>' : '';
      var isEdit = editId === b.id;
      html += '<div class="card" id="blk-'+esc(b.id)+'" style="margin-bottom:8px;border:1px solid var(--border)" data-blk-id="'+esc(b.id)+'">';
      html += '<div class="flex between gap8" style="padding:10px 12px;align-items:center">';
      html += '<div style="min-width:0;flex:1"><div class="cell-main truncate" style="max-width:360px">'+esc(b.label||"(untitled)")+'</div>';
      html += '<div class="flex gap6" style="flex-wrap:wrap;margin-top:4px;align-items:center"><span class="badge badge-neutral">'+esc(typeLabel)+'</span><span class="mono muted small">'+esc(b.type)+'</span>'+req+'<span class="mono muted small">'+esc(b.id)+'</span></div></div>';
      html += '<div class="flex gap6" style="flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">';
      html += '<button type="button" class="btn btn-secondary btn-sm" data-move="up" data-id="'+esc(b.id)+'" '+(i===0?'disabled':'')+'>\u2191</button>';
      html += '<button type="button" class="btn btn-secondary btn-sm" data-move="down" data-id="'+esc(b.id)+'" '+(i===schema.blocks.length-1?'disabled':'')+'>\u2193</button>';
      html += '<button type="button" class="btn btn-secondary btn-sm" data-dup="'+esc(b.id)+'">Duplicate</button>';
      html += '<button type="button" class="btn btn-danger btn-sm" data-del="'+esc(b.id)+'">Delete</button>';
      if(isEdit){ html += '<a class="btn btn-primary btn-sm" href="'+esc(location.pathname)+'">Done</a>'; }
      else { html += '<a class="btn btn-secondary btn-sm" href="'+esc(location.pathname)+'?edit='+esc(b.id)+'">Edit</a>'; }
      html += '</div></div>';
      if(isEdit){
        html += '<div style="border-top:1px solid var(--border);padding:12px;background:var(--surface-secondary)">';
        html += '<div class="field"><label>Label</label><input class="input" data-blk="'+esc(b.id)+'" data-key="label" value="'+esc(b.label)+'"></div>';
        html += '<div class="field"><label>Placeholder</label><input class="input" data-blk="'+esc(b.id)+'" data-key="placeholder" value="'+esc(b.placeholder||'')+'" placeholder="Optional"></div>';
        html += '<div class="field"><label>Help text</label><input class="input" data-blk="'+esc(b.id)+'" data-key="help" value="'+esc(b.help||'')+'" placeholder="Optional"></div>';
        html += '<label class="checkbox-row field"><input type="checkbox" data-blk="'+esc(b.id)+'" data-key="required" '+(b.required?'checked':'')+'><span>Required</span></label>';
        if(schema.version===2){ html += '<div class="field"><label>Page</label><select class="select" data-blk="'+esc(b.id)+'" data-key="page_id">'; for(var pi=0;pi<schema.pages.length;pi++){ html += '<option value="'+esc(schema.pages[pi].id)+'" '+((b.page_id||schema.pages[0].id)===schema.pages[pi].id?'selected':'')+'>'+esc(schema.pages[pi].title)+'</option>'; } html += '</select></div>'; }
        if(b.type==="select"||b.type==="radio"||b.type==="checkbox_choice"){
          var opts = (b.options||[]).join("\n");
          html += '<div class="field"><label>Options (one per line)</label><textarea class="textarea" data-blk="'+esc(b.id)+'" data-key="options" rows="4">'+esc(opts)+'</textarea></div>';
        }
        if(b.type==="file"){
          html += '<label class="checkbox-row field"><input type="checkbox" data-blk="'+esc(b.id)+'" data-key="multiple" '+(b.multiple?'checked':'')+'><span>Allow multiple files</span></label>';
        }
        html += '<div class="flex gap8"><a class="btn btn-secondary btn-sm" href="'+esc(location.pathname)+'">Close</a><span class="muted small" style="align-self:center">Changes apply on Save.</span></div>';
        html += '</div>';
      }
      html += '</div>';
    }
    canvas.innerHTML = html;
  }

  function sel(value, options){ var h=''; for(var i=0;i<options.length;i++) h+='<option value="'+esc(options[i][0])+'" '+(value===options[i][0]?'selected':'')+'>'+esc(options[i][1])+'</option>'; return h; }
  function renderMeta(){
    if(schema.version!==2) return;
    var pe=document.getElementById('builder-pages'); if(pe){ var ph=''; schema.pages.forEach(function(p){ ph+='<div class="field flex gap6" data-page-row="'+esc(p.id)+'"><input class="input" data-page-id="'+esc(p.id)+'" value="'+esc(p.title||'')+'"><button type="button" class="btn btn-danger btn-sm" data-page-delete="'+esc(p.id)+'">Delete</button></div>'; }); pe.innerHTML=ph; }
    var ve=document.getElementById('builder-variables'); if(ve){ var vh=''; schema.variables.forEach(function(v){ vh+='<div class="field" data-var-row="'+esc(v.id)+'"><div class="flex gap6"><input class="input" data-var-name="'+esc(v.id)+'" value="'+esc(v.name||'')+'" placeholder="name"><select class="select" data-var-type="'+esc(v.id)+'">'+sel(v.type||'text',[["text","Text"],["number","Number"],["bool","Boolean"],["date","Date"],["currency","Currency"]])+'</select><button type="button" class="btn btn-danger btn-sm" data-var-delete="'+esc(v.id)+'">Delete</button></div><input class="input mt8" data-var-default="'+esc(v.id)+'" value="'+esc(v.defaultValue==null?'':v.defaultValue)+'" placeholder="Default value"><input class="input mt8" data-var-expression="'+esc(v.id)+'" value="'+esc(v.expression||'')+'" placeholder="Optional calculation, e.g. quantity * price"></div>'; }); ve.innerHTML=vh; }
    var re=document.getElementById('builder-rules'); if(re){ var rh=''; schema.logic.forEach(function(r){ var c=r.conditions&&r.conditions[0]||{source:'answer',key:'',operator:'equals',value:''}; var a=r.actions&&r.actions[0]||{type:'show',target:''}; rh+='<div class="card" style="padding:10px;margin-bottom:8px" data-rule-row="'+esc(r.id)+'"><div class="small muted" style="margin-bottom:6px">When</div><div class="flex gap6" style="flex-wrap:wrap"><select class="select" data-rule-match="'+esc(r.id)+'">'+sel(r.match||'all',[["all","all"],["any","any"]])+'</select><select class="select" data-rule-source="'+esc(r.id)+'">'+sel(c.source||'answer',[["answer","answer"],["var","variable"],["url","URL"],["meta","meta"]])+'</select><input class="input" data-rule-key="'+esc(r.id)+'" value="'+esc(c.key||'')+'" placeholder="field or variable id"><select class="select" data-rule-op="'+esc(r.id)+'">'+sel(c.operator||'equals',[["equals","equals"],["not_equals","not equals"],["contains","contains"],["gt","greater than"],["lt","less than"],["is_empty","is empty"],["is_not_empty","is not empty"]])+'</select><input class="input" data-rule-value="'+esc(r.id)+'" value="'+esc(c.value==null?'':c.value)+'" placeholder="value"></div><div class="small muted" style="margin:10px 0 6px">Then</div><div class="flex gap6" style="flex-wrap:wrap"><select class="select" data-action-type="'+esc(r.id)+'">'+sel(a.type||'show',[["show","show"],["hide","hide"],["require","require"],["jump-to-page","jump to page"],["jump-to-ending","jump to ending"],["redirect","redirect"],["set-variable","set variable"]])+'</select><input class="input" data-action-target="'+esc(r.id)+'" value="'+esc(a.target||'')+'" placeholder="target id or URL"><input class="input" data-action-value="'+esc(r.id)+'" value="'+esc(a.value||'')+'" placeholder="expression (optional)"><button type="button" class="btn btn-danger btn-sm" data-rule-delete="'+esc(r.id)+'">Delete</button></div></div>'; }); re.innerHTML=rh; }
  }

  document.addEventListener('click', function(e){
    if(schema.version===2){
      var pa=e.target.closest('[data-page-add]'); if(pa){ schema.pages.push({id:'page_'+Date.now(),title:'Page '+(schema.pages.length+1)}); persist(); renderMeta(); render(); return; }
      var pd=e.target.closest('[data-page-delete]'); if(pd){ if(schema.pages.length<=1){ alert('A form needs at least one page.'); return; } if(!confirm('Delete this page? Blocks on it will move to the first page.')) return; var pid=pd.getAttribute('data-page-delete'); schema.pages=schema.pages.filter(function(p){return p.id!==pid}); schema.blocks.forEach(function(b){if(b.page_id===pid)b.page_id=schema.pages[0].id}); persist(); renderMeta(); render(); return; }
      var va=e.target.closest('[data-var-add]'); if(va){ schema.variables.push({id:'var_'+Date.now(),name:'variable'+(schema.variables.length+1),type:'text',defaultValue:''}); persist(); renderMeta(); return; }
      var vd=e.target.closest('[data-var-delete]'); if(vd){ if(!confirm('Delete this variable?')) return; var vid=vd.getAttribute('data-var-delete'); schema.variables=schema.variables.filter(function(v){return v.id!==vid}); persist(); renderMeta(); return; }
      var ra=e.target.closest('[data-rule-add]'); if(ra){ var first=schema.blocks[0]; schema.logic.push({id:'rule_'+Date.now(),match:'all',conditions:[{source:'answer',key:first?first.id:'',operator:'equals',value:''}],actions:[{type:'show',target:''}]}); persist(); renderMeta(); return; }
      var rd=e.target.closest('[data-rule-delete]'); if(rd){ if(!confirm('Delete this rule?')) return; var rid=rd.getAttribute('data-rule-delete'); schema.logic=schema.logic.filter(function(r){return r.id!==rid}); persist(); renderMeta(); return; }
    }
    var add = e.target.closest('[data-add-type]');
    if(add){
      var t = add.getAttribute('data-add-type');
      if(!t) return;
      schema.blocks.push(defaultsFor(t));
      persist();
      render();
      return;
    }
    var dup = e.target.closest('[data-dup]');
    if(dup){
      var id = dup.getAttribute('data-dup');
      var idx = schema.blocks.findIndex(function(x){ return x.id===id; });
      if(idx!==-1){
        var orig = schema.blocks[idx];
        var copy = JSON.parse(JSON.stringify(orig));
        copy.id = genId();
        schema.blocks.splice(idx+1,0,copy);
        persist();
        render();
      }
      return;
    }
    var del = e.target.closest('[data-del]');
    if(del){
      var did = del.getAttribute('data-del');
      if(!confirm('Delete this block?')) return;
      schema.blocks = schema.blocks.filter(function(x){ return x.id!==did; });
      persist();
      render();
      return;
    }
    var mv = e.target.closest('[data-move]');
    if(mv){
      var mid = mv.getAttribute('data-id');
      var dir = mv.getAttribute('data-move');
      var mi = schema.blocks.findIndex(function(x){ return x.id===mid; });
      if(mi===-1) return;
      if(dir==="up" && mi>0){ var tmp=schema.blocks[mi-1]; schema.blocks[mi-1]=schema.blocks[mi]; schema.blocks[mi]=tmp; }
      if(dir==="down" && mi < schema.blocks.length-1){ var tmp2=schema.blocks[mi+1]; schema.blocks[mi+1]=schema.blocks[mi]; schema.blocks[mi]=tmp2; }
      persist();
      render();
      return;
    }
  });

  function findBlock(id){ for(var i=0;i<schema.blocks.length;i++) if(schema.blocks[i].id===id) return schema.blocks[i]; return null; }

  document.addEventListener('input', function(e){
    var t = e.target;
    if(!t || !t.getAttribute) return;
    var blk = t.getAttribute('data-blk');
    var key = t.getAttribute('data-key');
    if(!blk || !key) {
      var sk = t.getAttribute('data-settings-key');
      if(sk){
        if(sk==="submitText") schema.settings.submitText = t.value;
        if(sk==="successMessage") schema.settings.successMessage = t.value;
        if(sk==="redirectUrl") schema.settings.redirectUrl = t.value;
        if(sk==="progressStyle") schema.settings.progressStyle = t.value;
        persist();
      }
      var pageId=t.getAttribute('data-page-id'); if(pageId){ var pg=schema.pages&&schema.pages.find(function(p){return p.id===pageId}); if(pg)pg.title=t.value; persist(); return; }
      var varId=t.getAttribute('data-var-name')||t.getAttribute('data-var-type')||t.getAttribute('data-var-default')||t.getAttribute('data-var-expression'); if(varId&&schema.version===2){ var vid=varId; var vv=schema.variables.find(function(v){return v.id===vid}); if(vv){ if(t.getAttribute('data-var-name'))vv.name=t.value; if(t.getAttribute('data-var-type'))vv.type=t.value; if(t.getAttribute('data-var-default'))vv.defaultValue=t.value; if(t.getAttribute('data-var-expression'))vv.expression=t.value; persist(); } return; }
      var ruleId=t.getAttribute('data-rule-match')||t.getAttribute('data-rule-source')||t.getAttribute('data-rule-key')||t.getAttribute('data-rule-op')||t.getAttribute('data-rule-value')||t.getAttribute('data-action-type')||t.getAttribute('data-action-target')||t.getAttribute('data-action-value'); if(ruleId&&schema.version===2){ var rr=schema.logic.find(function(r){return r.id===ruleId}); if(rr){ var cc=rr.conditions[0]||(rr.conditions[0]={source:'answer',key:'',operator:'equals',value:''}); var aa=rr.actions[0]||(rr.actions[0]={type:'show',target:''}); if(t.getAttribute('data-rule-match'))rr.match=t.value; if(t.getAttribute('data-rule-source'))cc.source=t.value; if(t.getAttribute('data-rule-key'))cc.key=t.value; if(t.getAttribute('data-rule-op'))cc.operator=t.value; if(t.getAttribute('data-rule-value'))cc.value=t.value; if(t.getAttribute('data-action-type'))aa.type=t.value; if(t.getAttribute('data-action-target'))aa.target=t.value; if(t.getAttribute('data-action-value'))aa.value=t.value; persist(); } return; }
      return;
    }
    var b = findBlock(blk);
    if(!b) return;
    if(key==="label") b.label = t.value;
    else if(key==="placeholder") b.placeholder = t.value;
    else if(key==="help") b.help = t.value;
    else if(key==="page_id") b.page_id = t.value;
    else if(key==="options") {
      var lines = t.value.split("\n").map(function(s){ return s.trim(); }).filter(function(s){ return s.length>0; });
      b.options = lines;
    }
    persist();
    // update title in canvas without full render for label changes
    var card = document.getElementById('blk-'+blk);
    if(card && key==="label"){
      var title = card.querySelector('.cell-main');
      if(title) title.textContent = t.value || "(untitled)";
    }
  });
  document.addEventListener('change', function(e){
    var t = e.target;
    if(!t || !t.getAttribute) return;
    var sk=t.getAttribute('data-settings-key'); if(sk==='conversational'){ schema.settings.conversational=!!t.checked; persist(); return; }
    var blk = t.getAttribute('data-blk');
    var key = t.getAttribute('data-key');
    if(!blk || !key) return;
    var b = findBlock(blk);
    if(!b) return;
    if(key==="required") b.required = !!t.checked;
    if(key==="multiple") b.multiple = !!t.checked;
    persist();
    render();
  });

  // keep textarea in sync on load
  persist();
  renderMeta();
})();
`;
