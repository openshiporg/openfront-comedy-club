import crypto from 'node:crypto';
import { permissions, type Permission } from '../access';
import { getOrCreateIdempotencyAttempt, updateIdempotencyAttempt } from '../utils/idempotency';
export const code = (prefix='') => prefix+crypto.randomBytes(10).toString('hex').toUpperCase();
export const hash = (token:string) => crypto.createHash('sha256').update(token).digest('hex');
export function requirePermission(context:any, permission:Permission) { if (!context.session?.itemId || !permissions[permission]({session:context.session})) throw new Error('Not authorized'); }
export async function lockTransactionKey(tx:any,key:string) { const result=await tx.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key},0))) AS acquired`; if(result instanceof Error) throw result; }
export async function audit(tx:any,context:any,action:string,targetList:string,targetId:string,before:any,after:any,reason='') { return tx.auditEvent.create({data:{eventKey:crypto.randomUUID(),actorId:context.session?.itemId||null,action,targetList,targetId,before:before?JSON.parse(JSON.stringify(before)):undefined,after:after?JSON.parse(JSON.stringify(after)):undefined,reason,requestId:crypto.randomUUID()}}); }
export async function command(context:any,name:string,input:any,operation:(tx:any)=>Promise<any>,lockKey?:string) {
  if(!input.idempotencyKey?.trim()) throw new Error('Idempotency key required');
  return context.prisma.$transaction(async(tx:any)=>{
    await lockTransactionKey(tx,'command:'+input.idempotencyKey);
    if(lockKey) await lockTransactionKey(tx,lockKey);
    const {attempt,replay}=await getOrCreateIdempotencyAttempt(tx,{key:input.idempotencyKey,requestPath:name,requestParams:{...input,actorId:context.session?.itemId||null}});
    if(replay && attempt.recoveryPoint==='completed') return attempt.responseBody;
    const result=await operation(tx); const value=JSON.parse(JSON.stringify(result));
    await updateIdempotencyAttempt(tx,attempt.id,'completed',value,200);return value;
  },{timeout:20000});
}
export function prove(record:any,token:string,field='cartToken') { if(!record || !token || hash(token)!==record[field]) throw new Error('Not found'); }
export async function transition(tx:any,context:any,model:string,id:string,next:string,allowed:Record<string,string[]>) {
  const before=await tx[model].findUnique({where:{id}});if(!before || !allowed[before.status]?.includes(next)) throw new Error('Invalid state transition');
  const changed=await tx[model].updateMany({where:{id,status:before.status},data:{status:next}});if(changed.count!==1) throw new Error('State changed');
  const after=await tx[model].findUnique({where:{id}});await audit(tx,context,next,model,id,before,after);return after;
}
