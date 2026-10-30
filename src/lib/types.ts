/** Tipos de domínio compartilhados entre painel, coletores, alertas e relatórios. */

export const COLLECTION_STATUSES = [
  "success",
  "unavailable",
  "temporary_failure",
  "structure_changed",
  "price_not_found",
  "auth_error",
  "invalid_source",
] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

export type AvailabilityStatus = "in_stock" | "out_of_stock" | "unknown";

export const SOURCE_TYPES = ["mercadolivre"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const RULE_TYPES = [
  "target_price",
  "percent_drop",
  "historic_low",
  "abs_change",
  "back_in_stock",
  "stale_data",
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export type Channel = "email" | "telegram" | "whatsapp";
export type NotificationKind = "alert" | "daily_report" | "test";
export type RunStatus = "running" | "success" | "partial" | "failed";
export type RunTrigger = "schedule" | "manual" | "panel";

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  category_id: string | null;
  target_price: number | null;
  max_price: number | null;
  notes: string | null;
  active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductSource {
  id: string;
  product_id: string;
  store_name: string;
  product_url: string;
  source_type: string;
  external_identifier: string | null;
  active: boolean;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_status: CollectionStatus | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceRecord {
  id: string;
  product_source_id: string;
  run_id: string | null;
  price: number | null;
  original_price: number | null;
  shipping_price: number | null;
  currency: string;
  availability_status: AvailabilityStatus;
  collection_status: CollectionStatus;
  seller_id: string | null;
  collected_at: string;
  source_url: string | null;
  metadata: Record<string, unknown>;
}

export interface AlertRule {
  id: string;
  product_id: string;
  rule_type: RuleType;
  threshold: number | null;
  cooldown_hours: number;
  active: boolean;
}

export interface AlertEvent {
  id: string;
  rule_id: string | null;
  product_id: string | null;
  product_source_id: string | null;
  rule_type: RuleType;
  event_key: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CollectionRun {
  id: string;
  run_key: string | null;
  trigger: RunTrigger;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  products_processed: number;
  sources_processed: number;
  successes: number;
  failures: number;
  error_summary: string | null;
  github_run_id: string | null;
}

export interface NotificationLog {
  id: string;
  channel: Channel;
  kind: NotificationKind;
  product_id: string | null;
  event_key: string;
  status: "sent" | "failed" | "skipped";
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface NotificationSettings {
  email_enabled: boolean;
  email_to: string | null;
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
  whatsapp_enabled: boolean;
  whatsapp_to: string | null;
  daily_summary_enabled: boolean;
  alerts_enabled: boolean;
  only_relevant: boolean;
  stale_after_hours: number;
}

/** Fonte com o produto ao qual pertence (usado pelos jobs). */
export interface SourceWithProduct extends ProductSource {
  product: Pick<Product, "id" | "name" | "target_price" | "max_price" | "active" | "archived_at">;
}

export const STATUS_LABELS: Record<CollectionStatus, string> = {
  success: "Sucesso",
  unavailable: "Indisponível",
  temporary_failure: "Falha temporária",
  structure_changed: "Estrutura alterada",
  price_not_found: "Preço não identificado",
  auth_error: "Erro de autenticação",
  invalid_source: "Fonte inválida",
};

export const RULE_LABELS: Record<RuleType, string> = {
  target_price: "Preço igual ou abaixo do alvo",
  percent_drop: "Queda percentual mínima",
  historic_low: "Menor preço já observado",
  abs_change: "Variação acima de um valor (R$)",
  back_in_stock: "Produto disponível novamente",
  stale_data: "Sem atualização há muitas horas",
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  mercadolivre: "Mercado Livre (API oficial)",
};
