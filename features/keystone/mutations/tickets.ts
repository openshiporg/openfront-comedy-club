import { showCapacity } from '../lib/capacity';
import { offerFreedSeats } from './waitlistCore';
import { saleState } from '../lib/saleWindow';
import crypto from 'node:crypto';
import { audit, code, command, hash, lockTransactionKey, prove, requirePermission } from '../lib/commands';
import { quote } from '../lib/money';

export async function expireUnderLock(tx:any,showId:string,context:any) {
  const holds=await tx.inventoryHold.findMany({where:{showId,status:'active',expiresAt:{lte:new Date()}}});
  for(const hold of holds) {
    // Provider-reserved inventory remains held until verified cancellation or capture.
    if(await tx.ticketOrder.count({where:{hold:{id:hold.id},status:'pending_payment'}})) continue;
    await tx.inventoryHold.update({where:{id:hold.id},data:{status:'expired'}});
    await tx.priceTier.update({where:{id:hold.priceTierId},data:{held:{decrement:hold.quantity}}});
    await tx.tableOccupancy.updateMany({where:{holdId:hold.id},data:{occupancyKey:null}});
    await tx.promoRedemption.updateMany({where:{hold:{id:hold.id},status:'reserved'},data:{status:'released'}});
    await audit(tx,context,'expired','InventoryHold',hold.id,hold,{status:'expired'});
  }
  if(holds.length) await offerFreedSeats(tx,context,showId);
  return holds.length;
}
export async function expireHolds(_root:any,args:any,context:any) {
  // One cheap query finds the shows that actually have expired holds; only those take a lock.
  const due=await context.prisma.inventoryHold.findMany({where:{status:'active',expiresAt:{lte:new Date()},...(args.showId?{showId:args.showId}:{})},select:{showId:true},distinct:['showId'],take:100});
  let expired=0;
  for(const {showId} of due) expired+=await context.prisma.$transaction(async(tx:any)=>{await lockTransactionKey(tx,'show:'+showId);return expireUnderLock(tx,showId,context);});
  return {expired};
}
export async function showsOnSale(_root:any,_args:any,context:any) {
  await expireHolds(null,{},context);
  const rows=await context.prisma.show.findMany({where:{status:{in:['on_sale','sold_out']},startsAt:{gt:new Date()}},select:{id:true,title:true,startsAt:true,doorsAt:true,ageRestriction:true,publicNote:true,room:{select:{name:true}},tiers:{select:{id:true,name:true,priceCents:true,feeCents:true,capacity:true,sold:true,held:true,status:true,salesStartAt:true,salesEndAt:true}}},orderBy:{startsAt:'asc'},take:100});
  return rows;
}
export async function showAvailability(_root:any,{showId}:any,context:any) {
  await expireHolds(null,{showId},context);
  const show=await context.prisma.show.findUnique({where:{id:showId},select:{id:true,title:true,status:true,startsAt:true,endsAt:true,ageRestriction:true,publicNote:true,capacity:true,room:{select:{name:true,seatingMode:true,sections:{select:{name:true,tables:{select:{id:true,label:true,seats:true}}}}}},tiers:{select:{id:true,name:true,priceCents:true,feeCents:true,capacity:true,sold:true,held:true,status:true,isTableTier:true,seatsPerUnit:true,salesStartAt:true,salesEndAt:true}},lineup:{where:{status:'confirmed'},select:{role:true,position:true,setMinutes:true,comedian:{select:{stageName:true,bio:true}}},orderBy:{position:'asc'}},occupancies:{where:{occupancyKey:{not:null}},select:{tableId:true}}}});
  if(!show || !['on_sale','sold_out','doors_open'].includes(show.status)) throw new Error('Show not available');return show;
}
export async function createTicketHold(_root:any,input:any,context:any) {
  if(!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>20) throw new Error('Choose 1–20 tickets');
  return command(context,'createTicketHold',input,async(tx)=>{
    await expireUnderLock(tx,input.showId,context);
    const show=await tx.show.findUnique({where:{id:input.showId},include:{room:true}});
    const tier=await tx.priceTier.findUnique({where:{id:input.tierId}});
    if(!show||show.status!=='on_sale'||!tier||tier.showId!==show.id||tier.status!=='on_sale'||show.startsAt<=new Date()) throw new Error('Tickets unavailable');
    {const state=saleState(tier);if(state==='scheduled') throw new Error('Sales have not opened for this tier yet');if(state==='ended') throw new Error('Sales have ended for this tier');}
    const totals=await tx.priceTier.aggregate({where:{showId:show.id},_sum:{sold:true,held:true}});
    if(tier.sold+tier.held+input.quantity>tier.capacity||(totals._sum.sold||0)+(totals._sum.held||0)+input.quantity>showCapacity(show)) throw new Error('Not enough capacity');
    const ids=[...new Set<string>(input.tableIds||[])];
    if(tier.isTableTier && !ids.length) throw new Error('Choose a table');
    const tables=ids.length?await tx.table.findMany({where:{id:{in:ids}},include:{section:true}}):[];
    if(tables.length!==ids.length||tables.some((t:any)=>t.section.roomId!==show.roomId||(tier.isTableTier&&t.section.name!==tier.name))) throw new Error('Invalid tables');
    if(tables.length && tables.reduce((n:number,t:any)=>n+t.seats,0)!==input.quantity) throw new Error('Reserve every seat at the selected tables');
    const settings=await tx.venueSettings.findFirst(); const token=crypto.randomBytes(32).toString('hex');
    const hold=await tx.inventoryHold.create({data:{holdKey:code('H'),showId:show.id,priceTierId:tier.id,quantity:input.quantity,cartToken:hash(token),status:'active',expiresAt:new Date(Date.now()+(settings?.holdMinutes||10)*60000),tables:{connect:ids.map(id=>({id}))}}});
    for(const tableId of ids) await tx.tableOccupancy.create({data:{occupancyKey:show.id+':'+tableId,showId:show.id,tableId,holdId:hold.id}});
    await tx.priceTier.update({where:{id:tier.id},data:{held:{increment:input.quantity}}});
    await audit(tx,context,'held','InventoryHold',hold.id,null,{quantity:input.quantity});
    return {holdKey:hold.holdKey,cartToken:token,expiresAt:hold.expiresAt};
  },'show:'+input.showId);
}
export async function applyPromoToHold(_root:any,input:any,context:any) {
  const lookup=await context.prisma.inventoryHold.findUnique({where:{holdKey:input.holdKey}});prove(lookup,input.cartToken);
  return command(context,'applyPromoToHold',input,async tx=>{
    const hold=await tx.inventoryHold.findUnique({where:{id:lookup.id},include:{show:true}});prove(hold,input.cartToken);
    if(hold.status!=='active'||hold.expiresAt<=new Date()||await tx.ticketOrder.count({where:{hold:{id:hold.id}}})) throw new Error('Hold cannot be changed');
    const promo=await tx.promoCode.findUnique({where:{code:input.code.toUpperCase()}});if(!promo) throw new Error('Invalid promotion');
    await lockTransactionKey(tx,'promo:'+promo.id);
    const current=await tx.promoCode.findUnique({where:{id:promo.id}});
    const reserved=await tx.promoRedemption.count({where:{promoCodeId:current.id,status:'reserved'}});
    const now=new Date();
    if(current.status!=='active'||(current.showId&&current.showId!==hold.showId)||(current.templateId&&current.templateId!==hold.show.templateId)||(current.startsAt&&current.startsAt>now)||(current.endsAt&&current.endsAt<now)||(current.maxUses!==null&&current.usedCount+reserved>=current.maxUses)) throw new Error('Promotion unavailable');
    await tx.promoRedemption.updateMany({where:{hold:{id:hold.id},status:'reserved'},data:{status:'released'}});
    await tx.promoRedemption.create({data:{promoCodeId:promo.id,holdId:hold.id,status:'reserved',amountCents:0}});
    await tx.inventoryHold.update({where:{id:hold.id},data:{promoId:promo.id}});return {applied:true};
  },'show:'+lookup.showId);
}
export async function lookupTicketOrder(_root:any,{email,orderNumber}:any,context:any) {
  const order=await context.prisma.ticketOrder.findUnique({where:{orderNumber},select:{orderNumber:true,email:true,status:true,name:true,totalCents:true,currencyCode:true,show:{select:{title:true,startsAt:true}},lines:{select:{tierName:true,quantity:true,unitPriceCents:true,lineTotalCents:true}},tickets:{select:{ticketCode:true,status:true,holderName:true}}}});
  if(!order || order.email.toLowerCase()!==String(email).trim().toLowerCase()) throw new Error('Order not found');
  const {email:_,...safe}=order;return safe;
}
export async function openMicSignup(_root:any,input:any,context:any) {
  if(!input.email||!input.name) throw new Error('Name and email required');
  return command(context,'openMicSignup',input,async tx=>{
    const show=await tx.show.findUnique({where:{id:input.showId}});if(!show?.isOpenMic||!show.signupOpensAt||show.signupOpensAt>new Date()||show.startsAt<new Date()) throw new Error('Signup closed');
    const email=input.email.trim().toLowerCase();
    const comedian=input.comedianId?await tx.comedian.findUnique({where:{id:input.comedianId}}):null;
    if(comedian&&comedian.email.toLowerCase()!==email) throw new Error('Comedian email does not match');
    return tx.openMicSignup.create({data:{signupKey:show.id+':'+(comedian?.id||email),showId:show.id,comedianId:comedian?.id||null,name:input.name,email,method:'online_list',status:'waiting'}});
  },'show:'+input.showId);
}

export async function openMicShows(_root:any,_args:any,context:any) {
  const from=new Date(Date.now()-3*3600000);
  return context.prisma.show.findMany({where:{isOpenMic:true,status:{in:['on_sale','sold_out','doors_open']},startsAt:{gte:from}},select:{id:true,title:true,startsAt:true,signupOpensAt:true,room:{select:{name:true}}},orderBy:{startsAt:'asc'},take:6});
}
