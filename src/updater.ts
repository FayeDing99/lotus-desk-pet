import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export function isDesktopRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function findAppUpdate(): Promise<Update | null> {
  if (!isDesktopRuntime()) return null;
  return check({ timeout: 15_000 });
}

export async function installAppUpdate(update: Update, onEvent: (event: DownloadEvent) => void) {
  await update.downloadAndInstall(onEvent);
  await relaunch();
}

export type { DownloadEvent, Update };
