import en from "../locales/en.json";
import bn from "../locales/bn.json";

export type Language = "en" | "bn";

const dictionaries = { en, bn };

export function translate(key: string, lang: Language = "en"): string {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = dictionaries[lang] || dictionaries.en;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return key;
    }
  }
  return typeof current === "string" ? current : key;
}
