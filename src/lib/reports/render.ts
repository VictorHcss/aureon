/** Renderização do relatório diário e dos alertas para cada canal. */
import { formatDateTime } from "../dates";
import { formatBRL, formatPercent } from "../money";
import { STATUS_LABELS, RULE_LABELS } from "../types";
import type { AlertCandidate } from "../alerts/engine";
import type { OutgoingMessage } from "../notify/types";
import { escapeTelegramHtml } from "../notify/telegram";
import type { DailyReport, ReportItem } from "./build";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Só permite links http(s) nos e-mails e mensagens. */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "#";
  } catch {
    return "#";
  }
}

function runLine(r: DailyReport): string {
  if (!r.run) return "Nenhuma coleta registrada ainda.";
  const status = { success: "concluída", partial: "concluída com falhas", failed: "falhou", running: "em andamento" }[r.run.status];
  return `Coleta ${status} em ${formatDateTime(r.run.finished_at ?? r.run.started_at)}: ${r.run.successes} consultas com sucesso e ${r.run.failures} com falha.`;
}

// Paleta Aureon adaptada para e-mail (clientes de e-mail não leem variáveis CSS).
const COLORS = { ink: "#202329", muted: "#646B76", line: "#E1E4E9", down: "#147537", up: "#B91C1C", accent: "#A35A00", gold: "#F59E0B" };

function changeHtml(pct: number | null): string {
  if (pct === null) return `<span style="color:${COLORS.muted}">—</span>`;
  const color = pct < 0 ? COLORS.down : pct > 0 ? COLORS.up : COLORS.muted;
  return `<span style="color:${color};font-weight:600">${formatPercent(pct)}</span>`;
}

function rowsHtml(items: ReportItem[], opts: { showTarget?: boolean } = {}): string {
  return items
    .map(
      (i) => `<tr>
  <td style="padding:10px 8px;border-bottom:1px solid ${COLORS.line}">
    <a href="${escapeHtml(safeUrl(i.url))}" style="color:${COLORS.accent};font-weight:600;text-decoration:none">${escapeHtml(i.productName)}</a>
    <div style="color:${COLORS.muted};font-size:12px">${escapeHtml(i.storeName)} · última coleta válida ${formatDateTime(i.lastValidAt)}</div>
  </td>
  <td style="padding:10px 8px;border-bottom:1px solid ${COLORS.line};text-align:right;white-space:nowrap;font-weight:600">${formatBRL(i.price)}${
        opts.showTarget && i.targetPrice ? `<div style="color:${COLORS.muted};font-size:12px;font-weight:400">alvo ${formatBRL(i.targetPrice)}</div>` : ""
      }</td>
  <td style="padding:10px 8px;border-bottom:1px solid ${COLORS.line};text-align:right;white-space:nowrap">${changeHtml(i.pctChange)}</td>
</tr>`,
    )
    .join("");
}

function sectionHtml(title: string, items: ReportItem[], opts: { showTarget?: boolean } = {}): string {
  if (!items.length) return "";
  return `<h2 style="font-size:16px;margin:28px 0 8px;color:${COLORS.ink}">${escapeHtml(title)} (${items.length})</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px">${rowsHtml(items, opts)}</table>`;
}

function textSection(title: string, items: ReportItem[]): string {
  if (!items.length) return "";
  const lines = items.map(
    (i) =>
      `- ${i.productName} (${i.storeName}): ${formatBRL(i.price)} ${i.pctChange !== null ? `(${formatPercent(i.pctChange)})` : ""}${
        i.targetPrice ? ` | alvo ${formatBRL(i.targetPrice)}` : ""
      }\n  ${safeUrl(i.url)}\n  Última coleta válida: ${formatDateTime(i.lastValidAt)}`,
  );
  return `\n${title} (${items.length})\n${lines.join("\n")}\n`;
}

