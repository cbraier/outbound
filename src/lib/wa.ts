export function brWaLink(phone: string, message?: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${full}${text}`;
}

export function openExternalLink(url: string) {
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) window.location.href = url;
}
