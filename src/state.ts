export const STORAGE_KEY = "lotus-desk-pet/state/v1";

export interface PetState {
  mood: number;
  satiety: number;
  energy: number;
  affection: number;
  lastUpdatedAt: number;
  quiet: boolean;
  position: { x: number; y: number };
}

export const defaultPetState = (): PetState => ({
  mood: 82,
  satiety: 68,
  energy: 74,
  affection: 0,
  lastUpdatedAt: Date.now(),
  quiet: false,
  position: { x: 0, y: 0 },
});

const isPetState = (value: unknown): value is PetState => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PetState>;
  return [candidate.mood, candidate.satiety, candidate.energy, candidate.affection].every(
    (item) => typeof item === "number" && Number.isFinite(item),
  );
};

export function loadPetState(): PetState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!isPetState(parsed)) return defaultPetState();
    const defaults = defaultPetState();
    return {
      mood: parsed.mood,
      satiety: parsed.satiety,
      energy: parsed.energy,
      affection: parsed.affection,
      lastUpdatedAt: typeof parsed.lastUpdatedAt === "number" ? parsed.lastUpdatedAt : defaults.lastUpdatedAt,
      quiet: typeof parsed.quiet === "boolean" ? parsed.quiet : defaults.quiet,
      position: { ...defaults.position, ...parsed.position },
    };
  } catch {
    return defaultPetState();
  }
}

export function savePetState(state: PetState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence failure should never stop the companion from responding.
  }
}

export function applyElapsedDecay(input: PetState, now = Date.now()): PetState {
  const state = { ...input };
  const elapsedMinutes = Math.max(0, Math.floor((now - state.lastUpdatedAt) / 60_000));
  if (elapsedMinutes < 15) return state;

  const satietyLoss = Math.floor(elapsedMinutes / 15);
  const energyLoss = Math.floor(elapsedMinutes / 20);
  const needPenalty = state.satiety < 25 || state.energy < 25 ? Math.floor(elapsedMinutes / 30) : 0;
  return {
    ...state,
    satiety: Math.max(0, state.satiety - satietyLoss),
    energy: Math.max(0, state.energy - energyLoss),
    mood: Math.max(0, state.mood - needPenalty),
    lastUpdatedAt: now,
  };
}

export function affectionLabel(affection: number): string {
  if (affection >= 280) return "Lv.5 最佳伙伴";
  if (affection >= 150) return "Lv.4 亲密";
  if (affection >= 70) return "Lv.3 朋友";
  if (affection >= 25) return "Lv.2 熟悉";
  return "Lv.1 陌生";
}
