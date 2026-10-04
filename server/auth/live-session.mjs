const fail=(status,message)=>Object.assign(Error(message),{status});
// Identity must first be verified with getUser. JWT contents locate its session,
// never grant a role or authorize an identity independently.
export async function requireLiveSession(req,admin){
 if(!req.user?.id||req.user.is_anonymous)throw fail(401,'Tu sesión venció. Volvé a ingresar.');
 const result=await req.auth.auth.getSession();let id;
 try{id=JSON.parse(Buffer.from(result.data?.session?.access_token?.split('.')[1]||'','base64url')).session_id;}catch{}
 if(result.error||typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw fail(401,'Tu sesión venció. Volvé a ingresar.');
 const live=await admin.rpc('mb_wholesale_access',{p_user:req.user.id,p_session:id});
 if(live.error)throw fail(503,'No pudimos verificar tu sesión. Reintentá.');
 if(live.data!==true)throw fail(401,'Tu sesión venció o requiere confirmar el email. Volvé a ingresar.');
 req.liveSessionId=id;return true;
}
