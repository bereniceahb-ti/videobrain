import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

export const runtime="nodejs";

const NOTION_VERSION="2025-09-03";
const DATA_SOURCE_ID="b120386f-3112-4220-a639-7b39c8f2f52f";

type VideoRow={
 id:string;user_id:string;youtube_id:string;youtube_url:string;title:string;channel:string|null;
 category:string|null;tags:string[]|null;summary_short:string|null;summary_full:string|null;
 key_points:string[]|null;applications:string[]|null;summary_status:string|null;status:string|null;created_at:string;
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

export async function POST(req:NextRequest){
 const notionToken=process.env.NOTION_TOKEN;
 const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!notionToken)return NextResponse.json({error:"A integração do Notion ainda não foi autorizada no VideoBrain."},{status:503});
 if(!supabaseUrl||!supabaseKey)return NextResponse.json({error:"Configuração do servidor incompleta."},{status:500});

 const authHeader=req.headers.get("authorization")||"";
 const token=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";
 if(!token)return NextResponse.json({error:"Entre na sua conta para sincronizar com o Notion."},{status:401});

 const supabase=createClient(supabaseUrl,supabaseKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:userError}=await supabase.auth.getUser(token);
 if(userError||!user)return NextResponse.json({error:"Sessão inválida. Entre novamente."},{status:401});

 let body:{videoId?:string}={};
 try{body=await req.json();}catch{}
 if(!body.videoId)return NextResponse.json({error:"Vídeo não informado."},{status:400});

 const userDb=createClient(supabaseUrl,supabaseKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await userDb.from("videos").select("id,user_id,youtube_id,youtube_url,title,channel,category,tags,summary_short,summary_full,key_points,applications,summary_status,status,created_at").eq("id",body.videoId).eq("user_id",user.id).single();
 if(error||!data)return NextResponse.json({error:"Vídeo não encontrado na sua biblioteca."},{status:404});
 const video=data as VideoRow;

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

 const query=await notionFetch(notionToken,`/data_sources/${DATA_SOURCE_ID}/query`,{
  method:"POST",
  body:JSON.stringify({filter:{property:"Vídeo ID",rich_text:{equals:video.youtube_id}},page_size:1})
 });
 if(!query.response.ok){
  const msg=query.response.status===404?"A base do VideoBrain ainda não foi compartilhada com a integração do Notion.":String(query.raw?.message||"Não consegui acessar a base do Notion.");
  return NextResponse.json({error:msg},{status:502});
 }

 const existing=query.raw?.results?.[0];
 const saved=existing
  ?await notionFetch(notionToken,`/pages/${existing.id}`,{method:"PATCH",body:JSON.stringify({properties})})
  :await notionFetch(notionToken,"/pages",{method:"POST",body:JSON.stringify({parent:{type:"data_source_id",data_source_id:DATA_SOURCE_ID},properties,icon:{type:"emoji",emoji:"🧠"}})});

 if(!saved.response.ok){
  const msg=String(saved.raw?.message||"Não consegui salvar este vídeo no Notion.");
  return NextResponse.json({error:msg.slice(0,500)},{status:502});
 }
 return NextResponse.json({ok:true,pageId:saved.raw?.id,url:saved.raw?.url,action:existing?"updated":"created"});
}
