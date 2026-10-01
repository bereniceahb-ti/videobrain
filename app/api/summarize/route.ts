import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

export const runtime="nodejs";
export const maxDuration=300;

const MODEL="gemini-3.5-flash-lite";

type SummaryPayload={
 summary_short:string;
 summary_full:string;
 key_points:string[];
 applications:string[];
 category:string;
 tags:string[];
};

const cleanArray=(value:unknown)=>Array.isArray(value)?value.filter((x):x is string=>typeof x==="string").slice(0,12):[];

export async function POST(req:NextRequest){
 const apiKey=process.env.GEMINI_API_KEY;
 const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!apiKey||!supabaseUrl||!supabaseKey)return NextResponse.json({error:"Configuração do servidor incompleta."},{status:500});

 const authHeader=req.headers.get("authorization")||"";
 const token=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";
 if(!token)return NextResponse.json({error:"Entre na sua conta para gerar resumos."},{status:401});

 const supabase=createClient(supabaseUrl,supabaseKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:userError}=await supabase.auth.getUser(token);
 if(userError||!user)return NextResponse.json({error:"Sessão inválida. Entre novamente."},{status:401});

 let body:{videoId?:string}={};
 try{body=await req.json();}catch{}
 if(!body.videoId)return NextResponse.json({error:"Vídeo não informado."},{status:400});

 const userDb=createClient(supabaseUrl,supabaseKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:video,error:videoError}=await userDb.from("videos").select("id,user_id,youtube_url,title,channel").eq("id",body.videoId).eq("user_id",user.id).single();
 if(videoError||!video)return NextResponse.json({error:"Vídeo não encontrado na sua biblioteca."},{status:404});

 await userDb.from("videos").update({summary_status:"processing",summary_error:null}).eq("id",video.id);

 const prompt=`Você é o motor de aprendizagem do VideoBrain. Analise integralmente este vídeo público do YouTube e responda em português do Brasil.\n\nTítulo: ${video.title}\nCanal: ${video.channel||"não informado"}\n\nObjetivo: transformar o vídeo em material útil para estudo e recuperação ativa, sem inventar informações que não estejam no conteúdo.\n\nRetorne SOMENTE JSON válido com exatamente estas chaves:\n{\n  "summary_short": "resumo objetivo em 3 a 5 frases",\n  "summary_full": "resumo completo, claro e estruturado em parágrafos, cobrindo ideias centrais, argumentos, exemplos e conclusões relevantes",\n  "key_points": ["5 a 10 pontos principais, cada um autoexplicativo"],\n  "applications": ["2 a 6 aplicações práticas, quando fizer sentido"],\n  "category": "uma categoria curta em português",\n  "tags": ["3 a 8 tags curtas"]\n}\n\nSe algum item não se aplicar, use lista vazia. Não inclua markdown fora do JSON.`;

 try{
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
   method:"POST",
   headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
   body:JSON.stringify({
    contents:[{parts:[{text:prompt},{file_data:{file_uri:video.youtube_url}}]}],
    generationConfig:{responseMimeType:"application/json"}
   })
  });
  const raw=await response.json();
  if(!response.ok){
   const msg=raw?.error?.message||"O Gemini não conseguiu processar este vídeo.";
   await userDb.from("videos").update({summary_status:"failed",summary_error:String(msg).slice(0,500)}).eq("id",video.id);
   return NextResponse.json({error:msg},{status:502});
  }
  const text=(raw?.candidates?.[0]?.content?.parts||[]).map((p:{text?:string})=>p.text||"").join("").trim();
  if(!text)throw new Error("A IA não retornou conteúdo para este vídeo.");
  const parsed=JSON.parse(text) as Partial<SummaryPayload>;
  const summary:SummaryPayload={
   summary_short:typeof parsed.summary_short==="string"?parsed.summary_short.trim():"",
   summary_full:typeof parsed.summary_full==="string"?parsed.summary_full.trim():"",
   key_points:cleanArray(parsed.key_points),
   applications:cleanArray(parsed.applications),
   category:typeof parsed.category==="string"?parsed.category.trim().slice(0,120):"",
   tags:cleanArray(parsed.tags).slice(0,8)
  };
  if(!summary.summary_short&&!summary.summary_full)throw new Error("A IA retornou um resumo vazio.");

  const {error:updateError}=await userDb.from("videos").update({
   ...summary,
   summary_status:"ready",
   summary_error:null,
   summarized_at:new Date().toISOString(),
   updated_at:new Date().toISOString()
  }).eq("id",video.id);
  if(updateError)throw new Error("O resumo foi gerado, mas não consegui salvá-lo na biblioteca.");

  return NextResponse.json({ok:true,summary});
 }catch(error){
  const message=error instanceof Error?error.message:"Falha ao resumir o vídeo.";
  await userDb.from("videos").update({summary_status:"failed",summary_error:message.slice(0,500)}).eq("id",video.id);
  return NextResponse.json({error:message},{status:500});
 }
}
