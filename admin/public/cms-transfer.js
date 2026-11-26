// Shared transfer vocabulary: form-input fields, not raw database objects.
export const transferFields = {
  organization:"name",group:"name organizationId talentIds visibility",
  talent:"displayName image activity officialProfileUrl aliasNames youtubeUrl xUrl twitchUrl tiktokUrl wikiUrl agencyState affiliations visibility",
  song:"title artists aliases readings songIdentityUrl visibility",
  event:"title announcementUrl summary venue starts ends format streamUrl fee thumbnailUrl performers groupIds organizerIds relatedOrganizationIds visibility",
  anniversary:"title kind month day year talentIds groupIds visibility",
  musicVideo:"rawSongTitle videoUrl videoKind songId talentIds newSongTitle newSongArtist newSongUrl visibility",
  video:"videoUrl visibility",karaoke:"videoUrl talentIds setlist complete visibility",
  performance:"rawLabel order startsAtSeconds endsAtSeconds verification karaokeId songId talentIds visibility",
  product:"title image identityUrl talentIds groupIds sales visibility",
  campaign:"title campaignImage products visibility",offer:"productId campaignId url price currency startsAt endsAt status periodNote visibility"
};
export const editFields = {
  organization:{name:"name"}, group:{name:"name"},
  talent:{displayName:"displayName",activity:"activityStatus.value",officialProfileUrl:"officialProfileUrl",image:"profileImage"},
  song:{title:"title",artists:"originalArtists",aliases:"aliases",readings:"readings"},
  event:{title:"title",summary:"summary",venue:"venue",format:"format",thumbnailUrl:"thumbnailUrl"},
  anniversary:{title:"title"},musicVideo:{rawSongTitle:"rawSongTitle"},
  video:{title:"title"},performance:{rawLabel:"rawLabel",verification:"verification"},
  product:{title:"title"},campaign:{title:"title"},offer:{periodNote:"periodNote",status:"status"},karaoke:{}
};
export const editableKeys = entity => [...Object.keys(editFields[entity]||{}),...(entity==="organization"?[]:["visibility"])];
const arrays = new Set(["talentIds","groupIds","organizerIds","relatedOrganizationIds","performers","affiliations","setlist","sales","products"]);
const object = x => x && typeof x==="object"&&!Array.isArray(x);
export function parseCsv(source, delimiter=",") {
  const input=source.replace(/^\uFEFF/,"");const rows=[];let row=[],cell="",quoted=false,closed=false;
  const push=()=>{row.push(cell);cell="";closed=false;};
  const line=()=>{push();if(row.some(v=>v!==""))rows.push(row);row=[];};
  for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'){if(input[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c===delimiter){push();continue;}if(c==="\n"||c==="\r"){if(c==="\r"&&input[i+1]==="\n")i++;line();continue;}
    if(closed)throw Error("閉じ引用符の後に区切り文字が必要です。");
    if(c==='"'){if(cell)throw Error("引用符の位置が不正です。");quoted=true;}else cell+=c;
  }
  if(quoted)throw Error("引用符が閉じられていません。");if(cell||row.length||closed)line();
  if(rows.length<2)throw Error("ヘッダーと1行以上のデータが必要です。");
  const header=rows.shift().map(v=>v.trim());if(header.some(v=>!v)||new Set(header).size!==header.length)throw Error("列名が空欄または重複しています。");
  return rows.map((row,i)=>{if(row.length!==header.length)throw Error((i+2)+"行目の列数が一致しません。");return Object.fromEntries(header.map((key,j)=>[key,row[j]]));});
}
export function parseTransfer(source, format, entity, mode) {
  if(typeof source!=="string"||source.length>100000)throw Error("入力は100KB相当までです。");
  let rows=format==="json"?JSON.parse(source.replace(/^\uFEFF/,"")):parseCsv(source,format==="tsv"?"\t":",");
  if(!Array.isArray(rows)||!rows.length||rows.length>12||rows.some(r=>!object(r)))throw Error("1〜12件のレコードを入力してください。");
  if(!Object.hasOwn(transferFields,entity)||!["create","update"].includes(mode))throw Error("未対応のデータ種類です。");
  const allowed=new Set(mode==="create"?transferFields[entity].split(" "):["id",...editableKeys(entity)]);
  return rows.map((row,i)=>{
    const result={};
    for(const [key,value] of Object.entries(row)){
      if(!allowed.has(key))throw Error((i+1)+"件目：未対応の列 "+key);
      if(arrays.has(key)){let v=value;if(typeof v==="string")v=v.trim()?JSON.parse(v):[];if(!Array.isArray(v))throw Error(key+"はJSON配列で指定してください。");result[key]=v;}
      else if(key==="complete"){if(![true,false,"true","false",""].includes(value))throw Error("complete は true / false を指定してください。");result[key]=value===true||value==="true";}
      else{if(typeof value!=="string"&&typeof value!=="number")throw Error(key+"は文字列または数値で指定してください。");result[key]=String(value);}
    }
    if(mode==="update"&&(!result.id||Object.keys(result).length<2))throw Error("固定IDと変更項目が必要です。");
    return result;
  });
}
export function newRecordInput(entity,row){
  const defaults={
    talent:{displayName:"",image:"",activity:"unknown",affiliations:[],agencyState:"unknown"},
    group:{name:"",talentIds:[]},organization:{name:""},song:{title:"",artists:"",aliases:"",readings:""},
    event:{title:"",announcementUrl:"",summary:"",venue:"",format:"unknown",performers:[],groupIds:[],organizerIds:[],relatedOrganizationIds:[]},
    anniversary:{title:"",kind:"birthday",month:"",day:"",year:"",talentIds:[],groupIds:[]},
    musicVideo:{rawSongTitle:"",videoKind:"cover",talentIds:[]},karaoke:{talentIds:[],setlist:[],complete:false},
    performance:{rawLabel:"",verification:"unreviewed",order:"",startsAtSeconds:"",endsAtSeconds:""},
    product:{title:"",image:"",identityUrl:"",talentIds:[],groupIds:[],sales:[]},
    campaign:{title:"",products:[]},offer:{price:"",currency:"JPY",status:"unknown",periodNote:""}
  };
  return {...defaults[entity],...(entity==="organization"?{}:{visibility:"draft"}),...row};
}

