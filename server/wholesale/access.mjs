const fail=(status,message)=>Object.assign(Error(message),{status});
export async function verifiedWholesaleSession(req,admin){
 if(!req.user?.id||req.user.is_anonymous)throw fail(401,'Ingresá con tu cuenta MateBreak para acceder a Compra Mayorista');
 // getUser already validated identity with Supabase. The cookie's JWT is used
 // only to locate that verified user's live session, never as authorization.
 const {data,error}=await req.auth.auth.getSession();
 let session;try{session=JSON.parse(Buffer.from(data?.session?.access_token?.split('.')[1]||'','base64url').toString()).session_id;}catch{}
 if(error||typeof session!=='string'||!/^[0-9a-f-]{36}$/i.test(session))throw fail(401,'Tu sesión venció. Volvé a ingresar.');
 const result=await admin.rpc('mb_wholesale_access',{p_user:req.user.id,p_session:session});
 if(result.error)throw fail(503,'No pudimos verificar tu acceso. Reintentá.');
 if(result.data!==true)throw fail(401,'Tu sesión venció o requiere confirmar el email. Volvé a ingresar.');
 return session;
}
