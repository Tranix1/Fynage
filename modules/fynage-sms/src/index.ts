import { requireNativeModule } from "expo-modules-core";

export type FynageSmsMessage = { id: string; sender: string; body: string; date: number };

type NativeFynageSms = {
  readInboxPage(minDate: number, offset: number, pageSize: number): Promise<FynageSmsMessage[]>;
};

const nativeModule = requireNativeModule<NativeFynageSms>("FynageSms");

export function readInboxPage(minDate: number, offset: number, pageSize: number): Promise<FynageSmsMessage[]> {
  return nativeModule.readInboxPage(minDate, offset, pageSize);
}
