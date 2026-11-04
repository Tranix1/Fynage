export async function explainSmsAccess(): Promise<boolean> {
  return false;
}

export async function searchRecentFinancialSms(_ownerId: string, _businessId: string, _requestIfMissing = true, _onProgress?: (scanned: number) => void): Promise<{ ignored: number; queuedForLink: number; scanned: number; since: number; newestDate: number; reachedLimit: boolean }> {
  throw new Error("SMS import is available on Android development builds only. Manual entry remains available.");
}
