export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.message || "We could not complete that request.");
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response;
}

export const jsonBody = (value) => ({ body: JSON.stringify(value) });

export async function download(path, filename) {
  const response = await fetch(`/api${path}`, { credentials: "include" });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.message || "The export could not be created.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
