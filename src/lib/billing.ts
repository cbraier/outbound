import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
const KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;
const ENTITLEMENT = "pro";

export async function initBilling(userId?: string | null) {
  if (!isNative() || !KEY) return;
  try {
    const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");
    await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR });
    await Purchases.configure({ apiKey: KEY, appUserID: userId || undefined });
  } catch (e) {
    console.warn("[billing] configure", e);
  }
}

export async function hasActiveEntitlement(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { customerInfo } = await Purchases.getCustomerInfo();
    return !!customerInfo.entitlements.active[ENTITLEMENT];
  } catch {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCurrentOffering(): Promise<any | null> {
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const { current } = await Purchases.getOfferings();
    return current;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function purchase(pkg: any): Promise<boolean> {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return !!customerInfo.entitlements.active[ENTITLEMENT];
}

export async function restore(): Promise<boolean> {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  const { customerInfo } = await Purchases.restorePurchases();
  return !!customerInfo.entitlements.active[ENTITLEMENT];
}
