import { stripCitations } from "@/lib/textClean";

export const TTS_RATES = [0.75, 1.0, 1.25] as const;

export interface SpeakOptions {
  rate?: number;
  voiceURI?: string | null;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

export function isTtsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function getChineseVoices(): SpeechSynthesisVoice[] {
  if (!isTtsSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  const chinese = voices.filter((v) => {
    const lang = v.lang.toLowerCase();
    return lang.startsWith("zh") || lang.includes("cmn");
  });

  // Prefer Simplified Mandarin (zh-CN) voices first, then local/enhanced voices
  return chinese.sort((a, b) => {
    const score = (v: SpeechSynthesisVoice) => {
      const lang = v.lang.toLowerCase();
      let s = 0;
      if (lang === "zh-cn" || lang === "zh_cn") s += 100;
      else if (lang.startsWith("zh-hans")) s += 90;
      else if (lang.startsWith("zh-tw") || lang.startsWith("zh-hk")) s += 40;
      const name = v.name.toLowerCase();
      if (name.includes("tingting") || name.includes("xiaoxiao") || name.includes("premium") || name.includes("enhanced")) {
        s += 25;
      }
      if (v.localService) s += 10;
      return s;
    };
    return score(b) - score(a);
  });
}

export function stopSpeaking(): void {
  if (!isTtsSupported()) return;
  window.speechSynthesis.cancel();
}

export function speakChinese(text: string, options: SpeakOptions = {}): boolean {
  if (!isTtsSupported()) {
    options.onError?.();
    return false;
  }

  const cleaned = stripCitations(text);
  if (!cleaned) {
    options.onEnd?.();
    return false;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.lang = "zh-CN";
  utterance.rate = options.rate ?? 1.0;

  const voices = getChineseVoices();
  if (voices.length > 0) {
    const preferred = options.voiceURI
      ? voices.find((v) => v.voiceURI === options.voiceURI)
      : undefined;
    utterance.voice = preferred || voices[0];
    utterance.lang = utterance.voice.lang || "zh-CN";
  }

  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onError?.();

  window.speechSynthesis.speak(utterance);
  return true;
}
