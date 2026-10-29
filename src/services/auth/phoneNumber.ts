export function toE164(phone: string, dialCode: string): string {
  const prefix = dialCode.trim();
  if (!/^\+\d{1,3}$/.test(prefix)) throw new Error("Choose a valid country code.");
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 6 || digits.length > 14) throw new Error("Enter a valid phone number.");
  return `${prefix}${digits}`;
}

export function phoneAuthError(error: unknown, fallback: string): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code) : "";
  if (code.includes("invalid-verification-code")) return "That verification code is incorrect. Check it and try again.";
  if (code.includes("session-expired") || code.includes("code-expired")) return "That code has expired. Request a new code.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a little before requesting another code.";
  if (code.includes("network-request-failed")) return "Network unavailable. Check your connection and try again.";
  if (code.includes("invalid-phone-number")) return "Enter a valid phone number in international format.";
  return fallback;
}
