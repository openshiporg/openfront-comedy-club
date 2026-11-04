import { queueLineupConfirmation, cancelQueued } from './reminders';
import { lineupConfirmationKey } from '../lib/reminders';
import crypto from 'node:crypto';
import { audit,code,command,hash,lockTransactionKey,requirePermission,transition } from '../lib/commands';
import { minimum,payout,settlement } from '../lib/money';
import { expireUnderLock } from './tickets';
import { assertValidWindow } from '../lib/saleWindow';
const showTransitions={draft:['on_sale','cancelled'],on_sale:['sold_out','doors_open','cancelled'],sold_out:['on_sale','doors_open','cancelled'],doors_open:['in_progress','cancelled'],in_progress:['completed','cancelled'],completed:['settled']};
export async function publishShow(_:any,a:any,c:any) {requirePermission(c,'canManageShows');return command(c,'publishShow',a,tx=>transition(tx,c,'show',a.showId,a.nextStatus||'on_sale',showTransitions),'show:'+a.showId);}
export async function pauseSales(_:any,a:any,c:any) {requirePermission(c,'canManageShows');return command(c,'pauseSales',a,async tx=>{const show=await tx.show.findUnique({where:{id:a.showId}});if(!show||!['on_sale','sold_out'].includes(show.status)) throw new Error('Sales are not open');await tx.priceTier.updateMany({where:{showId:a.showId},data:{status:'paused'}});await audit(tx,c,'sales_paused','Show',a.showId,null,null);return {paused:true};},'show:'+a.showId);}
export async function resumeSales(_:any,a:any,c:any) {
 requirePermission(c,'canManageShows');
 return command(c,'resumeSales',a,async tx=>{
  const show=await tx.show.findUnique({where:{id:a.showId}});
  if(!show||!['on_sale','sold_out'].includes(show.status)) throw new Error('Sales cannot resume');
  await expireUnderLock(tx,show.id,c);
  const tiers=await tx.priceTier.findMany({where:{showId:show.id,status:'paused'}});
  if(!tiers.length) throw new Error('No paused tiers');
  for(const t of tiers) await tx.priceTier.update({where:{id:t.id},data:{status:t.sold+t.held>=t.capacity?'sold_out':'on_sale'}});
  const totals=await tx.priceTier.aggregate({where:{showId:show.id},_sum:{sold:true,held:true}});
  await tx.show.update({where:{id:show.id},data:{status:(totals._sum.sold||0)+(totals._sum.held||0)>=show.capacity?'sold_out':'on_sale'}});
  await audit(tx,c,'sales_resumed','Show',show.id,null,{tiers:tiers.map((t:any)=>t.id)});return {resumed:tiers.length};
 },'show:'+a.showId);
}
export async function offerSlot(_:any,a:any,c:any) {requirePermission(c,'canManageTalent');return command(c,'offerSlot',a,async tx=>{
  const comedian=await tx.comedian.findUnique({where:{id:a.comedianId}});const show=await tx.show.findUnique({where:{id:a.showId}});if(!comedian||!show||['cancelled','completed','settled'].includes(show.status)) throw new Error('Show or comedian unavailable');
  if(['headliner','host'].includes(a.role)&&await tx.lineupSlot.count({where:{showId:a.showId,role:a.role,status:{notIn:['cancelled','declined']}}})) throw new Error('Only one host and headliner allowed');
  const slot=await tx.lineupSlot.create({data:{showId:a.showId,comedianId:a.comedianId,role:a.role,position:a.position||0,setMinutes:a.setMinutes||10,feeCents:a.feeCents??comedian.defaultFeeCents,bonusCents:0,status:'offered'}});await audit(tx,c,'offered','LineupSlot',slot.id,null,slot);return slot;
},'show:'+a.showId);}
export async function confirmSlot(_:any,a:any,c:any) {requirePermission(c,'canManageTalent');return command(c,'confirmSlot',a,async tx=>{const slot=await tx.lineupSlot.findUnique({where:{id:a.slotId}});if(!slot) throw new Error('Slot not found');await lockTransactionKey(tx,'show:'+slot.showId);const updated=await transition(tx,c,'lineupSlot',slot.id,'confirmed',{offered:['confirmed']});await tx.lineupSlot.update({where:{id:slot.id},data:{confirmedAt:new Date()}});await queueLineupConfirmation(tx,slot.id);return updated;});}
export async function setLineup(_:any,a:any,c:any) {requirePermission(c,'canManageTalent');return command(c,'setLineup',a,async tx=>{const slots=await tx.lineupSlot.findMany({where:{showId:a.showId}});const ids=a.slots.map((s:any)=>s.id);if(ids.length!==new Set(ids).size||ids.some((id:string)=>!slots.some((s:any)=>s.id===id))) throw new Error('Invalid lineup');for(const s of a.slots) await tx.lineupSlot.update({where:{id:s.id},data:{position:s.position,setMinutes:s.setMinutes}});const show=await tx.show.findUnique({where:{id:a.showId}});const total=a.slots.reduce((n:number,s:any)=>n+s.setMinutes,0);await audit(tx,c,'reordered','Show',a.showId,null,a.slots);return {warning:total>(show.endsAt-show.startsAt)/60000?'Lineup exceeds show duration':null};},'show:'+a.showId);}
export async function checkInTicket(_:any,a:any,c:any) {requirePermission(c,'canManageDoor');return command(c,'checkInTicket',a,async tx=>{
 const ticket=await tx.ticket.findFirst({where:{OR:[{ticketCode:a.tokenOrCode},{tokenHash:hash(a.tokenOrCode)}]}});if(!ticket) throw new Error('Ticket not found');
 const result=ticket.showId!==a.showId?'wrong_show':ticket.status==='checked_in'?'duplicate':ticket.status!=='valid'?'void':'admitted';
 let effective=result;if(result==='admitted'){const cas=await tx.ticket.updateMany({where:{id:ticket.id,status:'valid'},data:{status:'checked_in'}});if(cas.count!==1) effective='duplicate';}
 const scan=await tx.checkIn.create({data:{ticketId:ticket.id,showId:a.showId,scannedById:c.session.itemId,at:new Date(),method:a.method||'manual',result:effective}});await audit(tx,c,effective,'Ticket',ticket.id,null,{status:effective});return scan;
},'show:'+a.showId);}
export async function seatParty(_:any,a:any,c:any) {requirePermission(c,'canManageDoor');return command(c,'seatParty',a,async tx=>{
 const order=await tx.ticketOrder.findUnique({where:{id:a.orderId},include:{show:true,tableAssignment:true,hold:true}});if(!order||!['paid','comp','partially_refunded'].includes(order.status)||order.tableAssignment) throw new Error('Party unavailable');
 const ids=[...new Set<string>(a.tableIds)];if(!ids.length) throw new Error('Choose tables');
 const tables=await tx.table.findMany({where:{id:{in:ids}},include:{section:true}});if(tables.length!==ids.length||tables.some((t:any)=>t.section.roomId!==order.show.roomId)||tables.reduce((n:number,t:any)=>n+t.seats,0)<order.partySize) throw new Error('Invalid table capacity');
 const assignment=await tx.seatingAssignment.create({data:{showId:order.showId,ticketOrderId:order.id,partySize:order.partySize,status:'seated',seatedAt:new Date(),serverId:a.serverId||c.session.itemId,tables:{connect:ids.map(id=>({id}))}}});
 for(const tableId of ids){const key=order.showId+':'+tableId;const occupancy=await tx.tableOccupancy.findUnique({where:{occupancyKey:key}});if(occupancy&&occupancy.holdId!==order.hold?.id) throw new Error('Table occupied');if(occupancy) await tx.tableOccupancy.update({where:{id:occupancy.id},data:{assignmentId:assignment.id}});else await tx.tableOccupancy.create({data:{occupancyKey:key,showId:order.showId,tableId,assignmentId:assignment.id}});}
 await audit(tx,c,'seated','SeatingAssignment',assignment.id,null,assignment);return assignment;
},'show:'+a.showId);}
export async function openCheck(_:any,a:any,c:any){requirePermission(c,'canManageChecks');return command(c,'openCheck',a,async tx=>{
 const seating=await tx.seatingAssignment.findUnique({where:{id:a.seatingAssignmentId},include:{show:{include:{room:{include:{venue:true}}}}}});if(!seating||seating.status!=='seated'||await tx.check.count({where:{seatingAssignmentId:seating.id,status:{in:['open','presented']}}})) throw new Error('Check unavailable');
 const venue=seating.show.room.venue;const cheapest=await tx.menuItem.findFirst({where:{active:true,countsTowardMinimum:true},orderBy:{priceCents:'asc'}});if(venue.drinkMinimumItems&&!cheapest) throw new Error('Qualifying minimum item required');
 const check=await tx.check.create({data:{showId:seating.showId,seatingAssignmentId:seating.id,serverId:c.session.itemId,status:'open',guestCount:seating.partySize,minimumItemsRequired:seating.partySize*venue.drinkMinimumItems,minimumUnitPriceCents:cheapest?.priceCents||0,minimumCentsFloor:(venue.drinkMinimumCentsFloor||0)*seating.partySize,taxBps:venue.taxBps}});await audit(tx,c,'opened','Check',check.id,null,check);return check;
},'seating:'+a.seatingAssignmentId);}
export async function addCheckItem(_:any,a:any,c:any){requirePermission(c,'canManageChecks');return command(c,'addCheckItem',a,async tx=>{const check=await tx.check.findUnique({where:{id:a.checkId}});const item=await tx.menuItem.findUnique({where:{id:a.menuItemId}});if(check?.status!=='open'||!item?.active||!Number.isInteger(a.qty)||a.qty<1||a.qty>100) throw new Error('Invalid check item');const line=await tx.checkItem.create({data:{checkId:check.id,menuItemId:item.id,name:item.name,priceCents:item.priceCents,qty:a.qty,countsTowardMinimum:item.countsTowardMinimum}});await audit(tx,c,'item_added','Check',check.id,null,line);return line;},'check:'+a.checkId);}
export async function runOpenMicLottery(_:any,a:any,c:any){requirePermission(c,'canManageTalent');return command(c,'runOpenMicLottery',a,async tx=>{const show=await tx.show.findUnique({where:{id:a.showId}});if(!show?.isOpenMic)throw new Error('Not an open mic');const rows=await tx.openMicSignup.findMany({where:{showId:a.showId,status:'waiting'},take:1000});const eligible=rows.filter((r:any)=>r.method!=='bringer'||(r.bringerGuestsRequired>0&&r.bringerGuestsArrived>=r.bringerGuestsRequired));rows.length=0;rows.push(...eligible);for(let i=rows.length-1;i>0;i--){const j=crypto.randomInt(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}for(let i=0;i<rows.length;i++)await tx.openMicSignup.update({where:{id:rows[i].id},data:{lotteryNumber:i+1}});await audit(tx,c,'lottery','Show',show.id,null,{count:rows.length});return {count:rows.length};},'show:'+a.showId);}

export async function updatePromoLimit(_:any,a:any,c:any){
 requirePermission(c,'canManageOrders');
 if(!Number.isSafeInteger(a.perOrderLimit)||a.perOrderLimit<1||a.perOrderLimit>20) throw new Error('Limit must be 1 to 20 tickets');
 return command(c,'updatePromoLimit',a,async tx=>{
  const before=await tx.promoCode.findUnique({where:{id:a.promoId}});if(!before) throw new Error('Promo not found');
  const after=await tx.promoCode.update({where:{id:before.id},data:{perOrderLimit:a.perOrderLimit}});
  await audit(tx,c,'promo_limit_changed','PromoCode',before.id,{perOrderLimit:before.perOrderLimit},{perOrderLimit:after.perOrderLimit});
  return {id:after.id,perOrderLimit:after.perOrderLimit};
 },'promo:'+a.promoId);
}

/** Door correction: puts a mistakenly admitted ticket back to valid. The scan history stays; the audit trail records who and why. */
export async function undoCheckIn(_:any,a:any,c:any){
 requirePermission(c,'canManageDoor');
 if(!a.reason?.trim()||a.reason.length>200) throw new Error('Reason required');
 return command(c,'undoCheckIn',a,async tx=>{
  const ticket=await tx.ticket.findUnique({where:{id:a.ticketId}});
  if(!ticket||ticket.showId!==a.showId) throw new Error('Ticket not found');
  const show=await tx.show.findUnique({where:{id:a.showId}});
  if(!show||['completed','settled','cancelled'].includes(show.status)) throw new Error('Show is closed to door changes');
  const cas=await tx.ticket.updateMany({where:{id:ticket.id,status:'checked_in'},data:{status:'valid'}});
  if(cas.count!==1) throw new Error('Ticket is not checked in');
  await audit(tx,c,'check_in_undone','Ticket',ticket.id,{status:'checked_in'},{status:'valid'},a.reason.trim());
  return {ticketId:ticket.id,status:'valid'};
 },'show:'+a.showId);
}

const SLOT_FLOW: Record<string, string[]> = { offered: ['declined', 'cancelled'], confirmed: ['cancelled', 'no_show'] };
/** Declines, cancels or marks a no-show so closeShow never pays a comedian who did not perform. */
export async function updateSlotStatus(_:any,a:any,c:any){
 requirePermission(c,'canManageTalent');
 return command(c,'updateSlotStatus',a,async tx=>{
  const first=await tx.lineupSlot.findUnique({where:{id:a.slotId}});if(!first) throw new Error('Slot not found');
  await lockTransactionKey(tx,'show:'+first.showId);
  const slot=await tx.lineupSlot.findUnique({where:{id:a.slotId}});
  if(!slot||!SLOT_FLOW[slot.status]?.includes(a.status)) throw new Error('Invalid state transition');
  const show=await tx.show.findUnique({where:{id:slot.showId}});
  if(!show||['settled','cancelled'].includes(show.status)) throw new Error('Show is closed to lineup changes');
  if(a.status==='no_show'&&!['doors_open','in_progress','completed'].includes(show.status)) throw new Error('No-show can only be recorded once doors are open');
  const moved=await transition(tx,c,'lineupSlot',slot.id,a.status,SLOT_FLOW);
  if(['declined','cancelled'].includes(a.status)) await cancelQueued(tx,{notificationKey:lineupConfirmationKey(slot.id)});
  return moved;
 });
}

/** Schedules when a tier goes on sale and off sale. Times are absolute instants; the screen converts from venue time. */
export async function setSalesWindow(_:any,a:any,c:any){
 requirePermission(c,'canManageShows');
 const parse=(v:any)=>v?new Date(v):null;
 const start=parse(a.salesStartAt), end=parse(a.salesEndAt);
 return command(c,'setSalesWindow',a,async tx=>{
  const first=await tx.priceTier.findUnique({where:{id:a.tierId}});if(!first) throw new Error('Tier not found');
  await lockTransactionKey(tx,'show:'+first.showId);
  const tier=await tx.priceTier.findUnique({where:{id:a.tierId},include:{show:true}});
  if(!tier||['cancelled','settled','completed'].includes(tier.show.status)) throw new Error('Show is closed to sales changes');
  assertValidWindow(start,end,tier.show.startsAt);
  const after=await tx.priceTier.update({where:{id:tier.id},data:{salesStartAt:start,salesEndAt:end}});
  await audit(tx,c,'sales_window_set','PriceTier',tier.id,{salesStartAt:tier.salesStartAt,salesEndAt:tier.salesEndAt},{salesStartAt:after.salesStartAt,salesEndAt:after.salesEndAt});
  return {tierId:after.id,salesStartAt:after.salesStartAt,salesEndAt:after.salesEndAt};
 });
}