// HTML is parsed as inert text. Never render remote markup or execute scripts.
export function officialUrl(value) {
  const url=new URL(value);
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.href.length>2048)throw Error("公開HTTPS URLを指定してください。");
  return url;
}
function decodeMetadata(value){
  const entities={amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" "};
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(all,k)=>{
    if(k[0]!=="#")return entities[k.toLowerCase()]||all;
    const code=k[1].toLowerCase()==="x"?parseInt(k.slice(2),16):Number(k.slice(1));
    return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):"";
  }).replace(/\s+/g," ").trim();
}
export function pageMetadata(html,source) {
  const base=officialUrl(source);
  if(typeof html!=="string"||html.length>524288)throw Error("HTMLは512KiB相当までです。");
  const head=html.split(/<\/head\s*>|<body(?:\s|>)/i,1)[0].replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,"");
  const meta=new Map();
  for(const tag of head.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)){
    const attrs=new Map();
    for(const a of tag[0].matchAll(/([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))attrs.set(a[1].toLowerCase(),a[2]??a[3]??a[4]);
    const key=(attrs.get("property")||attrs.get("name")||"").toLowerCase();
    if(key&&attrs.has("content")&&!meta.has(key))meta.set(key,decodeMetadata(attrs.get("content")));
  }
  const title=(meta.get("og:title")||meta.get("twitter:title")||decodeMetadata(head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]||"")).slice(0,500);
  const description=(meta.get("og:description")||meta.get("description")||meta.get("twitter:description")||"").slice(0,2000);
  let image="";try{const raw=meta.get("og:image")||meta.get("twitter:image");if(raw)image=officialUrl(new URL(raw,base).href).href;}catch{}
  return {title,description,image,url:base.href};
}
