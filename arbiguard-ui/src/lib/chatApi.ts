const apiBase = import.meta.env.VITE_API_BASE ?? "";

export interface ChatApiResult {
  response: string;
  action?: string;
}

export async function postChat(message: string): Promise<ChatApiResult> {
  const res = await fetch(`${apiBase}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const data = (await res.json()) as {
    response?: string;
    action?: string;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(data.error ?? data.response ?? `Request failed (${res.status})`);
  }

  return {
    response: data.response ?? "",
    action: data.action,
  };
}
