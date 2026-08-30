export function ownerIdFromSubject(subject: string) {
  return subject.split('|', 1)[0]
}

export async function requireOwner(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }, message: string) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error(message)
  return ownerIdFromSubject(identity.subject)
}
