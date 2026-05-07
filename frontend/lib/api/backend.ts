export async function fetcherRealTime(url: string, init: any): Promise<Response> {
  const res = await fetch(`${process.env.BACKEND_RT_URL}/api/v1${url}`, {
    ...init,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();

    throw new Error(text);
  }

  return res;
}

export async function fetcherJSON<JSON = any>(url: string, init: any): Promise<JSON> {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1${url}`, {
    ...init,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return (await res.json()) as JSON;
}
