export const DAILY_POINT_CAP = 50;
export const STORAGE_KEY = "lotus-desk-pet/state/v1";

export interface PetState {
  mood: number;
  satiety: number;
  energy: number;
  affection: number;
  points: number;
  dailyPoints: number;
  dailyDate: string;
  lastUpdatedAt: number;
  quiet: boolean;
  inventory: {
    apple: number;
    cookie: number;
    parfait: number;
  };
  position: { x: number; y: number };
}

const todayKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const defaultPetState = (): PetState => ({
  mood: 82,
  satiety: 68,
  energy: 74,
  affection: 0,
  points: 0,
  dailyPoints: 0,
  dailyDate: todayKey(),
  lastUpdatedAt: Date.now(),
  quiet: false,
  inventory: { apple: 3, cookie: 2, parfait: 1 },
  position: { x: 0, y: 0 },
});

const isPetState = (value: unknown): value is PetState => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PetState>;
  return [candidate.mood, candidate.satiety, candidate.energy, candidate.affection, candidate.points].every(
    (item) => typeof item === "number" && Number.isFinite(item),
  );
};

export function normalizeDay(state: PetState, now = new Date()): PetState {
  const day = todayKey(now);
  return state.dailyDate === day ? state : { ...state, dailyDate: day, dailyPoints: 0 };
}

export function loadPetState(): PetState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!isPetState(parsed)) return defaultPetState();
    const defaults = defaultPetState();
    return normalizeDay({
      ...defaults,
      ...parsed,
      inventory: { ...defaults.inventory, ...parsed.inventory },
      position: { ...defaults.position, ...parsed.position },
    });
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
  const state = normalizeDay({ ...input }, new Date(now));
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

export function awardInteractionPoint(input: PetState): { state: PetState; awarded: boolean } {
  const state = normalizeDay({ ...input });
  if (state.dailyPoints >= DAILY_POINT_CAP) return { state, awarded: false };
  return { awarded: true, state: { ...state, points: state.points + 1, dailyPoints: state.dailyPoints + 1 } };
}

export function affectionLabel(affection: number): string {
  if (affection >= 280) return "Lv.5 最佳伙伴";
  if (affection >= 150) return "Lv.4 亲密";
  if (affection >= 70) return "Lv.3 朋友";
  if (affection >= 25) return "Lv.2 熟悉";
  return "Lv.1 陌生";
}
