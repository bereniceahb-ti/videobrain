import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";

type Candidate={youtubeId:string;title:string;channel:string;thumbnail:string;url:string;rank:number};

function extractYouTubeId(input:string){
 try{
  const raw=input.trim();
  const url=new URL(raw.startsWith("http")?raw:`https://${raw}`);
  const host=url.hostname.replace(/^www\./,"");
  if(host==="youtu.be")return url.pathname.split("/").filter(Boolean)[0]||null;
  if(host==="youtube.com"||host==="m.youtube.com"||host==="music.youtube.com"){
   if(url.pathname==="/watch")return url.searchParams.get("v");
   const parts=url.pathname.split("/").filter(Boolean);
   if(["shorts","embed","live"].includes(parts[0]))return parts[1]||null;
  }
 }catch{}
 return null;
}

export async function POST(req:NextRequest){
 const apiKey=process.env.YOUTUBE_API_KEY;
 if(!apiKey)return NextResponse.json({error:"A chave da API do YouTube não está configurada."},{status:500});

 let body:{links?:string[];text?:string}={};
 try{body=await req.json();}catch{}
 const rawLinks=Array.isArray(body.links)?body.links:String(body.text||"").split(/\s+/).filter(Boolean);
 const parsed=rawLinks.map(link=>({link,id:extractYouTubeId(link)}));
 const invalid=parsed.filter(x=>!x.id).map(x=>x.link);
 const ids=[...new Set(parsed.map(x=>x.id).filter((x):x is string=>Boolean(x)))].slice(0,50);
 if(!ids.length)return NextResponse.json({error:"Não encontrei links válidos do YouTube.",invalid},{status:400});

 const endpoint=new URL("https://www.googleapis.com/youtube/v3/videos");
 endpoint.searchParams.set("part","snippet");
 endpoint.searchParams.set("id",ids.join(","));
 endpoint.searchParams.set("key",apiKey);
 const response=await fetch(endpoint.toString(),{cache:"no-store"});
 const raw=await response.json();
 if(!response.ok)return NextResponse.json({error:raw?.error?.message||"Não consegui consultar o YouTube."},{status:502});

 const byId=new Map<string,any>((raw.items||[]).map((item:any)=>[item.id,item]));
 const results=ids.map(id=>{
  const item=byId.get(id);
  if(!item)return null;
  const snippet=item.snippet||{};
  const c:Candidate={
   youtubeId:id,
   title:snippet.title||"Vídeo do YouTube",
   channel:snippet.channelTitle||"",
   thumbnail:snippet.thumbnails?.medium?.url||snippet.thumbnails?.high?.url||snippet.thumbnails?.default?.url||`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
   url:`https://www.youtube.com/watch?v=${id}`,
   rank:1
  };
  return {detected:{title:c.title,channel:c.channel,confidence:1},candidates:[c]};
 }).filter(Boolean);

 const notFound=ids.filter(id=>!byId.has(id));
 return NextResponse.json({count:results.length,results,invalid,notFound});
}
