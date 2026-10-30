/** Contrato de acesso a dados usado pelos jobs (coleta, alertas, relatórios). */
import type { TokenStore } from "../collectors/mercadolivre-auth";
import type {
  AlertEvent, AlertRule, Channel, CollectionRun, CollectionStatus, NotificationLog, NotificationSettings,
  PriceRecord, Product, ProductSource, RunStatus, RunTrigger, SourceWithProduct,
} from "../types";

export type NewPriceRecord = Omit<PriceRecord, "id">;
export type NewAlertEvent = Omit<AlertEvent, "id" | "created_at">;
export type NewNotificationLog = Omit<NotificationLog, "id" | "created_at">;

export interface RunSummary {
  status: RunStatus;
  finished_at: string;
  products_processed: number;
  sources_processed: number;
  successes: number;
  failures: number;
  error_summary: string | null;
}

export interface ProductWithSources extends Product {
  sources: ProductSource[];
}

export interface Repository extends TokenStore {
  startRun(input: { trigger: RunTrigger; runKey: string | null; githubRunId: string | null }): Promise<CollectionRun | null>;
  finishRun(id: string, summary: RunSummary): Promise<void>;
  getLatestRun(): Promise<CollectionRun | null>;

  listCollectableSources(): Promise<SourceWithProduct[]>;
  getSourceWithProduct(id: string): Promise<SourceWithProduct | null>;
  updateSourceAfterCollection(
    id: string,
    patch: { last_checked_at: string; last_status: CollectionStatus; last_error: string | null; last_success_at?: string },
  ): Promise<void>;
  insertPrice(record: NewPriceRecord): Promise<"inserted" | "duplicate">;
  listHistory(sourceIds: string[]): Promise<PriceRecord[]>;

  listActiveRules(): Promise<AlertRule[]>;
  listEventsSince(sinceIso: string): Promise<AlertEvent[]>;
  insertEvent(event: NewAlertEvent): Promise<"inserted" | "duplicate">;

  getSettings(): Promise<NotificationSettings>;
  hasSentNotification(channel: Channel, eventKey: string): Promise<boolean>;
  logNotification(log: NewNotificationLog): Promise<void>;

  listMonitoredProducts(): Promise<ProductWithSources[]>;
}

export const DEFAULT_SETTINGS: NotificationSettings = {
  email_enabled: false,
  email_to: null,
  telegram_enabled: false,
  telegram_chat_id: null,
  whatsapp_enabled: false,
  whatsapp_to: null,
  daily_summary_enabled: true,
  alerts_enabled: true,
  only_relevant: false,
  stale_after_hours: 48,
};
