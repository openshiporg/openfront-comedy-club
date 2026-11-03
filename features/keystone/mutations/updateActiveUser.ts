import { isSignedIn } from "../access";

async function updateActiveUser(_root: any, { data }: { data: any }, context: any) {
  const session = context.session;
  if (!isSignedIn({ session })) throw new Error("Not authenticated");
  const allowed = new Set(["email", "name", "password", "onboardingStatus", "notificationPreference"]);
  if (Object.keys(data || {}).some((key) => !allowed.has(key))) throw new Error("Unsupported profile field");
  return context.db.User.updateOne({ where: { id: session.itemId }, data });
}
export default updateActiveUser;
