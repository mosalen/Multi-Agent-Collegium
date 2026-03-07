// Storage abstraction: Tauri native FS in production, localStorage in dev/web

const isTauri = () => typeof window !== "undefined" && window.__TAURI_INTERNALS__;

async function invokeCmd(cmd, args) {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke(cmd, args);
  }
  return null;
}

export async function storageGet(key) {
  if (isTauri()) {
    const val = await invokeCmd("storage_get", { key });
    return val ? JSON.parse(val) : null;
  }
  const val = localStorage.getItem(`mac:${key}`);
  return val ? JSON.parse(val) : null;
}

export async function storageSet(key, value) {
  const json = JSON.stringify(value);
  if (isTauri()) {
    await invokeCmd("storage_set", { key, value: json });
  } else {
    localStorage.setItem(`mac:${key}`, json);
  }
}

export async function storageDelete(key) {
  if (isTauri()) {
    await invokeCmd("storage_delete", { key });
  } else {
    localStorage.removeItem(`mac:${key}`);
  }
}

export async function storageList(prefix) {
  if (isTauri()) {
    return invokeCmd("storage_list", { prefix: prefix || null });
  }
  // localStorage fallback
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("mac:")) {
      const stripped = k.slice(4);
      if (!prefix || stripped.startsWith(prefix)) {
        keys.push(stripped);
      }
    }
  }
  return keys;
}
