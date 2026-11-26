import { officialUrl,pageMetadata } from "../public/cms-transfer.js";
import { fail } from "./security.mjs";
// Exact, repository-known official sites. Additional domains must be deliberately configured.
const defaults=["paletteproject.jp","www.paletteproject.jp","proforma-production.jp","www.proforma-production.jp","jcm-event.bitfan.id"];
export async function fetchOfficialMetadata(source, extra="", transport=fetch){
  let url;try{url=officialUrl(source);}catch{fail(400,"cms_invalid_source_url");}
  const hosts=new Set([...defaults,...String(extra||"").split(",").map(v=>v.trim().toLowerCase()).filter(v=>/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(v)&&!/\.(?:local|internal|localhost|test|invalid|example|onion)$/.test(v))]);
  if(!hosts.has(url.hostname))fail(400,"cms_source_host_not_allowed");
  url.hash="";
  try{
    const response=await transport(url,{method:"GET",redirect:"manual",headers:{Accept:"text/html,application/xhtml+xml"},signal:AbortSignal.timeout(8000),cache:"no-store"});
    if(!response.ok||!/^text\/html\b|^application\/xhtml\+xml\b/i.test(response.headers.get("content-type")||""))fail(502,"cms_source_unavailable");
    if(Number(response.headers.get("content-length"))>524288){await response.body?.cancel();fail(413,"cms_source_too_large");}
    const reader=response.body?.getReader();if(!reader)fail(502,"cms_source_unavailable");
    const decoder=new TextDecoder();let bytes=0,html="";
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>524288){await reader.cancel();fail(413,"cms_source_too_large");}html+=decoder.decode(value,{stream:true});}
    html+=decoder.decode();
    return {...pageMetadata(html,url.href),source:"official-html",retrievedAt:new Date().toISOString()};
  }catch(error){if(error?.message==="cms_source_too_large")throw error;fail(502,"cms_source_unavailable");}
}
