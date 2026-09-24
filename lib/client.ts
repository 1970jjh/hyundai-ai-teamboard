/** 브라우저 → 우리 API 호출. 실패하면 한국어 메시지를 담은 Error 를 던진다. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new Error("네트워크에 연결할 수 없습니다");
  }
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null;
  if (!res.ok || !json?.success) throw new Error(json?.error ?? `요청 실패 (${res.status})`);
  return json.data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "알 수 없는 오류");

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
