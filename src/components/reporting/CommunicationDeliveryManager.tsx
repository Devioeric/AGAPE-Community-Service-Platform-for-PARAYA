"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { DeliveryRuntimeDTO } from "@/lib/reporting/contracts";

export function CommunicationDeliveryManager() {
  const [rows, setRows] = useState<DeliveryRuntimeDTO[]>([]);
  const [message, setMessage] = useState("");
  const load = async () => {
    const response = await fetch("/api/admin/communication-delivery", { cache: "no-store" });
    if (response.ok) setRows(await response.json());
  };
  useEffect(() => { void load(); }, []);

  async function save(event: FormEvent<HTMLFormElement>, channel: "email" | "sms") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/communication-delivery", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel, mode: form.get("mode"), providerKey: form.get("providerKey"), syntheticUserIds: [] }),
    });
    setMessage(response.ok ? `${channel.toUpperCase()} delivery configuration saved.` : "Configuration was not saved.");
    if (response.ok) await load();
  }

  async function requeue(channel: "email" | "sms") {
    const response = await fetch("/api/admin/communication-delivery", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel }),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? `${payload.requeued ?? 0} eligible ${channel} deliveries requeued.` : "Deliveries were not requeued.");
    if (response.ok) await load();
  }

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-semibold text-paraya-brown">Communication delivery</h1>
      <p className="mt-1 text-sm text-gray-600">In-app notifications remain authoritative. External email and SMS stay off until explicitly configured.</p>
    </div>
    {message && <p className="rounded-lg bg-paraya-cream px-4 py-3 text-sm">{message}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      {(["email", "sms"] as const).map(channel => {
        const row = rows.find(item => item.channel === channel);
        return <form key={channel} onSubmit={event => void save(event, channel)} className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold capitalize">{channel}</h2>
          <p className="mt-1 text-xs text-gray-500">Queued {row?.queuedCount ?? 0} · Failed {row?.failedCount ?? 0} · Suppressed {row?.suppressedCount ?? 0}</p>
          <label className="mt-4 block text-sm">Runtime mode
            <select name="mode" defaultValue={row?.mode ?? "off"} className="mt-1 w-full rounded-lg border px-3 py-2">
              <option value="off">Off</option><option value="synthetic">Synthetic</option><option value="live">Live</option>
            </select>
          </label>
          <label className="mt-3 block text-sm">Provider key
            <input name="providerKey" defaultValue={row?.providerKey ?? "disabled"} className="mt-1 w-full rounded-lg border px-3 py-2" maxLength={100} required />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg bg-paraya-brown px-4 py-2 text-sm text-white">Save configuration</button>
            <button type="button" onClick={() => void requeue(channel)} className="rounded-lg border px-4 py-2 text-sm">Requeue eligible</button>
          </div>
        </form>;
      })}
    </div>
  </div>;
}
