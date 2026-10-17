import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
const KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;
const ENTITLEMENT = "outbound_sales_pro";

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

// Compra de CONSUMÍVEL (pacote de Doods). O crédito entra pela conta via webhook do RevenueCat.
export async function purchaseDoods(storeProductId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isNative()) return { ok: false, error: "Compra disponível apenas no app." };
  try {
    const { Purchases, PRODUCT_CATEGORY } = await import("@revenuecat/purchases-capacitor");
    let product = null;
    try {
      const { products } = await Purchases.getProducts({
        productIdentifiers: [storeProductId],
        type: PRODUCT_CATEGORY.NON_SUBSCRIPTION,
      });
      product = products?.[0] || null;
    } catch {
      product = null;
    }
    if (product) {
      await Purchases.purchaseStoreProduct({ product });
      return { ok: true };
    }
    // Fallback: pacote anexado a uma offering (compatível com configurações antigas).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { current } = await Purchases.getOfferings() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pkgs: any[] = current?.availablePackages || [];
    const pkg = pkgs.find((p) => p?.product?.identifier === storeProductId);
    if (!pkg) return { ok: false, error: "Produto indisponível no momento. Confira a conexão e tente de novo." };
    await Purchases.purchasePackage({ aPackage: pkg });
    return { ok: true };
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err?.userCancelled) return { ok: false, error: "Compra cancelada." };
    return { ok: false, error: err?.message || "Falha na compra." };
  }
}
