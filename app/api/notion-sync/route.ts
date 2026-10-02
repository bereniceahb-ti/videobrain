import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {syncVideoToNotion,type NotionVideo} from "@/lib/notion";

export const runtime="nodejs";

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

 try{
  const result=await syncVideoToNotion(notionToken,data as NotionVideo);
  return NextResponse.json({ok:true,...result});
 }catch(error){
  const message=error instanceof Error?error.message:"Não consegui sincronizar com o Notion.";
  return NextResponse.json({error:message.slice(0,500)},{status:502});
 }
}
