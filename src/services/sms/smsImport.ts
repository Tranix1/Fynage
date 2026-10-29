export async function explainSmsAccess(): Promise<boolean> {
  return false;
}

export async function importRecentFinancialSms(_ownerId: string, _businessId: string, _initial = false, _requestIfMissing = true, _minDate?: number, _onProgress?: (scanned: number, imported: number) => void): Promise<{ imported: number; duplicates: number; ignored: number; newestDate: number }> {
  throw new Error("SMS import is available on Android development builds only. Manual entry remains available.");
}
