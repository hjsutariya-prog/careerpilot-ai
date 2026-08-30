export function isAllowedAdminEmail(email: string | undefined, configuredEmail: string | undefined) {
  return Boolean(email && configuredEmail && email.trim().toLowerCase() === configuredEmail.trim().toLowerCase())
}
