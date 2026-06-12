import { env } from "./env.js";

export const NOVA_SONIC_V1_MODEL_ID = "amazon.nova-sonic-v1:0";

export const NOVA_SONIC_MODELS = [
  { id: NOVA_SONIC_V1_MODEL_ID, label: "Amazon Nova Sonic v1" },
];

export const NOVA_SONIC_V1_VOICES = [
  {
    language: "en-US",
    label: "English (US)",
    voices: [
      { id: "tiffany", label: "Tiffany", genderSound: "feminine" },
      { id: "matthew", label: "Matthew", genderSound: "masculine" },
    ],
  },
  {
    language: "en-GB",
    label: "English (GB)",
    voices: [{ id: "amy", label: "Amy", genderSound: "feminine" }],
  },
  {
    language: "fr-FR",
    label: "French",
    voices: [
      { id: "ambre", label: "Ambre", genderSound: "feminine" },
      { id: "florian", label: "Florian", genderSound: "masculine" },
    ],
  },
  {
    language: "it-IT",
    label: "Italian",
    voices: [
      { id: "beatrice", label: "Beatrice", genderSound: "feminine" },
      { id: "lorenzo", label: "Lorenzo", genderSound: "masculine" },
    ],
  },
  {
    language: "de-DE",
    label: "German",
    voices: [
      { id: "greta", label: "Greta", genderSound: "feminine" },
      { id: "lennart", label: "Lennart", genderSound: "masculine" },
    ],
  },
  {
    language: "es-ES",
    label: "Spanish",
    voices: [
      { id: "lupe", label: "Lupe", genderSound: "feminine" },
      { id: "carlos", label: "Carlos", genderSound: "masculine" },
    ],
  },
] as const;

export const DEFAULT_NOVA_SONIC_VOICE = {
  provider: "aws_nova_sonic" as const,
  modelId: env.BEDROCK_SONIC_MODEL_ID || NOVA_SONIC_V1_MODEL_ID,
  language: env.DEFAULT_SONIC_LANGUAGE || "en-US",
  voiceId: env.DEFAULT_SONIC_VOICE_ID || "tiffany",
  speakingStyle: "friendly" as const,
  responseSpeed: "normal" as const,
  allowInterruptions: true,
  captionsEnabledByDefault: true,
};

type NovaSonicSpeakingStyle = "friendly" | "professional" | "warm" | "fast" | "calm";
type NovaSonicResponseSpeed = "normal" | "fast";

export function isValidNovaSonicVoice(language: string, voiceId: string) {
  return NOVA_SONIC_V1_VOICES.some(
    (group) =>
      group.language === language &&
      group.voices.some((voice) => voice.id === voiceId),
  );
}

export function normalizeNovaSonicVoice(input?: {
  provider?: string | null;
  modelId?: string | null;
  language?: string | null;
  voiceId?: string | null;
  speakingStyle?: string | null;
  responseSpeed?: string | null;
  allowInterruptions?: boolean | null;
  captionsEnabledByDefault?: boolean | null;
} | null) {
  const language = input?.language || DEFAULT_NOVA_SONIC_VOICE.language;
  const voiceId = input?.voiceId || DEFAULT_NOVA_SONIC_VOICE.voiceId;
  const validVoice = isValidNovaSonicVoice(language, voiceId);

  const speakingStyle: NovaSonicSpeakingStyle =
    input?.speakingStyle === "professional" ||
    input?.speakingStyle === "warm" ||
    input?.speakingStyle === "fast" ||
    input?.speakingStyle === "calm"
      ? input.speakingStyle
      : DEFAULT_NOVA_SONIC_VOICE.speakingStyle;
  const responseSpeed: NovaSonicResponseSpeed =
    input?.responseSpeed === "fast" ? "fast" : DEFAULT_NOVA_SONIC_VOICE.responseSpeed;

  return {
    provider: "aws_nova_sonic" as const,
    modelId:
      input?.modelId && NOVA_SONIC_MODELS.some((model) => model.id === input.modelId)
        ? input.modelId
        : DEFAULT_NOVA_SONIC_VOICE.modelId,
    language: validVoice ? language : DEFAULT_NOVA_SONIC_VOICE.language,
    voiceId: validVoice ? voiceId : DEFAULT_NOVA_SONIC_VOICE.voiceId,
    speakingStyle,
    responseSpeed,
    allowInterruptions: input?.allowInterruptions ?? DEFAULT_NOVA_SONIC_VOICE.allowInterruptions,
    captionsEnabledByDefault:
      input?.captionsEnabledByDefault ?? DEFAULT_NOVA_SONIC_VOICE.captionsEnabledByDefault,
  };
}
