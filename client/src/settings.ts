import { createContext, useContext, useEffect, useState } from 'react';
import { setMuted } from './sfx';

export type Theme = 'light' | 'dark';
export type CardStyle = 'vector' | 'photo';
export interface Settings {
  theme: Theme;
  cardStyle: CardStyle;
  sound: boolean;
}

const KEY = 'meono.settings.v2';

function load(): Settings {
  const fallback: Settings = { theme: 'light', cardStyle: 'photo', sound: true };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

export function useSettingsState() {
  const [settings, setSettings] = useState<Settings>(load);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    setMuted(!settings.sound);
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* bỏ qua: chỉ là tuỳ chọn hiển thị */
    }
  }, [settings]);
  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  return [settings, update] as const;
}

export const SettingsContext = createContext<Settings>({ theme: 'light', cardStyle: 'photo', sound: true });
export const useSettings = () => useContext(SettingsContext);
