import { Capacitor } from "@capacitor/core";

export interface AgendaEventForNotify {
  id: string;
  titulo: string;
  data_inicio: string;
  alerta_minutos?: number | null;
  concluido?: boolean | null;
  status?: string | null;
}

const isNative = () => Capacitor.isNativePlatform();

function idFromUuid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) hash = (hash * 31 + uuid.charCodeAt(i)) >>> 0;
  return hash % 2147483647;
}

export async function requestAgendaNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const { display } = await LocalNotifications.checkPermissions();
    if (display === "granted") return true;
    const { display: after } = await LocalNotifications.requestPermissions();
    return after === "granted";
  } catch {
    return false;
  }
}

/** Reagenda as notificações locais dos compromissos do dia (só no app nativo). */
export async function scheduleAgendaNotifications(events: AgendaEventForNotify[]): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const granted = await requestAgendaNotificationPermission();
    if (!granted) return;

    const pending = await LocalNotifications.getPending();
    const ids = pending.notifications
      .filter((n) => (n.extra as { source?: string } | undefined)?.source === "outbound-agenda")
      .map((n) => n.id);
    if (ids.length) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });

    const now = Date.now();
    const notifications = events
      .filter((e) => !e.concluido && e.status !== "cancelado")
      .map((e) => {
        const start = new Date(e.data_inicio).getTime();
        if (Number.isNaN(start)) return null;
        const lead = e.alerta_minutos && e.alerta_minutos > 0 ? e.alerta_minutos : 30;
        const fireAt = start - lead * 60 * 1000;
        if (fireAt <= now) return null;
        return {
          id: idFromUuid(e.id),
          title: "Outbound Sales",
          body: `${e.titulo} às ${new Date(start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
          schedule: { at: new Date(fireAt) },
          extra: { source: "outbound-agenda", eventId: e.id },
        };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);

    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch (e) {
    console.warn("[agenda-notifications] falha", e);
  }
}
