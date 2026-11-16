'use strict';
const {hash}=require('./official-discovery');
const {validateCatalog}=require('./catalog');const {validateEvents}=require('./feature-data');
const names=['events','goods','media','feature-id-registry','catalog','catalog-id-registry'];
function planRegistration(before,review,talents,anniversaries){
 if(!require('./talents').ajv.compile(require('../schemas/catalog-registration.schema.json'))(review))throw new Error('invalid_review_schema');
 if(review.baseHash!==hash(before)&&review.resultHash!==hash(before))throw new Error('main_conflict');const after=structuredClone(before);const changes=[];
 for(const patch of review.patches){if(!names.includes(patch.file)||!Array.isArray(after[patch.file]?.[patch.collection]))throw new Error('invalid_patch_target');const rows=after[patch.file][patch.collection],key=patch.collection==='videos'?'youtubeId':'id',index=rows.findIndex(r=>r[key]===patch.record[key]),old=index<0?null:rows[index];if(hash(old)===hash(patch.record))continue;
 if(patch.status!=='confirmed'||patch.evidenceHash!==hash(patch.record)||patch.expectedHash!==hash(old))throw new Error('unverified_or_conflicting_patch');
 if(index<0)rows.push(patch.record);else rows[index]=patch.record;changes.push({file:patch.file,collection:patch.collection,id:patch.record.id,before:old,after:patch.record});
 }
 // Registries only add IDs; never recycle or remove issued identifiers.
 for(const [registry,collections]of [['catalog-id-registry',[[after.catalog,'groups'],[after.goods,'products'],[after.goods,'campaigns'],[after.goods,'offers']]],['feature-id-registry',[[after.events,'events']]]])for(const [model,key]of collections)for(const row of model[key])if(!after[registry].issued.includes(row.id))after[registry].issued.push(row.id);
 validateCatalog(talents,after.catalog,anniversaries,after.goods,after['catalog-id-registry']);validateEvents(talents,after.catalog,after.media,after.events,after['feature-id-registry']);
 return {baseHash:hash(before),resultHash:hash(after),changes,result:after,rollback:before};
}
module.exports={names,planRegistration};
