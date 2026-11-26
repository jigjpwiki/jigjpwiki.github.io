import { prepareDraft, draftDetails, writeDraft, draftGroups, draftTypes } from "./cms-draft.mjs";
import { parseTransfer, newRecordInput, editFields, editableKeys } from "../public/cms-transfer.js";
import { hasAllContent, cmsPermissions } from "./cms-scope.mjs";
import { planSubmission, equal, recordAt } from "./submission-plan.mjs";
import { fail, hash } from "./security.mjs";

function expectedValue(before, entity, field, value) {
  if(field==="visibility"){if(!["public","draft"].includes(value))fail(400,"cms_invalid_batch");return ["visibility",value];}
  if(field==="activity"&&!["unknown","active","hiatus","retired","ended"].includes(value))fail(400,"cms_invalid_batch");
  if(field==="verification"&&!["verified","unreviewed","rejected"].includes(value))fail(400,"cms_invalid_batch");
  if(field==="format"&&!["unknown","onsite","online","hybrid"].includes(value))fail(400,"cms_invalid_batch");
  if(field==="status"&&!["unknown","scheduled","on_sale","ended","sold_out"].includes(value))fail(400,"cms_invalid_batch");
  const path=editFields[entity]?.[field];if(!path)fail(400,"cms_invalid_batch");
  if(["artists","aliases","readings"].includes(field)){const lines=[...new Set(value.split("\n").map(v=>v.trim()).filter(Boolean))];return [path,field==="artists"&&!lines.length?null:lines];}
  if(field==="image")return [path,value.trim()?{url:value.trim()}:null];
  if(["officialProfileUrl","thumbnailUrl"].includes(field))return [path,value.trim()||undefined];
  if(["name","displayName","title","rawLabel","rawSongTitle"].includes(field)&&!value.trim())fail(400,"cms_invalid_batch");
  return [path,value.trim()||null];
}
export async function prepareTransfer(snapshot, member, input, existing=[], lookup) {
  if(member.role!=="editor"||!hasAllContent(member))fail(403,"cms_scope_denied");
  if(input?.sha!==snapshot.sha)fail(409,"main_changed_reload");
  const {entity,mode}=input;
  if(!Object.hasOwn(draftTypes,entity))fail(400,"cms_invalid_batch");
  let rows;try{rows=parseTransfer(JSON.stringify(input.rows),"json",entity,mode);}catch{fail(400,"cms_invalid_batch");}
  const subjects=new Set(existing.filter(op=>op.id).map(op=>op.entity+":"+op.id));
  const requested=new Set();const access=cmsPermissions(snapshot.models,member);
  let result=existing;const draftIds=[],combined=[],preview=[];
  for(const [index,row] of rows.entries()){
    let values,expected;
    if(mode==="update"){
      const {id,...changes}=row;const subject=entity+":"+id;
      if(requested.has(subject)||subjects.has(subject))fail(409,"cms_bulk_existing_draft");requested.add(subject);
      const before=recordAt(snapshot.models,{entity,id});if(!access.canRead(entity,before))fail(403,"cms_scope_denied");
      expected=structuredClone(before);let changed=false;
      for(const [field,value] of Object.entries(changes)){
        if(!editableKeys(entity).includes(field))fail(400,"cms_invalid_batch");
        const [path,next]=expectedValue(before,entity,field,value);
        const parts=path.split(".");let target=expected;for(const p of parts.slice(0,-1))target=target[p];
        const key=parts.at(-1);
        if(next===undefined){if(Object.hasOwn(target,key)){delete target[key];changed=true;}}
        else if(!equal(target[key],next)){target[key]=next;changed=true;}
      }
      if(!changed){preview.push({row:index+1,id,unchanged:true});continue;}
      values={...draftDetails(snapshot,member,entity,id),...changes,id};
    }else{
      values=newRecordInput(entity,row);
      // Import creates new records only. Nested existing identities must never be overwritten implicitly.
      function assertNew(v){if(Array.isArray(v))v.forEach(assertNew);else if(v&&typeof v==="object"){if(Object.hasOwn(v,"id")||Object.hasOwn(v,"draftId")||Object.hasOwn(v,"sha"))fail(400,"cms_invalid_batch");Object.values(v).forEach(assertNew);}}
      assertNew(values);
    }
    const group=await prepareDraft(snapshot,member,{...values,entity,sha:snapshot.sha},lookup);
    for(const op of group){
      if(mode==="update"){
        if(!op.id||!op.before)fail(409,"cms_bulk_unsafe_roundtrip");
        if(!equal(op.entity===entity&&op.id===row.id?expected:op.before,op.value))fail(409,"cms_bulk_unsafe_roundtrip");
      }else if(op.id)fail(409,"cms_bulk_unsafe_roundtrip");
      if(op.id){const subject=op.entity+":"+op.id;if(subjects.has(subject))fail(409,"cms_bulk_existing_draft");subjects.add(subject);}
    }
    const written=writeDraft(result,undefined,group);result=written.operations;draftIds.push(written.id);
    combined.push(...draftGroups(result).get(written.id));
    preview.push({row:index+1,id:row.id||null,name:row.displayName||row.title||row.name||row.rawSongTitle||row.rawLabel||row.videoUrl||row.id,operations:group.length});
  }
  if(!combined.length)fail(409,"no_changes");
  if(combined.length>60)fail(413,"workspace_operation_limit");
  const plan=await planSubmission(snapshot,combined,{actor:"0",batchId:await hash(combined)});
  if(plan.conflicts?.length)fail(409,"main_changed_reload");
  const after=cmsPermissions({...snapshot.models,...plan.files},member);
  for(const row of plan.impact.records)after.assertChange(row.entity,row.before,row.value);
  return {operations:result,draftIds,preview};
}