export function renderDailyReport(report: DailyReport, appUrl?: string | null): OutgoingMessage {
  const date = formatDateTime(report.generatedAt);
  const highlights = report.targetReached.length + report.drops.length;
  const subject = report.isEmpty
    ? `Aureon: nenhum produto monitorado (${date})`
    : `Aureon: ${report.targetReached.length} no alvo, ${report.drops.length} em queda (${date})`;
  const partial = report.run && report.run.status !== "success";

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#F6F7F9;font-family:Arial,Helvetica,sans-serif;color:${COLORS.ink}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:12px;padding:24px;border-top:4px solid ${COLORS.gold}">
<tr><td>
<p style="margin:0 0 12px;font-size:13px;font-weight:600;color:${COLORS.ink}">Aureon</p>
<h1 style="font-size:20px;margin:0 0 4px">Relatório diário de preços</h1>
<p style="margin:0;color:${COLORS.muted};font-size:13px">Gerado em ${date} (horário de Brasília)</p>
<p style="margin:16px 0 0;font-size:14px">${escapeHtml(runLine(report))}</p>
<p style="margin:6px 0 0;font-size:14px">${report.totals.products} produtos e ${report.totals.sources} ofertas monitoradas.</p>
${partial ? `<p style="margin:12px 0 0;padding:10px;background:#FFF4E5;border-radius:6px;font-size:13px">Atenção: parte das consultas falhou. Os itens abaixo usam a última coleta válida de cada oferta.</p>` : ""}
${report.isEmpty ? `<p style="margin:16px 0 0">Cadastre produtos no painel para começar a receber comparações.</p>` : ""}
${sectionHtml("Atingiram o preço-alvo", report.targetReached, { showTarget: true })}
${sectionHtml("Maiores quedas desde a coleta anterior", report.drops)}
${sectionHtml("Menor preço já observado pelo monitor", report.historicLows)}
${sectionHtml("Ficaram mais caros", report.increases)}
${sectionHtml("Sem atualização recente", report.stale)}
${!report.isEmpty && highlights === 0 ? `<p style="margin:24px 0 0;font-size:14px">Nenhuma queda ou preço-alvo atingido hoje.</p>` : ""}
<p style="margin:28px 0 0;color:${COLORS.muted};font-size:12px">Comparações consideram apenas as lojas monitoradas pelo sistema, não o mercado inteiro.${
    appUrl ? ` <a href="${escapeHtml(safeUrl(appUrl))}" style="color:${COLORS.accent}">Abrir painel</a>` : ""
  }</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    "Aureon: relatório diário de preços",
    `Gerado em ${date} (horário de Brasília)`,
    runLine(report),
    `${report.totals.products} produtos e ${report.totals.sources} ofertas monitoradas.`,
    partial ? "Atenção: parte das consultas falhou; itens usam a última coleta válida." : "",
    textSection("Atingiram o preço-alvo", report.targetReached),
    textSection("Maiores quedas", report.drops),
    textSection("Menor preço já observado", report.historicLows),
    textSection("Ficaram mais caros", report.increases),
    textSection("Sem atualização recente", report.stale),
    "Comparações consideram apenas as lojas monitoradas.",
    appUrl ? `Painel: ${appUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const tgItem = (i: ReportItem) =>
    `• <a href="${escapeHtml(safeUrl(i.url))}">${escapeTelegramHtml(i.productName)}</a> (${escapeTelegramHtml(i.storeName)}): <b>${formatBRL(i.price)}</b>${
      i.pctChange !== null ? ` ${formatPercent(i.pctChange)}` : ""
    }`;
  const tgSection = (title: string, items: ReportItem[]) => (items.length ? `\n<b>${title}</b>\n${items.map(tgItem).join("\n")}` : "");
  const telegram = [
    `<b>📊 Aureon: relatório de preços</b> — ${date}`,
    escapeTelegramHtml(runLine(report)),
    tgSection("🎯 No preço-alvo", report.targetReached),
    tgSection("📉 Quedas", report.drops),
    tgSection("🏷️ Menor preço já observado", report.historicLows),
    tgSection("📈 Mais caros", report.increases),
    report.stale.length ? `\n⚠️ ${report.stale.length} oferta(s) sem atualização recente.` : "",
    report.isEmpty ? "Nenhum produto monitorado ainda." : "",
  ]
    .filter(Boolean)
    .join("\n");

  const whatsapp = `Aureon, relatório ${date}: ${report.targetReached.length} no preço-alvo, ${report.drops.length} em queda, ${report.increases.length} mais caros, ${report.stale.length} sem atualização.${
    report.targetReached[0] ? ` Destaque: ${report.targetReached[0].productName} por ${formatBRL(report.targetReached[0].price)}.` : ""
  }${appUrl ? ` Painel: ${appUrl}` : ""}`;

  return { subject, html, text, telegram, whatsapp };
}

export function renderAlert(a: AlertCandidate): OutgoingMessage {
  const when = formatDateTime(a.collectedAt);
  const label = RULE_LABELS[a.ruleType];
  const head =
    a.ruleType === "stale_data"
      ? `Sem atualização: ${a.productName}`
      : a.ruleType === "target_price"
        ? `Preço-alvo atingido: ${a.productName}`
        : a.ruleType === "historic_low"
          ? `Menor preço já observado: ${a.productName}`
          : a.ruleType === "back_in_stock"
            ? `Disponível novamente: ${a.productName}`
            : `Variação de preço: ${a.productName}`;
  const details = [
    `Loja: ${a.storeName}`,
    a.price !== null ? `Preço atual: ${formatBRL(a.price)}` : "Preço atual: sem coleta válida recente",
    a.pctChange !== null ? `Variação: ${formatPercent(a.pctChange)}` : null,
    a.targetPrice ? `Preço-alvo: ${formatBRL(a.targetPrice)}` : null,
    `Consulta: ${when}`,
    `Regra: ${label}`,
  ].filter((x): x is string => Boolean(x));

  const url = safeUrl(a.url);
  return {
    subject: head,
    html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;color:${COLORS.ink}">
<p style="margin:0 0 8px;font-size:13px;font-weight:600">Aureon</p>
<h1 style="font-size:18px">${escapeHtml(head)}</h1>
<ul>${details.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
<p><a href="${escapeHtml(url)}">Ver oferta</a></p></body></html>`,
    text: `${head}\n${details.join("\n")}\n${url}`,
    telegram: `<b>${escapeTelegramHtml(head)}</b>\n${details.map(escapeTelegramHtml).join("\n")}\n<a href="${escapeHtml(url)}">Ver oferta</a>`,
    whatsapp: `${head}. ${details.join(". ")}. ${url}`,
  };
}

export function renderTestMessage(now = new Date()): OutgoingMessage {
  const when = formatDateTime(now);
  const text = `Mensagem de teste do Aureon enviada em ${when}. Se você recebeu, este canal está configurado.`;
  return {
    subject: "Aureon: mensagem de teste",
    html: `<p style="font-family:Arial,Helvetica,sans-serif">${escapeHtml(text)}</p>`,
    text,
    telegram: escapeTelegramHtml(text),
    whatsapp: text,
  };
}

export { STATUS_LABELS };
