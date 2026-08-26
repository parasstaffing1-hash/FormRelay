export type IntegrationProvider = "webhook" | "slack" | "discord" | "airtable" | "google_sheets";
export type IntegrationConfig = { provider: IntegrationProvider; url: string; mapping?: Record<string, string> };

function valueAt(data: Record<string, string>, path: string): string {
  if (path.startsWith("literal:")) return path.slice(8);
  return data[path] ?? "";
}

export function mapIntegrationPayload(config: IntegrationConfig, data: Record<string, string>, form: { id: string; name: string }): Record<string, unknown> {
  const fields = Object.fromEntries(Object.entries(config.mapping ?? {}).map(([destination, source]) => [destination, valueAt(data, source)]));
  if (config.provider === "slack") return { text: `New submission to ${form.name}`, blocks: [{ type: "section", text: { type: "mrkdwn", text: `*New submission to ${form.name}*\n${Object.entries(fields).map(([key, value]) => `*${key}:* ${String(value)}`).join("\n")}` } }] };
  if (config.provider === "discord") return { content: `New submission to ${form.name}\n${Object.entries(fields).map(([key, value]) => `**${key}:** ${String(value)}`).join("\n")}` };
  return { event: "submission.created", form, data: fields };
}

export async function deliverIntegration(config: IntegrationConfig, data: Record<string, string>, form: { id: string; name: string }): Promise<string> {
  if (!/^https?:\/\//i.test(config.url)) throw new Error("integration URL is invalid");
  const response = await fetch(config.url, { method: "POST", headers: { "content-type": "application/json", "X-FormRelay-Integration": config.provider }, body: JSON.stringify(mapIntegrationPayload(config, data, form)), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`${config.provider} integration HTTP ${response.status}`);
  return `${config.provider} integration delivered`;
}
