import { defaultNanoBananaSettings, validateNanoBananaSettings } from '../nodes/nanoBanana';
import { defaultSeedreamSettings, validateSeedreamSettings } from '../nodes/seedream';
import {
  apimartFixedSettings, defaultSunburstSettings, validateSunburstProvider,
  validateSunburstSettings, validateSunburstVariant, type SunburstSettings,
} from '../nodes/sunburst';
import type { SunburstNode } from '../nodes/types';

function createImagePreset<Settings>(model: string, defaults: Settings, validate: (value: unknown) => Settings) {
  const storageKey = `momoflow-${model}-preset-v1`;
  return {
    newNodeData() {
      try {
        const stored = JSON.parse(globalThis.localStorage?.getItem(storageKey) ?? 'null');
        if (stored) return { ...defaults, ...validate(stored), imageInputs: 1 };
      } catch { /* Use factory defaults when the stored preset is unavailable or invalid. */ }
      return { ...defaults, imageInputs: 1 };
    },
    remember(data: Settings) {
      try {
        globalThis.localStorage?.setItem(storageKey, JSON.stringify(validate(data)));
      } catch { /* Keep the last valid preset while parameters are incomplete. */ }
    },
  };
}

type SunburstPreset = SunburstSettings & Pick<SunburstNode['data'], 'provider' | 'variant'>;
const defaultSunburstPreset: SunburstPreset = {
  ...defaultSunburstSettings, ...apimartFixedSettings,
  provider: 'apimart', channelModel: 'gpt-image-2.6-ext', variant: 'Sunburst',
};

export const sunburstPreset = createImagePreset('sunburst', defaultSunburstPreset, value => {
  const settings = validateSunburstSettings(value);
  const { provider, variant } = value as SunburstPreset;
  return {
    ...settings,
    outputFormat: settings.outputFormat === 'webp' ? 'png' : settings.outputFormat,
    provider: validateSunburstProvider(provider),
    variant: validateSunburstVariant(variant),
  };
});

export const nanoBananaPreset = createImagePreset('nano-banana', defaultNanoBananaSettings, validateNanoBananaSettings);
export const seedreamPreset = createImagePreset('seedream', defaultSeedreamSettings, validateSeedreamSettings);
