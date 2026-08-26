import { FC } from "hono/jsx";
import { AppShell, CommandItem } from "../ui/shell";
import { PageHead } from "../ui/components";
import { FormRow } from "../types";
import { FormSchema, BlockType, BLOCK_DEFS } from "../blocks";

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
              <p class="hint small">Saved with the schema.</p>
            </div>
          </div>
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
  try{ schema = JSON.parse(ta.value); }catch(e){ schema = {version:1, blocks:[], settings:{submitText:"Submit", successMessage:"", redirectUrl:""}}; }
  if(!schema.blocks) schema.blocks = [];
  if(!schema.settings) schema.settings = {submitText:"Submit", successMessage:"", redirectUrl:""};

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
    var blk = {id: genId(), type: type, label: lbl, required:false};
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

  document.addEventListener('click', function(e){
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
        persist();
      }
      return;
    }
    var b = findBlock(blk);
    if(!b) return;
    if(key==="label") b.label = t.value;
    else if(key==="placeholder") b.placeholder = t.value;
    else if(key==="help") b.help = t.value;
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
})();
`;
