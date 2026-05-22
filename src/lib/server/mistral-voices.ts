import { Mistral } from '@mistralai/mistralai';

const VOICE_CACHE_TTL_MS = 10 * 60 * 1000;

type VoiceList = Awaited<ReturnType<Mistral['audio']['voices']['list']>>['items'];

let cachedVoices: VoiceList | null = null;
let cachedAt = 0;
let inFlightRequest: Promise<VoiceList> | null = null;

const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? '';

const getVoices = async (client: Mistral): Promise<VoiceList> => {
  if (cachedVoices && Date.now() - cachedAt < VOICE_CACHE_TTL_MS) {
    return cachedVoices;
  }

  if (!inFlightRequest) {
    inFlightRequest = client.audio.voices
      .list()
      .then((response) => {
        cachedVoices = response.items;
        cachedAt = Date.now();
        return response.items;
      })
      .finally(() => {
        inFlightRequest = null;
      });
  }

  return inFlightRequest;
};

const isFrenchVoice = (voice: VoiceList[number]) =>
  voice.languages?.some((language) => normalize(language).startsWith('fr')) ?? false;

export const resolveMistralVoiceId = async (
  client: Mistral,
  requestedVoiceId?: string | null
): Promise<string | undefined> => {
  try {
    const requested = normalize(requestedVoiceId);
    if (requested === 'fr_marie_neutral') {
      return 'fr_marie_neutral';
    }

    const voices = await getVoices(client);
    const matchedVoice = requested
      ? voices.find((voice) =>
          [voice.id, voice.slug, voice.name].some((candidate) => normalize(candidate) === requested)
        )
      : undefined;

    return matchedVoice?.id ?? 'fr_marie_neutral';
  } catch (error) {
    console.warn('[Mistral Voices] Failed to fetch voice catalog; using fr_marie_neutral.', error);
    return 'fr_marie_neutral';
  }
};
