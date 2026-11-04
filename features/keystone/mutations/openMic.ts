import { audit, command, lockTransactionKey, requirePermission } from '../lib/commands';

export async function addBringerSignup(_: any, a: any, c: any) {
  requirePermission(c, 'canManageTalent');
  const name = String(a.name || '').trim(), email = String(a.email || '').trim().toLowerCase();
  if (!name || !email) throw new Error('Name and email required');
  if (!Number.isInteger(a.guestsRequired) || a.guestsRequired < 1 || a.guestsRequired > 20) throw new Error('Guests required must be 1 to 20');
  return command(c, 'addBringerSignup', a, async tx => {
    const show = await tx.show.findUnique({ where: { id: a.showId } });
    if (!show?.isOpenMic) throw new Error('Not an open mic');
    const signupKey = show.id + ':' + email;
    if (await tx.openMicSignup.findUnique({ where: { signupKey } })) throw new Error('Already signed up');
    const row = await tx.openMicSignup.create({ data: { signupKey, showId: show.id, name, email, method: 'bringer', status: 'waiting', bringerGuestsRequired: a.guestsRequired } });
    await audit(tx, c, 'bringer_signup', 'OpenMicSignup', row.id, null, row);
    return row;
  }, 'show:' + a.showId);
}

export async function recordBringerArrival(_: any, a: any, c: any) {
  requirePermission(c, 'canManageTalent');
  if (!Number.isInteger(a.guests) || a.guests < 1 || a.guests > 20) throw new Error('Guest count must be 1 to 20');
  return command(c, 'recordBringerArrival', a, async tx => {
    const before = await tx.openMicSignup.findUnique({ where: { id: a.signupId } });
    if (!before || before.method !== 'bringer' || before.status !== 'waiting') throw new Error('Not a waiting bringer');
    const arrived = Math.min(before.bringerGuestsRequired, before.bringerGuestsArrived + a.guests);
    const changed = await tx.openMicSignup.updateMany({ where: { id: before.id, status: 'waiting', bringerGuestsArrived: before.bringerGuestsArrived }, data: { bringerGuestsArrived: arrived } });
    if (changed.count !== 1) throw new Error('Signup changed');
    const after = await tx.openMicSignup.findUnique({ where: { id: before.id } });
    await audit(tx, c, 'bringer_arrival', 'OpenMicSignup', before.id, before, after);
    return after;
  }, 'signup:' + a.signupId);
}

const SIGNUP_FLOW: Record<string, string[]> = { waiting: ['called', 'skipped', 'withdrawn'], called: ['performed', 'skipped', 'waiting'], skipped: ['waiting', 'withdrawn'] };
/** Moves a performer through the list on the night. Only drawn performers (lottery number > 0) can be called. */
export async function setSignupStatus(_: any, a: any, c: any) {
  requirePermission(c, 'canManageTalent');
  return command(c, 'setSignupStatus', a, async tx => {
    const first = await tx.openMicSignup.findUnique({ where: { id: a.signupId } });
    if (!first) throw new Error('Invalid state transition');
    await lockTransactionKey(tx, 'show:' + first.showId);
    const before = await tx.openMicSignup.findUnique({ where: { id: a.signupId } });
    if (!before || !SIGNUP_FLOW[before.status]?.includes(a.status)) throw new Error('Invalid state transition');
    const show = await tx.show.findUnique({ where: { id: before.showId } });
    if (!show || ['cancelled', 'settled'].includes(show.status)) throw new Error('Show is closed');
    if (a.status === 'called') {
      if (!(before.lotteryNumber > 0)) throw new Error('Run the lottery before calling performers');
      if (await tx.openMicSignup.count({ where: { showId: before.showId, status: 'called', id: { not: before.id } } })) throw new Error('Finish the performer on stage first');
    }
    const changed = await tx.openMicSignup.updateMany({ where: { id: before.id, status: before.status }, data: { status: a.status } });
    if (changed.count !== 1) throw new Error('State changed');
    const after = await tx.openMicSignup.findUnique({ where: { id: before.id } });
    await audit(tx, c, 'signup_' + a.status, 'OpenMicSignup', before.id, before, after);
    return after;
  }, 'signup:' + a.signupId);
}
