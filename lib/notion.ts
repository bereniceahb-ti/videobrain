const NOTION_VERSION="2026-03-11";
const DATA_SOURCE_ID="b120386f-3112-4220-a639-7b39c8f2f52f";

export type NotionVideo={
 id:string;
 youtube_id:string;
 youtube_url:string;
 title:string;
 channel:string|null;
 category:string|null;
 tags:string[]|null;
 summary_short:string|null;
 summary_full:string|null;
 key_points:string[]|null;
 applications:string[]|null;
 summary_status:string|null;
 status:string|null;
 created_at:string;
};

const rich=(value:string)=>value?Array.from({length:Math.ceil(value.length/1900)},(_,i)=>({
 type:"text",text:{content:value.slice(i*1900,(i+1)*1900)}
})):[];
const joined=(items:string[]|null)=>Array.isArray(items)?items.map(x=>`• ${x}`).join("\n"):"";
const studyStatus=(s:string|null)=>s==="ja_conheco"?"Aprendido":"Quero estudar";
const summaryStatus=(s:string|null)=>s==="ready"?"Pronto":s==="processing"?"Resumindo":s==="failed"?"Falhou":"Pendente";

async function notionFetch(token:string,path:string,init:RequestInit={}){
 const response=await fetch(`https://api.notion.com/v1${path}`,{
  ...init,
  headers:{
   Authorization:`Bearer ${token}`,
   "Notion-Version":NOTION_VERSION,
   "Content-Type":"application/json",
   ...(init.headers||{})
  }
 });
 let raw:any={};
 try{raw=await response.json();}catch{}
 return {response,raw};
}

export async function syncVideoToNotion(token:string,video:NotionVideo){
 const properties={
  "Título":{title:rich(video.title)},
  "Canal":{rich_text:rich(video.channel||"")},
  "Link do YouTube":{url:video.youtube_url},
  "Categoria":{select:{name:video.category||"Sem categoria"}},
  "Tags":{multi_select:(video.tags?.length?video.tags:["geral"]).slice(0,20).map(name=>({name:name.slice(0,100)}))},
  "Resumo curto":{rich_text:rich(video.summary_short||"")},
  "Resumo completo":{rich_text:rich(video.summary_full||"")},
  "Pontos principais":{rich_text:rich(joined(video.key_points))},
  "Aplicações práticas":{rich_text:rich(joined(video.applications))},
  "Status de estudo":{select:{name:studyStatus(video.status)}},
  "Status do resumo":{select:{name:summaryStatus(video.summary_status)}},
  "Data de inclusão":{date:{start:video.created_at.slice(0,10)}},
  "Vídeo ID":{rich_text:rich(video.youtube_id)}
 };

 const query=await notionFetch(token,`/data_sources/${DATA_SOURCE_ID}/query`,{
  method:"POST",
  body:JSON.stringify({filter:{property:"Vídeo ID",rich_text:{equals:video.youtube_id}},page_size:1})
 });
 if(!query.response.ok){
  const message=query.response.status===404
   ?"A base do VideoBrain ainda não foi compartilhada com a integração do Notion."
   :String(query.raw?.message||"Não consegui acessar a base do Notion.");
  throw new Error(message);
 }

 const existing=query.raw?.results?.[0];
 const saved=existing
  ?await notionFetch(token,`/pages/${existing.id}`,{method:"PATCH",body:JSON.stringify({properties})})
  :await notionFetch(token,"/pages",{method:"POST",body:JSON.stringify({
    parent:{type:"data_source_id",data_source_id:DATA_SOURCE_ID},
    properties,
    icon:{type:"emoji",emoji:"🧠"}
   })});

 if(!saved.response.ok)throw new Error(String(saved.raw?.message||"Não consegui salvar este vídeo no Notion.").slice(0,500));

 return {
  pageId:saved.raw?.id as string|undefined,
  url:saved.raw?.url as string|undefined,
  action:(existing?"updated":"created") as "updated"|"created"
 };
}
