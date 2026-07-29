import { isServiceRequest, json, serviceClient } from "./generation.ts";

type ClaimedDelivery = {
  id: string;
  expo_push_token: string;
  title: string;
  body: string;
  link: string;
  type: string;
  lease_token: string;
};

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  details?: { error?: string };
  message?: string;
};

const expoPushUrl = "https://exp.host/--/api/v2/push/send";
const expoReceiptsUrl = "https://exp.host/--/api/v2/push/getReceipts";

async function claim(limit: number) {
  const client = serviceClient();
  const { error: reclaimError } = await client.rpc(
    "reclaim_expired_push_deliveries",
  );
  if (reclaimError) throw reclaimError;
  const { data, error } = await client.rpc("claim_push_deliveries", {
    p_worker_id: `process-push-deliveries:${crypto.randomUUID()}`,
    p_limit: Math.min(Math.max(limit, 1), 100),
    p_lease_seconds: 120,
  });
  if (error) throw error;
  return (data ?? []) as ClaimedDelivery[];
}

async function disableInvalidDevice(token: string) {
  const client = serviceClient();
  const { error } = await client
    .from("push_devices")
    .update({ enabled: false, disabled_at: new Date().toISOString() })
    .eq("expo_push_token", token);
  if (error) throw error;
}

export async function processPushDeliveries(limit = 50) {
  const deliveries = await claim(limit);
  if (!deliveries.length) return { claimed: 0, sent: 0, failed: 0 };
  const client = serviceClient();
  let tickets: ExpoTicket[];
  try {
    const response = await fetch(expoPushUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        deliveries.map((delivery) => ({
          to: delivery.expo_push_token,
          title: delivery.title,
          body: delivery.body,
          sound: "default",
          channelId: "patch",
          data: { link: delivery.link, type: delivery.type },
        })),
      ),
    });
    if (!response.ok) throw new Error(`Expo push returned ${response.status}.`);
    const payload = (await response.json()) as { data?: ExpoTicket[] };
    tickets = payload.data ?? [];
    if (tickets.length !== deliveries.length) {
      throw new Error("Expo push returned an incomplete ticket batch.");
    }
  } catch {
    await Promise.all(
      deliveries.map(async (delivery) => {
        const { error: failureError } = await client.rpc("fail_push_delivery", {
          p_delivery_id: delivery.id,
          p_lease_token: delivery.lease_token,
          p_error_code: "provider_unavailable",
          p_error_message: "Expo push provider was unavailable.",
          p_retryable: true,
        });
        if (failureError) throw failureError;
      }),
    );
    return { claimed: deliveries.length, sent: 0, failed: deliveries.length };
  }

  let sent = 0;
  let failed = 0;
  await Promise.all(
    deliveries.map(async (delivery, index) => {
      const ticket = tickets[index];
      if (ticket?.status === "ok") {
        const { data, error } = await client.rpc("complete_push_delivery", {
          p_delivery_id: delivery.id,
          p_lease_token: delivery.lease_token,
          p_ticket_id: ticket.id ?? null,
        });
        if (error) throw error;
        if (!data) {
          throw new Error("Push delivery lease was lost before completion.");
        }
        sent += 1;
        return;
      }
      failed += 1;
      const nonRetryable = ticket?.details?.error === "DeviceNotRegistered";
      const { data, error } = await client.rpc("fail_push_delivery", {
        p_delivery_id: delivery.id,
        p_lease_token: delivery.lease_token,
        p_error_code: ticket?.details?.error ?? "provider_error",
        p_error_message: ticket?.message ?? "Expo push rejected delivery.",
        p_retryable: !nonRetryable,
      });
      if (error) throw error;
      if (!data) {
        throw new Error(
          "Push delivery lease was lost before failure handling.",
        );
      }
      if (nonRetryable) await disableInvalidDevice(delivery.expo_push_token);
    }),
  );
  return { claimed: deliveries.length, sent, failed };
}

export async function processPushReceipts(limit = 100) {
  const client = serviceClient();
  const { data, error } = await client
    .from("push_deliveries")
    .select("id, device_id, provider_ticket_id")
    .eq("status", "sent")
    .not("provider_ticket_id", "is", null)
    .is("provider_receipt_id", null)
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  const deliveries = data ?? [];
  if (!deliveries.length) return { checked: 0, disabled: 0 };
  const ids = deliveries
    .map((delivery) => delivery.provider_ticket_id)
    .filter((id): id is string => Boolean(id));
  const response = await fetch(expoReceiptsUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    throw new Error(`Expo receipt lookup returned ${response.status}.`);
  }
  const payload = (await response.json()) as {
    data?: Record<string, ExpoTicket>;
  };
  if (!payload.data || typeof payload.data !== "object") {
    throw new Error("Expo receipt response was malformed.");
  }
  let disabled = 0;
  await Promise.all(
    deliveries.map(async (delivery) => {
      const receipt = delivery.provider_ticket_id
        ? payload.data?.[delivery.provider_ticket_id]
        : null;
      if (!receipt) return;
      if (
        receipt.status === "error" &&
        receipt.details?.error === "DeviceNotRegistered"
      ) {
        const { error: disableError } = await client
          .from("push_devices")
          .update({ enabled: false, disabled_at: new Date().toISOString() })
          .eq("id", delivery.device_id);
        if (disableError) throw disableError;
        disabled += 1;
      }
      const { error: receiptError } = await client
        .from("push_deliveries")
        .update({
          provider_receipt_id: delivery.provider_ticket_id,
          error_code: receipt.details?.error ?? null,
          error_message: receipt.message ?? null,
        })
        .eq("id", delivery.id);
      if (receiptError) throw receiptError;
    }),
  );
  return { checked: deliveries.length, disabled };
}

export { isServiceRequest, json };
