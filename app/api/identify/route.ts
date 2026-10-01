import {NextResponse} from "next/server";

export const runtime="nodejs";

type Detected={title:string;channel?:string;duration?:string;confidence?:number};
type YTItem={id:{videoId:string};snippet:{title:string;channelTitle:string;thumbnails:{medium?:{url:string};high?:{url:string}}}};

function cleanJson(text:string){
 const fenced=text.match(/```(?:json)?\s*([\s\S]*?)```/i);
 return (fenced?.[1]??text).trim();
}
function decode(s:string){return s.replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,"<").replace(/&gt;/g,">")}

async function detectImage(file:File):Promise<Detected[]>{
 const key=process.env.GEMINI_API_KEY;
 if(!key) throw new Error("GEMINI_API_KEY não configurada.");
 const bytes=Buffer.from(await file.arrayBuffer());
 const prompt=`Analise este screenshot de uma lista/interface do YouTube. Extraia APENAS vídeos visíveis. Ignore menus, anúncios, playlists como contêiner e textos de interface. Retorne JSON puro no formato {"videos":[{"title":"título exatamente como visível","channel":"canal se visível","duration":"duração se visível","confidence":0.0}]}. Não invente texto cortado. confidence deve refletir legibilidade, de 0 a 1.`;
 const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:file.type||"image/jpeg",data:bytes.toString("base64")}}]}],generationConfig:{temperature:0.1,responseMimeType:"application/json"}})
 });
 if(!res.ok) throw new Error(`Gemini respondeu ${res.status}: ${(await res.text()).slice(0,300)}`);
 const data=await res.json();
 const text=data?.candidates?.[0]?.content?.parts?.[0]?.text;
 if(!text) return [];
 const parsed=JSON.parse(cleanJson(text));
 return Array.isArray(parsed?.videos)?parsed.videos:[];
}

async function searchYouTube(v:Detected){
 const key=process.env.YOUTUBE_API_KEY;
 if(!key) throw new Error("YOUTUBE_API_KEY não configurada.");
 const q=[v.title,v.channel].filter(Boolean).join(" ");
 const u=new URL("https://www.googleapis.com/youtube/v3/search");
 u.searchParams.set("part","snippet");u.searchParams.set("type","video");u.searchParams.set("maxResults","3");u.searchParams.set("q",q);u.searchParams.set("key",key);
 const res=await fetch(u,{cache:"no-store"});
 if(!res.ok) throw new Error(`YouTube respondeu ${res.status}: ${(await res.text()).slice(0,300)}`);
 const data=await res.json();
 return ((data.items||[]) as YTItem[]).map((x,i)=>({youtubeId:x.id.videoId,title:decode(x.snippet.title),channel:decode(x.snippet.channelTitle),thumbnail:x.snippet.thumbnails?.high?.url||x.snippet.thumbnails?.medium?.url||"",url:`https://www.youtube.com/watch?v=${x.id.videoId}`,rank:i+1}));
}

export async function POST(req:Request){
 try{
  const form=await req.formData();
  const files=form.getAll("images").filter((x):x is File=>x instanceof File);
  if(!files.length) return NextResponse.json({error:"Envie pelo menos um print."},{status:400});
  if(files.length>8) return NextResponse.json({error:"Envie no máximo 8 prints por vez."},{status:400});
  const detected=(await Promise.all(files.map(detectImage))).flat();
  const unique=detected.filter((v,i,a)=>v?.title&&a.findIndex(x=>x.title.toLowerCase()===v.title.toLowerCase())===i).slice(0,25);
  const results=[];
  for(const v of unique){
   const candidates=await searchYouTube(v);
   results.push({detected:v,candidates});
  }
  return NextResponse.json({count:results.length,results});
 }catch(e){
  console.error(e);
  return NextResponse.json({error:e instanceof Error?e.message:"Falha ao identificar vídeos."},{status:500});
 }
}