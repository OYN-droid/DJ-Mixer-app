const DECKFORGE_VERSION = "2.0.0-recovery";
const DECKFORGE_DEVELOPMENT = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const DECKFORGE_LOG_PREFIX = "[DeckForge]";

window.addEventListener("error", (event) => {
  console.error(DECKFORGE_LOG_PREFIX, "Unhandled application error", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error(DECKFORGE_LOG_PREFIX, "Unhandled promise rejection", event.reason);
});

if (DECKFORGE_DEVELOPMENT) {
  console.info(DECKFORGE_LOG_PREFIX, `Development build ${DECKFORGE_VERSION}`);
}

const AudioEngine = {
  context: null,
  destination: null,
  recorder: null,
  chunks: [],
  mixUrl: null,
  masterAnalyser: null,
  masterGain: null,

  async init() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.destination = this.context.createMediaStreamDestination();
      this.masterAnalyser = this.context.createAnalyser();
      this.masterAnalyser.fftSize = 256;
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = Number(document.querySelector("#masterVolume")?.value || 0.9);
      this.masterAnalyser.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      this.masterGain.connect(this.destination);
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }
};

const deckState = {
  a: createDeckState("a"),
  b: createDeckState("b")
};

const sampler = {
  buffers: Array(16).fill(null),
  names: [
    "Kick Chop",
    "Vocal",
    "Stab",
    "Airhorn",
    "Loop 1",
    "Loop 2",
    "FX",
    "Drop",
    "Snare",
    "Hat",
    "Bass Hit",
    "Scratch",
    "Hook",
    "Break",
    "Rise",
    "Tag"
  ],
  active: Array(16).fill(null),
  starts: Array(16).fill(0),
  ends: Array(16).fill(null),
  modes: Array(16).fill("trigger"),
  quantize: "off",
  selected: 0,
  bank: "A",
  scene: "Intro",
  workspaceMode: "simple",
  gains: Array(16).fill(0.9),
  pans: Array(16).fill(0),
  pitches: Array(16).fill(0),
  filters: Array(16).fill(20000),
  categories: Array(16).fill("User-created"),
  chokes: Array(16).fill(0),
  sources: Array(16).fill("Memory audio"),
  relink: Array(16).fill(false),
  held: new Set(),
  lastTrigger: "None",
  lastStop: "None",
  lastError: "None",
  banks: {},
  scenes: {},
  takeHistory: [],
  promptHistory: [],
  recentTriggers: []
};

const PAD_KEYS = ["1", "2", "3", "4", "q", "w", "e", "r", "a", "s", "d", "f", "z", "x", "c", "v"];
const PAD_CATEGORIES = ["DITC", "Recent samples", "Favorites", "DJ Drops", "Vocals", "Movie Quotes", "Sports Clips", "FX", "Drums", "Loops", "Scratches", "Generated Pads"];

const sourceFiles = [];
const droppedFilePaths = new WeakMap();
const supportedAudioExtensions = [".mp3", ".wav", ".wave", ".aif", ".aiff", ".flac", ".m4a", ".aac", ".alac"];
const supportedImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
const DITC_METADATA_KEY = "deckforge-ditc-metadata";
const ditcState = {
  search: "",
  filter: "all",
  sort: "recent",
  selectedTrackId: null,
  previewTrackId: null,
  smartMixIds: new Set(),
  advanced: false,
  comfortable: false,
  lastImportResult: "No import yet",
  lastError: "None",
  dragTarget: "None"
};

const editorState = {
  tracks: [
    { id: "editor-track-1", name: "Songs / Main Decks", role: "Music" },
    { id: "editor-track-2", name: "Vocals / Acapellas", role: "Stems" },
    { id: "editor-track-3", name: "Pads / Drops / Scratches", role: "Performance" },
    { id: "editor-track-4", name: "Drums / Keys / FX", role: "Production" }
  ],
  clips: [],
  selectedClipId: null,
  snap: "bar",
  zoom: 8,
  playhead: 0,
  playing: false,
  paused: false,
  scheduled: [],
  pointerDrag: null,
  recording: null,
  eventQuantize: "snap"
};

const crateSelection = {
  local: new Set(),
  saved: new Set()
};

const stemState = {
  file: null,
  sourceBuffer: null,
  sourceName: "",
  stems: [],
  previewSource: null,
  previewGain: null
};

let aiPlanState = null;
let aiSearchResultsState = [];
let mixtapeInspirationState = null;
const mixtapeReferenceState = {
  file: null,
  buffer: null,
  name: "",
  files: [],
  tracks: [],
  artwork: null,
  artworkAnalysis: null
};

const PRODUCER_STUDIO_KEY = "deckforge-producer-studio";
const ProjectIntelligenceEngine = window.ProjectIntelligence;
const RecommendationEngine = window.ContextualRecommendations;
const projectContext = ProjectIntelligenceEngine.getProjectContext();
window.DeckForgeProjectContext = projectContext;

const producerStudioState = {
  mode: "simple",
  projectId: "deckforge-session",
  projectName: "DeckForge Session",
  description: "",
  genre: null,
  subgenre: null,
  era: null,
  region: null,
  mood: null,
  energy: null,
  tags: [],
  createdAt: new Date().toISOString(),
  history: [],
  savedPrompts: [],
  undoActions: new Map(),
  timelineFilter: "all",
  recommendationFilter: "all",
  showAllRecommendations: false,
  pendingRecommendationRejectionId: null,
  lastDismissedRecommendationId: null,
  promptDomains: { ditc: true, decks: true, smartMix: true, beatForge: true, harmonyLab: true, pads: true, stems: true, arrangement: true, mixtape: true, aiHistory: true },
  pendingStaleAction: null,
  contextUnsubscribe: null
};
let projectIntelligenceReady = false;
let recommendationEngineReady = false;

const AudioIdentificationService = {
  providers: [],

  register(provider) {
    this.providers.push(provider);
  },

  configuredProviders() {
    return this.providers.filter((provider) => provider.isConfigured());
  },

  status() {
    const configured = this.configuredProviders();
    return {
      configured: configured.length > 0,
      providers: this.providers.map((provider) => ({
        id: provider.id,
        label: provider.label,
        configured: provider.isConfigured()
      }))
    };
  },

  async identifyTrack(track) {
    const segments = buildRecognitionSegments(track.buffer);
    const configured = this.configuredProviders();
    if (!configured.length) {
      return {
        configured: false,
        providerStatuses: this.status().providers,
        segments,
        matches: [],
        tracklist: []
      };
    }
    const segmentResults = [];
    for (const segment of segments) {
      const clip = clipAudioBuffer(track.buffer, segment.start, segment.end);
      for (const provider of configured) {
        try {
          const result = await provider.identifySegment(clip, segment, track);
          if (result?.matches?.length) {
            segmentResults.push({ provider: provider.label, segment, matches: result.matches });
          }
        } catch (error) {
          segmentResults.push({
            provider: provider.label,
            segment,
            matches: [],
            error: error.message || "Provider recognition failed."
          });
        }
      }
    }
    const matches = segmentResults.flatMap((result) => result.matches.map((match) => ({
      ...normalizeFingerprintMatch(match, result.provider, result.segment),
      segment: result.segment
    })));
    return {
      configured: true,
      providerStatuses: this.status().providers,
      segments,
      segmentResults,
      matches,
      tracklist: aggregateFingerprintMatches(matches)
    };
  }
};


const autoMixState = {
  running: false,
  state: "Idle",
  mode: "club",
  sourceMode: "both",
  items: [],
  plan: [],
  index: 0,
  activeDeck: "a",
  preparedDeck: null,
  preparedIndex: null,
  timers: [],
  transition: null,
  handoffArmed: false,
  incomingDeck: null,
  estimatedTransitionAt: null,
  promptPlan: null,
  lastManualOverride: "None",
  lastError: "None"
};

const SMART_PROMPT_HISTORY_KEY = "deckforge-smart-prompt-history";
const SMART_PROMPT_RECIPES_KEY = "deckforge-smart-prompt-recipes";
const smartPromptState = {
  rawPrompt: "",
  parsedIntent: null,
  plan: null,
  state: "Prompt Idle",
  clarification: "",
  executionInProgress: false,
  executionToken: 0,
  executionError: "",
  lastExecutionPlanId: null,
  saferPlans: [],
  selectedSaferPlanId: null,
  lastError: "None",
  history: [],
  recipes: []
};

const bpmRecoveryState = {
  deckId: null,
  active: false,
  pending: false,
  manualOverride: false,
  startRatio: 1,
  currentRatio: 1,
  targetRatio: 1,
  originalBpm: 0,
  blendBpm: 0,
  durationBars: 8,
  durationSeconds: 0,
  curve: "smooth",
  progress: 0,
  startedAt: 0,
  frame: null,
  delayTimer: null,
  plan: null,
  lastError: "None"
};

const transitionController = {
  activePlan: null,
  version: 0,
  pollTimer: null,
  schedulerActive: false,
  transitionStarted: false,
  crossfaderAutomationActive: false,
  lastPlaybackTime: null,
  secondsRemaining: null,
  previousCancellationResult: "None",
  lastFailure: "None"
};

const quickTransitionState = { deckId: "a" };

const TEMPO_SAFETY_PREFERENCES_KEY = "deckforge-tempo-safety-preferences";
const tempoSafetyPreferences = {
  preferredShift: 4,
  warningThreshold: 8,
  absoluteMaximumShift: 12,
  automaticallySuggest: true,
  automaticallyExecute: false,
  askBeforeReplacing: true,
  allowHalfDouble: true,
  allowBridgeSuggestions: true,
  preserveIncomingBpm: true,
  largeMismatchTransition: "filter-sweep",
  transitionPreference: "smooth"
};

const drums = {
  playing: false,
  paused: false,
  step: 0,
  cycle: 0,
  timer: null,
  schedulerVersion: 0,
  voices: [],
  rows: ["Kick", "Snare", "Hat", "Clap", "Sub"],
  patternId: "A1",
  name: "A1 Verse",
  bars: 1,
  stepsPerBar: 16,
  currentBar: 0,
  section: "Verse",
  version: 1,
  source: "Preset",
  seed: 9201,
  preset: "boomBapCuts",
  machine: "analog808",
  groove: "boom-bap",
  grooveIntensity: 60,
  grooveCandidate: null,
  grooveCandidateIntensity: null,
  grooveAnchor: null,
  lastAppliedGroove: null,
  grooveLocks: { kick: false, snare: false, hats: false, percussion: false, velocity: false, timing: false },
  grooveMetrics: null,
  schedulerLoadedVersion: 0,
  view: "steps",
  selectedLane: 0,
  selectedStep: 0,
  metronome: false,
  loop: true,
  recording: false,
  overdub: false,
  liveEvents: [],
  undoStack: [],
  patterns: [],
  promptHistory: [],
  pendingPlan: null,
  lastGeneration: "None",
  lastPrompt: "None",
  lastError: "None",
  kit: {
    kick: { start: 120, end: 42, decay: 0.26, gain: 0.9 },
    sub: { start: 62, end: 34, decay: 0.28, gain: 0.7 },
    snare: { frequency: 1700, decay: 0.16, gain: 0.45 },
    hat: { frequency: 7200, decay: 0.06, gain: 0.22 },
    clap: { frequency: 1500, decay: 0.14, gain: 0.42 },
    swing: 0
  },
  pattern: [
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
  ],
  velocities: Array.from({ length: 5 }, () => Array(16).fill(0.85)),
  probabilities: Array.from({ length: 5 }, () => Array(16).fill(1)),
  timingOffsets: Array.from({ length: 5 }, () => Array(16).fill(0)),
  automation: Array.from({ length: 5 }, () => Array(16).fill(1)),
  lanes: ["Kick", "Snare", "Hat", "Clap", "Sub"].map((name) => ({ name, volume: 1, pan: 0, filter: 16000, pitch: 0, choke: 0, muted: false, solo: false, sample: "Synthesized voice", layers: [] }))
};

const drumGrooves = [
  { id: "straight", name: "Straight", description: "Even sixteenths with consistent accents.", swing: 0, timing: 0, velocity: 0 },
  { id: "boom-bap", name: "Boom Bap", description: "Late hats and a firm backbeat pocket.", swing: 0.12, timing: 0.012, velocity: 0.08 },
  { id: "loose-pocket", name: "Loose Pocket", description: "Push-pull timing with softer ghost accents.", swing: 0.18, timing: 0.02, velocity: 0.14 },
  { id: "dilla", name: "Dilla-Inspired", description: "Intentionally uneven, non-copying soulful pocket.", swing: 0.24, timing: 0.028, velocity: 0.18 },
  { id: "pete-rock", name: "Pete Rock-Inspired", description: "Relaxed soulful swing, soft hats, and a delayed layered backbeat.", swing: 0.19, timing: 0.019, velocity: 0.13 },
  { id: "premier", name: "Premier-Inspired", description: "Tight kick/snare pocket, crisp accents, and deliberate vocal space.", swing: 0.1, timing: 0.01, velocity: 0.11 },
  { id: "mpc", name: "MPC Feel", description: "Classic shuffled sixteenth-note feel.", swing: 0.16, timing: 0.01, velocity: 0.1 },
  { id: "sp", name: "SP Feel", description: "Sparse, slightly late sample-style drums with strong accents.", swing: 0.14, timing: 0.017, velocity: 0.15 },
  { id: "house", name: "House Swing", description: "Steady kick with lightly swung percussion.", swing: 0.08, timing: 0.006, velocity: 0.05 },
  { id: "shuffle", name: "Shuffle", description: "Pronounced alternating subdivision swing.", swing: 0.28, timing: 0.012, velocity: 0.1 },
  { id: "jersey", name: "Jersey Bounce", description: "Fast syncopated club bounce.", swing: 0.05, timing: 0.008, velocity: 0.12 },
  { id: "garage", name: "UK Garage", description: "Shuffled hats around syncopated kicks.", swing: 0.2, timing: 0.014, velocity: 0.1 },
  { id: "breakbeat", name: "Breakbeat", description: "Chopped syncopation and energetic ghost notes.", swing: 0.06, timing: 0.012, velocity: 0.15 },
  { id: "rnb", name: "R&B Pocket", description: "Soft, late percussion around a stable backbeat.", swing: 0.17, timing: 0.018, velocity: 0.12 },
  { id: "humanize", name: "Humanize", description: "Seeded timing and velocity variation.", swing: 0.08, timing: 0.024, velocity: 0.18 },
  { id: "cinematic-trap", name: "Cinematic Trap", description: "Half-time backbeat, strategic silence, and dramatic rolls.", swing: 0.04, timing: 0.006, velocity: 0.16 }
];

const beatStyles = ["Boom Bap", "Loose Soulful Groove", "Trap", "Cinematic Trap", "Drill", "House", "Deep House", "Garage", "Jersey Club", "Breakbeat", "R&B", "Neo-Soul", "Lo-Fi"];

const drumMachines = [
  {
    id: "performance8s",
    name: "Performance 8S Hub",
    notes: "Modern performance drum station feel: polished house kicks, flexible 808 low-end, bright hats, and live-set-ready punch.",
    kit: {
      kick: { start: 138, end: 46, decay: 0.22, gain: 0.96 },
      sub: { start: 66, end: 30, decay: 0.62, gain: 0.74 },
      snare: { frequency: 2200, decay: 0.1, gain: 0.42 },
      hat: { frequency: 10800, decay: 0.038, gain: 0.22 },
      clap: { frequency: 2400, decay: 0.13, gain: 0.58 },
      swing: 0.03
    }
  },
  {
    id: "analog808",
    name: "Analog 808",
    notes: "Long subby kick, crisp hats, snappy clap, and tuned low-end for trap, electro, and classic rap patterns.",
    kit: {
      kick: { start: 96, end: 42, decay: 0.34, gain: 0.78 },
      sub: { start: 62, end: 29, decay: 0.74, gain: 0.9 },
      snare: { frequency: 1750, decay: 0.11, gain: 0.34 },
      hat: { frequency: 9800, decay: 0.035, gain: 0.18 },
      clap: { frequency: 2100, decay: 0.1, gain: 0.52 },
      swing: 0.03
    }
  },
  {
    id: "house909",
    name: "House 909",
    notes: "Punchy four-on-the-floor kick, open bright hats, and solid claps for house and techno foundations.",
    kit: {
      kick: { start: 145, end: 48, decay: 0.24, gain: 1 },
      sub: { start: 58, end: 38, decay: 0.2, gain: 0.34 },
      snare: { frequency: 2300, decay: 0.09, gain: 0.36 },
      hat: { frequency: 11200, decay: 0.055, gain: 0.24 },
      clap: { frequency: 2500, decay: 0.16, gain: 0.62 },
      swing: 0.02
    },
    pattern: [
      [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  {
    id: "digital707",
    name: "Digital 707",
    notes: "Tight sample-based pop and new-wave drum character: clean kicks, hard claps, and bright hats.",
    kit: {
      kick: { start: 128, end: 54, decay: 0.16, gain: 0.82 },
      sub: { start: 60, end: 42, decay: 0.13, gain: 0.24 },
      snare: { frequency: 2600, decay: 0.085, gain: 0.46 },
      hat: { frequency: 10400, decay: 0.042, gain: 0.2 },
      clap: { frequency: 2300, decay: 0.11, gain: 0.58 },
      swing: 0.01
    }
  },
  {
    id: "electro606",
    name: "Electro 606",
    notes: "Thin, fast, machine-like percussion for electro, early synth pop, post-punk, and minimal patterns.",
    kit: {
      kick: { start: 118, end: 52, decay: 0.13, gain: 0.66 },
      sub: { start: 55, end: 40, decay: 0.12, gain: 0.18 },
      snare: { frequency: 2800, decay: 0.07, gain: 0.34 },
      hat: { frequency: 9200, decay: 0.026, gain: 0.18 },
      clap: { frequency: 1900, decay: 0.075, gain: 0.3 },
      swing: 0
    }
  },
  {
    id: "linnPop",
    name: "Linn Pop",
    notes: "Chunky early-digital drum machine flavor for funk, pop, new wave, and dance records.",
    kit: {
      kick: { start: 112, end: 48, decay: 0.18, gain: 0.9 },
      sub: { start: 58, end: 38, decay: 0.18, gain: 0.28 },
      snare: { frequency: 2100, decay: 0.13, gain: 0.58 },
      hat: { frequency: 7800, decay: 0.04, gain: 0.17 },
      clap: { frequency: 1750, decay: 0.16, gain: 0.5 },
      swing: 0.06
    }
  },
  {
    id: "spBoomBap",
    name: "Crunchy Boom-Bap Sampler",
    notes: "Low-bit, chopped break feel with darker hats, dry snare, and lumpy swing for sample-heavy hip-hop.",
    kit: {
      kick: { start: 108, end: 44, decay: 0.21, gain: 0.92 },
      sub: { start: 54, end: 34, decay: 0.24, gain: 0.36 },
      snare: { frequency: 1450, decay: 0.12, gain: 0.58 },
      hat: { frequency: 5200, decay: 0.045, gain: 0.13 },
      clap: { frequency: 1200, decay: 0.11, gain: 0.28 },
      swing: 0.18
    }
  },
  {
    id: "jungleBreaks",
    name: "Jungle Break Chopper",
    notes: "Fast chopped-break simulation with clipped kicks, splintered snares, dusty hats, and sub-friendly headroom.",
    kit: {
      kick: { start: 122, end: 46, decay: 0.11, gain: 0.78 },
      sub: { start: 64, end: 31, decay: 0.82, gain: 0.86 },
      snare: { frequency: 2450, decay: 0.075, gain: 0.62 },
      hat: { frequency: 8600, decay: 0.022, gain: 0.2 },
      clap: { frequency: 1850, decay: 0.085, gain: 0.34 },
      swing: 0.04
    },
    pattern: [
      [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0],
      [0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
      [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]
    ]
  }
];

const drumPresets = [
  {
    id: "boomBapCuts",
    name: "NY Boom-Bap Cuts",
    bpm: 92,
    notes: "Dusty chopped-break feel: heavy kick pockets, hard snare on 2 and 4, sparse hats, DJ-cut friendly gaps.",
    swing: 0.16,
    kit: {
      kick: { start: 118, end: 46, decay: 0.22, gain: 0.95 },
      sub: { start: 58, end: 36, decay: 0.22, gain: 0.38 },
      snare: { frequency: 1850, decay: 0.12, gain: 0.62 },
      hat: { frequency: 6200, decay: 0.04, gain: 0.17 },
      clap: { frequency: 1300, decay: 0.09, gain: 0.28 }
    },
    pattern: [
      [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  {
    id: "soulFlip",
    name: "Soul Flip Bounce",
    bpm: 88,
    notes: "Warm soul-sample drums with laid-back hats, push-pull kick syncopation, and roomy claps.",
    swing: 0.22,
    kit: {
      kick: { start: 110, end: 44, decay: 0.3, gain: 0.88 },
      sub: { start: 56, end: 35, decay: 0.3, gain: 0.48 },
      snare: { frequency: 1550, decay: 0.18, gain: 0.42 },
      hat: { frequency: 5400, decay: 0.05, gain: 0.14 },
      clap: { frequency: 1250, decay: 0.18, gain: 0.46 }
    },
    pattern: [
      [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  {
    id: "virginiaBounce",
    name: "Virginia Bounce",
    bpm: 100,
    notes: "Rubbery club knock: clipped kick, crisp claps, syncopated hats, and dance-floor negative space.",
    swing: 0.09,
    kit: {
      kick: { start: 132, end: 48, decay: 0.2, gain: 0.92 },
      sub: { start: 64, end: 38, decay: 0.2, gain: 0.32 },
      snare: { frequency: 2100, decay: 0.1, gain: 0.32 },
      hat: { frequency: 8600, decay: 0.035, gain: 0.2 },
      clap: { frequency: 1800, decay: 0.12, gain: 0.55 }
    },
    pattern: [
      [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  {
    id: "harlemSoul",
    name: "Harlem Soul Heat",
    bpm: 96,
    notes: "Bright soul-loop energy: clap-snare stack, eager kick pickups, and rolling hat movement.",
    swing: 0.14,
    kit: {
      kick: { start: 125, end: 45, decay: 0.24, gain: 0.9 },
      sub: { start: 60, end: 36, decay: 0.24, gain: 0.42 },
      snare: { frequency: 1900, decay: 0.13, gain: 0.5 },
      hat: { frequency: 7600, decay: 0.045, gain: 0.18 },
      clap: { frequency: 1700, decay: 0.14, gain: 0.5 }
    },
    pattern: [
      [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
    ]
  },
  {
    id: "newOrleansClub",
    name: "New Orleans Club Snap",
    bpm: 98,
    notes: "Bouncy Southern club grid with snappy claps, chant-ready space, and busy off-beat hats.",
    swing: 0.05,
    kit: {
      kick: { start: 130, end: 42, decay: 0.18, gain: 0.95 },
      sub: { start: 66, end: 34, decay: 0.22, gain: 0.62 },
      snare: { frequency: 2200, decay: 0.08, gain: 0.34 },
      hat: { frequency: 9000, decay: 0.032, gain: 0.2 },
      clap: { frequency: 2000, decay: 0.1, gain: 0.62 }
    },
    pattern: [
      [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  {
    id: "darkQueensbridge",
    name: "Dark Street Loop",
    bpm: 86,
    notes: "Menacing, stripped pocket: dry snare, low thump, half-lit hats, and room for grimy samples.",
    swing: 0.12,
    kit: {
      kick: { start: 105, end: 40, decay: 0.25, gain: 0.86 },
      sub: { start: 54, end: 31, decay: 0.34, gain: 0.56 },
      snare: { frequency: 1450, decay: 0.11, gain: 0.52 },
      hat: { frequency: 5000, decay: 0.04, gain: 0.11 },
      clap: { frequency: 1100, decay: 0.1, gain: 0.2 }
    },
    pattern: [
      [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
    ]
  },
  {
    id: "stadiumSoul",
    name: "Stadium Soul Horns",
    bpm: 94,
    notes: "Big entrance drums: confident kicks, loud clap-snare accents, and wide-open anthem spacing.",
    swing: 0.08,
    kit: {
      kick: { start: 128, end: 45, decay: 0.28, gain: 0.98 },
      sub: { start: 60, end: 34, decay: 0.3, gain: 0.52 },
      snare: { frequency: 2100, decay: 0.16, gain: 0.55 },
      hat: { frequency: 7600, decay: 0.05, gain: 0.16 },
      clap: { frequency: 1900, decay: 0.18, gain: 0.6 }
    },
    pattern: [
      [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  {
    id: "atlantaDark808",
    name: "Atlanta Dark 808",
    bpm: 140,
    notes: "Modern trap drive: long sub, tight clap, busy hat grid, and dark half-time pulse.",
    swing: 0.03,
    kit: {
      kick: { start: 95, end: 38, decay: 0.18, gain: 0.72 },
      sub: { start: 68, end: 30, decay: 0.62, gain: 0.9 },
      snare: { frequency: 1800, decay: 0.08, gain: 0.25 },
      hat: { frequency: 9800, decay: 0.03, gain: 0.16 },
      clap: { frequency: 2200, decay: 0.09, gain: 0.48 }
    },
    pattern: [
      [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0]
    ]
  },
  {
    id: "churchKeysTrap",
    name: "Church Keys Trap",
    bpm: 132,
    notes: "Rolling trap bounce with organ-friendly space, bouncing 808s, crisp claps, and hat flurries.",
    swing: 0.06,
    kit: {
      kick: { start: 102, end: 40, decay: 0.17, gain: 0.74 },
      sub: { start: 70, end: 32, decay: 0.5, gain: 0.82 },
      snare: { frequency: 1900, decay: 0.09, gain: 0.26 },
      hat: { frequency: 10500, decay: 0.028, gain: 0.18 },
      clap: { frequency: 2100, decay: 0.11, gain: 0.52 }
    },
    pattern: [
      [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]
    ]
  },
  {
    id: "timbaBounce",
    name: "Percussive Bounce",
    bpm: 104,
    notes: "Sparse, syncopated drum programming with dry knock, clipped percussion, and unexpected gaps.",
    swing: 0.11,
    kit: {
      kick: { start: 124, end: 44, decay: 0.19, gain: 0.86 },
      sub: { start: 60, end: 35, decay: 0.18, gain: 0.3 },
      snare: { frequency: 2300, decay: 0.08, gain: 0.34 },
      hat: { frequency: 8200, decay: 0.035, gain: 0.15 },
      clap: { frequency: 1600, decay: 0.08, gain: 0.32 }
    },
    pattern: [
      [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      [0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0],
      [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ]
  },
  {
    id: "jungleBreakbeat",
    name: "Jungle Breakbeat",
    bpm: 164,
    notes: "Fast syncopated breakbeat grid with ghost snares, chopped hats, off-grid-feeling kicks, and room for sub bass.",
    swing: 0.04,
    kit: {
      kick: { start: 124, end: 44, decay: 0.12, gain: 0.78 },
      sub: { start: 68, end: 30, decay: 0.86, gain: 0.88 },
      snare: { frequency: 2500, decay: 0.075, gain: 0.62 },
      hat: { frequency: 8800, decay: 0.022, gain: 0.2 },
      clap: { frequency: 1900, decay: 0.08, gain: 0.3 }
    },
    pattern: [
      [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0],
      [0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
      [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]
    ]
  }
];

const instrumentPresets = [
  {
    id: "rapKeys",
    name: "Rap Minor Keys",
    notes: "Dark minor keys with a low-pass filter, short release, and enough body to sit behind drums.",
    wave: "triangle",
    bassWave: "sine",
    filter: 1300,
    attack: 0.012,
    decay: 0.12,
    sustain: 0.52,
    release: 0.38,
    gain: 0.34,
    detune: 5,
    root: 48
  },
  {
    id: "newWave",
    name: "New Wave Poly Synth",
    notes: "Bright, slightly detuned square-wave chords for glossy new wave hooks and pulsing bass figures.",
    wave: "square",
    bassWave: "sawtooth",
    filter: 2600,
    attack: 0.02,
    decay: 0.1,
    sustain: 0.6,
    release: 0.42,
    gain: 0.28,
    detune: 11,
    root: 50
  },
  {
    id: "postPunk",
    name: "Post-Punk Mono Bass",
    notes: "Dry, urgent saw bass and stark organ-like keys for angular basslines and tense riffs.",
    wave: "sawtooth",
    bassWave: "sawtooth",
    filter: 1050,
    attack: 0.004,
    decay: 0.08,
    sustain: 0.42,
    release: 0.16,
    gain: 0.36,
    detune: 0,
    root: 45
  },
  {
    id: "rnbElectric",
    name: "R&B Electric Keys",
    notes: "Soft electric-key tone for extended chords, slow voicings, and late-night melodic runs.",
    wave: "sine",
    bassWave: "triangle",
    filter: 1900,
    attack: 0.035,
    decay: 0.18,
    sustain: 0.62,
    release: 0.72,
    gain: 0.32,
    detune: 4,
    root: 49
  },
  {
    id: "funkClav",
    name: "Funk Clav & Bass",
    notes: "Short, percussive clav-style stabs with a round pocket bass for syncopated funk parts.",
    wave: "square",
    bassWave: "triangle",
    filter: 3400,
    attack: 0.003,
    decay: 0.08,
    sustain: 0.18,
    release: 0.09,
    gain: 0.24,
    detune: 3,
    root: 48
  },
  {
    id: "soulOrgan",
    name: "Soul Organ",
    notes: "Warm drawbar-ish organ chords and walking bass support for soul loops and gospel movement.",
    wave: "triangle",
    bassWave: "sine",
    filter: 2300,
    attack: 0.018,
    decay: 0.16,
    sustain: 0.78,
    release: 0.55,
    gain: 0.3,
    detune: 7,
    root: 48
  },
  {
    id: "houseStabs",
    name: "House Chord Stabs",
    notes: "Short minor and ninth chords for garage, classic house, piano-house layering, and chopped vocal-house progressions.",
    wave: "sawtooth",
    bassWave: "triangle",
    filter: 2400,
    attack: 0.006,
    decay: 0.09,
    sustain: 0.28,
    release: 0.16,
    gain: 0.3,
    detune: 8,
    root: 48
  },
  {
    id: "technoPluck",
    name: "Techno Pluck",
    notes: "Fast resonant plucks and sequence-friendly stabs for techno, electro, and minimal electronic lines.",
    wave: "sawtooth",
    bassWave: "square",
    filter: 1250,
    attack: 0.002,
    decay: 0.055,
    sustain: 0.18,
    release: 0.08,
    gain: 0.28,
    detune: 2,
    root: 47
  },
  {
    id: "electroBass",
    name: "Electro Bass",
    notes: "Rubbery low synth for electro-funk, freestyle, house basslines, and 80s electronic grooves.",
    wave: "square",
    bassWave: "sawtooth",
    filter: 900,
    attack: 0.004,
    decay: 0.1,
    sustain: 0.46,
    release: 0.18,
    gain: 0.36,
    detune: 0,
    root: 43
  },
  {
    id: "jungleAtmos",
    name: "Jungle Atmos Pad",
    notes: "Wide minor pads and misty chord beds for atmospheric jungle, late-night breakbeats, and moody electronic hooks.",
    wave: "triangle",
    bassWave: "sine",
    filter: 1700,
    attack: 0.09,
    decay: 0.24,
    sustain: 0.76,
    release: 1.4,
    gain: 0.26,
    detune: 16,
    root: 46
  },
  {
    id: "jungleSub",
    name: "Jungle Reese/Sub",
    notes: "Dark detuned low-end for jungle basslines, rolling sub pressure, and breakbeat drops.",
    wave: "sawtooth",
    bassWave: "sine",
    filter: 780,
    attack: 0.006,
    decay: 0.18,
    sustain: 0.7,
    release: 0.5,
    gain: 0.38,
    detune: 18,
    root: 41
  }
];

const synthMachines = [
  {
    id: "polyAnalog",
    name: "Poly Analog",
    notes: "Warm detuned polysynth model for house chords, synth-pop hooks, and broad electronic pads.",
    wave: "sawtooth",
    bassWave: "sawtooth",
    filterBoost: 1.08,
    detuneAdd: 9,
    attackScale: 1,
    releaseScale: 1.12,
    gainScale: 0.92,
    q: 2.2,
    subMix: 0.2
  },
  {
    id: "acidMono",
    name: "Acid Mono",
    notes: "Resonant mono-synth bite for acid basslines, squelchy stabs, and warehouse riffs.",
    wave: "sawtooth",
    bassWave: "sawtooth",
    filterBoost: 0.62,
    detuneAdd: 0,
    attackScale: 0.45,
    releaseScale: 0.45,
    gainScale: 1.08,
    q: 11,
    subMix: 0.08
  },
  {
    id: "fmDigital",
    name: "FM Digital",
    notes: "Glassy digital electric tones for 80s pop, R&B keys, metallic stabs, and clean house accents.",
    wave: "sine",
    bassWave: "triangle",
    filterBoost: 1.45,
    detuneAdd: 3,
    attackScale: 0.85,
    releaseScale: 1.25,
    gainScale: 0.9,
    q: 1.4,
    subMix: 0.12
  },
  {
    id: "stringMachine",
    name: "String Machine",
    notes: "Soft ensemble-like synth layer for new wave pads, post-punk beds, and moody electronic chords.",
    wave: "triangle",
    bassWave: "sine",
    filterBoost: 1.25,
    detuneAdd: 18,
    attackScale: 2.4,
    releaseScale: 2.2,
    gainScale: 0.78,
    q: 1.2,
    subMix: 0.18
  },
  {
    id: "houseOrgan",
    name: "House Organ",
    notes: "Percussive organ-style house chords, garage stabs, and bass support for dance tracks.",
    wave: "square",
    bassWave: "triangle",
    filterBoost: 1.05,
    detuneAdd: 5,
    attackScale: 0.6,
    releaseScale: 0.58,
    gainScale: 1,
    q: 2.8,
    subMix: 0.16
  },
  {
    id: "subBass",
    name: "Sub Bass Synth",
    notes: "Clean sine/triangle low-end model for trap 808 lines, house subs, and heavy rap bass.",
    wave: "sine",
    bassWave: "sine",
    filterBoost: 0.7,
    detuneAdd: 0,
    attackScale: 0.55,
    releaseScale: 1.4,
    gainScale: 1.18,
    q: 4,
    subMix: 0.36
  },
  {
    id: "reesePad",
    name: "Reese & Atmos",
    notes: "Detuned low synth and airy pad model for jungle, breakbeat, atmospheric drum and bass, and moody electronic records.",
    wave: "sawtooth",
    bassWave: "sawtooth",
    filterBoost: 0.72,
    detuneAdd: 24,
    attackScale: 1.35,
    releaseScale: 1.7,
    gainScale: 0.88,
    q: 5.5,
    subMix: 0.42
  }
];

const instrument = {
  preset: "rapKeys",
  machine: "polyAnalog",
  bassMode: false,
  workspaceMode: "simple",
  key: "C",
  scale: "minor",
  chordMode: "minor7",
  sustain: false,
  pitchBend: 0,
  modulation: 0,
  velocity: 0.82,
  recording: false,
  patternPlaying: false,
  patternPaused: false,
  patternLoop: true,
  patternTimer: null,
  patternStartedAt: 0,
  patternPlayhead: 0,
  pattern: { id: "harmony-a1", name: "Harmony A1", bars: 4, stepsPerBar: 16, notes: [], version: 1, source: "Manual", type: "chords" },
  selectedNoteId: null,
  patterns: [],
  undoStack: [],
  promptHistory: [],
  pendingPlan: null,
  favorites: [],
  instrumentCategory: "All",
  selectedInstrumentIndex: 0,
  arpeggiator: { enabled: false, rate: "1/8", direction: "up", octaves: 1 },
  lastError: "None",
  midiEnabled: false,
  midiInputs: [],
  activeVoices: [],
  keyboard: [
    { label: "C", key: "A", offset: 0 }, { label: "C#", key: "W", offset: 1, black: true }, { label: "D", key: "S", offset: 2 }, { label: "Eb", key: "E", offset: 3, black: true }, { label: "E", key: "D", offset: 4 }, { label: "F", key: "F", offset: 5 }, { label: "F#", key: "T", offset: 6, black: true }, { label: "G", key: "G", offset: 7 }, { label: "Ab", key: "Y", offset: 8, black: true }, { label: "A", key: "H", offset: 9 }, { label: "Bb", key: "U", offset: 10, black: true }, { label: "B", key: "J", offset: 11 }, { label: "C", key: "K", offset: 12 }
  ],
  bass: [
    { label: "C", offset: -12 },
    { label: "D", offset: -10 },
    { label: "Eb", offset: -9 },
    { label: "F", offset: -7 },
    { label: "G", offset: -5 },
    { label: "Ab", offset: -4 },
    { label: "Bb", offset: -2 },
    { label: "C", offset: 0 }
  ],
  chords: {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    seventh: [0, 4, 7, 10],
    minor7: [0, 3, 7, 10],
    major7: [0, 4, 7, 11],
    ninth: [0, 3, 7, 10, 14],
    sus: [0, 5, 7, 10],
    neoSoul: [0, 3, 7, 10, 14, 17],
    house: [0, 3, 7, 12],
    jazz: [0, 4, 7, 11, 14],
    stab: [0, 7, 12],
    octave: [0, 12]
  }
};

const harmonyScales = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], pentatonic: [0, 3, 5, 7, 10], chromatic: Array.from({ length: 12 }, (_, index) => index) };
const harmonyRoots = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const harmonyInstrumentCategories = ["All", "Piano", "Rhodes", "Wurlitzer", "Organ", "Strings", "Pads", "Choirs", "Bass", "Synth Leads", "Plucks", "House Stabs", "Boom Bap Keys", "Neo Soul", "Vintage", "Lo-Fi", "Generated Instruments", "Favorites", "Recently Used"];

function createDeckState(id) {
  return {
    id,
    status: "empty",
    trackName: "",
    analysis: null,
    smartMixControlled: false,
    manualOverride: false,
    lastError: "",
    buffer: null,
    source: null,
    startedAt: 0,
    offset: 0,
    playing: false,
    commandVersion: 0,
    loop: false,
    scratchWasPlaying: false,
    lastScratchX: 0,
    selectionStart: null,
    selectionEnd: null,
    dragSelectStart: null,
    dragSelectMoved: false,
    gain: null,
    filter: null,
    crossGain: null,
    analyser: null,
    meterPeak: 0,
    waveformPeaks: null,
    loopBeats: 8,
    loopStart: 0,
    loopEnd: 0
  };
}

function setDeckStatus(id, status, options = {}) {
  const deck = deckState[id];
  deck.status = status;
  if (options.smartMixControlled !== undefined) deck.smartMixControlled = options.smartMixControlled;
  if (options.manualOverride !== undefined) deck.manualOverride = options.manualOverride;
  if (options.error !== undefined) deck.lastError = options.error;
  const label = document.querySelector(`#deck-status-${id}`);
  if (label) {
    const names = {
      empty: "Empty",
      loading: "Loading",
      ready: "Ready",
      playing: "Playing",
      paused: "Paused",
      cueing: "Cueing",
      preparing: "Preparing",
      "transitioning-in": "Transitioning In",
      "transitioning-out": "Transitioning Out",
      error: "Error"
    };
    label.textContent = `${names[status] || status}${deck.smartMixControlled ? " · Smart Mix" : ""}${deck.manualOverride ? " · Manual override" : ""}`;
    label.dataset.state = status;
  }
  renderDeckMeta(id);
}

function renderDeckMeta(id) {
  const deck = deckState[id];
  const meta = document.querySelector(`#deck-meta-${id}`);
  if (!meta) return;
  const bpm = deck.analysis?.bpm ? `${deck.analysis.bpm} BPM` : "BPM unknown";
  const key = deck.analysis?.key ? `key ${deck.analysis.key}` : "key unknown";
  const tempo = Number(document.querySelector(`#pitch-${id}`)?.value || 1).toFixed(2);
  const gain = Number(document.querySelector(`#gain-${id}`)?.value || 0).toFixed(2);
  const channel = Number(document.querySelector(`#channel-${id}`)?.value || 0).toFixed(2);
  meta.textContent = `${bpm}, ${key}, tempo ${tempo}x, gain ${gain}, channel ${channel}`;
  const identity = parseTrackIdentity(deck.trackName);
  const title = document.querySelector(`#title-${id}`);
  const artwork = document.querySelector(`#artwork-${id}`);
  if (title) title.textContent = deck.buffer ? identity.title : "Empty deck";
  if (artwork) artwork.textContent = deck.buffer ? (identity.artist !== "Unknown" ? identity.artist[0] : identity.title[0] || id).toUpperCase() : id.toUpperCase();
  const values = {
    [`artist-${id}`]: identity.artist,
    [`bpm-${id}`]: deck.analysis?.bpm || "--",
    [`key-${id}`]: deck.analysis?.key || "--",
    [`genre-${id}`]: deck.analysis?.genre || "Unknown",
    [`track-duration-${id}`]: formatTime(deck.buffer?.duration || 0)
  };
  Object.entries(values).forEach(([elementId, value]) => {
    const element = document.querySelector(`#${elementId}`);
    if (element) element.textContent = value;
  });
}

function parseTrackIdentity(name = "") {
  const clean = name.replace(/\.[^/.]+$/, "").trim();
  const parts = clean.split(/\s+-\s+/);
  return parts.length > 1 ? { artist: parts[0], title: parts.slice(1).join(" - ") } : { artist: "Unknown", title: clean || "Empty deck" };
}

function connectDeck(deck) {
  const ctx = AudioEngine.context;
  if (deck.gain) return;
  deck.filter = ctx.createBiquadFilter();
  deck.filter.type = "lowpass";
  deck.filter.frequency.value = 16000;
  deck.gain = ctx.createGain();
  updateDeckGain(deck.id);
  deck.analyser = ctx.createAnalyser();
  deck.analyser.fftSize = 256;
  deck.analyser.smoothingTimeConstant = 0.76;
  deck.crossGain = ctx.createGain();
  deck.crossGain.gain.value = 0.5;
  deck.filter.connect(deck.gain);
  deck.gain.connect(deck.analyser);
  deck.analyser.connect(deck.crossGain);
  deck.crossGain.connect(AudioEngine.masterAnalyser);
}

function makeSource(deck) {
  const ctx = AudioEngine.context;
  const source = ctx.createBufferSource();
  source.buffer = deck.buffer;
  source.playbackRate.value = Number(document.querySelector(`#pitch-${deck.id}`).value);
  source.loop = deck.loop;
  if (deck.loop && deck.loopEnd > deck.loopStart) {
    source.loopStart = deck.loopStart;
    source.loopEnd = deck.loopEnd;
  }
  source.connect(deck.filter);
  source.onended = () => {
    if (!source.loop && deck.source === source) {
      deck.playing = false;
      deck.offset = 0;
      setDeckPlaying(deck.id, false);
      setDeckStatus(deck.id, "ready", { smartMixControlled: false });
      drawPlayhead(deck.id, 0);
    }
  };
  return source;
}

async function loadAudioFile(file) {
  await AudioEngine.init();
  const arrayBuffer = await file.arrayBuffer();
  return AudioEngine.context.decodeAudioData(arrayBuffer);
}

async function loadFileToDeck(file, id) {
  if (!isSupportedAudioFile(file)) return;
  const deck = deckState[id];
  if (autoMixState.running) triggerManualOverride(`Loaded a new track on Deck ${id.toUpperCase()}`, id);
  pauseDeck(id);
  setDeckStatus(id, "loading");
  try {
    deck.buffer = await loadAudioFile(file);
  } catch (error) {
    setDeckStatus(id, "error", { error: error.message || "Unable to decode audio" });
    autoMixState.lastError = deck.lastError;
    renderSmartMixPanel();
    return;
  }
  deck.trackName = file.name;
  deck.analysis = analyzeAudioBuffer(deck.buffer, file.name);
  deck.offset = 0;
  deck.waveformPeaks = null;
  deck.loop = false;
  deck.loopStart = 0;
  deck.loopEnd = 0;
  renderDeckLoopStatus(id);
  deck.selectionStart = null;
  deck.selectionEnd = null;
  document.querySelector(`#title-${id}`).textContent = file.name;
  connectDeck(deck);
  drawWaveform(id);
  updateDeckTimeDisplay(id);
  updateSelectionDisplay(id);
  renderEditorSourceBin();
  renderAiContext();
  setDeckStatus(id, "ready", { smartMixControlled: false, manualOverride: false, error: "" });
  updateSmartMixSourceOptions();
  emitProjectContextChange("decks", "track-loaded", { summary: `Loaded ${file.name} on Deck ${id.toUpperCase()}`, decision: { domain: "Decks", action: "Track loaded", summary: `Loaded ${file.name} on Deck ${id.toUpperCase()}`, after: { deck: id, track: file.name }, initiatedBy: "user" } });
}

function loadBufferToDeck(buffer, name, id, options = {}) {
  const deck = deckState[id];
  if (autoMixState.running && !options.smartMixControlled) triggerManualOverride(`Loaded a new track on Deck ${id.toUpperCase()}`, id);
  pauseDeck(id);
  deck.buffer = buffer;
  deck.trackName = name;
  deck.analysis = options.analysis || analyzeAudioBuffer(buffer, name);
  deck.offset = 0;
  deck.waveformPeaks = null;
  deck.loop = false;
  deck.loopStart = 0;
  deck.loopEnd = 0;
  renderDeckLoopStatus(id);
  deck.selectionStart = null;
  deck.selectionEnd = null;
  document.querySelector(`#title-${id}`).textContent = name;
  connectDeck(deck);
  drawWaveform(id);
  updateDeckTimeDisplay(id);
  updateSelectionDisplay(id);
  renderEditorSourceBin();
  renderAiContext();
  setDeckStatus(id, "ready", {
    smartMixControlled: Boolean(options.smartMixControlled),
    manualOverride: false,
    error: ""
  });
  updateSmartMixSourceOptions();
  emitProjectContextChange(options.smartMixControlled ? "smartMix" : "decks", "track-loaded", { summary: `Loaded ${name} on Deck ${id.toUpperCase()}`, decision: { domain: options.smartMixControlled ? "Smart Mix" : "Decks", action: "Track loaded", summary: `Loaded ${name} on Deck ${id.toUpperCase()}`, after: { deck: id, track: name }, initiatedBy: options.smartMixControlled ? "AI" : "user" } });
}

function addBufferToPad(buffer, name) {
  const index = sampler.buffers.findIndex((bufferItem) => !bufferItem);
  const target = index === -1 ? 0 : index;
  setPadBuffer(target, buffer, name);
  return target;
}

function setPadBuffer(index, buffer, name, options = {}) {
  sampler.buffers[index] = buffer;
  sampler.names[index] = name.replace(/\.[^/.]+$/, "");
  sampler.starts[index] = Math.max(0, options.start || 0);
  sampler.ends[index] = Math.min(buffer.duration, options.end || buffer.duration);
  sampler.modes[index] = options.mode || (buffer.duration > 8 ? "loop" : "trigger");
  sampler.categories[index] = options.category || (buffer.duration > 8 ? "Loops" : "User-created");
  sampler.sources[index] = options.source || "Local or in-memory audio";
  sampler.relink[index] = false;
  sampler.selected = index;
  renderPads();
  renderPadEditor();
  renderEditorSourceBin();
  savePadWorkspace();
  emitProjectContextChange("pads", "pad-assigned", { summary: `Assigned ${sampler.names[index]} to Pad ${index + 1}`, decision: { domain: "Pads", action: "Pad assigned", summary: `Assigned ${sampler.names[index]} to Pad ${index + 1} in Bank ${sampler.bank}`, after: { bank: sampler.bank, pad: index + 1, name: sampler.names[index] }, initiatedBy: options.source?.includes("AI") ? "AI" : "user" } });
}

async function playDeck(id) {
  const deck = deckState[id];
  if (!deck?.buffer) return false;
  const commandVersion = ++deck.commandVersion;
  setDeckStatus(id, "preparing");
  try {
    if (!AudioEngine.context || AudioEngine.context.state !== "running") await AudioEngine.init();
    if (commandVersion !== deck.commandVersion || !deck.buffer) return false;
    connectDeck(deck);
    stopDeckSource(deck);
    const ctx = AudioEngine.context;
    const source = makeSource(deck);
    const duration = deck.buffer.duration;
    deck.offset = deck.offset % duration;
    source.start(0, deck.offset);
    deck.startedAt = ctx.currentTime - deck.offset;
    deck.source = source;
    deck.playing = true;
    setDeckPlaying(id, true);
    setDeckStatus(id, "playing", { error: "" });
    renderGlobalTransport();
    emitProjectContextChange("decks", "playback-started", { summary: `Deck ${id.toUpperCase()} playback started` });
    return true;
  } catch (error) {
    if (commandVersion !== deck.commandVersion) return false;
    deck.playing = false;
    setDeckPlaying(id, false);
    const reason = error.message || "Unable to start deck playback";
    setDeckStatus(id, "error", { error: reason });
    globalTransportState.lastError = `Deck ${id.toUpperCase()}: ${reason}`;
    if (DECKFORGE_DEVELOPMENT) console.error(`[DeckForge][Deck ${id.toUpperCase()}] play failed: ${reason}`);
    renderGlobalTransport();
    return false;
  }
}

async function restartDeck(id) {
  const deck = deckState[id];
  const label = `Deck ${String(id).toUpperCase()}`;
  if (DECKFORGE_DEVELOPMENT) console.debug(`[DeckForge][${label}] restart requested`);
  if (!deck?.buffer) {
    if (deck) setDeckStatus(id, "empty", { error: "No track is loaded" });
    return false;
  }
  if (DECKFORGE_DEVELOPMENT) {
    console.debug(`[DeckForge][${label}] loaded track valid`);
    console.debug(`[DeckForge][Audio] context state before restart: ${AudioEngine.context?.state || "not started"}`);
  }
  stopDeckSource(deck);
  deck.playing = false;
  deck.offset = 0;
  setDeckPlaying(id, false);
  drawPlayhead(id, 0);
  updateDeckTimeDisplay(id);
  const played = await playDeck(id);
  if (DECKFORGE_DEVELOPMENT) {
    if (AudioEngine.context?.state === "running") console.debug("[DeckForge][Audio] context resumed");
    console.debug(`[DeckForge][${label}] registry entry restored`);
    if (played) console.debug(`[DeckForge][${label}] play promise resolved`);
    else console.error(`[DeckForge][${label}] restart failed: ${deck.lastError || "playback was cancelled"}`);
  }
  return played;
}

function currentDeckTime(id) {
  const deck = deckState[id];
  if (!deck.buffer) return 0;
  if (!deck.playing) return deck.offset;
  const elapsed = AudioEngine.context.currentTime - deck.startedAt;
  if (deck.loop && deck.loopEnd > deck.loopStart && elapsed >= deck.loopStart) {
    return deck.loopStart + ((elapsed - deck.loopStart) % (deck.loopEnd - deck.loopStart));
  }
  return elapsed % deck.buffer.duration;
}

function updateDeckLoop(id, enabled = deckState[id].loop) {
  const deck = deckState[id];
  if (!deck.buffer) return;
  deck.loop = Boolean(enabled);
  deck.loopBeats = Number(document.querySelector(`#loop-size-${id}`)?.value || deck.loopBeats || 8);
  if (deck.loop) {
    const beatSeconds = 60 / Number(deck.analysis?.bpm || 120);
    const loopDuration = Math.min(deck.buffer.duration, beatSeconds * deck.loopBeats);
    deck.loopStart = Math.min(currentDeckTime(id), Math.max(0, deck.buffer.duration - loopDuration));
    deck.loopEnd = Math.min(deck.buffer.duration, deck.loopStart + loopDuration);
  } else {
    deck.loopStart = 0;
    deck.loopEnd = 0;
  }
  if (deck.source) {
    deck.source.loop = deck.loop;
    if (deck.loop) {
      deck.source.loopStart = deck.loopStart;
      deck.source.loopEnd = deck.loopEnd;
    }
  }
  const button = document.querySelector(`[data-action="loop"][data-deck="${id}"]`);
  if (button) {
    button.classList.toggle("is-active", deck.loop);
    button.setAttribute("aria-pressed", deck.loop ? "true" : "false");
  }
  renderDeckLoopStatus(id);
  drawPlayhead(id, deck.buffer.duration ? currentDeckTime(id) / deck.buffer.duration : 0);
}

function renderDeckLoopStatus(id) {
  const deck = deckState[id];
  const status = document.querySelector(`#loop-status-${id}`);
  const button = document.querySelector(`[data-action="loop"][data-deck="${id}"]`);
  if (button) {
    button.classList.toggle("is-active", deck.loop);
    button.setAttribute("aria-pressed", deck.loop ? "true" : "false");
  }
  if (!status) return;
  if (!deck.loop || deck.loopEnd <= deck.loopStart) {
    status.textContent = "Loop off";
    return;
  }
  if (!deck.playing) {
    status.textContent = `${deck.loopBeats} beats · armed`;
    return;
  }
  const remaining = Math.max(0, deck.loopEnd - currentDeckTime(id));
  status.textContent = `${deck.loopBeats} beats · ${remaining.toFixed(1)}s remaining`;
}

function seekDeck(id, time) {
  const deck = deckState[id];
  if (!deck.buffer) return;
  const wasPlaying = deck.playing;
  const duration = deck.buffer.duration;
  deck.offset = Math.max(0, Math.min(duration - 0.01, time));
  if (wasPlaying) {
    playDeck(id);
  } else {
    drawPlayhead(id, deck.offset / duration);
    updateDeckTimeDisplay(id);
  }
}

function nudgeDeck(id, seconds) {
  seekDeck(id, currentDeckTime(id) + seconds);
}

function pauseDeck(id) {
  const deck = deckState[id];
  deck.commandVersion += 1;
  if (!deck.playing) return;
  deck.offset = currentDeckTime(id);
  stopDeckSource(deck);
  deck.playing = false;
  setDeckPlaying(id, false);
  setDeckStatus(id, deck.buffer ? "paused" : "empty");
  emitProjectContextChange("decks", "playback-paused", { summary: `Deck ${id.toUpperCase()} playback paused` });
}

function stopDeck(id) {
  const deck = deckState[id];
  const wasActive = deck.playing || deck.status === "paused" || deck.offset > 0;
  deck.commandVersion += 1;
  stopDeckSource(deck);
  deck.playing = false;
  deck.offset = 0;
  setDeckPlaying(id, false);
  drawPlayhead(id, 0);
  document.querySelector(`.platter[data-deck="${id}"]`)?.style.setProperty("--platter-angle", "0deg");
  updateDeckTimeDisplay(id);
  setDeckStatus(id, deck.buffer ? "ready" : "empty");
  if (wasActive) emitProjectContextChange("decks", "playback-stopped", { summary: `Deck ${id.toUpperCase()} playback stopped` });
}

function clearDeck(id) {
  const deck = deckState[id];
  stopDeck(id);
  deck.buffer = null;
  deck.trackName = "";
  deck.analysis = null;
  deck.offset = 0;
  deck.waveformPeaks = null;
  deck.loop = false;
  deck.loopStart = 0;
  deck.loopEnd = 0;
  renderDeckLoopStatus(id);
  deck.selectionStart = null;
  deck.selectionEnd = null;
  document.querySelector(`#title-${id}`).textContent = "Empty deck";
  updateDeckTimeDisplay(id);
  updateSelectionDisplay(id);
  drawWaveform(id);
  renderAiContext();
  setDeckStatus(id, "empty", { smartMixControlled: false, manualOverride: false, error: "" });
  updateSmartMixSourceOptions();
  emitProjectContextChange("decks", "deck-cleared", { summary: `Cleared Deck ${id.toUpperCase()}`, decision: { domain: "Decks", action: "Deck cleared", summary: `Cleared Deck ${id.toUpperCase()}`, initiatedBy: "user" } });
}

function cueDeck(id) {
  const deck = deckState[id];
  setDeckStatus(id, "cueing");
  deck.offset = 0;
  if (deck.playing) playDeck(id);
  drawPlayhead(id, 0);
  updateDeckTimeDisplay(id);
  setDeckStatus(id, deck.playing ? "playing" : "paused");
}

function stopDeckSource(deck) {
  if (!deck.source) return;
  const source = deck.source;
  deck.source = null;
  source.onended = null;
  try {
    source.stop();
  } catch {
    /* source may already be stopped */
  }
}

function setDeckPlaying(id, isPlaying) {
  document.querySelector(`.deck[data-deck="${id}"]`).classList.toggle("is-playing", isPlaying);
  document.querySelector(`[data-action="play"][data-deck="${id}"]`).textContent = isPlaying ? "Pause" : "Play";
}

function updateDeckGain(id) {
  const deck = deckState[id];
  if (!deck.gain) return;
  const trim = Number(document.querySelector(`#gain-${id}`)?.value ?? 0.85);
  const channel = Number(document.querySelector(`#channel-${id}`)?.value ?? 1);
  deck.gain.gain.value = trim * channel;
}

function setCrossfaderValue(value) {
  const nextValue = Math.max(0, Math.min(1, Number(value)));
  document.querySelectorAll("#crossfader, #mixerCrossfader").forEach((slider) => {
    slider.value = nextValue;
  });
  updateCrossfader(nextValue);
}

function updateCrossfader(value = Number(document.querySelector("#crossfader").value)) {
  if (deckState.a.crossGain) deckState.a.crossGain.gain.value = Math.cos(value * Math.PI * 0.5);
  if (deckState.b.crossGain) deckState.b.crossGain.gain.value = Math.cos((1 - value) * Math.PI * 0.5);
}

function buildWaveformPeaks(deck, width) {
  if (!deck.buffer) return [];
  const data = deck.buffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(data.length / width));
  return Array.from({ length: width }, (_, x) => {
    let min = 1;
    let max = -1;
    let energy = 0;
    const start = x * samplesPerPixel;
    for (let i = 0; i < samplesPerPixel; i += 1) {
      const sample = data[start + i] || 0;
      min = Math.min(min, sample);
      max = Math.max(max, sample);
      energy += Math.abs(sample);
    }
    return { min, max, energy: energy / samplesPerPixel };
  });
}

function drawWaveform(id, playheadRatio = null) {
  const deck = deckState[id];
  const canvas = document.querySelector(`#wave-${id}`);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0d1014";
  ctx.fillRect(0, 0, width, height);
  if (!deck.buffer) return;
  if (!deck.waveformPeaks || deck.waveformPeaks.length !== width) deck.waveformPeaks = buildWaveformPeaks(deck, width);
  const bpm = Number(deck.analysis?.bpm || 0);
  if (bpm > 0) {
    const beatSeconds = 60 / bpm;
    const beatCount = Math.min(256, Math.floor(deck.buffer.duration / beatSeconds));
    ctx.lineWidth = 1;
    for (let beat = 0; beat <= beatCount; beat += 1) {
      const x = (beat * beatSeconds / deck.buffer.duration) * width;
      ctx.strokeStyle = beat % 4 === 0 ? "rgba(247,180,75,.24)" : "rgba(255,255,255,.07)";
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }
  if (playheadRatio !== null) {
    ctx.fillStyle = id === "a" ? "rgba(38,214,199,.1)" : "rgba(255,63,110,.1)";
    ctx.fillRect(0, 0, Math.max(0, Math.min(1, playheadRatio)) * width, height);
  }
  deck.waveformPeaks.forEach((peak, x) => {
    const intensity = Math.min(1, peak.energy * 5);
    const lightness = Math.round(52 + intensity * 22);
    ctx.fillStyle = id === "a" ? `hsl(174 70% ${lightness}%)` : `hsl(343 92% ${lightness}%)`;
    const y = (1 + peak.min) * height * 0.5;
    const barHeight = Math.max(1, (peak.max - peak.min) * height * 0.5);
    ctx.fillRect(x, y, 1, barHeight);
  });
  if (deck.loop && deck.loopEnd > deck.loopStart) {
    const loopX = deck.loopStart / deck.buffer.duration * width;
    const loopWidth = (deck.loopEnd - deck.loopStart) / deck.buffer.duration * width;
    ctx.fillStyle = "rgba(168,113,255,.16)";
    ctx.fillRect(loopX, 0, loopWidth, height);
    ctx.strokeStyle = "rgba(199,168,255,.85)";
    ctx.strokeRect(loopX, 1, loopWidth, height - 2);
  }
  const transitionItem = autoMixState.items.find((item) => item.name === deck.trackName);
  const transitionTime = transitionItem && (id === autoMixState.incomingDeck ? transitionItem.cueIn : transitionItem.cueOut);
  if (Number.isFinite(transitionTime)) {
    const x = transitionTime / deck.buffer.duration * width;
    ctx.strokeStyle = "#a871ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  drawSelectionOverlay(id, ctx, width, height);
}

function drawPlayhead(id, ratio) {
  const canvas = document.querySelector(`#wave-${id}`);
  const ctx = canvas.getContext("2d");
  drawWaveform(id, ratio);
  ctx.strokeStyle = "#f7b44b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ratio * canvas.width, 0);
  ctx.lineTo(ratio * canvas.width, canvas.height);
  ctx.stroke();
}

function drawSelectionOverlay(id, ctx, width, height) {
  const deck = deckState[id];
  const range = getSelectionRange(id);
  if (!deck.buffer || !range) return;
  const x = (range.start / deck.buffer.duration) * width;
  const w = ((range.end - range.start) / deck.buffer.duration) * width;
  ctx.fillStyle = "rgba(247, 180, 75, 0.2)";
  ctx.fillRect(x, 0, w, height);
  ctx.strokeStyle = "rgba(247, 180, 75, 0.86)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, 0, w, height);
}

function updateDeckTimeDisplay(id) {
  const deck = deckState[id];
  const current = currentDeckTime(id);
  const duration = deck.buffer ? deck.buffer.duration : 0;
  document.querySelector(`#time-${id}`).textContent = formatTime(current);
  document.querySelector(`#duration-${id}`).textContent = formatTime(duration);
  const seek = document.querySelector(`#seek-${id}`);
  seek.value = duration ? Math.round((current / duration) * 1000) : 0;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function markSelection(id, point) {
  const deck = deckState[id];
  if (!deck.buffer) return;
  const time = currentDeckTime(id);
  if (point === "in") {
    deck.selectionStart = time;
    if (deck.selectionEnd !== null && deck.selectionEnd <= time) {
      deck.selectionEnd = Math.min(deck.buffer.duration, time + 4);
    }
  }
  if (point === "out") {
    deck.selectionEnd = time;
    if (deck.selectionStart !== null && deck.selectionStart >= time) {
      deck.selectionStart = Math.max(0, time - 4);
    }
  }
  updateSelectionDisplay(id);
  drawPlayhead(id, currentDeckTime(id) / deck.buffer.duration);
}

function getSelectionRange(id) {
  const deck = deckState[id];
  if (!deck.buffer || deck.selectionStart === null || deck.selectionEnd === null) return null;
  const start = Math.max(0, Math.min(deck.selectionStart, deck.selectionEnd));
  const end = Math.min(deck.buffer.duration, Math.max(deck.selectionStart, deck.selectionEnd));
  if (end - start < 0.05) return null;
  return { start, end };
}

function getActionRange(id) {
  const deck = deckState[id];
  if (!deck.buffer) return null;
  const selected = getSelectionRange(id);
  if (selected) return selected;
  const current = currentDeckTime(id);
  if (deck.selectionStart !== null) {
    const start = Math.max(0, Math.min(deck.selectionStart, current));
    const end = Math.min(deck.buffer.duration, Math.max(deck.selectionStart, current));
    if (end - start >= 0.05) return { start, end };
  }
  if (deck.selectionEnd !== null) {
    const start = Math.max(0, Math.min(deck.selectionEnd, current));
    const end = Math.min(deck.buffer.duration, Math.max(deck.selectionEnd, current));
    if (end - start >= 0.05) return { start, end };
  }
  const start = Math.max(0, Math.min(current, deck.buffer.duration - 4));
  const end = Math.min(deck.buffer.duration, start + 4);
  return end - start >= 0.05 ? { start, end } : null;
}

function updateSelectionDisplay(id) {
  const range = getSelectionRange(id);
  const label = document.querySelector(`#selection-${id}`);
  label.textContent = range
    ? `Selection: ${formatTime(range.start)} - ${formatTime(range.end)} (${(range.end - range.start).toFixed(1)}s)`
    : "Selection: none";
}

function selectionBuffer(id, allowFallback = false) {
  const deck = deckState[id];
  const range = allowFallback ? getActionRange(id) : getSelectionRange(id);
  if (!deck.buffer || !range) return null;
  return clipAudioBuffer(deck.buffer, range.start, range.end);
}

function clipAudioBuffer(buffer, start, end) {
  const sampleRate = buffer.sampleRate;
  const firstSample = Math.max(0, Math.floor(start * sampleRate));
  const lastSample = Math.min(buffer.length, Math.ceil(end * sampleRate));
  const frameCount = Math.max(1, lastSample - firstSample);
  const clip = AudioEngine.context.createBuffer(buffer.numberOfChannels, frameCount, sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel).slice(firstSample, lastSample);
    clip.copyToChannel(source, channel);
  }
  return clip;
}

function previewSelection(id) {
  const buffer = selectionBuffer(id, true);
  if (buffer) {
    playBufferPreview(buffer);
    showDeckEditStatus(id, "Previewing selected clip.");
  }
}

function sendSelectionToPad(id) {
  const buffer = selectionBuffer(id, true);
  if (!buffer) return;
  addBufferToPad(buffer, `Deck ${id.toUpperCase()} clip`);
  showDeckEditStatus(id, "Clip sent to sampler pad.");
}

function sampleDeckToPad(id) {
  const range = getActionRange(id);
  const buffer = selectionBuffer(id, true);
  if (!buffer || !range) {
    showDeckEditStatus(id, "Load audio, then mark or play to sample a clip.");
    return;
  }
  addBufferToPad(buffer, `Deck ${id.toUpperCase()} ${formatTime(range.start)}`);
  showDeckEditStatus(id, `Sampled ${formatTime(range.start)} - ${formatTime(range.end)} to pads.`);
}

function saveDeckClipToCrate(id) {
  const range = getActionRange(id);
  const buffer = selectionBuffer(id, true);
  if (!buffer || !range) {
    showDeckEditStatus(id, "Load audio, then mark or play to save a crate clip.");
    return;
  }
  const label = `Deck ${id.toUpperCase()} clip ${formatTime(range.start)}-${formatTime(range.end)}`;
  addBufferToCrate(buffer, label, `Saved from Deck ${id.toUpperCase()} ${formatTime(range.start)} - ${formatTime(range.end)}.`);
  showDeckEditStatus(id, `Saved ${formatTime(range.start)} - ${formatTime(range.end)} to crate.`);
}

function trimDeckToSelection(id) {
  const range = getActionRange(id);
  const buffer = selectionBuffer(id, true);
  if (!buffer) return;
  loadBufferToDeck(buffer, `Deck ${id.toUpperCase()} trim`, id);
  showDeckEditStatus(id, `Trimmed deck to ${formatTime(range.start)} - ${formatTime(range.end)}.`);
}

function splitDeckToPads(id) {
  const deck = deckState[id];
  if (!deck.buffer) return;
  const range = getSelectionRange(id) || { start: 0, end: deck.buffer.duration };
  const current = currentDeckTime(id);
  const splitAt = current > range.start + 0.05 && current < range.end - 0.05
    ? current
    : range.start + (range.end - range.start) / 2;
  if (splitAt <= range.start || splitAt >= range.end) return;
  const left = clipAudioBuffer(deck.buffer, range.start, splitAt);
  const right = clipAudioBuffer(deck.buffer, splitAt, range.end);
  addBufferToPad(left, `Deck ${id.toUpperCase()} split 1`);
  addBufferToPad(right, `Deck ${id.toUpperCase()} split 2`);
  showDeckEditStatus(id, `Split at ${formatTime(splitAt)} and sent both pieces to pads.`);
}

function showDeckEditStatus(id, message) {
  const label = document.querySelector(`#selection-${id}`);
  if (label) label.textContent = message;
}

function waveformTimeFromEvent(canvas, event, id) {
  const deck = deckState[id];
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  return ratio * deck.buffer.duration;
}

function animationLoop() {
  for (const id of ["a", "b"]) {
    const deck = deckState[id];
    if (deck.buffer && deck.playing) {
      const ratio = ((AudioEngine.context.currentTime - deck.startedAt) % deck.buffer.duration) / deck.buffer.duration;
      drawPlayhead(id, ratio);
      updateDeckTimeDisplay(id);
      renderDeckLoopStatus(id);
      const pitch = Number(document.querySelector(`#pitch-${id}`)?.value || 1);
      const angle = (AudioEngine.context.currentTime - deck.startedAt) * 200 * pitch;
      document.querySelector(`.platter[data-deck="${id}"]`)?.style.setProperty("--platter-angle", `${angle}deg`);
    }
  }
  animateMeters();
  updatePadProgress();
  updateHarmonyPosition();
  monitorSmartMixHandoff();
  if (!autoMixState.lastPanelRender || performance.now() - autoMixState.lastPanelRender > 500) {
    autoMixState.lastPanelRender = performance.now();
    renderSmartMixPanel();
    renderGlobalTransport();
  }
  requestAnimationFrame(animationLoop);
}

function animateMeters() {
  if (!AudioEngine.masterAnalyser) return;
  const data = new Uint8Array(AudioEngine.masterAnalyser.frequencyBinCount);
  AudioEngine.masterAnalyser.getByteFrequencyData(data);
  const low = data.slice(0, 36).reduce((sum, value) => sum + value, 0) / (36 * 255);
  const high = data.slice(36).reduce((sum, value) => sum + value, 0) / ((data.length - 36) * 255);
  const meters = document.querySelectorAll(".master-meter span");
  meters[0].style.transform = `scaleY(${Math.max(0.08, low)})`;
  meters[1].style.transform = `scaleY(${Math.max(0.08, high)})`;
  for (const id of ["a", "b"]) animateDeckMeter(id);
}

function animateDeckMeter(id) {
  const deck = deckState[id];
  if (!deck.analyser) return;
  const samples = new Uint8Array(deck.analyser.fftSize);
  deck.analyser.getByteTimeDomainData(samples);
  let squareSum = 0;
  let instantaneousPeak = 0;
  samples.forEach((value) => {
    const sample = (value - 128) / 128;
    squareSum += sample * sample;
    instantaneousPeak = Math.max(instantaneousPeak, Math.abs(sample));
  });
  const level = deck.playing ? Math.min(1, Math.sqrt(squareSum / samples.length) * 3.4) : 0;
  deck.meterPeak = Math.max(level, deck.meterPeak * 0.975);
  const left = Math.round(level * 100);
  const right = Math.round(level * 96);
  const peak = Math.min(99, Math.round(deck.meterPeak * 100));
  const leftBar = document.querySelector(`[data-meter="${id}-left"]`);
  const rightBar = document.querySelector(`[data-meter="${id}-right"]`);
  const leftPeak = document.querySelector(`[data-peak="${id}-left"]`);
  const rightPeak = document.querySelector(`[data-peak="${id}-right"]`);
  if (leftBar) leftBar.style.width = `${left}%`;
  if (rightBar) rightBar.style.width = `${right}%`;
  if (leftPeak) leftPeak.style.left = `${peak}%`;
  if (rightPeak) rightPeak.style.left = `${Math.max(0, peak - 2)}%`;
  document.querySelector(`[data-clip="${id}"]`)?.classList.toggle("is-clipping", instantaneousPeak >= 0.98);
}

function padModeLabel(mode) {
  return ({ trigger: "One Shot", hold: "Hold", gate: "Gate", toggle: "Toggle", loop: "Loop", repeat: "Repeat", roll: "Roll", "dj-drop": "DJ Drop" })[mode] || "One Shot";
}

function renderPads() {
  const pads = document.querySelector("#pads");
  pads.innerHTML = "";
  sampler.names.forEach((name, index) => {
    const slot = document.createElement("div");
    slot.className = "pad-slot";
    const button = document.createElement("button");
    const isPlaying = Boolean(sampler.active[index]);
    const isSelected = sampler.selected === index;
    button.className = `pad${isPlaying ? " is-hot" : ""}${isSelected ? " is-selected" : ""}`;
    const buffer = sampler.buffers[index];
    const region = buffer ? getPadRegion(index) : null;
    const mode = padModeLabel(sampler.modes[index]);
    const category = sampler.categories[index] || "User-created";
    button.type = "button";
    button.dataset.category = buffer ? category : "Empty";
    button.setAttribute("aria-pressed", String(isPlaying));
    button.setAttribute("aria-label", `Pad ${index + 1}, ${name}, ${buffer ? `${category}, ${mode}` : "empty"}, shortcut ${PAD_KEYS[index].toUpperCase()}`);
    button.innerHTML = `<span class="pad-badge">${buffer ? category : "Empty"} · ${PAD_KEYS[index].toUpperCase()}</span><strong>${index + 1}. ${name}</strong><small>${buffer ? `${isPlaying ? "Playing" : mode} · ${formatTime(region.end - region.start)}` : "Drop audio here"}</small><span class="pad-progress" style="transform:scaleX(0)"></span>`;
    button.addEventListener("pointerdown", async (event) => {
      if (event.button !== 0) return;
      selectPad(index);
      await AudioEngine.init();
      triggerPad(index, { held: true });
    });
    button.addEventListener("pointerup", () => releasePad(index));
    button.addEventListener("pointercancel", () => releasePad(index));
    button.addEventListener("dragover", (event) => { event.preventDefault(); button.classList.add("is-drop-target"); });
    button.addEventListener("dragleave", () => button.classList.remove("is-drop-target"));
    button.addEventListener("drop", (event) => handlePadDrop(event, index));
    slot.appendChild(button);
    if (sampler.buffers[index]) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-button";
      deleteButton.type = "button";
      deleteButton.textContent = "×";
      deleteButton.title = `Delete pad ${index + 1}`;
      deleteButton.ariaLabel = `Delete pad ${index + 1}`;
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        deletePad(index);
      });
      slot.appendChild(deleteButton);
    }
    pads.appendChild(slot);
  });
  document.querySelector("#padEmptyState")?.toggleAttribute("hidden", sampler.buffers.some(Boolean));
  renderPadDiagnostics();
}

function triggerPad(index, options = {}) {
  const buffer = sampler.buffers[index];
  if (!buffer || !AudioEngine.context) return;
  const mode = sampler.modes[index];
  if ((mode === "toggle" || mode === "loop") && sampler.active[index]) {
    stopPad(index);
    return;
  }
  stopPad(index, { quiet: true });
  const choke = Number(sampler.chokes[index]) || (mode === "dj-drop" ? 4 : 0);
  if (choke) sampler.active.forEach((active, other) => { if (active && other !== index && (Number(sampler.chokes[other]) === choke || (mode === "dj-drop" && sampler.modes[other] === "dj-drop"))) stopPad(other, { quiet: true }); });
  const ctx = AudioEngine.context;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const pan = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
  const region = getPadRegion(index);
  const startAt = nextPadTriggerTime();
  recordEditorPerformanceEvent({
    kind: "pad",
    padIndex: index,
    name: sampler.names[index],
    regionStart: region.start,
    regionEnd: region.end,
    duration: region.end - region.start,
    loop: ["loop", "toggle", "repeat", "roll"].includes(mode),
    playbackMode: mode,
    velocity: 0.9
  });
  source.buffer = buffer;
  source.loop = ["loop", "toggle", "repeat", "roll"].includes(mode);
  if (source.loop) {
    source.loopStart = region.start;
    source.loopEnd = region.end;
  }
  source.playbackRate.value = 2 ** ((Number(sampler.pitches[index]) || 0) / 12);
  gain.gain.value = Number(sampler.gains[index]) || 0;
  filter.type = "lowpass";
  filter.frequency.value = Number(sampler.filters[index]) || 20000;
  source.connect(filter);
  filter.connect(gain);
  if (pan) { gain.connect(pan); pan.pan.value = Number(sampler.pans[index]) || 0; pan.connect(AudioEngine.masterAnalyser); } else gain.connect(AudioEngine.masterAnalyser);
  sampler.active[index] = { source, gain, filter, pan, startedAt: startAt, duration: region.end - region.start, mode, choke };
  if (options.held && ["hold", "gate", "repeat", "roll"].includes(mode)) sampler.held.add(index);
  sampler.lastTrigger = `${index + 1}. ${sampler.names[index]} (${padModeLabel(mode)})`;
  sampler.recentTriggers.unshift({ pad: index + 1, name: sampler.names[index], mode, timestamp: new Date().toISOString() });
  sampler.recentTriggers = sampler.recentTriggers.slice(0, 12);
  source.onended = () => {
    sampler.active[index] = null;
    renderPads();
  };
  if (source.loop) {
    source.start(startAt, region.start);
  } else {
    source.start(startAt, region.start, region.end - region.start);
  }
  renderPads();
  renderAiContext();
  emitProjectContextChange("pads", "pad-triggered", { summary: `Triggered Pad ${index + 1}: ${sampler.names[index]}` });
}

function releasePad(index) {
  const mode = sampler.modes[index];
  sampler.held.delete(index);
  if (["hold", "gate", "repeat", "roll"].includes(mode)) stopPad(index);
}

function stopPad(index, options = {}) {
  const active = sampler.active[index];
  if (!active) return;
  sampler.active[index] = null;
  sampler.held.delete(index);
  active.source.onended = null;
  try {
    active.source.stop();
  } catch {
    /* Pad may already have ended. */
  }
  sampler.lastStop = `${index + 1}. ${sampler.names[index]}`;
  if (!options.quiet) renderPads();
  if (!options.quiet) emitProjectContextChange("pads", "pad-stopped", { summary: `Stopped Pad ${index + 1}: ${sampler.names[index]}` });
}

function nextPadTriggerTime() {
  if (!AudioEngine.context || sampler.quantize === "off") return 0;
  const bpm = Number(document.querySelector("#globalBpm").value) || 120;
  const beat = 60 / bpm;
  const interval = sampler.quantize === "bar" ? beat * 4 : beat;
  const now = AudioEngine.context.currentTime;
  return Math.ceil((now + 0.01) / interval) * interval;
}

function stopAllPads() {
  sampler.active.forEach((active, index) => {
    if (active) stopPad(index);
  });
}

function stopPadLoops() {
  sampler.active.forEach((active, index) => {
    if (active && ["loop", "toggle", "repeat", "roll"].includes(sampler.modes[index])) stopPad(index);
  });
}

function releaseHeldPads() {
  [...sampler.held].forEach((index) => releasePad(index));
  setPadEditorStatus("Released held, gate, repeat, and roll pads.");
}

function panicPads() {
  stopAllPads();
  sampler.held.clear();
  setPadEditorStatus("Pad panic completed. All pad sources and held state reset.");
}

async function handlePadDrop(event, index) {
  event.preventDefault();
  event.currentTarget.classList.remove("is-drop-target");
  const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith("audio/"));
  if (file) {
    try {
      await AudioEngine.init();
      const buffer = await loadAudioFile(file);
      if (sampler.buffers[index] && !window.confirm(`Replace ${sampler.names[index]} on Pad ${index + 1}?`)) return;
      setPadBuffer(index, buffer, file.name, { source: `Local file: ${file.name}` });
      setPadEditorStatus(`Assigned ${file.name} to Pad ${index + 1}.`);
    } catch (error) {
      sampler.lastError = error.message;
      setPadEditorStatus(`Could not load dropped audio: ${error.message}`);
    }
    return;
  }
  const trackId = event.dataTransfer?.getData("application/x-deckforge-ditc-track") || event.dataTransfer?.getData("text/plain");
  const source = sourceFiles.find((item) => item.id === trackId);
  if (source?.buffer) {
    if (sampler.buffers[index] && !window.confirm(`Replace ${sampler.names[index]} on Pad ${index + 1}?`)) return;
    setPadBuffer(index, source.buffer, source.name, { source: "DITC local library" });
    setPadEditorStatus(`Assigned ${source.name} from DITC to Pad ${index + 1}.`);
    return;
  }
  setPadEditorStatus("This drag source does not expose decoded audio. Use its Send to Pad action or a local/DITC audio file.");
}

function capturePadBank() {
  return {
    names: [...sampler.names], starts: [...sampler.starts], ends: [...sampler.ends], modes: [...sampler.modes],
    gains: [...sampler.gains], pans: [...sampler.pans], pitches: [...sampler.pitches], filters: [...sampler.filters],
    categories: [...sampler.categories], chokes: [...sampler.chokes], sources: [...sampler.sources], relink: [...sampler.relink],
    buffers: [...sampler.buffers]
  };
}

function emptyPadBank() {
  return { names: Array.from({ length: 16 }, (_, index) => `Pad ${index + 1}`), starts: Array(16).fill(0), ends: Array(16).fill(null), modes: Array(16).fill("trigger"), gains: Array(16).fill(0.9), pans: Array(16).fill(0), pitches: Array(16).fill(0), filters: Array(16).fill(20000), categories: Array(16).fill("User-created"), chokes: Array(16).fill(0), sources: Array(16).fill("Unassigned"), relink: Array(16).fill(false), buffers: Array(16).fill(null) };
}

function applyPadBank(bank) {
  ["names", "starts", "ends", "modes", "gains", "pans", "pitches", "filters", "categories", "chokes", "sources", "relink", "buffers"].forEach((key) => { sampler[key] = [...bank[key]]; });
  sampler.active = Array(16).fill(null);
  sampler.selected = 0;
}

function switchPadBank(name) {
  if (name === sampler.bank) return;
  const previousBank = sampler.bank;
  panicPads();
  sampler.banks[sampler.bank] = capturePadBank();
  sampler.bank = name;
  sampler.banks[name] ||= emptyPadBank();
  applyPadBank(sampler.banks[name]);
  savePadWorkspace();
  renderPads(); renderPadEditor();
  setPadEditorStatus(`Switched to Bank ${name}. Pad audio was stopped; decks were not affected.`);
  emitProjectContextChange("pads", "pad-bank-changed", { summary: `Switched from Pad Bank ${previousBank} to ${name}`, decision: { domain: "Pads", action: "Pad bank selected", summary: `Selected Pad Bank ${name}`, before: { bank: previousBank }, after: { bank: name }, initiatedBy: "user" } });
}

function switchPadScene(name) {
  const previousScene = sampler.scene;
  panicPads();
  sampler.scenes[sampler.scene] = { bank: sampler.bank, quantize: sampler.quantize };
  sampler.scene = name;
  const scene = sampler.scenes[name];
  if (scene) { document.querySelector("#padQuantize").value = scene.quantize; sampler.quantize = scene.quantize; if (scene.bank !== sampler.bank) switchPadBank(scene.bank); }
  savePadWorkspace(); renderPadDiagnostics();
  emitProjectContextChange("pads", "pad-scene-changed", { summary: `Switched from Pad Scene ${previousScene} to ${name}`, decision: { domain: "Pads", action: "Pad scene selected", summary: `Selected Pad Scene ${name}`, before: { scene: previousScene }, after: { scene: name }, initiatedBy: "user" } });
}

function savePadWorkspace() {
  sampler.banks[sampler.bank] = capturePadBank();
  const serializableBanks = Object.fromEntries(Object.entries(sampler.banks).map(([name, bank]) => [name, { ...bank, buffers: undefined, relink: bank.names.map((padName, index) => Boolean(bank.buffers[index]) || bank.relink[index]) }]));
  localStorage.setItem("deckforge-pad-workspace", JSON.stringify({ bank: sampler.bank, scene: sampler.scene, workspaceMode: sampler.workspaceMode, quantize: sampler.quantize, banks: serializableBanks, scenes: sampler.scenes, promptHistory: sampler.promptHistory.slice(-20) }));
}

function restorePadWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem("deckforge-pad-workspace") || "null");
    sampler.banks.A = capturePadBank();
    ["B", "C", "D"].forEach((name) => { sampler.banks[name] = emptyPadBank(); });
    if (!saved) return;
    Object.entries(saved.banks || {}).forEach(([name, bank]) => { sampler.banks[name] = { ...emptyPadBank(), ...bank, buffers: Array(16).fill(null) }; });
    sampler.bank = saved.bank || "A"; sampler.scene = saved.scene || "Intro"; sampler.workspaceMode = saved.workspaceMode || "simple"; sampler.quantize = saved.quantize || "off"; sampler.scenes = saved.scenes || {}; sampler.promptHistory = saved.promptHistory || [];
    applyPadBank(sampler.banks[sampler.bank] || emptyPadBank());
  } catch (error) { sampler.lastError = `Workspace restore: ${error.message}`; sampler.banks.A = capturePadBank(); }
}

function renderPadDiagnostics() {
  const details = document.querySelector("#padDiagnostics");
  if (details) details.hidden = !DECKFORGE_DEVELOPMENT;
  const output = document.querySelector("#padDiagnosticsOutput");
  if (!output || !DECKFORGE_DEVELOPMENT) return;
  output.textContent = JSON.stringify({ bank: sampler.bank, scene: sampler.scene, activePads: sampler.active.map((active, index) => active ? index + 1 : null).filter(Boolean), loopingPads: sampler.active.map((active, index) => active?.source.loop ? index + 1 : null).filter(Boolean), heldPads: [...sampler.held].map((index) => index + 1), chokeGroups: sampler.chokes, recording: Boolean(editorState.recording), quantize: sampler.quantize, lastTrigger: sampler.lastTrigger, lastStop: sampler.lastStop, lastError: sampler.lastError, audioBufferCount: sampler.buffers.filter(Boolean).length, objectUrlCount: 0 }, null, 2);
}

function renderPadWorkspaceControls() {
  const section = document.querySelector("#sampler");
  if (section) section.dataset.padMode = sampler.workspaceMode;
  document.querySelector("#padWorkspaceMode").value = sampler.workspaceMode;
  document.querySelector("#padBank").value = sampler.bank;
  document.querySelector("#padScene").value = sampler.scene;
  document.querySelector("#padQuantize").value = sampler.quantize;
  const list = document.querySelector("#padCategories");
  if (list) list.innerHTML = PAD_CATEGORIES.map((category) => `<button type="button" class="secondary-button pad-category-chip" data-pad-category-filter="${category}"><span>${category}</span><span>${category === "DITC" ? sourceFiles.length : sampler.categories.filter((item, index) => item === category && sampler.buffers[index]).length}</span></button>`).join("");
}

function loadStarterPadBank() {
  if (sampler.buffers.some(Boolean) && !window.confirm(`Bank ${sampler.bank} contains audio. Clear it and load the starter layout?`)) return;
  panicPads();
  const starter = emptyPadBank();
  starter.names = ["Kick", "Snare", "Closed Hat", "Open Hat", "DJ Drop", "Vocal", "Crowd", "Movie Quote", "Impact", "Riser", "Loop A", "Loop B", "Scratch A", "Scratch B", "User 1", "User 2"];
  starter.categories = ["Drums", "Drums", "Drums", "Drums", "DJ Drops", "Vocals", "Sports", "Movie Quotes", "FX", "FX", "Loops", "Loops", "Scratches", "Scratches", "User-created", "User-created"];
  starter.relink = starter.names.map(() => true);
  applyPadBank(starter); sampler.banks[sampler.bank] = starter;
  savePadWorkspace(); renderPads(); renderPadEditor();
  setPadEditorStatus("Starter layout loaded as honest Relink Required slots. Add your own audio to make each pad playable.");
}

function previewAiPadPlan() {
  const prompt = document.querySelector("#aiPadPrompt").value.trim();
  if (!prompt) { document.querySelector("#aiPadPlan").textContent = "Enter a prompt first."; return; }
  const sources = sourceFiles.filter((source) => source.buffer).slice(0, 16);
  const occupied = sampler.buffers.filter(Boolean).length;
  const plan = { pads: Math.min(16, sources.length), sourceTracks: sources.map((source) => source.name), categories: prompt.toLowerCase().includes("sports") ? ["Sports", "FX"] : prompt.toLowerCase().includes("house") ? ["Loops", "FX", "Vocals"] : ["DJ Drops", "Scratches", "Vocals", "FX"], suggestedBank: sampler.bank, suggestedScenes: [sampler.scene, "Transition"], extractionRegions: "Whole decoded local sources; automatic hook extraction is unavailable", playbackModes: sources.map((source) => source.buffer.duration > 8 ? "Loop" : "One Shot"), confidence: sources.length ? "Medium" : "Low", warnings: [...(occupied ? [`Bank ${sampler.bank} has ${occupied} occupied pad(s); Apply will ask before replacing.`] : []), ...(sources.length ? [] : ["No decoded DITC local sources are available. Import local audio first."])] };
  sampler.pendingAiPlan = { prompt, sources, plan };
  document.querySelector("#aiPadPlan").textContent = JSON.stringify(plan, null, 2);
  document.querySelector("#applyAiPadPlan").disabled = !sources.length;
}

function applyAiPadPlan() {
  const pending = sampler.pendingAiPlan;
  if (!pending?.sources.length) return;
  if (sampler.buffers.some(Boolean) && !window.confirm(`Replace occupied pads in Bank ${sampler.bank} with this plan?`)) return;
  panicPads(); applyPadBank(emptyPadBank());
  pending.sources.forEach((source, index) => setPadBuffer(index, source.buffer, source.name, { source: "AI plan from DITC local source", category: pending.plan.categories[index % pending.plan.categories.length] }));
  sampler.promptHistory.push(pending.prompt); savePadWorkspace();
  document.querySelector("#aiPadBuilder").close();
  setPadEditorStatus(`Applied a ${pending.sources.length}-pad local plan. No new audio was generated.`);
}

function updatePadProgress() {
  if (!AudioEngine.context) return;
  sampler.active.forEach((active, index) => {
    if (!active) return;
    const elapsed = Math.max(0, AudioEngine.context.currentTime - active.startedAt);
    const ratio = active.source.loop ? (elapsed % active.duration) / active.duration : Math.min(1, elapsed / active.duration);
    const progress = document.querySelectorAll("#pads .pad-progress")[index];
    if (progress) progress.style.transform = `scaleX(${ratio})`;
    const small = document.querySelectorAll("#pads .pad small")[index];
    if (small) small.textContent = `${active.source.loop ? "Looping" : "Playing"} · ${formatTime(Math.max(0, active.duration - (active.source.loop ? elapsed % active.duration : elapsed)))} left`;
  });
}

function previewPadMacro() {
  const value = document.querySelector("#padMacro").value;
  setPadEditorStatus(value === "transition" ? `Preview: stop active pad loops, then trigger Pad ${sampler.selected + 1}. Decks and Smart Mix are untouched.` : `Preview: trigger Pad ${sampler.selected + 1} using its current mode and settings.`);
}

async function runPadMacro() {
  cancelPadMacro();
  await AudioEngine.init();
  const value = document.querySelector("#padMacro").value;
  if (value === "transition") stopPadLoops();
  sampler.macroRun = { cancelled: false, value };
  if (!sampler.macroRun.cancelled) triggerPad(sampler.selected);
  setPadEditorStatus(`Ran supported ${value === "transition" ? "pad transition" : "trigger"} macro. Local Stop or Panic remains authoritative.`);
}

function cancelPadMacro() {
  if (sampler.macroRun) sampler.macroRun.cancelled = true;
  sampler.macroRun = null;
  setPadEditorStatus("Pad macro cancelled. Already-started audio remains under local transport control.");
}

function deletePad(index) {
  stopPad(index);
  sampler.buffers[index] = null;
  sampler.names[index] = `Pad ${index + 1}`;
  sampler.starts[index] = 0;
  sampler.ends[index] = null;
  sampler.modes[index] = "trigger";
  sampler.categories[index] = "User-created";
  sampler.chokes[index] = 0;
  sampler.sources[index] = "Unassigned";
  sampler.relink[index] = false;
  renderPads();
  renderPadEditor();
  renderAiContext();
  savePadWorkspace();
}

function selectPad(index) {
  sampler.selected = index;
  renderPads();
  renderPadEditor();
}

function getPadRegion(index) {
  const buffer = sampler.buffers[index];
  if (!buffer) return { start: 0, end: 0 };
  const start = Math.max(0, Math.min(sampler.starts[index] || 0, buffer.duration - 0.02));
  const end = Math.max(start + 0.02, Math.min(sampler.ends[index] || buffer.duration, buffer.duration));
  return { start, end };
}

function renderPadEditor() {
  const index = sampler.selected;
  const buffer = sampler.buffers[index];
  const title = document.querySelector("#padEditorTitle");
  const meta = document.querySelector("#padEditorMeta");
  const start = document.querySelector("#padStart");
  const end = document.querySelector("#padEnd");
  const mode = document.querySelector("#padMode");
  const quantize = document.querySelector("#padQuantize");
  if (!title || !meta || !start || !end || !mode || !quantize) return;
  title.textContent = `${index + 1}. ${sampler.names[index]}`;
  if (!buffer) {
    meta.textContent = sampler.relink[index] ? `Relink Required: ${sampler.names[index]} metadata was restored, but browser security requires the local audio file again.` : "Empty pad. Load a sample or send a deck/crate clip here.";
    start.value = 0;
    end.value = 1000;
    mode.value = "trigger";
    quantize.value = sampler.quantize;
    drawPadWaveform();
    return;
  }
  const region = getPadRegion(index);
  meta.textContent = `${formatTime(buffer.duration)} source · ${sampler.sources[index]} · region ${formatTime(region.start)} - ${formatTime(region.end)} · ${padModeLabel(sampler.modes[index])}`;
  start.value = Math.round((region.start / buffer.duration) * 1000);
  end.value = Math.round((region.end / buffer.duration) * 1000);
  mode.value = sampler.modes[index];
  quantize.value = sampler.quantize;
  const values = { padGain: sampler.gains[index], padPan: sampler.pans[index], padPitch: sampler.pitches[index], padFilter: sampler.filters[index], padCategory: sampler.categories[index], padChoke: sampler.chokes[index] };
  Object.entries(values).forEach(([id, value]) => { const control = document.querySelector(`#${id}`); if (control) control.value = value; });
  drawPadWaveform();
}

function updateSelectedPadRange(which, value) {
  const index = sampler.selected;
  const buffer = sampler.buffers[index];
  if (!buffer) return;
  const time = (Number(value) / 1000) * buffer.duration;
  if (which === "start") {
    sampler.starts[index] = Math.min(time, getPadRegion(index).end - 0.02);
  } else {
    sampler.ends[index] = Math.max(time, getPadRegion(index).start + 0.02);
  }
  renderPadEditor();
  renderPads();
}

function updateSelectedPadMode(value) {
  sampler.modes[sampler.selected] = value;
  renderPadEditor();
  renderPads();
  savePadWorkspace();
}

function updateSelectedPadSetting(key, value) {
  const index = sampler.selected;
  sampler[key][index] = ["categories"].includes(key) ? value : Number(value);
  const active = sampler.active[index];
  if (active && key === "gains") active.gain.gain.value = Number(value);
  if (active && key === "pans" && active.pan) active.pan.pan.value = Number(value);
  if (active && key === "filters") active.filter.frequency.value = Number(value);
  if (active && key === "pitches") active.source.playbackRate.value = 2 ** (Number(value) / 12);
  renderPads(); savePadWorkspace();
}

function updatePadQuantize(value) {
  sampler.quantize = value;
  renderPadEditor();
  setPadEditorStatus(value === "off" ? "Pad quantize off. Pads trigger immediately." : `Pads trigger on the next ${value}.`);
  savePadWorkspace();
}

function previewSelectedPadRegion() {
  const index = sampler.selected;
  const buffer = sampler.buffers[index];
  if (!buffer) return;
  playBufferPreview(clipSelectedPadRegion());
  setPadEditorStatus("Previewing selected pad region.");
}

function clipSelectedPadRegion() {
  const index = sampler.selected;
  const buffer = sampler.buffers[index];
  if (!buffer) return null;
  const region = getPadRegion(index);
  return clipAudioBuffer(buffer, region.start, region.end);
}

function sliceSelectedPadToPads() {
  const index = sampler.selected;
  const buffer = sampler.buffers[index];
  if (!buffer) {
    setPadEditorStatus("Load a sample before slicing.");
    return;
  }
  const region = getPadRegion(index);
  const count = Math.max(2, Math.min(16, Number(document.querySelector("#padSliceCount").value) || 8));
  const length = (region.end - region.start) / count;
  const baseName = sampler.names[index];
  for (let i = 0; i < count; i += 1) {
    const target = (index + i) % sampler.buffers.length;
    const startTime = region.start + i * length;
    const endTime = i === count - 1 ? region.end : startTime + length;
    const chop = clipAudioBuffer(buffer, startTime, endTime);
    setPadBuffer(target, chop, `${baseName} chop ${i + 1}`, { mode: "trigger" });
  }
  sampler.selected = index;
  renderPads();
  renderPadEditor();
  setPadEditorStatus(`Sliced ${baseName} into ${count} playable pads.`);
}

function saveSelectedPadClipToCrate() {
  const clip = clipSelectedPadRegion();
  if (!clip) {
    setPadEditorStatus("Select a loaded pad before saving.");
    return;
  }
  addBufferToCrate(clip, `${sampler.names[sampler.selected]} pad clip`, "Saved from sampler pad editor.");
  setPadEditorStatus("Saved selected pad region to crate.");
}

function setPadEditorStatus(message) {
  const status = document.querySelector("#padEditorStatus");
  if (status) status.textContent = message;
}

function drawPadWaveform() {
  const canvas = document.querySelector("#padWaveform");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b0e12";
  ctx.fillRect(0, 0, width, height);
  const buffer = sampler.buffers[sampler.selected];
  if (!buffer) {
    ctx.fillStyle = "rgba(232, 238, 242, 0.38)";
    ctx.fillText("Load or select a pad sample to edit start/end points.", 18, height / 2);
    return;
  }
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / width));
  ctx.strokeStyle = "rgba(38, 214, 199, 0.9)";
  ctx.beginPath();
  for (let x = 0; x < width; x += 1) {
    let min = 1;
    let max = -1;
    for (let j = 0; j < step; j += 1) {
      const value = data[x * step + j] || 0;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    ctx.moveTo(x, ((1 + min) / 2) * height);
    ctx.lineTo(x, ((1 + max) / 2) * height);
  }
  ctx.stroke();
  const region = getPadRegion(sampler.selected);
  const startX = (region.start / buffer.duration) * width;
  const endX = (region.end / buffer.duration) * width;
  ctx.fillStyle = "rgba(247, 180, 75, 0.2)";
  ctx.fillRect(startX, 0, Math.max(2, endX - startX), height);
  ctx.strokeStyle = "rgba(247, 180, 75, 0.9)";
  ctx.strokeRect(startX, 0, Math.max(2, endX - startX), height);
}

function collectAiContext() {
  const loadedPads = sampler.names
    .map((name, index) => ({
      name,
      index,
      loaded: Boolean(sampler.buffers[index]),
      duration: sampler.buffers[index] ? getPadRegion(index).end - getPadRegion(index).start : 0,
      mode: sampler.modes[index]
    }))
    .filter((pad) => pad.loaded);
  const savedSources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
  const selected = selectedCrateItems();
  return {
    decks: ["a", "b"].map((id) => ({
      id,
      title: document.querySelector(`#title-${id}`).textContent,
      loaded: Boolean(deckState[id].buffer),
      duration: deckState[id].buffer ? deckState[id].buffer.duration : 0
    })),
    pads: loadedPads,
    stems: stemState.stems.map((stem) => ({ name: stem.name, id: stem.id, quality: stem.quality || "Stem" })),
    crate: [
      ...sourceFiles.map((source) => ({ id: source.id, name: source.name, type: "Local file", loadable: true, selected: crateSelection.local.has(source.id), analysis: source.analysis, notes: source.notes || "" })),
      ...savedSources.map((source, index) => ({ id: String(index), name: source.name, type: detectPlatform(source.url), url: source.url, loadable: false, selected: crateSelection.saved.has(String(index)), analysis: source.analysis, notes: source.notes || "" }))
    ],
    selectedCrate: selected,
    drumPreset: drumPresets.find((preset) => preset.id === drums.preset)?.name || "None",
    drumMachine: drumMachines.find((machine) => machine.id === drums.machine)?.name || "None",
    synthPreset: getInstrumentPreset()?.name || "None",
    synthMachine: getSynthMachine()?.name || "None",
    bpm: Number(document.querySelector("#globalBpm").value) || 124
  };
}

function renderAiContext() {
  const context = collectAiContext();
  const container = document.querySelector("#aiContext");
  if (!container) return;
  const items = [
    ...context.decks.map((deck) => ({
      title: `Deck ${deck.id.toUpperCase()}`,
      detail: deck.loaded ? `${deck.title} (${formatTime(deck.duration)})` : "Empty"
    })),
    { title: "Pads", detail: context.pads.length ? context.pads.map((pad) => `${pad.index + 1}. ${pad.name}`).join(", ") : "No loaded pads" },
    { title: "Stems", detail: context.stems.length ? context.stems.map((stem) => `${stem.name} (${stem.quality})`).join(", ") : "No generated stems" },
    { title: "Crate", detail: context.crate.length ? context.crate.map((item) => `${item.selected ? "✓ " : ""}${item.name} (${item.type}${item.analysis ? `, ${analysisSummary(item.analysis)}` : ""})`).join(", ") : "No crate tracks" },
    { title: "Drums", detail: `${context.drumMachine} / ${context.drumPreset}` },
    { title: "Keys", detail: `${context.synthMachine} / ${context.synthPreset}` },
    { title: "Tempo", detail: `${context.bpm} BPM` }
  ];
  container.innerHTML = items.map((item) => `
    <div class="ai-context-item">
      <strong>${item.title}</strong>
      <small>${item.detail}</small>
    </div>
  `).join("");
}

function editorSecondsPerBar() {
  const bpm = Number(document.querySelector("#globalBpm")?.value) || 124;
  return (60 / bpm) * 4;
}

function editorPixelsPerSecond() {
  return Number(editorState.zoom) * 4;
}

function editorTotalSeconds() {
  return Math.max(480, ...editorState.clips.map((clip) => clip.start + clip.duration + 24));
}

function editorSnapSeconds() {
  const bar = editorSecondsPerBar();
  if (editorState.snap === "phrase") return bar * 8;
  if (editorState.snap === "bar") return bar;
  if (editorState.snap === "beat") return bar / 4;
  return 0;
}

function snapEditorTime(time) {
  const snap = editorSnapSeconds();
  if (!snap) return Math.max(0, time);
  return Math.max(0, Math.round(time / snap) * snap);
}

function editorClipColor(type) {
  const colors = {
    song: "#26d6c7",
    deck: "#80d66b",
    pad: "#f7b44b",
    stem: "#8cb7ff",
    drums: "#ff7f50",
    keys: "#c78cff",
    fx: "#ff5f8f",
    file: "#d8e36a"
  };
  return colors[type] || "#26d6c7";
}

function editorSources() {
  const sources = [];
  sourceFiles.forEach((source) => {
    sources.push({
      id: source.id,
      type: "song",
      label: source.name,
      detail: source.analysis ? analysisSummary(source.analysis) : "Crate audio",
      duration: source.buffer?.duration || source.analysis?.duration || 180,
      sourceKind: "crate"
    });
  });
  ["a", "b"].forEach((id) => {
    const deck = deckState[id];
    if (deck.buffer) {
      sources.push({
        id,
        type: "deck",
        label: `Deck ${id.toUpperCase()} - ${document.querySelector(`#title-${id}`)?.textContent || "Loaded deck"}`,
        detail: `${formatTime(deck.buffer.duration)} deck audio`,
        duration: deck.buffer.duration,
        sourceKind: "deck"
      });
    }
  });
  sampler.buffers.forEach((buffer, index) => {
    if (!buffer) return;
    const region = getPadRegion(index);
    sources.push({
      id: String(index),
      type: "pad",
      label: `Pad ${index + 1} - ${sampler.names[index]}`,
      detail: `${formatTime(region.end - region.start)} ${sampler.modes[index]}`,
      duration: region.end - region.start,
      sourceKind: "pad"
    });
  });
  stemState.stems.forEach((stem) => {
    sources.push({
      id: stem.id,
      type: "stem",
      label: stem.name,
      detail: stem.quality || "Stem",
      duration: stem.buffer.duration,
      sourceKind: "stem"
    });
  });
  sources.push(
    { id: "drum-pattern", type: "drums", label: `${getSmartEditorDrumLabel()}`, detail: "Current drum pattern clip", duration: editorSecondsPerBar() * 4, sourceKind: "drums" },
    { id: "keys-performance", type: "keys", label: `${getInstrumentPreset()?.name || "Keys"} part`, detail: "Keys/bass performance lane", duration: editorSecondsPerBar() * 4, sourceKind: "keys" },
    { id: "dj-drop", type: "fx", label: "DJ Drop / Tag", detail: "Drop marker with fade/effects", duration: 4, sourceKind: "marker" },
    { id: "transition-fx", type: "fx", label: "Echo / Filter Transition", detail: "Automation marker", duration: 8, sourceKind: "marker" }
  );
  return sources;
}

function getSmartEditorDrumLabel() {
  const preset = drumPresets.find((item) => item.id === drums.preset);
  return preset ? `${preset.name} drums` : "Drum pattern";
}

function renderEditorSourceBin() {
  const bin = document.querySelector("#editorSourceBin");
  if (!bin) return;
  const sources = editorSources();
  bin.innerHTML = sources.length ? sources.map((source) => `
    <div class="editor-source" draggable="true" data-editor-source='${escapeHtml(JSON.stringify(source))}'>
      <strong>${escapeHtml(source.label)}</strong>
      <small>${escapeHtml(source.detail)}</small>
    </div>
  `).join("") : "<p class=\"fine-print\">Load crate tracks, pads, stems, decks, drums, or keys to populate the editor bin.</p>";
}

function renderEditor() {
  renderEditorSourceBin();
  const ruler = document.querySelector("#editorRuler");
  const timeline = document.querySelector("#editorTimeline");
  const playhead = document.querySelector("#editorPlayhead");
  if (!ruler || !timeline) return;
  const pps = editorPixelsPerSecond();
  const barSeconds = editorSecondsPerBar();
  const totalSeconds = editorTotalSeconds();
  const barWidth = Math.max(36, barSeconds * pps);
  const barCount = Math.ceil(totalSeconds / barSeconds);
  ruler.style.setProperty("--bar-width", `${barWidth}px`);
  timeline.style.setProperty("--bar-width", `${barWidth}px`);
  ruler.innerHTML = Array.from({ length: barCount }, (_, index) => `<span>${index + 1}</span>`).join("");
  timeline.innerHTML = `<div class="editor-playhead" style="left:${132 + editorState.playhead * pps}px"></div>`;
  editorState.tracks.forEach((track, trackIndex) => {
    const row = document.createElement("div");
    row.className = "editor-track";
    row.dataset.trackIndex = String(trackIndex);
    row.innerHTML = `
      <div class="editor-track-label">
        <strong>${escapeHtml(track.name)}</strong>
        <small>${escapeHtml(track.role)}</small>
      </div>
      <div class="editor-track-lane" data-track-index="${trackIndex}" style="width:${Math.max(840, totalSeconds * pps)}px"></div>
    `;
    const lane = row.querySelector(".editor-track-lane");
    editorState.clips.filter((clip) => clip.trackIndex === trackIndex).forEach((clip) => {
      lane.appendChild(renderEditorClipElement(clip, pps));
    });
    timeline.appendChild(row);
  });
  if (playhead) {
    playhead.max = Math.ceil(totalSeconds);
    playhead.value = Math.round(editorState.playhead);
  }
  renderEditorInspector();
}

function renderEditorClipElement(clip, pps) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `editor-clip${clip.id === editorState.selectedClipId ? " is-selected" : ""}`;
  el.dataset.clipId = clip.id;
  el.style.left = `${clip.start * pps}px`;
  el.style.width = `${Math.max(28, clip.duration * pps)}px`;
  el.style.setProperty("--clip-color", clip.color || editorClipColor(clip.type));
  el.style.setProperty("--fade-in-alpha", String(Math.min(0.55, (clip.fadeIn || 0) / Math.max(1, clip.duration))));
  el.style.setProperty("--fade-out-alpha", String(Math.min(0.55, (clip.fadeOut || 0) / Math.max(1, clip.duration))));
  el.innerHTML = `<strong>${escapeHtml(clip.name)}</strong><small>${formatTime(clip.start)} - ${formatTime(clip.start + clip.duration)} ${clip.loop ? "Loop" : ""}</small>`;
  return el;
}

function renderEditorInspector() {
  const inspector = document.querySelector("#editorInspector");
  if (!inspector) return;
  const clip = selectedEditorClip();
  if (!clip) {
    inspector.textContent = "Select a clip to edit timing, fades, volume, filter, EQ, and effects.";
    return;
  }
  inspector.innerHTML = `
    <p><strong>${escapeHtml(clip.name)}</strong><br>${escapeHtml(clip.type)} clip on ${escapeHtml(editorState.tracks[clip.trackIndex]?.name || "track")}</p>
    ${clip.events?.length ? `<p>${clip.events.length} playable event${clip.events.length === 1 ? "" : "s"} in this clip.</p>` : ""}
    <label>Start <input data-editor-field="start" type="number" min="0" step="0.1" value="${roundEditorValue(clip.start)}"></label>
    <label>Duration <input data-editor-field="duration" type="number" min="0.25" step="0.1" value="${roundEditorValue(clip.duration)}"></label>
    <label>Volume <input data-editor-field="volume" type="range" min="0" max="1.5" step="0.01" value="${clip.volume}"></label>
    <label>Fade In <input data-editor-field="fadeIn" type="number" min="0" step="0.1" value="${roundEditorValue(clip.fadeIn || 0)}"></label>
    <label>Fade Out <input data-editor-field="fadeOut" type="number" min="0" step="0.1" value="${roundEditorValue(clip.fadeOut || 0)}"></label>
    <label>Stretch <input data-editor-field="stretch" type="range" min="0.5" max="1.5" step="0.01" value="${clip.stretch || 1}"></label>
    <label>Filter <input data-editor-field="filter" type="range" min="200" max="16000" step="10" value="${clip.filter || 16000}"></label>
    <label>EQ Tilt <input data-editor-field="eq" type="range" min="-1" max="1" step="0.01" value="${clip.eq || 0}"></label>
    <label>Mute <input data-editor-field="muted" type="checkbox" ${clip.muted ? "checked" : ""}></label>
    <label>Solo <input data-editor-field="solo" type="checkbox" ${clip.solo ? "checked" : ""}></label>
    <label>FX
      <select data-editor-field="effect">
        ${["none", "echo", "filter sweep", "reverb tail", "scratch fill", "bass swap"].map((effect) => `<option value="${effect}" ${clip.effect === effect ? "selected" : ""}>${effect}</option>`).join("")}
      </select>
    </label>
    <button type="button" class="secondary-button" data-editor-command="delete-clip">Delete Clip</button>
  `;
}

function roundEditorValue(value) {
  return Math.round(Number(value) * 10) / 10;
}

function selectedEditorClip() {
  return editorState.clips.find((clip) => clip.id === editorState.selectedClipId) || null;
}

function editorStatus(message) {
  const status = document.querySelector("#editorStatus");
  if (status) status.textContent = message;
}

function editorLaneTimeFromEvent(lane, event) {
  const rect = lane.getBoundingClientRect();
  return snapEditorTime((event.clientX - rect.left) / editorPixelsPerSecond());
}

function editorTrackIndexFromY(clientY) {
  const rows = [...document.querySelectorAll(".editor-track")];
  const found = rows.find((row) => {
    const rect = row.getBoundingClientRect();
    return clientY >= rect.top && clientY <= rect.bottom;
  });
  return found ? Number(found.dataset.trackIndex) : 0;
}

async function addEditorClipFromSource(source, trackIndex, start) {
  const performanceEvents = source.sourceKind === "drums"
    ? createDrumPatternEvents(source.duration || editorSecondsPerBar() * 4, source.patternSnapshot)
    : source.sourceKind === "keys"
      ? createKeysSketchEvents(source.duration || editorSecondsPerBar() * 4)
      : null;
  const clip = {
    id: createId(),
    source,
    sourceKind: source.sourceKind,
    sourceId: source.id,
    type: source.type,
    name: source.label,
    trackIndex,
    start: snapEditorTime(start),
    duration: Math.max(0.5, source.duration || 8),
    sourceStart: 0,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    stretch: 1,
    loop: false,
    filter: 16000,
    eq: 0,
    effect: "none",
    color: editorClipColor(source.type),
    events: performanceEvents
  };
  editorState.clips.push(clip);
  editorState.selectedClipId = clip.id;
  editorState.playhead = clip.start;
  renderEditor();
  editorStatus(`Added ${clip.name} at ${formatTime(clip.start)}. Playhead moved to the clip start.`);
  emitProjectContextChange("arrangement", "clip-added", { summary: `Added ${clip.name} to the arrangement`, decision: { domain: "Arrangement", action: "Clip added", summary: `Added ${clip.name} at ${formatTime(clip.start)}`, after: { id: clip.id, trackIndex, start: clip.start, duration: clip.duration }, initiatedBy: "user" } });
}

async function addEditorFileClip(file, trackIndex, start) {
  const buffer = await loadAudioFile(file);
  const source = {
    id: createId(),
    type: "file",
    label: file.name,
    detail: "Dropped audio file",
    duration: buffer.duration,
    sourceKind: "buffer",
    buffer
  };
  await addEditorClipFromSource(source, trackIndex, start);
}

async function resolveEditorClipBuffer(clip) {
  if (clip.source?.buffer) return clip.source.buffer;
  if (clip.sourceKind === "crate") return getSourceFileBuffer(clip.sourceId);
  if (clip.sourceKind === "deck") return deckState[clip.sourceId]?.buffer || null;
  if (clip.sourceKind === "pad") {
    const index = Number(clip.sourceId);
    const buffer = sampler.buffers[index];
    if (!buffer) return null;
    const region = getPadRegion(index);
    return clipAudioBuffer(buffer, region.start, region.end);
  }
  if (clip.sourceKind === "stem") return stemState.stems.find((stem) => stem.id === clip.sourceId)?.buffer || null;
  return null;
}

function setEditorClipField(field, value) {
  const clip = selectedEditorClip();
  if (!clip) return;
  if (field === "muted" || field === "solo") {
    clip[field] = Boolean(value);
    renderEditor();
    return;
  }
  if (["start", "duration", "volume", "fadeIn", "fadeOut", "stretch", "filter", "eq"].includes(field)) {
    clip[field] = Number(value);
  } else {
    clip[field] = value;
  }
  if (field === "start") clip.start = snapEditorTime(clip.start);
  if (field === "duration") clip.duration = Math.max(0.25, clip.duration);
  renderEditor();
  emitProjectContextChange("arrangement", "clip-edited", { summary: `Edited ${clip.name} ${field}` });
}

function splitSelectedEditorClip() {
  const clip = selectedEditorClip();
  if (!clip || clip.duration < 1) return;
  const half = clip.duration / 2;
  const duplicate = { ...clip, id: createId(), start: snapEditorTime(clip.start + half), duration: half, name: `${clip.name} split` };
  if (clip.events?.length) {
    const leftEvents = clip.events.filter((event) => event.time < half);
    const rightEvents = clip.events
      .filter((event) => event.time >= half)
      .map((event) => ({ ...event, time: event.time - half }));
    clip.events = leftEvents;
    duplicate.events = rightEvents;
  }
  clip.duration = half;
  editorState.clips.push(duplicate);
  editorState.selectedClipId = duplicate.id;
  renderEditor();
  emitProjectContextChange("arrangement", "clip-split", { summary: `Split ${clip.name}`, decision: { domain: "Arrangement", action: "Clip split", summary: `Split ${clip.name} at ${formatTime(duplicate.start)}`, initiatedBy: "user" } });
}

function duplicateSelectedEditorClip() {
  const clip = selectedEditorClip();
  if (!clip) return;
  const duplicate = { ...clip, id: createId(), start: snapEditorTime(clip.start + clip.duration), name: `${clip.name} copy`, events: clip.events ? clip.events.map((event) => ({ ...event })) : undefined };
  editorState.clips.push(duplicate);
  editorState.selectedClipId = duplicate.id;
  renderEditor();
  emitProjectContextChange("arrangement", "clip-duplicated", { summary: `Duplicated ${clip.name}`, decision: { domain: "Arrangement", action: "Clip duplicated", summary: `Duplicated ${clip.name}`, initiatedBy: "user" } });
}

function deleteSelectedEditorClip() {
  if (!editorState.selectedClipId) return;
  const removed = selectedEditorClip();
  editorState.clips = editorState.clips.filter((clip) => clip.id !== editorState.selectedClipId);
  editorState.selectedClipId = null;
  renderEditor();
  emitProjectContextChange("arrangement", "clip-deleted", { summary: `Deleted ${removed?.name || "arrangement clip"}`, decision: { domain: "Arrangement", action: "Clip deleted", summary: `Deleted ${removed?.name || "arrangement clip"}`, before: removed ? { id: removed.id, name: removed.name, start: removed.start, duration: removed.duration } : null, initiatedBy: "user" } });
}

function quantizeSelectedEditorClip() {
  const clip = selectedEditorClip();
  if (!clip) return;
  clip.start = snapEditorTime(clip.start);
  if (clip.events?.length) clip.events = quantizePerformanceEvents(clip.events);
  renderEditor();
}

function loopSelectedEditorClip() {
  const clip = selectedEditorClip();
  if (!clip) return;
  clip.loop = !clip.loop;
  if (clip.loop) clip.duration = Math.max(clip.duration, editorSecondsPerBar() * 4);
  renderEditor();
}

async function playEditorArrangement() {
  await AudioEngine.init();
  stopEditorArrangement();
  editorState.playing = true;
  editorState.paused = false;
  document.querySelector("#editorPlay").textContent = "Playing";
  const startAt = AudioEngine.context.currentTime + 0.08;
  const from = editorState.playhead;
  let scheduledCount = 0;
  const hasSolo = editorState.clips.some((clip) => clip.solo);
  const audioClips = editorState.clips
    .filter((clip) => clip.start + clip.duration > from)
    .filter((clip) => !hasSolo || clip.solo)
    .sort((a, b) => a.start - b.start);
  for (const clip of audioClips) {
    if (clip.muted) continue;
    if ((clip.sourceKind === "drums" || clip.type === "drums") && !clip.events?.length) {
      clip.events = createDrumPatternEvents(clip.duration || editorSecondsPerBar() * 4);
    }
    if ((clip.sourceKind === "keys" || clip.type === "keys") && !clip.events?.length) {
      clip.events = createKeysSketchEvents(clip.duration || editorSecondsPerBar() * 4);
    }
    if (clip.sourceKind === "performance" || clip.events?.length) {
      scheduledCount += scheduleEditorPerformanceClip(clip, from, startAt);
      continue;
    }
    const buffer = await resolveEditorClipBuffer(clip);
    if (!buffer) {
      editorStatus(`Could not resolve audio for ${clip.name}. Try loading the source again or dragging the file directly into the Editor.`);
      continue;
    }
    const source = AudioEngine.context.createBufferSource();
    const gain = AudioEngine.context.createGain();
    const filter = AudioEngine.context.createBiquadFilter();
    source.buffer = buffer;
    source.loop = Boolean(clip.loop);
    source.playbackRate.value = 1 / Math.max(0.1, clip.stretch || 1);
    filter.type = "lowpass";
    filter.frequency.value = clip.filter || 16000;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(AudioEngine.masterAnalyser);
    const offset = Math.max(0, from - clip.start + (clip.sourceStart || 0));
    const when = startAt + Math.max(0, clip.start - from);
    const safeOffset = Math.min(offset, Math.max(0, buffer.duration - 0.05));
    const remaining = Math.max(0.05, buffer.duration - safeOffset);
    const requestedDuration = Math.max(0.1, clip.duration - Math.max(0, from - clip.start));
    const playDuration = source.loop ? requestedDuration : Math.min(requestedDuration, remaining);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(clip.volume || 1, when + Math.min(clip.fadeIn || 0.02, playDuration * 0.45));
    if (clip.fadeOut) {
      gain.gain.setValueAtTime(clip.volume || 1, when + Math.max(0, playDuration - clip.fadeOut));
      gain.gain.linearRampToValueAtTime(0.0001, when + playDuration);
    }
    try {
      source.start(when, safeOffset, playDuration);
    } catch (error) {
      editorStatus(`Could not play ${clip.name}: ${error.message || "invalid clip timing"}.`);
      continue;
    }
    source.onended = () => {
      editorState.scheduled = editorState.scheduled.filter((item) => item.source !== source);
    };
    editorState.scheduled.push({ source, gain, filter });
    scheduledCount += 1;
  }
  editorStatus(scheduledCount
    ? `Previewing ${scheduledCount} editor clip${scheduledCount === 1 ? "" : "s"} from ${formatTime(from)}.`
    : `No playable editor clips at ${formatTime(from)}. Select a clip or move the playhead to a clip start.`);
  emitProjectContextChange("arrangement", "playback-started", { summary: `Started arrangement playback at ${formatTime(from)}` });
}

function stopEditorArrangement(options = {}) {
  const wasActive = editorState.playing || editorState.paused || editorState.scheduled.length > 0;
  editorState.scheduled.forEach((item) => {
    try {
      item.source.stop();
    } catch {
      /* Clip may have already stopped. */
    }
  });
  editorState.scheduled = [];
  editorState.playing = false;
  editorState.paused = false;
  const play = document.querySelector("#editorPlay");
  if (play) play.textContent = "Play";
  if (wasActive && !options.silent) emitProjectContextChange("arrangement", "playback-stopped", { summary: "Stopped arrangement playback" });
}

function pauseEditorArrangement() {
  const playhead = editorState.playhead;
  stopEditorArrangement({ silent: true });
  editorState.playhead = playhead;
  editorState.paused = true;
  editorStatus(`Arrangement paused at ${formatTime(playhead)}.`);
  emitProjectContextChange("arrangement", "playback-paused", { summary: `Paused arrangement at ${formatTime(playhead)}` });
}

function addEditorTrack() {
  const index = editorState.tracks.length + 1;
  editorState.tracks.push({ id: createId(), name: `Arrangement Track ${index}`, role: "Layer" });
  renderEditor();
  emitProjectContextChange("arrangement", "track-lane-added", { summary: `Added Arrangement Track ${index}` });
}

function startEditorPerformanceRecording(overdub = false) {
  if (!AudioEngine.context) {
    editorStatus("Start Audio before recording performances.");
    return;
  }
  if (editorState.recording) stopEditorPerformanceRecording();
  const targetTrack = selectedEditorClip()?.trackIndex ?? Math.min(2, editorState.tracks.length - 1);
  editorState.recording = {
    id: createId(),
    startedAt: AudioEngine.context.currentTime,
    timelineStart: editorState.playhead,
    trackIndex: targetTrack,
    overdub,
    events: []
  };
  const record = document.querySelector("#editorRecordPerformance");
  const overdubButton = document.querySelector("#editorOverdubPerformance");
  if (record) record.textContent = "Stop Rec";
  if (record) record.classList.add("is-active");
  if (overdubButton) overdubButton.classList.toggle("is-active", overdub);
  editorStatus(`${overdub ? "Overdub" : "Recording"} performance at ${formatTime(editorState.playhead)}. Play drums, keys, or pads.`);
}

function stopEditorPerformanceRecording() {
  const recording = editorState.recording;
  if (!recording) return;
  editorState.recording = null;
  const record = document.querySelector("#editorRecordPerformance");
  const overdubButton = document.querySelector("#editorOverdubPerformance");
  if (record) record.textContent = "Record Perf";
  if (record) record.classList.remove("is-active");
  if (overdubButton) overdubButton.classList.remove("is-active");
  if (!recording.events.length) {
    editorStatus("Performance recording stopped. No events captured.");
    return;
  }
  const events = quantizePerformanceEvents(recording.events);
  const duration = Math.max(editorSecondsPerBar(), ...events.map((event) => event.time + (event.duration || 0.15))) + 0.1;
  const clip = {
    id: createId(),
    sourceKind: "performance",
    type: inferPerformanceClipType(events),
    name: `${recording.overdub ? "Overdub" : "Performance"} ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
    trackIndex: recording.trackIndex,
    start: recording.timelineStart,
    duration,
    sourceStart: 0,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    stretch: 1,
    loop: false,
    muted: false,
    solo: false,
    filter: 16000,
    eq: 0,
    effect: "none",
    color: editorClipColor(inferPerformanceClipType(events)),
    events
  };
  editorState.clips.push(clip);
  editorState.selectedClipId = clip.id;
  renderEditor();
  editorStatus(`Captured ${events.length} performance event${events.length === 1 ? "" : "s"} as an editable timeline clip.`);
  emitProjectContextChange("arrangement", "performance-recorded", { summary: `Recorded ${clip.name}`, decision: { domain: "Arrangement", action: "Performance recorded", summary: `Captured ${events.length} performance events as ${clip.name}`, after: { clipId: clip.id, eventCount: events.length, duration: clip.duration }, initiatedBy: "user" } });
}

function recordEditorPerformanceEvent(event) {
  const recording = editorState.recording;
  if (!recording || !AudioEngine.context) return;
  recording.events.push({
    ...event,
    time: Math.max(0, AudioEngine.context.currentTime - recording.startedAt),
    velocity: event.velocity ?? 1
  });
}

function performanceQuantizeSeconds() {
  const value = editorState.eventQuantize;
  if (value === "free") return 0;
  if (value === "sixteenth") return 60 / (Number(document.querySelector("#globalBpm")?.value) || 124) / 4;
  if (value === "beat") return editorSecondsPerBar() / 4;
  if (value === "bar") return editorSecondsPerBar();
  return editorSnapSeconds();
}

function quantizePerformanceEvents(events) {
  const grid = performanceQuantizeSeconds();
  return events.map((event) => ({
    ...event,
    time: grid ? Math.max(0, Math.round(event.time / grid) * grid) : event.time
  })).sort((a, b) => a.time - b.time);
}

function inferPerformanceClipType(events) {
  if (events.every((event) => event.kind === "drum")) return "drums";
  if (events.every((event) => event.kind === "key")) return "keys";
  if (events.every((event) => event.kind === "pad")) return "pad";
  return "fx";
}

function createDrumPatternEvents(duration, snapshot = null) {
  const bpm = Number(document.querySelector("#globalBpm")?.value) || 124;
  const stepSeconds = 60 / bpm / 4;
  const model = snapshot || serializeBeatPattern();
  const patternSteps = model.bars * model.stepsPerBar;
  const patternLength = stepSeconds * patternSteps;
  const events = [];
  for (let base = 0; base < duration; base += patternLength) {
    model.rows.forEach((row, rowIndex) => {
      model.pattern[rowIndex].forEach((enabled, step) => {
        if (!enabled) return;
        const time = base + step * stepSeconds + (model.timingOffsets?.[rowIndex]?.[step] || 0) / 1000;
        if (time >= duration) return;
        const tone = row === "Kick" ? drums.kit.kick : row === "Sub" ? drums.kit.sub : row === "Hat" ? drums.kit.hat : row === "Clap" ? drums.kit.clap : drums.kit.snare;
        events.push({
          kind: "drum",
          name: row,
          time,
          velocity: (model.velocities?.[rowIndex]?.[step] || 0.85) * (model.automation?.[rowIndex]?.[step] || 1),
          duration: tone.decay || 0.12,
          kit: model.kit,
          preset: model.preset,
          probability: model.probabilities?.[rowIndex]?.[step] ?? 1,
          timingOffset: model.timingOffsets?.[rowIndex]?.[step] || 0,
          groove: model.groove,
          patternVersion: model.version
        });
      });
    });
  }
  return events.sort((a, b) => a.time - b.time);
}

function createKeysSketchEvents(duration) {
  const preset = getInstrumentPreset();
  const bar = editorSecondsPerBar();
  const chord = instrument.chords.minor7;
  const events = [];
  for (let base = 0; base < duration; base += bar * 2) {
    chord.forEach((offset) => {
      events.push({
        kind: "key",
        midi: preset.root + offset + 12,
        isBass: false,
        time: base,
        duration: Math.min(bar * 1.5, duration - base),
        presetId: preset.id,
        machineId: instrument.machine,
        velocity: 0.62
      });
    });
    events.push({
      kind: "key",
      midi: preset.root - 12,
      isBass: true,
      time: base,
      duration: Math.min(bar, duration - base),
      presetId: preset.id,
      machineId: instrument.machine,
      velocity: 0.78
    });
  }
  return events.filter((event) => event.duration > 0).sort((a, b) => a.time - b.time);
}

function scheduleEditorPerformanceClip(clip, from, startAt) {
  if (!clip.events?.length) {
    editorStatus(`${clip.name} has no playable performance events yet. Record a performance or use a drum/key pattern source.`);
    return 0;
  }
  const clipOffset = Math.max(0, from - clip.start);
  let scheduled = 0;
  clip.events.forEach((event) => {
    if (event.time < clipOffset || event.time > clip.duration) return;
    const when = startAt + Math.max(0, clip.start + event.time - from);
    if (event.kind === "drum") scheduleRecordedDrum(event, when, clip.volume);
    if (event.kind === "key") scheduleRecordedKey(event, when, clip.volume);
    if (event.kind === "pad") scheduleRecordedPad(event, when, clip.volume);
    scheduled += 1;
  });
  return scheduled;
}

function scheduleRecordedDrum(event, when, clipVolume = 1) {
  if (!AudioEngine.context) return;
  playDrumVoice(event.name, when, (event.velocity || 1) * clipVolume);
}

function scheduleRecordedKey(event, when, clipVolume = 1) {
  if (!AudioEngine.context) return;
  const delay = Math.max(0, when - AudioEngine.context.currentTime);
  const preset = instrumentPresets.find((item) => item.id === event.presetId) || getInstrumentPreset();
  const frequency = midiToFrequency(event.midi);
  playSynthVoice(frequency, preset, event.isBass, event.duration || 0.7, delay, (event.velocity || 1) * clipVolume);
}

function scheduleRecordedPad(event, when, clipVolume = 1) {
  const buffer = sampler.buffers[event.padIndex];
  if (!buffer || !AudioEngine.context) return;
  const ctx = AudioEngine.context;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.loop = Boolean(event.loop);
  if (source.loop) {
    source.loopStart = event.regionStart || 0;
    source.loopEnd = event.regionEnd || buffer.duration;
  }
  gain.gain.value = (event.velocity || 1) * 0.9 * clipVolume;
  source.connect(gain);
  gain.connect(AudioEngine.masterAnalyser);
  const duration = Math.max(0.05, (event.regionEnd || buffer.duration) - (event.regionStart || 0));
  if (source.loop) {
    source.start(when, event.regionStart || 0);
    source.stop(when + Math.max(duration, event.duration || duration));
  } else {
    source.start(when, event.regionStart || 0, duration);
  }
  editorState.scheduled.push({ source, gain });
}

function generateEditorAiSuggestions() {
  const output = document.querySelector("#editorAiOutput");
  if (!output) return;
  const context = collectAiContext();
  const bpm = Number(document.querySelector("#globalBpm")?.value) || 124;
  const clipCount = editorState.clips.length;
  const longest = editorState.clips.reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
  const selected = selectedEditorClip();
  const suggestions = [
    {
      title: "Arrangement Flow",
      detail: clipCount
        ? `Current edit runs ${formatTime(longest)} with ${clipCount} clips. Build intro tags before bar 9, main blend around bar 17, and a reset/drop near ${formatTime(longest * 0.62)}.`
        : "Drag a crate song to track 1, then layer stems, pads, drums, and drops on the lower tracks."
    },
    {
      title: "Transitions",
      detail: "Use 4-8 bar overlaps for songs, set fade-outs on outgoing clips, and place echo/filter markers one beat before vocal drops."
    },
    {
      title: "Performance Layers",
      detail: context.pads.length
        ? `Record or place pad chops from ${context.pads.slice(0, 4).map((pad) => pad.name).join(", ")} as rhythmic accents quantized to ${bpm} BPM.`
        : "Send deck selections to pads, then place chops on the Pads/Drops track for MPC-style mixtape movement."
    },
    {
      title: "Selected Clip",
      detail: selected
        ? `For ${selected.name}, try ${selected.type === "song" ? "a slow filter fade and bass swap into the next record" : "shorter timing, bar snap, and a reverb or echo tail"}.`
        : "Select a clip to get timing, fade, and effect-specific suggestions."
    }
  ];
  output.innerHTML = suggestions.map((item) => `
    <div class="ai-step">
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.detail)}</small>
    </div>
  `).join("");
}

function renderRecommendationPromptResponse(prompt, recommendation, steps) {
  aiPlanState = {
    prompt,
    steps,
    tags: {},
    contextVersion: ProjectIntelligenceEngine.getContextVersion(),
    includedContextDomains: ["recommendations"],
    recommendationId: recommendation?.recommendationId || null
  };
  renderAiPlan(aiPlanState);
  document.querySelector("#applyAiPlan").disabled = true;
  document.querySelector("#startAiMix").disabled = true;
  rememberProducerPrompt(prompt);
}

async function handleRecommendationPromptCommand(prompt) {
  if (!recommendationEngineReady || !/suggestion|recommendation|safer transition|everything except/i.test(prompt)) return false;
  const recommendation = RecommendationEngine.resolveReference(prompt);
  const lower = prompt.toLowerCase();
  if (/everything except/.test(lower)) {
    const excluded = /drum|beat/.test(lower) ? "Beat Forge" : /harmony|chord/.test(lower) ? "Harmony Lab" : /pad/.test(lower) ? "Pads" : null;
    const candidates = RecommendationEngine.getRecommendations().filter((item) => item.applyCapability.available && item.domain !== excluded);
    renderRecommendationPromptResponse(prompt, null, [{ title: "Review required", detail: `${candidates.length} applicable recommendation${candidates.length === 1 ? "" : "s"} remain${excluded ? ` after excluding ${excluded}` : ""}. DeckForge will not change several systems from one ambiguous command; apply each reviewed card explicitly.` }, ...candidates.map((item) => ({ title: item.title, detail: `${item.domain}: ${item.summary}` }))]);
    return true;
  }
  if (!recommendation) {
    renderRecommendationPromptResponse(prompt, null, [{ title: "Recommendation not found", detail: "Reference a visible card by number, exact title, or recommendation ID, then try again." }]);
    return true;
  }
  if (/save/.test(lower)) {
    RecommendationEngine.saveRecommendation(recommendation.recommendationId);
    renderRecommendationPromptResponse(prompt, recommendation, [{ title: "Saved for later", detail: `${recommendation.title} remains available in the Saved for Later filter.` }]);
    return true;
  }
  if (/alternative|other option/.test(lower)) {
    const alternatives = recommendation.alternativeActions.length ? recommendation.alternativeActions.map((item) => ({ title: item.label, detail: `Alternative action for ${recommendation.title}.` })) : [{ title: "No additional executable alternative", detail: recommendation.explanation }];
    renderRecommendationPromptResponse(prompt, recommendation, alternatives);
    return true;
  }
  if (/explain|why|beginner/.test(lower)) {
    renderRecommendationPromptResponse(prompt, recommendation, [
      { title: recommendation.title, detail: recommendation.explanation },
      ...recommendation.evidence.map((item) => ({ title: item.label, detail: String(item.value) })),
      ...(recommendation.learningNote ? [{ title: "Learning note", detail: recommendation.learningNote }] : [])
    ]);
    return true;
  }
  if (/preview/.test(lower)) {
    const result = await runContextualRecommendationAction(recommendation.recommendationId, "preview");
    renderRecommendationPromptResponse(prompt, recommendation, [{ title: result?.success ? "Preview started" : "Preview unavailable", detail: result?.result?.message || result?.reason || "The recommendation preview could not start." }]);
    return true;
  }
  if (/apply|accept|do it|use the/.test(lower)) {
    const mode = recommendation.applyCapability.available ? "apply" : "navigate";
    const result = await runContextualRecommendationAction(recommendation.recommendationId, mode);
    renderRecommendationPromptResponse(prompt, recommendation, [{ title: result?.success ? "Recommendation completed" : "Action needs attention", detail: result?.result?.message || result?.message || result?.reason || "The recommendation action could not complete." }]);
    return true;
  }
  renderRecommendationPromptResponse(prompt, recommendation, [{ title: recommendation.title, detail: recommendation.summary }, { title: "Primary action", detail: recommendation.suggestedAction?.label || "Guidance only" }]);
  return true;
}

async function generateAiPlan() {
  const prompt = document.querySelector("#aiPrompt").value.trim();
  if (!prompt) return;
  if (await handleRecommendationPromptCommand(prompt)) return;
  emitProjectContextChange("AI", "prompt-submitted", { summary: "Submitted a Producer Studio prompt", decision: { domain: "AI", action: "Prompt submitted", summary: prompt, initiatedBy: "user" } });
  const includedDomains = selectedPromptContextDomains();
  const intelligenceSummary = ProjectIntelligenceEngine.getContextSummary({ include: ["project", ...includedDomains] });
  intelligenceSummary.recommendations = recommendationEngineReady ? RecommendationEngine.getPromptSummary() : [];
  const context = collectAiContext();
  context.projectIntelligence = intelligenceSummary;
  context.recommendations = intelligenceSummary.recommendations;
  aiPlanState = buildLocalAiPlan(prompt, context);
  aiPlanState.contextVersion = intelligenceSummary.contextVersion;
  aiPlanState.projectContext = intelligenceSummary;
  aiPlanState.includedContextDomains = [...includedDomains];
  rememberProducerPrompt(prompt);
  renderAiPlan(aiPlanState);
  document.querySelector("#applyAiPlan").disabled = false;
  document.querySelector("#startAiMix").disabled = !(aiPlanState.tags.mixtape || aiPlanState.tags.liveSet);
  resetPromptContextDomains();
}

async function analyzeMixtapeInspiration() {
  if (mixtapeReferenceState.tracks.length) {
    await runMixtapeReferenceProjectAnalysis();
    return;
  }
  const selected = selectedCrateItems().filter((item) => item.kind === "local");
  const reference = selected[0] || sourceFiles[0];
  const output = document.querySelector("#mixtapeAnalysisOutput");
  if (!reference) {
    output.textContent = "Load a mixtape in the inspiration upload area, or select a local mixtape in the crate.";
    return;
  }
  output.textContent = `Analyzing ${reference.name} as mixtape inspiration...`;
  const source = sourceFiles.find((item) => item.id === reference.id) || reference;
  const buffer = await getSourceFileBuffer(source.id);
  if (!buffer) {
    output.textContent = "Could not decode the selected mixtape.";
    return;
  }
  await runMixtapeReferenceAnalysis(source, buffer);
}

async function loadMixtapeReferenceFile(file) {
  if (!file) return;
  await loadMixtapeReferenceFiles([file]);
}

async function loadMixtapeReferenceFiles(files) {
  const list = [...files]
    .filter((file) => isSupportedAudioFile(file) || isSupportedImageFile(file))
    .sort((a, b) => fileFolderPath(a).localeCompare(fileFolderPath(b), undefined, { numeric: true, sensitivity: "base" }));
  if (!list.length) return;
  const status = document.querySelector("#mixtapeReferenceStatus");
  const output = document.querySelector("#mixtapeAnalysisOutput");
  if (status) status.textContent = `Loading ${list.length} mixtape reference file${list.length === 1 ? "" : "s"}...`;
  if (output) output.textContent = "Analyzing mixtape project as creative inspiration...";

  const audioFiles = list.filter(isSupportedAudioFile);
  const imageFiles = list.filter(isSupportedImageFile);
  const tracks = [];
  for (const file of audioFiles) {
    const buffer = await loadAudioFile(file);
    tracks.push({
      id: createId(),
      file,
      name: fileFolderPath(file),
      buffer,
      analysis: analyzeAudioBuffer(buffer, fileFolderPath(file)),
      order: inferTrackOrder(fileFolderPath(file), tracks.length)
    });
  }
  tracks.sort((a, b) => a.order - b.order);
  const artwork = imageFiles[0] || null;
  mixtapeReferenceState.file = audioFiles[0] || null;
  mixtapeReferenceState.files = list;
  mixtapeReferenceState.tracks = tracks;
  mixtapeReferenceState.artwork = artwork;
  mixtapeReferenceState.artworkAnalysis = artwork ? await analyzeMixtapeArtwork(artwork) : null;
  mixtapeReferenceState.name = inferMixtapeProjectName(list);
  mixtapeReferenceState.buffer = tracks[0]?.buffer || null;

  if (status) {
    const artText = artwork ? ` and cover art "${fileFolderPath(artwork)}"` : "";
    status.textContent = `${tracks.length} audio file${tracks.length === 1 ? "" : "s"}${artText} loaded as one AI inspiration project. Not added to decks or crate.`;
  }
  if (!tracks.length) {
    if (output) output.textContent = artwork
      ? "Cover art loaded. Add one or more mixtape audio files so the AI can analyze the full reference project."
      : "No supported mixtape audio or artwork files were found.";
    return;
  }
  await runMixtapeReferenceProjectAnalysis();
}

async function runMixtapeReferenceProjectAnalysis() {
  if (!mixtapeReferenceState.tracks.length) return;
  const project = {
    id: "mixtape-reference-project",
    name: mixtapeReferenceState.name,
    tracks: mixtapeReferenceState.tracks,
    artworkAnalysis: mixtapeReferenceState.artworkAnalysis
  };
  const buffer = mixtapeReferenceState.tracks[0].buffer;
  await runMixtapeReferenceAnalysis(project, buffer);
}

async function runMixtapeReferenceAnalysis(source, buffer) {
  const output = document.querySelector("#mixtapeAnalysisOutput");
  if (output) output.textContent = `Analyzing ${source.name} as mixtape inspiration...`;
  const notes = document.querySelector("#mixtapeInspirationNotes").value.trim();
  const referenceAnalysis = source.tracks?.length ? aggregateProjectAnalysis(source.tracks, source.name) : analyzeAudioBuffer(buffer, source.name);
  const structure = source.tracks?.length
    ? await analyzeMixtapeProjectStructure(source, notes, referenceAnalysis)
    : await analyzeMixtapeStructure(buffer, source.name, notes, referenceAnalysis);
  const blueprint = buildMixtapeBlueprint(structure, collectAiContext(), source.id);
  mixtapeInspirationState = { source, referenceAnalysis, structure, blueprint };
  renderMixtapeInspiration(mixtapeInspirationState);
  document.querySelector("#applyMixtapeBlueprint").disabled = false;
  emitProjectContextChange("mixtape", "reference-analyzed", { summary: `Analyzed reference mixtape ${source.name}`, decision: { domain: "AI", action: "Reference mixtape analyzed", summary: `Analyzed ${source.name} for project identity and structure`, after: { name: source.name, genre: structure.genre || null, mood: structure.mood || null }, initiatedBy: "user" } });
}

function inferTrackOrder(name, fallback) {
  const match = name.match(/(?:^|[\s._-])(\d{1,3})(?:[\s._-]|$)/);
  return match ? Number(match[1]) : fallback + 1;
}

function inferMixtapeProjectName(files) {
  const folderPath = files.map(fileFolderPath).find((path) => path.includes("/"));
  if (folderPath) return folderPath.split("/")[0] || "Mixtape Reference Project";
  const audio = files.find(isSupportedAudioFile);
  const base = fileFolderPath(audio || files[0] || { name: "Mixtape Reference" }).split("/")[0];
  return base.replace(/\.[^/.]+$/, "") || "Mixtape Reference Project";
}

async function analyzeMixtapeArtwork(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return {
      fileName: file.name,
      averageColor: "unknown",
      palette: ["unreadable image"],
      mood: "visual reference uploaded",
      era: "unknown visual era",
      typography: "unknown typography",
      imagery: inferArtworkImagery(file.name),
      direction: "Use the uploaded cover as a visual reference when creating the new mixtape identity."
    };
  }
  const canvas = document.createElement("canvas");
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let brightness = 0;
  let saturation = 0;
  const colors = {};
  for (let i = 0; i < pixels.length; i += 16) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    r += red;
    g += green;
    b += blue;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    brightness += max / 255;
    saturation += max ? (max - min) / max : 0;
    const key = `${Math.round(red / 48) * 48},${Math.round(green / 48) * 48},${Math.round(blue / 48) * 48}`;
    colors[key] = (colors[key] || 0) + 1;
  }
  const count = pixels.length / 16;
  const avg = { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
  const topColors = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([color]) => `rgb(${color})`);
  const avgBrightness = brightness / count;
  const avgSaturation = saturation / count;
  return {
    fileName: file.name,
    averageColor: `rgb(${avg.r}, ${avg.g}, ${avg.b})`,
    palette: topColors,
    mood: avgBrightness < 0.35 ? "dark/gritty" : avgSaturation > 0.45 ? "bold/high-energy" : "muted/cinematic",
    era: inferArtworkEra(file.name, avgBrightness, avgSaturation),
    typography: inferArtworkTypography(file.name, avgBrightness, avgSaturation),
    imagery: inferArtworkImagery(file.name),
    direction: `Use ${topColors.join(", ")} color cues, ${avgBrightness < 0.35 ? "shadowy contrast" : "clear cover contrast"}, and ${avgSaturation > 0.45 ? "loud accent colors" : "restrained tonal accents"}.`
  };
}

function inferArtworkEra(name, brightness, saturation) {
  const text = name.toLowerCase();
  if (/90s|classic|tape|cassette|vinyl/.test(text)) return "classic mixtape / physical media";
  if (/blog|datpiff|2000|dvd/.test(text)) return "mid-2000s internet mixtape";
  if (/neon|future|digital|cover/.test(text) || saturation > 0.55) return "modern digital cover";
  return brightness < 0.35 ? "street DVD / underground" : "contemporary playlist cover";
}

function inferArtworkTypography(name, brightness, saturation) {
  if (/explicit|deluxe|hosted|dj/.test(name.toLowerCase())) return "bold title/DJ-host typography";
  if (saturation > 0.55) return "large high-contrast display type";
  if (brightness < 0.35) return "heavy condensed title type";
  return "clean editorial title type";
}

function inferArtworkImagery(name) {
  const text = name.toLowerCase();
  if (/sports|game|championship|arena/.test(text)) return "sports/arena imagery";
  if (/movie|film|cinema|street|hood|block/.test(text)) return "cinematic/street imagery";
  if (/love|rnb|soul|late/.test(text)) return "romantic/nightlife imagery";
  return "artist/scene/collage imagery inferred from cover palette";
}

function aggregateProjectAnalysis(tracks, name) {
  if (!tracks.length) {
    return {
      bpm: 0,
      bpmRange: "unknown BPM range",
      key: "Unknown",
      keyRange: "unknown key range",
      energy: "Medium",
      genre: "Unknown",
      duration: 0,
      loudness: 0
    };
  }
  const bpms = tracks.map((track) => track.analysis.bpm);
  const energies = tracks.map((track) => energyRank(track.analysis.energy));
  const first = tracks[0].analysis || analyzeAudioBuffer(tracks[0].buffer, name);
  return {
    ...first,
    bpm: Math.round(average(bpms)),
    bpmRange: `${Math.min(...bpms)}-${Math.max(...bpms)} BPM`,
    keyRange: [...new Set(tracks.map((track) => track.analysis.key))].slice(0, 6).join(", "),
    energy: average(energies) > 1.35 ? "High" : average(energies) > 0.7 ? "Medium" : "Low",
    genre: first.genre,
    duration: tracks.reduce((sum, track) => sum + track.buffer.duration, 0)
  };
}

async function analyzeMixtapeProjectStructure(project, notes, analysis) {
  const segments = project.tracks.map((track, index) => ({
    index: index + 1,
    start: 0,
    end: track.buffer.duration,
    energy: track.analysis.loudness || 0.1,
    intensity: track.analysis.energy,
    peakDensity: 0,
    name: track.name,
    bpm: track.analysis.bpm,
    key: track.analysis.key,
    genre: track.analysis.genre
  }));
  const joinedText = `${project.name} ${notes} ${project.tracks.map((track) => track.name).join(" ")}`;
  const genreProfile = classifyMixtapeGenre(joinedText, notes, analysis, segments);
  const tags = inferMixtapeCreativeTags(joinedText);
  const transitionStyles = inferMixtapeTransitionStyles(segments, analysis, tags);
  const sampleWorld = inferSampleWorld(joinedText, genreProfile.primary, tags);
  const fingerprintResults = await identifyMixtapeAudio(project.tracks);
  const discovery = buildMixtapeDiscovery(project.tracks, genreProfile, project.artworkAnalysis, notes, fingerprintResults);
  return {
    name: project.name,
    notes,
    theme: inferMixtapeTheme(project.name, notes, { ...analysis, genre: genreProfile.primary }, tags),
    mood: project.artworkAnalysis?.mood || inferMoodFromAnalysis(joinedText, analysis),
    genre: genreProfile.primary,
    genreProfile,
    subgenres: genreProfile.substyles,
    bpm: analysis.bpm,
    bpmRange: analysis.bpmRange,
    key: analysis.key,
    keyRange: analysis.keyRange,
    energyArc: describeProjectEnergyArc(project.tracks),
    segments,
    pacing: inferProjectPacing(project.tracks, analysis),
    harmonicLanguage: inferHarmonicLanguage(analysis, tags),
    transitionStyles,
    tagsAndDrops: tags.drops ? "Frequent DJ tags, hosted drops, callouts, and identity marks." : "Use tasteful identity drops at intro, section turns, and outro.",
    scratches: tags.scratches ? "Scratch phrases and turntable fills are a signature element." : "Use scratches sparingly as punctuation.",
    performanceElements: inferPerformanceElements(tags, transitionStyles),
    sampleWorld,
    motifs: inferRecurringMotifs(notes, tags, { ...analysis, genre: genreProfile.primary }),
    arrangement: `Track-order project: ${project.tracks.length} files sequenced as ${project.tracks.map((track, index) => `${index + 1}. ${track.name}`).join(" / ")}.`,
    effects: inferEffectFrequency(transitionStyles, tags),
    vocalDensity: estimateVocalDensityFromName(joinedText, genreProfile.primary),
    artwork: project.artworkAnalysis,
    fingerprintStatus: fingerprintResults.status,
    detectedTracklist: fingerprintResults.tracklist,
    discovery
  };
}

function describeProjectEnergyArc(tracks) {
  const ranks = tracks.map((track) => energyRank(track.analysis.energy));
  const first = average(ranks.slice(0, Math.ceil(ranks.length / 3)));
  const last = average(ranks.slice(-Math.ceil(ranks.length / 3)));
  if (last > first + 0.4) return "track-by-track build from lower energy into a stronger finish";
  if (first > last + 0.4) return "front-loaded impact followed by cooldown/interlude energy";
  return "balanced project flow with alternating energy chapters";
}

function inferProjectPacing(tracks, analysis) {
  const shortTracks = tracks.filter((track) => track.buffer.duration < 90).length;
  if (shortTracks >= Math.max(2, tracks.length * 0.3)) return "mixtape pacing with skits/interludes and quick connective pieces";
  if (analysis.bpm > 120) return "fast blend pacing with energetic sequencing";
  return "song-focused pacing with room for hooks, verses, and hosted transitions";
}

async function identifyMixtapeAudio(tracks) {
  const perTrack = [];
  let projectOffset = 0;
  for (const track of tracks) {
    perTrack.push({ track, projectOffset, result: await AudioIdentificationService.identifyTrack(track) });
    projectOffset += track.buffer?.duration || 0;
  }
  return {
    status: AudioIdentificationService.status(),
    perTrack,
    tracklist: perTrack.flatMap((item) => item.result.tracklist.map((match) => ({
      ...match,
      sourceTimestamp: match.timestamp,
      sourceDetectedAt: match.detectedAt,
      timestamp: item.projectOffset + match.timestamp,
      detectedAt: formatTime(item.projectOffset + match.timestamp),
      sourceFile: item.track.name
    }))).sort((a, b) => a.timestamp - b.timestamp)
  };
}

function buildMixtapeDiscovery(tracks, genreProfile, artwork, notes, fingerprintResults = null) {
  const context = { genreProfile, artwork, notes, fingerprintResults };
  return tracks.map((track) => identifyMixtapeTrack(track, context));
}

function identifyMixtapeTrack(track, context) {
  const providers = [
    metadataDiscoveryProvider,
    lyricsNotesDiscoveryProvider,
    artworkContextDiscoveryProvider,
    webSearchDiscoveryProvider,
    createFingerprintDiscoveryProvider(context.fingerprintResults)
  ];
  const providerResults = providers.map((provider) => provider.identify(track, context)).filter(Boolean);
  const possibleMatches = providerResults
    .flatMap((result) => result.matches || [])
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);
  const best = possibleMatches[0] || null;
  const confidence = best ? best.confidence : 24;
  const fingerprintConfigured = Boolean(context.fingerprintResults?.status?.configured);
  return {
    name: track.name,
    cleanedName: cleanTrackName(track.name),
    likelyRole: inferProjectTrackRole(track.name, track.buffer.duration || 0),
    metadataClues: extractTrackMetadataClues(track.name),
    confidence,
    status: best?.status || (confidence >= 78 ? "likely" : confidence >= 48 ? "possible" : "needs review"),
    disclaimer: fingerprintConfigured
      ? "Audio recognition provider results are included when available; low-confidence matches remain candidates."
      : "Assisted song discovery only; no audio fingerprint provider is configured yet.",
    providers: providerResults.map((result) => ({
      id: result.id,
      label: result.label,
      status: result.status,
      confidence: result.confidence,
      evidence: result.evidence
    })),
    possibleMatches,
    searchUrl: best?.searchUrl || buildSearchUrl(`${cleanTrackName(track.name)} ${context.genreProfile.primary} mixtape`),
    recommendationSeed: `${cleanTrackName(track.name)} - ${context.genreProfile.substyles.slice(0, 3).join(", ")} - ${context.artwork?.mood || "audio-led mood"}${context.notes ? ` - ${context.notes}` : ""}`
  };
}

const metadataDiscoveryProvider = {
  id: "metadata",
  label: "Metadata / Filename",
  status: "active",
  identify(track, context) {
    const clean = cleanTrackName(track.name);
    const clues = extractTrackMetadataClues(track.name);
    const folder = track.name.includes("/") ? track.name.split("/").slice(0, -1).join(" / ") : "";
    const hasArtistTitle = Boolean(clues.artistGuess && clues.titleGuess);
    const confidence = hasArtistTitle ? 76 : clean.length > 4 ? 52 : 30;
    const query = hasArtistTitle
      ? `${clues.artistGuess} ${clues.titleGuess}`
      : `${clean} ${context.genreProfile.primary}`;
    return {
      id: this.id,
      label: this.label,
      status: this.status,
      confidence,
      evidence: [
        hasArtistTitle ? `artist/title pattern: ${clues.artistGuess} - ${clues.titleGuess}` : `cleaned filename: ${clean}`,
        folder ? `folder context: ${folder}` : "no folder context"
      ],
      matches: [{
        title: clues.titleGuess || clean,
        artist: clues.artistGuess || "Unknown artist",
        source: this.label,
        confidence,
        evidence: hasArtistTitle ? "Filename looks like artist - title metadata." : "Filename provides a searchable title clue.",
        searchUrl: buildSearchUrl(query)
      }]
    };
  }
};

const lyricsNotesDiscoveryProvider = {
  id: "lyrics-notes",
  label: "Lyrics / Cue Notes",
  status: "active",
  identify(track, context) {
    const lyricClues = extractLyricClues(`${context.notes || ""}\n${track.name}`);
    if (!lyricClues.length) {
      return {
        id: this.id,
        label: this.label,
        status: "no clues",
        confidence: 0,
        evidence: ["No lyric, quote, hook, or cue-note clues found."],
        matches: []
      };
    }
    const query = `${lyricClues[0]} lyrics ${context.genreProfile.primary}`;
    return {
      id: this.id,
      label: this.label,
      status: this.status,
      confidence: 58,
      evidence: lyricClues.slice(0, 3),
      matches: [{
        title: lyricClues[0],
        artist: "Unknown artist",
        source: this.label,
        confidence: 58,
        evidence: "Cue notes include lyric/quote-like text that can be searched.",
        searchUrl: buildSearchUrl(query)
      }]
    };
  }
};

const artworkContextDiscoveryProvider = {
  id: "artwork-context",
  label: "Artwork / Project Context",
  status: "active",
  identify(track, context) {
    if (!context.artwork) {
      return {
        id: this.id,
        label: this.label,
        status: "no artwork",
        confidence: 0,
        evidence: ["No cover art uploaded."],
        matches: []
      };
    }
    const clean = cleanTrackName(track.name);
    const query = `${clean} ${context.artwork.era} ${context.artwork.mood} ${context.genreProfile.primary}`;
    return {
      id: this.id,
      label: this.label,
      status: this.status,
      confidence: 42,
      evidence: [`artwork mood: ${context.artwork.mood}`, `visual era: ${context.artwork.era}`, `imagery: ${context.artwork.imagery}`],
      matches: [{
        title: clean,
        artist: "Unknown artist",
        source: this.label,
        confidence: 42,
        evidence: "Artwork narrows likely era, mood, and cultural context, but does not identify audio by itself.",
        searchUrl: buildSearchUrl(query)
      }]
    };
  }
};

const webSearchDiscoveryProvider = {
  id: "web-search",
  label: "Clickable Web Search",
  status: "active",
  identify(track, context) {
    const clean = cleanTrackName(track.name);
    const query = `${clean} ${context.genreProfile.primary} ${context.genreProfile.substyles.slice(0, 2).join(" ")} mixtape`;
    return {
      id: this.id,
      label: this.label,
      status: this.status,
      confidence: 50,
      evidence: ["Creates a focused search query from filename, genre profile, and mixtape context."],
      matches: [{
        title: clean,
        artist: "Search needed",
        source: this.label,
        confidence: 50,
        evidence: "Manual web verification recommended before treating this as an identified song.",
        searchUrl: buildSearchUrl(query)
      }]
    };
  }
};

function createFingerprintDiscoveryProvider(fingerprintResults) {
  return {
    id: "audio-fingerprint",
    label: "True Audio Fingerprint",
    identify(track) {
      const serviceStatus = fingerprintResults?.status || AudioIdentificationService.status();
      const result = fingerprintResults?.perTrack?.find((item) => item.track === track)?.result;
      if (!serviceStatus.configured) {
        return {
          id: this.id,
          label: this.label,
          status: "not configured",
          confidence: 0,
          evidence: [
            "No audio recognition provider is configured, so the analyzer fell back to assisted discovery.",
            "Configure deckforge-id-acrcloud, deckforge-id-audd, deckforge-id-acoustid, or deckforge-id-custom-fingerprint in localStorage with an endpoint to enable provider calls."
          ],
          matches: []
        };
      }
      const matches = result?.tracklist || [];
      if (!matches.length) {
        return {
          id: this.id,
          label: this.label,
          status: "no match",
          confidence: 0,
          evidence: [
            `${result?.segments?.length || 0} audio segments checked; no configured provider returned a usable match.`,
            "Silence, talking-heavy, clipped, and noisy transition windows are skipped before recognition."
          ],
          matches: []
        };
      }
      return {
        id: this.id,
        label: this.label,
        status: "active",
        confidence: Math.max(...matches.map((match) => match.confidence)),
        evidence: matches.map((match) => `${match.status}: ${match.artist} - ${match.title} at ${match.detectedAt}`),
        matches: matches.map((match) => ({
          ...match,
          source: match.provider,
          evidence: `${match.status} fingerprint result from ${match.provider} at ${match.detectedAt}.`
        }))
      };
    }
  };
}

function buildSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildRecognitionSegments(buffer) {
  if (!buffer) return [];
  const segmentLength = buffer.duration > 120 ? 35 : Math.min(30, Math.max(20, buffer.duration * 0.6));
  const step = buffer.duration > 240 ? 75 : 45;
  const candidates = [];
  for (let start = 0; start < Math.max(1, buffer.duration - 8); start += step) {
    const end = Math.min(buffer.duration, start + segmentLength);
    if (end - start < 12) continue;
    const stats = analyzeRecognitionWindow(buffer, start, end);
    if (stats.rms < 0.018) continue;
    if (stats.peakDensity > 0.2 || stats.zeroCrossingRate > 0.32) continue;
    candidates.push({
      start,
      end,
      duration: end - start,
      rms: stats.rms,
      peakDensity: stats.peakDensity,
      zeroCrossingRate: stats.zeroCrossingRate,
      quality: scoreRecognitionWindow(stats)
    });
  }
  const sorted = candidates.sort((a, b) => b.quality - a.quality);
  return sorted.slice(0, 8).sort((a, b) => a.start - b.start);
}

function analyzeRecognitionWindow(buffer, start, end) {
  const data = buffer.getChannelData(0);
  const first = Math.max(0, Math.floor(start * buffer.sampleRate));
  const last = Math.min(data.length, Math.floor(end * buffer.sampleRate));
  let sumSquares = 0;
  let peaks = 0;
  let crossings = 0;
  let previous = data[first] || 0;
  const stride = Math.max(1, Math.floor((last - first) / 12000));
  let count = 0;
  for (let i = first; i < last; i += stride) {
    const value = data[i] || 0;
    sumSquares += value * value;
    if (Math.abs(value) > 0.58) peaks += 1;
    if ((value >= 0 && previous < 0) || (value < 0 && previous >= 0)) crossings += 1;
    previous = value;
    count += 1;
  }
  return {
    rms: Math.sqrt(sumSquares / Math.max(1, count)),
    peakDensity: peaks / Math.max(1, count),
    zeroCrossingRate: crossings / Math.max(1, count)
  };
}

function scoreRecognitionWindow(stats) {
  const levelScore = Math.max(0, 1 - Math.abs(stats.rms - 0.09) / 0.09);
  const peakPenalty = Math.min(0.45, stats.peakDensity * 1.5);
  const noisePenalty = Math.min(0.4, stats.zeroCrossingRate);
  return Math.round((levelScore - peakPenalty - noisePenalty + 0.5) * 100);
}

function normalizeFingerprintMatch(match, provider, segment) {
  const confidence = Math.round(Number(match.confidence ?? match.score ?? 0));
  return {
    title: match.title || match.name || "Unknown title",
    artist: match.artist || match.artists?.join(", ") || "Unknown artist",
    album: match.album || "",
    year: match.year || match.releaseYear || "",
    isrc: match.isrc || match.externalIds?.isrc || "",
    externalIds: match.externalIds || {},
    provider,
    confidence,
    timestamp: segment.start,
    detectedAt: formatTime(segment.start),
    status: confidence >= 85 ? "confirmed" : confidence >= 65 ? "likely" : "possible",
    alternates: match.alternates || [],
    evidence: match.evidence || `Recognized from ${formatTime(segment.start)}-${formatTime(segment.end)} segment.`,
    searchUrl: match.searchUrl || buildSearchUrl(`${match.artist || ""} ${match.title || match.name || ""}`)
  };
}

function aggregateFingerprintMatches(matches) {
  const grouped = new Map();
  matches.forEach((match) => {
    const key = `${match.artist.toLowerCase()}::${match.title.toLowerCase()}`;
    const group = grouped.get(key) || { ...match, detections: [], alternates: [] };
    group.detections.push({ timestamp: match.timestamp, provider: match.provider, confidence: match.confidence });
    group.confidence = Math.max(group.confidence, match.confidence);
    group.timestamp = Math.min(group.timestamp, match.timestamp);
    group.detectedAt = formatTime(group.timestamp);
    group.status = group.confidence >= 85 && group.detections.length > 1 ? "confirmed" : group.confidence >= 65 ? "likely" : "possible";
    group.alternates.push(...(match.alternates || []));
    grouped.set(key, group);
  });
  return [...grouped.values()].sort((a, b) => a.timestamp - b.timestamp);
}

function identificationProviderConfig(id) {
  try {
    return JSON.parse(localStorage.getItem(`deckforge-id-${id}`) || "{}");
  } catch {
    return {};
  }
}

async function postRecognitionRequest(config, payload) {
  if (!config.endpoint) return null;
  const headers = { "Content-Type": "application/json", ...(config.headers || {}) };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Recognition provider returned ${response.status}`);
  return response.json();
}

function createEndpointIdentificationProvider(id, label) {
  return {
    id,
    label,
    isConfigured() {
      const config = identificationProviderConfig(id);
      return Boolean(config.endpoint);
    },
    async identifySegment(clip, segment, track) {
      const config = identificationProviderConfig(id);
      const wav = audioBufferToWav(clip);
      const audioBase64 = await blobToBase64(new Blob([wav], { type: "audio/wav" }));
      const payload = {
        provider: id,
        trackName: track.name,
        timestamp: segment.start,
        duration: segment.duration,
        audio: audioBase64
      };
      const data = await postRecognitionRequest(config, payload);
      return { matches: normalizeProviderMatches(data) };
    }
  };
}

function normalizeProviderMatches(data) {
  if (!data) return [];
  if (Array.isArray(data.matches)) return data.matches;
  if (Array.isArray(data.results)) return data.results;
  if (data.title || data.name) return [data];
  return [];
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

AudioIdentificationService.register(createEndpointIdentificationProvider("acrcloud", "ACRCloud"));
AudioIdentificationService.register(createEndpointIdentificationProvider("audd", "AudD"));
AudioIdentificationService.register(createEndpointIdentificationProvider("custom-fingerprint", "Custom Fingerprint DB"));
AudioIdentificationService.register({
  id: "acoustid",
  label: "AcoustID / Chromaprint",
  isConfigured() {
    const config = identificationProviderConfig("acoustid");
    return Boolean(config.endpoint && config.chromaprintReady);
  },
  async identifySegment(clip, segment, track) {
    const config = identificationProviderConfig("acoustid");
    const wav = audioBufferToWav(clip);
    const audioBase64 = await blobToBase64(new Blob([wav], { type: "audio/wav" }));
    const data = await postRecognitionRequest(config, {
      provider: "acoustid",
      trackName: track.name,
      timestamp: segment.start,
      duration: segment.duration,
      audio: audioBase64
    });
    return { matches: normalizeProviderMatches(data) };
  }
});

function extractLyricClues(text) {
  const quoted = [...text.matchAll(/["“”']([^"“”'\n]{12,120})["“”']/g)].map((match) => match[1].trim());
  const labeled = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /lyric|hook|quote|chant|drop|says|vocal/i.test(line) && line.length > 10)
    .map((line) => line.replace(/^\d{1,2}(?::\d{2}){1,2}\s*-?\s*/, ""));
  return [...new Set([...quoted, ...labeled])].slice(0, 5);
}

function cleanTrackName(name) {
  return name.replace(/\.[^/.]+$/, "").replace(/^\d{1,3}[\s._-]+/, "").replace(/[_-]+/g, " ").trim();
}

function inferProjectTrackRole(name, duration) {
  const text = name.toLowerCase();
  if (/intro|opening/.test(text) || duration < 45) return "intro/drop/skit";
  if (/skit|interlude|outro|speech|quote/.test(text)) return "skit/interlude/dialogue";
  if (/bonus|freestyle/.test(text)) return "bonus/freestyle";
  return "song/blend segment";
}

function extractTrackMetadataClues(name) {
  const clean = cleanTrackName(name);
  const featuring = clean.match(/\b(?:feat|ft)\.?\s+(.+)/i)?.[1] || "";
  const dashParts = clean.split(/\s+-\s+/);
  return {
    artistGuess: dashParts.length > 1 ? dashParts[0] : "",
    titleGuess: dashParts.length > 1 ? dashParts.slice(1).join(" - ") : clean,
    featuring
  };
}

async function analyzeMixtapeStructure(buffer, name, notes, analysis) {
  const segments = analyzeEnergySegments(buffer, 12);
  const energyArc = describeEnergyArc(segments);
  const genreProfile = classifyMixtapeGenre(name, notes, analysis, segments);
  const density = estimateVocalDensityFromName(`${name} ${notes}`, genreProfile.primary);
  const tags = inferMixtapeCreativeTags(`${name} ${notes}`);
  const transitionStyles = inferMixtapeTransitionStyles(segments, analysis, tags);
  const sampleWorld = inferSampleWorld(`${name} ${notes}`, genreProfile.primary, tags);
  const singleTrack = { name, buffer, analysis };
  const fingerprintResults = await identifyMixtapeAudio([singleTrack]);
  const discovery = buildMixtapeDiscovery([singleTrack], genreProfile, null, notes, fingerprintResults);
  return {
    name,
    notes,
    theme: inferMixtapeTheme(name, notes, { ...analysis, genre: genreProfile.primary }, tags),
    mood: inferMoodFromAnalysis(`${name} ${notes}`, analysis),
    genre: genreProfile.primary,
    genreProfile,
    subgenres: genreProfile.substyles,
    bpm: analysis.bpm,
    key: analysis.key,
    energyArc,
    segments,
    pacing: inferMixtapePacing(segments, analysis),
    harmonicLanguage: inferHarmonicLanguage(analysis, tags),
    transitionStyles,
    tagsAndDrops: tags.drops ? "Frequent DJ tags, hosted drops, callouts, and identity marks." : "Use tasteful identity drops at intro, section turns, and outro.",
    scratches: tags.scratches ? "Scratch phrases and turntable fills are a signature element." : "Use scratches sparingly as punctuation.",
    performanceElements: inferPerformanceElements(tags, transitionStyles),
    sampleWorld,
    motifs: inferRecurringMotifs(notes, tags, analysis),
    arrangement: inferArrangementPattern(segments, transitionStyles),
    effects: inferEffectFrequency(transitionStyles, tags),
    vocalDensity: density,
    fingerprintStatus: fingerprintResults.status,
    detectedTracklist: fingerprintResults.tracklist,
    discovery
  };
}

function analyzeEnergySegments(buffer, count = 12) {
  const data = buffer.getChannelData(0);
  const segmentLength = Math.max(1, Math.floor(data.length / count));
  const segments = [];
  for (let i = 0; i < count; i += 1) {
    const start = i * segmentLength;
    const end = Math.min(data.length, start + segmentLength);
    let sum = 0;
    let peaks = 0;
    for (let j = start; j < end; j += 1) {
      const value = Math.abs(data[j]);
      sum += value;
      if (value > 0.42) peaks += 1;
    }
    const energy = sum / Math.max(1, end - start);
    segments.push({
      index: i + 1,
      start: (start / data.length) * buffer.duration,
      end: (end / data.length) * buffer.duration,
      energy,
      intensity: energy > 0.16 ? "High" : energy > 0.08 ? "Medium" : "Low",
      peakDensity: peaks / Math.max(1, end - start)
    });
  }
  return segments;
}

function describeEnergyArc(segments) {
  const first = average(segments.slice(0, 4).map((segment) => segment.energy));
  const middle = average(segments.slice(4, 8).map((segment) => segment.energy));
  const last = average(segments.slice(8).map((segment) => segment.energy));
  if (middle > first * 1.18 && last >= middle * 0.9) return "steady build into a sustained peak";
  if (first > middle && middle < last) return "drop into a reset, then rebuild";
  if (last < first * 0.85) return "front-loaded energy with a cinematic cooldown";
  if (Math.abs(first - last) < 0.02) return "consistent cruising energy";
  return "gradual emotional lift";
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function classifyMixtapeGenre(name, notes, analysis, segments) {
  const text = `${name} ${notes}`.toLowerCase();
  const scores = {
    "Hip-Hop/Rap": 0,
    "R&B/Soul": 0,
    "House/Dance": 0,
    "Jungle/DnB": 0,
    "Reggae/Dancehall": 0,
    "Pop/Open Format": 0
  };
  const evidence = [];
  const add = (genre, amount, reason) => {
    scores[genre] += amount;
    if (reason) evidence.push(`${genre}: ${reason}`);
  };

  if (/hip.?hop|rap|freestyle|mc|bars|verse|cypher|boom.?bap|trap|drill|808|mixtape|hosted|dj clue|funk flex|kid capri|datpiff/.test(text)) add("Hip-Hop/Rap", 6, "metadata/notes include rap, mixtape, DJ host, or substyle cues");
  if (/boom.?bap|breakbeat|sample flip|scratch|turntabl|premier|90s/.test(text)) add("Hip-Hop/Rap", 4, "boom bap, scratch, breakbeat, or sampled-loop language");
  if (/trap|drill|808|hi.?hat|atlanta|memphis|south|bounce|club rap|jersey/.test(text)) add("Hip-Hop/Rap", 4, "trap/drill/808/bounce/club rap cues");
  if (/drop|tag|shout|hosted|radio|exclusive|world premiere|freestyle/.test(text)) add("Hip-Hop/Rap", 3, "hosted mixtape drops and shout-outs are present");
  if (/r&b|rnb|soul|slow jam|sung hook|vocal run|love|ballad/.test(text)) add("R&B/Soul", 5, "R&B/soul vocal or theme cues");
  if (/house|edm|dance|techno|garage|four on the floor|club mix/.test(text)) add("House/Dance", 5, "dance/house metadata cues");
  if (/jungle|dnb|drum.?and.?bass|breakcore/.test(text)) add("Jungle/DnB", 6, "jungle/DnB metadata cues");
  if (/dancehall|reggae|afro|soca|island/.test(text)) add("Reggae/Dancehall", 5, "island/dancehall metadata cues");

  if (analysis.genre.includes("Hip-Hop") || analysis.genre.includes("Trap")) add("Hip-Hop/Rap", 2, "track analyzer leaned rap/open format");
  if (analysis.genre.includes("R&B")) add("R&B/Soul", 2, "track analyzer leaned R&B/soul");
  if (analysis.genre.includes("House")) add("House/Dance", text.match(/rap|hip.?hop|mixtape/) ? 1 : 3, "tempo suggests house/dance, weighted lightly if rap cues exist");
  if (analysis.genre.includes("Jungle")) add("Jungle/DnB", 3, "tempo suggests jungle/DnB");

  const highSegments = segments.filter((segment) => segment.intensity === "High").length;
  if (analysis.bpm >= 132 && /rap|trap|drill|808|mixtape|freestyle|bounce/.test(text)) add("Hip-Hop/Rap", 3, "fast BPM appears with rap/trap/bounce context");
  else if (analysis.bpm >= 118 && analysis.bpm <= 130) add("House/Dance", 1, "BPM sits in dance range, low-confidence without dance metadata");
  if (highSegments >= 6 && /drop|tag|scratch|freestyle|rap/.test(text)) add("Hip-Hop/Rap", 2, "high energy appears with DJ/rap performance cues");

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [primary, primaryScore] = sorted[0];
  const secondScore = sorted[1]?.[1] || 0;
  const confidence = primaryScore >= 9 && primaryScore - secondScore >= 3 ? "High" : primaryScore >= 5 ? "Medium" : "Low";
  const substyles = inferMixtapeSubgenres(text, { genre: primary });
  const uncertainty = confidence === "Low" || primaryScore - secondScore <= 2
    ? `Uncertain: ${primary} and ${sorted[1]?.[0] || "another style"} signals are close. Add notes about artists, era, region, or DJ tags for better accuracy.`
    : "";
  return {
    primary,
    confidence,
    scores,
    scoreSummary: sorted.map(([genre, score]) => `${genre} ${score}`).join(", "),
    substyles,
    explanation: evidence.slice(0, 8),
    uncertainty
  };
}

function inferMixtapeCreativeTags(text) {
  const lower = text.toLowerCase();
  return {
    drops: /drop|tag|host|hosted|shout|clue|flex|capri|radio|station/.test(lower),
    scratches: /scratch|cut|turntab|blend|battle/.test(lower),
    cinematic: /movie|film|cinema|dialogue|quote|scene|trailer/.test(lower),
    sports: /sports|broadcast|commentary|game|arena|championship|nba|nfl|mlb/.test(lower),
    comedy: /comedy|comedian|funny|skit/.test(lower),
    speeches: /speech|interview|sermon|news|politic|documentary/.test(lower),
    street: /street|gritty|mixtape|hood|block|freestyle/.test(lower),
    romantic: /r&b|slow|love|soul|late night/.test(lower)
  };
}

function inferMixtapeTheme(name, notes, analysis, tags) {
  if (tags.cinematic) return "cinematic storytelling with dialogue-led transitions";
  if (tags.sports) return "competitive, arena-style momentum and victory narration";
  if (tags.street) return "street-radio mixtape energy with hosted drops and quick blends";
  if (tags.romantic) return "late-night emotional sequencing with smooth vocal moments";
  return `${analysis.genre} creative identity with ${analysis.energy.toLowerCase()} energy and ${analysis.key} harmonic color`;
}

function inferMixtapeSubgenres(text, analysis) {
  const lower = text.toLowerCase();
  const subgenres = [analysis.genre];
  if (/boom.?bap|90s|premier/.test(lower)) subgenres.push("Boom bap");
  if (/trap|drill|808/.test(lower)) subgenres.push("Trap/Drill");
  if (/r&b|soul|slow jam/.test(lower)) subgenres.push("R&B/Soul");
  if (/dancehall|afro|reggae/.test(lower)) subgenres.push("Island/Afro crossover");
  if (/house|club|dance/.test(lower)) subgenres.push("Club/House");
  return [...new Set(subgenres)];
}

function inferMixtapeTransitionStyles(segments, analysis, tags) {
  const styles = [];
  if (tags.scratches) styles.push("scratch fills", "quick cuts");
  if (tags.drops) styles.push("DJ drop bridges", "radio-style callouts");
  if (analysis.bpm > 120) styles.push("phrase-matched blends", "filter sweeps", "bass swaps");
  if (analysis.bpm < 100) styles.push("echo outs", "vocal-to-instrumental blends", "hook drops");
  if (segments.some((segment) => segment.intensity === "Low")) styles.push("breakdown resets");
  return [...new Set(styles.length ? styles : ["smooth crossfades", "EQ blends", "hook-to-hook transitions"])];
}

function inferSampleWorld(text, genre, tags) {
  const clips = [];
  if (tags.cinematic) clips.push("movie dialogue", "TV scene fragments", "trailer risers");
  if (tags.sports) clips.push("sports commentary", "crowd reactions", "arena announcer lines");
  if (tags.speeches) clips.push("interviews", "speeches", "documentary narration");
  if (tags.comedy) clips.push("comedy skits", "crowd laughter", "character one-liners");
  if (!clips.length) clips.push("DJ tags", "vocal drops", "short dialogue motifs", `${genre} texture beds`);
  return clips;
}

function inferMixtapePacing(segments, analysis) {
  const highs = segments.filter((segment) => segment.intensity === "High").length;
  if (highs >= 6) return "fast, dense, club-ready pacing with short breathers";
  if (analysis.bpm < 95) return "patient, vocal-led pacing with longer blends";
  return "medium pacing with alternating songs, drops, and reset moments";
}

function inferHarmonicLanguage(analysis, tags) {
  if (tags.romantic) return `warm minor/major-adjacent blends centered around ${analysis.key}`;
  if (tags.street) return `dark minor-compatible movement around ${analysis.key}`;
  return `harmonic compatibility around ${analysis.key}, avoiding harsh key jumps during vocal blends`;
}

function inferPerformanceElements(tags, transitionStyles) {
  const elements = [...transitionStyles];
  if (tags.drops) elements.push("signature intro tag", "recurring host ad-lib");
  if (tags.scratches) elements.push("scratch answer phrases");
  return [...new Set(elements)];
}

function inferRecurringMotifs(notes, tags, analysis) {
  const motifs = [];
  if (tags.cinematic) motifs.push("recurring dialogue hook");
  if (tags.sports) motifs.push("scoreboard/countdown motif");
  if (tags.drops) motifs.push("DJ name drop as chapter marker");
  motifs.push(`${analysis.genre} rhythmic motif`);
  return motifs;
}

function inferArrangementPattern(segments, transitionStyles) {
  return `Open with identity/drop, build through ${segments.length} energy chapters, use ${transitionStyles.slice(0, 3).join(", ")} between chapters, then close with callback motif.`;
}

function inferEffectFrequency(transitionStyles, tags) {
  if (tags.drops || tags.scratches) return "High: drops, scratches, echo throws, and filter moves every few transitions.";
  if (transitionStyles.includes("filter sweeps")) return "Medium-high: frequent filters and EQ blending, moderate delay throws.";
  return "Moderate: effects support transitions without overwhelming the songs.";
}

function buildMixtapeBlueprint(structure, context, referenceId) {
  const candidates = context.crate.filter((item) => item.loadable && item.id !== referenceId);
  const selected = candidates.filter((item) => item.selected);
  const pool = selected.length ? selected : candidates;
  const sorted = [...pool].sort((a, b) => {
    const aEnergy = energyRank(a.analysis?.energy);
    const bEnergy = energyRank(b.analysis?.energy);
    return structure.energyArc.includes("build") ? aEnergy - bEnergy : bEnergy - aEnergy;
  });
  const chapters = buildMixtapeChapters(structure, sorted, context);
  return {
    title: `Original mixtape inspired by ${structure.name.replace(/\.[^/.]+$/, "")}`,
    creativeDirection: `Capture ${structure.theme}; primary lane ${structure.genre} (${structure.subgenres.join(", ")}), confidence ${structure.genreProfile.confidence}; keep ${structure.pacing}; use ${structure.sampleWorld.join(", ")} as connective tissue.`,
    trackStrategy: sorted.length
      ? sorted.map((item) => `${item.name}${item.analysis ? ` (${item.analysis.bpm} BPM, ${item.analysis.key}, ${item.analysis.energy})` : ""}`).join(" -> ")
      : "Add more local crate tracks to generate song-specific sequencing. Use loaded decks/pads as temporary source material for now.",
    chapters,
    soundDesign: [
      `DJ drops: ${structure.tagsAndDrops}`,
      `Scratches/performance: ${structure.scratches}`,
      `Effects: ${structure.effects}`,
      `Motifs: ${structure.motifs.join(", ")}`
    ],
    transitionRules: structure.transitionStyles.map((style) => `${style}: use where BPM/key/energy supports the emotional arc`),
    sampleRecommendations: structure.sampleWorld.map((sample) => `Find or record original ${sample} that reinforces "${structure.theme}" without copying the reference.`),
    discoveryPlan: structure.discovery?.length
      ? `${structure.detectedTracklist?.length ? `Fingerprint detected ${structure.detectedTracklist.length} track candidate${structure.detectedTracklist.length === 1 ? "" : "s"}: ${structure.detectedTracklist.map((match) => `${match.status} ${match.artist} - ${match.title} at ${match.detectedAt}`).join("; ")}. ` : ""}${structure.discovery.map((item) => `Assisted discovery for "${item.cleanedName}": ${item.status} (${item.confidence}%). Verify possible matches via fingerprint result, metadata, lyrics/cue notes, folder context, artwork, and web search before using them as confirmed IDs. Then find adjacent songs with ${structure.genre} production, ${item.likelyRole} function, and ${structure.mood} mood. Search: ${item.searchUrl}`).join(" ")}`
      : "Use assisted discovery from metadata, lyrics, filename clues, folder structure, artwork, and web searches. Treat results as candidates until a future audio-fingerprint provider confirms them.",
    artworkPlan: structure.artwork
      ? `Match visual mood: ${structure.artwork.mood}; palette ${structure.artwork.palette.join(", ")}; imagery ${structure.artwork.imagery}; typography ${structure.artwork.typography}.`
      : "Add cover art to guide visual mood, era, palette, typography, and cultural references.",
    padPlan: context.pads.length
      ? context.pads.map((pad) => `Pad ${pad.index + 1}: ${pad.name} (${formatTime(pad.duration)}, ${pad.mode}) as drops/chops`).join("; ")
      : "Create pads for DJ tags, dialogue callbacks, transition risers, scratch phrases, and hook chops.",
    stemPlan: context.stems.length
      ? `Use available stems for acapella bridges and instrumental overlays: ${context.stems.map((stem) => stem.name).join(", ")}.`
      : "Generate stems from 1-2 anchor records for acapella drops, instrumental beds, and bass/drum-only transition tools."
  };
}

function buildMixtapeChapters(structure, tracks, context) {
  const chapterNames = ["Cold Open", "Identity Drop", "First Blend Run", "Energy Lift", "Reset / Skit", "Peak Sequence", "Callback Outro"];
  return chapterNames.map((name, index) => {
    const track = tracks[index % Math.max(1, tracks.length)];
    const segment = structure.segments[Math.min(structure.segments.length - 1, Math.floor((index / chapterNames.length) * structure.segments.length))];
    return {
      title: name,
      detail: track
        ? `${track.name} as anchor. Aim for ${segment.intensity.toLowerCase()} energy, ${structure.transitionStyles[index % structure.transitionStyles.length]} into next section.`
        : `Use deck/pad material for ${segment.intensity.toLowerCase()} energy; add ${structure.sampleWorld[index % structure.sampleWorld.length]} as a thematic bridge.`
    };
  });
}

function renderMixtapeInspiration(state) {
  const output = document.querySelector("#mixtapeAnalysisOutput");
  if (!output) return;
  const { structure, blueprint } = state;
  const discoveryHtml = structure.discovery?.length
    ? structure.discovery.map((item) => `
      <span class="discovery-item">
        <b>${escapeHtml(item.cleanedName)}</b> (${escapeHtml(item.likelyRole)}) - ${escapeHtml(item.status)} / ${item.confidence}%
        <a href="${escapeHtml(item.searchUrl)}" target="_blank" rel="noreferrer">Search web</a>
        <em>${escapeHtml(item.disclaimer)}</em>
        ${item.possibleMatches.length ? `
          <span class="discovery-matches">
            ${item.possibleMatches.map((match) => `
              <span>
                ${escapeHtml(match.artist)} - ${escapeHtml(match.title)}
                <small>${escapeHtml(match.source)} confidence ${match.confidence}%: ${escapeHtml(match.evidence)}</small>
                <a href="${escapeHtml(match.searchUrl)}" target="_blank" rel="noreferrer">Verify</a>
              </span>
            `).join("")}
          </span>
        ` : ""}
        <em>Recommendation seed: ${escapeHtml(item.recommendationSeed)}</em>
      </span>
    `).join("")
    : "";
  const fingerprintStatusHtml = structure.fingerprintStatus
    ? `
      <em>${structure.fingerprintStatus.configured
        ? `Audio fingerprint providers configured: ${structure.fingerprintStatus.providers.filter((provider) => provider.configured).map((provider) => provider.label).join(", ")}.`
        : "No true audio fingerprint provider is configured. Falling back to assisted song discovery."}</em>
      <em>Provider slots: ${structure.fingerprintStatus.providers.map((provider) => `${provider.label} ${provider.configured ? "ready" : "not configured"}`).join(" / ")}</em>
    `
    : "";
  const detectedTracklistHtml = structure.detectedTracklist?.length
    ? structure.detectedTracklist.map((match) => `
      <span class="discovery-item">
        <b>${escapeHtml(match.artist)} - ${escapeHtml(match.title)}</b> ${escapeHtml(match.status)} / ${match.confidence}%
        <em>${escapeHtml(match.album || "Album unknown")}${match.year ? `, ${escapeHtml(match.year)}` : ""}${match.isrc ? ` / ISRC ${escapeHtml(match.isrc)}` : ""}</em>
        <em>${escapeHtml(match.provider)} at ${escapeHtml(match.detectedAt)}${match.sourceFile ? ` in ${escapeHtml(match.sourceFile)}` : ""}</em>
        ${match.alternates?.length ? `<em>Alternates: ${escapeHtml(match.alternates.map((alt) => `${alt.artist || "Unknown"} - ${alt.title || alt.name || "Unknown"}`).join(" / "))}</em>` : ""}
      </span>
    `).join("")
    : "";
  const sections = [
    { title: "Reference Identity", detail: `${structure.theme}. Mood: ${structure.mood}.` },
    { title: "Genre Confidence", detail: `Primary genre: ${structure.genre}. Substyles detected: ${structure.subgenres.join(", ")}. Confidence: ${structure.genreProfile.confidence}. Scores: ${structure.genreProfile.scoreSummary}. ${structure.genreProfile.uncertainty}` },
    { title: "Why This Classification", detail: structure.genreProfile.explanation.join(" ") || "Classification used available audio analysis, filename metadata, and inspiration notes." },
    { title: "Energy & Pacing", detail: `${structure.energyArc}; ${structure.pacing}.` },
    { title: "BPM / Harmony", detail: `${structure.bpmRange || `${structure.bpm} BPM`}, ${structure.keyRange || structure.key}. ${structure.harmonicLanguage}.` },
    { title: "Transitions", detail: structure.transitionStyles.join(", ") },
    { title: "Tags / Drops / Scratches", detail: `${structure.tagsAndDrops} ${structure.scratches}` },
    { title: "Sample World", detail: structure.sampleWorld.join(", ") },
    ...(structure.artwork ? [{ title: "Artwork Identity", detail: `${structure.artwork.fileName}: ${structure.artwork.mood}, ${structure.artwork.era}, ${structure.artwork.typography}. Palette: ${structure.artwork.palette.join(", ")}. ${structure.artwork.direction}` }] : []),
    ...(fingerprintStatusHtml ? [{ title: "Audio Recognition Status", detailHtml: fingerprintStatusHtml }] : []),
    ...(detectedTracklistHtml ? [{ title: "Detected Tracklist", detailHtml: detectedTracklistHtml }] : []),
    ...(discoveryHtml ? [{ title: "Assisted Song Discovery", detailHtml: `<em>Uses true fingerprint results when a provider is configured, then falls back to metadata, filenames, folder structure, artwork context, cue/lyrics notes, and clickable web searches. Unconfirmed results are candidates, not guesses.</em>${discoveryHtml}` }] : []),
    { title: "Arrangement", detail: structure.arrangement },
    { title: "New Mixtape Direction", detail: blueprint.creativeDirection },
    { title: "Track Strategy", detail: blueprint.trackStrategy },
    { title: "Chapters", detail: blueprint.chapters.map((chapter) => `${chapter.title}: ${chapter.detail}`).join(" | ") },
    { title: "Sound Design", detail: blueprint.soundDesign.join(" ") },
    { title: "Pads/Stems", detail: `${blueprint.padPlan} ${blueprint.stemPlan}` }
  ];
  output.innerHTML = sections.map((section) => `
    <div class="ai-step">
      <strong>${escapeHtml(section.title)}</strong>
      <small>${section.detailHtml || escapeHtml(section.detail)}</small>
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function applyMixtapeBlueprintAsPlan() {
  if (!mixtapeInspirationState) return;
  const { structure, blueprint } = mixtapeInspirationState;
  aiPlanState = {
    prompt: `Create a new original mixtape inspired by ${structure.name}.`,
    contextVersion: ProjectIntelligenceEngine.getContextVersion(),
    projectContext: ProjectIntelligenceEngine.getContextSummary(),
    includedContextDomains: selectedPromptContextDomains(),
    tags: { mixtape: true, liveSet: true, chopped: true, stems: true },
    executableActions: buildExecutableDjActions(collectAiContext(), { mixtape: true, liveSet: true, stems: true, searchClip: false }),
    steps: [
      { title: "Creative Identity", detail: blueprint.creativeDirection },
      { title: "Reference Analysis", detail: `${structure.theme}. ${structure.energyArc}. ${structure.transitionStyles.join(", ")}.` },
      { title: "Fresh Track Strategy", detail: blueprint.trackStrategy },
      ...blueprint.chapters,
      { title: "Samples & Drops", detail: blueprint.sampleRecommendations.join(" ") },
      { title: "Discovery & Similar Songs", detail: blueprint.discoveryPlan },
      { title: "Artwork Direction", detail: blueprint.artworkPlan },
      { title: "Pads", detail: blueprint.padPlan },
      { title: "Stems", detail: blueprint.stemPlan },
      { title: "Transition Rules", detail: blueprint.transitionRules.join(" ") }
    ]
  };
  renderAiPlan(aiPlanState);
  document.querySelector("#applyAiPlan").disabled = false;
  document.querySelector("#startAiMix").disabled = false;
}

function buildLocalAiPlan(prompt, context) {
  const text = prompt.toLowerCase();
  const tags = {
    jungle: /jungle|breakbeat|drum.?and.?bass|dnb|goldie|everything but the girl/.test(text),
    house: /house|garage|club|dance|four on the floor|909/.test(text),
    trap: /trap|808|metro|zay|dark/.test(text),
    boomBap: /boom.?bap|premier|dusty|sample|break/.test(text),
    newWave: /new wave|post.?punk|depeche|pet shop|new order|synth.?pop/.test(text),
    soul: /soul|r&b|warm|smooth|gospel/.test(text),
    funk: /funk|clav|groove|slap/.test(text),
    dark: /dark|moody|gritty|menacing|night/.test(text),
    airy: /air|atmos|pad|ambient|dream|wash/.test(text),
    chopped: /chop|stutter|slice|cut|sample/.test(text),
    stems: /stem|separate|isolate|vocal|acapella|drums|bass|guitar|synth/.test(text),
    mixtape: /mixtape|dj clue|funk flex|kid capri|blend|drop|shout|hosted/.test(text),
    liveSet: /live set|dj mix|transition|fade|interpolate|smooth|blend|crossfade/.test(text),
    searchClip: /find|search|clip|sample|quote|lyric|timestamp|from \d|at \d|\d{1,2}:\d{2}/.test(text)
  };
  tags.render = /render|export|finished mix|record/.test(text);
  tags.beatmatch = /beat.?match|sync|tempo match|matched/.test(text);
  tags.interpolate = /interpolate|mash.?up|blend these|vocal drop|instrumental fade/.test(text);
  const bpm = inferPromptBpm(text, tags, context.bpm);
  const drumPreset = pickDrumPreset(tags);
  const drumMachine = pickDrumMachine(tags);
  const synthPreset = pickSynthPreset(tags);
  const synthMachine = pickSynthMachine(tags);
  const stemIdeas = planStemUsage(context, tags);
  const padIdeas = planPadUsage(context, tags);
  const deckIdeas = planDeckUsage(context, tags);
  const crateIdeas = planCrateUsage(context, tags);
  const mixIdeas = planMixUsage(context, tags);
  const analysisIdeas = planAnalysisUsage(context);
  const executableActions = buildExecutableDjActions(context, tags);

  return {
    prompt,
    tags,
    bpm,
    drumPreset,
    drumMachine,
    synthPreset,
    synthMachine,
    executableActions,
    steps: [
      { title: "Track Analysis", detail: analysisIdeas },
      { title: "Tempo & Pocket", detail: `Set tempo to ${bpm} BPM. Use ${drumMachine.name} with ${drumPreset.name} for the rhythmic center.` },
      { title: "Deck Arrangement", detail: deckIdeas },
      { title: "Crate Strategy", detail: crateIdeas },
      { title: "Stems", detail: stemIdeas },
      { title: "Pads", detail: padIdeas },
      { title: "Search & Clip", detail: tags.searchClip ? "The prompt contains a section search request. Apply Plan will search selected/local audio by timestamp or saved cue text and produce clip actions." : "Use Search & Clip for exact timestamps or lyric/quote searches from saved crate cue text." },
      { title: "Mixtape / Live Set", detail: mixIdeas },
      { title: "Executable Actions", detail: executableActions.map((action) => action.label).join(" → ") || "Generate stems, load tracks, or select crate items to unlock executable actions." },
      { title: "Keys & Bass", detail: `Use ${synthMachine.name} with ${synthPreset.name}. ${tags.airy ? "Hold long minor chords and low-pass them under the mix." : "Use short stabs between vocal or drum phrases."}` },
      { title: "Performance Moves", detail: `${tags.chopped ? "Drag-select 1-2 bar phrases from the deck and send them to pads for finger-drumming." : "Use deck In/Out marks to grab hooks and transitions."} Crossfade slowly when changing sections, then scratch only on fills.` }
    ]
  };
}

function inferPromptBpm(text, tags, fallback) {
  const explicit = text.match(/\b([6-9]\d|1[0-8]\d)\s*bpm\b/);
  if (explicit) return Number(explicit[1]);
  if (tags.jungle) return 164;
  if (tags.house) return 124;
  if (tags.trap) return 140;
  if (tags.newWave) return 112;
  if (tags.boomBap) return 92;
  if (tags.soul) return 84;
  if (tags.funk) return 104;
  return fallback;
}

function pickDrumPreset(tags) {
  if (tags.jungle) return drumPresets.find((preset) => preset.id === "jungleBreakbeat");
  if (tags.house) return drumPresets.find((preset) => preset.id === "stadiumSoul");
  if (tags.trap) return drumPresets.find((preset) => preset.id === "atlantaDark808");
  if (tags.soul) return drumPresets.find((preset) => preset.id === "soulFlip");
  if (tags.funk) return drumPresets.find((preset) => preset.id === "virginiaBounce");
  if (tags.newWave) return drumPresets.find((preset) => preset.id === "timbaBounce");
  return drumPresets.find((preset) => preset.id === "boomBapCuts");
}

function pickDrumMachine(tags) {
  if (tags.jungle) return drumMachines.find((machine) => machine.id === "jungleBreaks");
  if (tags.house) return drumMachines.find((machine) => machine.id === "house909");
  if (tags.trap) return drumMachines.find((machine) => machine.id === "analog808");
  if (tags.newWave) return drumMachines.find((machine) => machine.id === "digital707");
  if (tags.funk) return drumMachines.find((machine) => machine.id === "linnPop");
  return drumMachines.find((machine) => machine.id === "spBoomBap");
}

function pickSynthPreset(tags) {
  if (tags.jungle && tags.dark) return instrumentPresets.find((preset) => preset.id === "jungleSub");
  if (tags.jungle) return instrumentPresets.find((preset) => preset.id === "jungleAtmos");
  if (tags.house) return instrumentPresets.find((preset) => preset.id === "houseStabs");
  if (tags.trap) return instrumentPresets.find((preset) => preset.id === "rapKeys");
  if (tags.newWave) return instrumentPresets.find((preset) => preset.id === "newWave");
  if (tags.soul) return instrumentPresets.find((preset) => preset.id === "rnbElectric");
  if (tags.funk) return instrumentPresets.find((preset) => preset.id === "funkClav");
  return instrumentPresets.find((preset) => preset.id === "rapKeys");
}

function pickSynthMachine(tags) {
  if (tags.jungle) return synthMachines.find((machine) => machine.id === "reesePad");
  if (tags.house) return synthMachines.find((machine) => machine.id === "houseOrgan");
  if (tags.newWave) return synthMachines.find((machine) => machine.id === "stringMachine");
  if (tags.trap) return synthMachines.find((machine) => machine.id === "subBass");
  return synthMachines.find((machine) => machine.id === "polyAnalog");
}

function planStemUsage(context, tags) {
  if (!context.stems.length) return "Generate stems first, then use vocals for hooks, drums for fills, bass for low-end support, and guitar/synth stems as texture.";
  const names = context.stems.map((stem) => stem.name).join(", ");
  if (tags.jungle) return `Use these stems: ${names}. Chop vocals into short one-beat calls, keep bass/sub phrases long, and cut drum stems into rapid fills.`;
  if (tags.house) return `Use these stems: ${names}. Loop a vocal phrase every 8 bars, keep bass steady, and use synth/guitar stems as filtered risers.`;
  if (tags.trap) return `Use these stems: ${names}. Pitch vocal chops down for ad-libs, keep bass sparse, and leave room for 808 hits.`;
  return `Use these stems: ${names}. Build contrast by muting everything except vocals and bass before each drop.`;
}

function planPadUsage(context, tags) {
  if (!context.pads.length) return "Send trimmed deck clips or stems to pads, then use pads 1-4 for drums/chops and pads 5-8 for vocals/FX.";
  const pads = context.pads.map((pad) => `${pad.index + 1}: ${pad.name}`).join(", ");
  return `${tags.chopped ? "Finger-drum short chops from" : "Accent transitions with"} loaded pads (${pads}). Stop pads between sections to keep the mix clean.`;
}

function planDeckUsage(context, tags) {
  const loaded = context.decks.filter((deck) => deck.loaded);
  if (!loaded.length) return "Load a main song or stem to Deck A, then load an instrumental, break, or alternate stem to Deck B.";
  if (loaded.length === 1) return `Use ${loaded[0].title} as the main source. Drag-select strong phrases from the waveform, send them to pads, then build drums underneath.`;
  return `Use ${loaded[0].title} as the anchor and ${loaded[1].title} as the response layer. ${tags.chopped ? "Trim hooks into pads and alternate them every 4 bars." : "Crossfade into Deck B for breakdowns and back to Deck A for drops."}`;
}

function planCrateUsage(context, tags) {
  if (!context.crate.length) return "Add local songs to the crate so the AI mix can load them into decks. Saved streaming links can be referenced, but local files work best for stems and Auto Mix.";
  const local = context.crate.filter((item) => item.loadable);
  const linked = context.crate.filter((item) => !item.loadable);
  const localText = local.length ? `Use local crate tracks for deck loading and stems: ${local.map((item) => item.name).join(", ")}.` : "No local crate files are available for automatic deck loading.";
  const linkText = linked.length ? `Reference saved links as inspiration or manually capture them: ${linked.map((item) => item.name).join(", ")}.` : "";
  if (tags.stems) return `${localText} Separate stems from the strongest local crate song first, then sample vocals/drums/bass into pads. ${linkText}`;
  return `${localText} ${linkText}`;
}

function planMixUsage(context, tags) {
  const mixTone = tags.mixtape
    ? "Use mixtape-style quick blends: echo-out moments, vocal drops from pads, scratch fills, and 8-bar call-and-response transitions."
    : "Use smooth live-set transitions: long crossfades, bass swaps, filtered intros, and clean phrase changes.";
  const selected = context.selectedCrate.length ? context.selectedCrate : context.crate;
  const analyzed = selected.filter((item) => item.analysis && !item.analysis.status);
  const available = context.crate.filter((item) => item.loadable).length + context.decks.filter((deck) => deck.loaded).length;
  if (!available) return `${mixTone} Load songs into the crate or decks before starting Auto Mix.`;
  const transitionMap = analyzed.length > 1
    ? ` Suggested order: ${[...analyzed].sort((a, b) => energyRank(a.analysis.energy) - energyRank(b.analysis.energy)).map((item) => `${item.name} (${item.analysis.bpm} BPM, ${item.analysis.key})`).join(" → ")}.`
    : "";
  const blendNote = tags.beatmatch
    ? " Match tempo around the detected BPM, start incoming tracks from intro/cue points, and fade bass out of the outgoing deck before bringing in the next low end."
    : " Use 8-second crossfades with outro-to-intro handoffs.";
  return `${mixTone} Auto Mix can alternate loaded deck tracks and local crate files, fading between Deck A and Deck B.${transitionMap}${blendNote} Use pads as drops over transition points.`;
}

function planAnalysisUsage(context) {
  const selected = context.selectedCrate.length ? context.selectedCrate : context.crate;
  if (!selected.length) return "Select crate tracks and click Analyze Selected so the AI can estimate BPM, key, energy, genre, intro, and outro regions.";
  const analyzed = selected.filter((item) => item.analysis && !item.analysis.status);
  if (!analyzed.length) return "Selected tracks are not analyzed yet. Click Analyze Selected for BPM/key/energy estimates before generating detailed transitions.";
  return analyzed.map((item) => `${item.name}: ${analysisSummary(item.analysis)}`).join(" | ");
}

function buildExecutableDjActions(context, tags) {
  const actions = [];
  const selected = context.selectedCrate.filter((item) => item.kind === "local");
  if (selected.length) {
    actions.push({ type: "load-sequence", label: `Load selected crate sequence (${selected.map((item) => item.name).join(", ")})` });
  }
  if (tags.stems) {
    actions.push({ type: "separate-stems", label: "Separate stems for the first selected/local/deck track" });
  }
  if (tags.mixtape || tags.liveSet || tags.beatmatch || tags.interpolate) {
    actions.push({ type: "auto-mix", label: tags.mixtape ? "Start mixtape-style Auto Mix with fast blends and drops" : "Start live-set Auto Mix with smooth crossfades" });
  }
  if (tags.interpolate) {
    actions.push({ type: "blend", label: "Blend two tracks with instrumental fade and vocal/drop cue planning" });
  }
  if (tags.render) {
    actions.push({ type: "record", label: "Use Record Mix while Auto Mix runs, then download the rendered performance" });
  }
  return actions;
}

function renderAiPlan(plan) {
  const output = document.querySelector("#aiPlanOutput");
  output.innerHTML = `
    <div class="ai-step">
      <strong>Project Context</strong>
      <small>Context v${plan.contextVersion ?? "N/A"} · ${(plan.includedContextDomains || []).join(", ") || "Project only"}</small>
    </div>
    <div class="ai-step">
      <strong>Direction</strong>
      <small>${plan.prompt}</small>
    </div>
    ${plan.steps.map((step) => `
      <div class="ai-step">
        <strong>${step.title}</strong>
        <small>${step.detail}</small>
      </div>
    `).join("")}
  `;
}

async function applyAiPlan(options = {}) {
  if (!aiPlanState) return;
  if (!options.force && !ProjectIntelligenceEngine.isContextVersionCurrent(aiPlanState.contextVersion)) {
    showStaleRecommendationDialog({
      label: "Prompt Studio plan",
      recalculate: () => generateAiPlan(),
      applyAnyway: () => applyAiPlan({ force: true })
    });
    return;
  }
  document.querySelector("#drumMachine").value = aiPlanState.drumMachine.id;
  applyDrumPreset(aiPlanState.drumPreset.id);
  document.querySelector("#globalBpm").value = aiPlanState.bpm;
  instrument.machine = aiPlanState.synthMachine.id;
  instrument.preset = aiPlanState.synthPreset.id;
  document.querySelector("#synthMachine").value = instrument.machine;
  document.querySelector("#instrumentPreset").value = instrument.preset;
  updateInstrumentNotes();
  renderAiContext();
  await loadSelectedCrateToDecks();
  if (aiPlanState.tags.stems) {
    const ready = await preparePromptStemSplit();
    if (ready) {
      switchView("stems");
      splitCurrentStemFile();
    }
  }
  if (aiPlanState.tags.searchClip) {
    document.querySelector("#aiSectionSearch").value = aiPlanState.prompt;
    await searchAudioSections();
  }
  if (aiPlanState.tags.mixtape || aiPlanState.tags.liveSet) {
    document.querySelector("#startAiMix").disabled = false;
  }
  emitProjectContextChange("AI", "prompt-plan-applied", { summary: "Applied a Prompt Studio plan", decision: { domain: "AI", action: "Prompt applied", summary: aiPlanState.prompt, initiatedBy: "user", after: { contextVersion: ProjectIntelligenceEngine.getContextVersion(), bpm: aiPlanState.bpm } } });
  renderProducerStudio({ sync: false });
}

async function preparePromptStemSplit() {
  const selectedLocal = selectedCrateItems().find((item) => item.kind === "local");
  const local = selectedLocal ? sourceFiles.find((source) => source.id === selectedLocal.id) : sourceFiles[0];
  if (local) {
    const buffer = await getSourceFileBuffer(local.id);
    stemState.file = local.file;
    stemState.sourceBuffer = buffer;
    stemState.sourceName = local.name.replace(/\.[^/.]+$/, "");
    stemState.stems = [];
    document.querySelector("#splitStems").disabled = false;
    document.querySelector("#stemStatus").textContent = `AI prompt loaded ${local.name}. Click Split Stems to isolate it.`;
    renderStemResults();
    return true;
  }
  const selectedSaved = selectedCrateItems().find((item) => item.kind === "saved");
  const savedSources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
  const savedCandidate = selectedSaved ? savedSources[selectedSaved.index] : savedSources[0];
  if (savedCandidate) {
    try {
      const buffer = await loadAudioFromUrl(savedCandidate.url);
      stemState.file = null;
      stemState.sourceBuffer = buffer;
      stemState.sourceName = savedCandidate.name;
      stemState.stems = [];
      document.querySelector("#splitStems").disabled = false;
      document.querySelector("#stemStatus").textContent = `AI prompt loaded ${savedCandidate.name}. Splitting direct audio URL.`;
      renderStemResults();
      return true;
    } catch {
      document.querySelector("#stemStatus").textContent = "AI prompt found crate links, but they are not direct audio. Drop a local file or use tab capture for stem splitting.";
    }
  }
  const deck = deckState.a.buffer ? deckState.a : deckState.b;
  if (deck.buffer) {
    stemState.file = null;
    stemState.sourceBuffer = deck.buffer;
    stemState.sourceName = `Deck ${deck.id.toUpperCase()}`;
    stemState.stems = [];
    document.querySelector("#splitStems").disabled = false;
    document.querySelector("#stemStatus").textContent = `AI prompt loaded Deck ${deck.id.toUpperCase()} for stem splitting.`;
    renderStemResults();
    return true;
  }
  return false;
}

async function loadSelectedCrateToDecks() {
  const selectedLocal = selectedCrateItems().filter((item) => item.kind === "local").slice(0, 2);
  for (let index = 0; index < selectedLocal.length; index += 1) {
    const deckId = index === 0 ? "a" : "b";
    const buffer = await getSourceFileBuffer(selectedLocal[index].id);
    if (buffer) loadBufferToDeck(buffer, selectedLocal[index].name, deckId);
  }
}

function readSmartPromptStorage() {
  try { smartPromptState.history = JSON.parse(localStorage.getItem(SMART_PROMPT_HISTORY_KEY) || "[]"); } catch { smartPromptState.history = []; }
  try { smartPromptState.recipes = JSON.parse(localStorage.getItem(SMART_PROMPT_RECIPES_KEY) || "[]"); } catch { smartPromptState.recipes = []; }
  try { Object.assign(tempoSafetyPreferences, JSON.parse(localStorage.getItem(TEMPO_SAFETY_PREFERENCES_KEY) || "{}")); } catch { /* Use safe defaults. */ }
}

function writeSmartPromptStorage() {
  localStorage.setItem(SMART_PROMPT_HISTORY_KEY, JSON.stringify(smartPromptState.history.slice(0, 12)));
  localStorage.setItem(SMART_PROMPT_RECIPES_KEY, JSON.stringify(smartPromptState.recipes.slice(0, 12)));
}

function writeTempoSafetyPreferences() {
  localStorage.setItem(TEMPO_SAFETY_PREFERENCES_KEY, JSON.stringify(tempoSafetyPreferences));
}

function renderTempoSafetyPreferences() {
  const values = {
    safetyPreferredShift: tempoSafetyPreferences.preferredShift,
    safetyWarningThreshold: tempoSafetyPreferences.warningThreshold,
    safetyAbsoluteMaximum: tempoSafetyPreferences.absoluteMaximumShift,
    safetyLargeTransition: tempoSafetyPreferences.largeMismatchTransition,
    safetyTransitionPreference: tempoSafetyPreferences.transitionPreference
  };
  Object.entries(values).forEach(([id, value]) => { const element = document.querySelector(`#${id}`); if (element) element.value = value; });
  const checks = {
    safetyAutoSuggest: tempoSafetyPreferences.automaticallySuggest,
    safetyAutoExecute: tempoSafetyPreferences.automaticallyExecute,
    safetyAskReplace: tempoSafetyPreferences.askBeforeReplacing,
    safetyHalfDouble: tempoSafetyPreferences.allowHalfDouble,
    safetyBridgeSuggestions: tempoSafetyPreferences.allowBridgeSuggestions,
    safetyPreserveIncoming: tempoSafetyPreferences.preserveIncomingBpm
  };
  Object.entries(checks).forEach(([id, value]) => { const element = document.querySelector(`#${id}`); if (element) element.checked = value; });
  const promptMaximum = document.querySelector("#promptMaxShift");
  if (promptMaximum) {
    const value = String(tempoSafetyPreferences.absoluteMaximumShift);
    if (![...promptMaximum.options].some((option) => option.value === value)) promptMaximum.add(new Option(`${value}%`, value));
    promptMaximum.value = value;
  }
}

function analyzeTempoRelationship(outgoingBpm, incomingBpm, outgoingAnalysis = {}, incomingAnalysis = {}) {
  const outgoing = Number(outgoingBpm || 0);
  const incoming = Number(incomingBpm || 0);
  if (!outgoing || !incoming || !tempoSafetyPreferences.allowHalfDouble) return { supported: false, effectiveIncomingBpm: incoming, label: "No subdivision interpretation" };
  const lower = Math.min(outgoing, incoming);
  const higher = Math.max(outgoing, incoming);
  const doubleTolerance = Math.abs(higher / 2 - lower) / lower;
  const rhythmicEnough = outgoingAnalysis.percussionIntensity !== "Low" && incomingAnalysis.percussionIntensity !== "Low";
  if (lower >= 60 && lower <= 100 && higher >= 120 && higher <= 190 && doubleTolerance <= 0.035 && rhythmicEnough) {
    const effectiveIncomingBpm = incoming > outgoing ? incoming / 2 : incoming * 2;
    return { supported: true, effectiveIncomingBpm, label: incoming > outgoing ? `Halftime interpretation: ${incoming.toFixed(1)} BPM treated as ${(incoming / 2).toFixed(1)} BPM` : `Double-time interpretation: ${incoming.toFixed(1)} BPM treated as ${(incoming * 2).toFixed(1)} BPM`, tolerancePercent: doubleTolerance * 100 };
  }
  return { supported: false, effectiveIncomingBpm: incoming, label: "No musically reliable halftime or double-time relationship" };
}

function evaluateTempoSafety(plan) {
  const outgoing = deckState[plan.activeDeck];
  const incoming = deckState[plan.incomingDeck];
  const outgoingBpm = Number(outgoing?.analysis?.bpm || plan.temporaryIncomingBpm || 0) * Number(document.querySelector(`#pitch-${plan.activeDeck}`)?.value || 1);
  const incomingBpm = Number(incoming?.analysis?.bpm || plan.originalIncomingBpm || 0);
  const relationship = analyzeTempoRelationship(outgoingBpm, incomingBpm, outgoing?.analysis, incoming?.analysis);
  const effectiveIncoming = relationship.supported ? relationship.effectiveIncomingBpm : incomingBpm;
  const requiredPlaybackShift = effectiveIncoming ? Math.abs((outgoingBpm / effectiveIncoming - 1) * 100) : 0;
  const absoluteDifference = Math.abs(incomingBpm - outgoingBpm);
  const bpmDifferencePercent = outgoingBpm ? absoluteDifference / outgoingBpm * 100 : 0;
  const level = requiredPlaybackShift > tempoSafetyPreferences.absoluteMaximumShift ? "extreme" : requiredPlaybackShift > tempoSafetyPreferences.warningThreshold ? "large" : requiredPlaybackShift > tempoSafetyPreferences.preferredShift ? "moderate" : "safe";
  return { outgoingBpm, incomingBpm, effectiveIncomingBpm: effectiveIncoming, requiredPlaybackShift, absoluteDifference, bpmDifferencePercent, relationship, level, configuredLimit: tempoSafetyPreferences.absoluteMaximumShift };
}

function supportedPromptStyle(text) {
  if (/quick|cut|open.?format/.test(text)) return { style: "quick-blend", label: "Quick blend" };
  if (/bass\s*swap/.test(text)) return { style: "bass-swap-phrase", label: "Bass swap" };
  if (/drop\s*mix/.test(text)) return { style: "drop-mix", label: "Drop mix" };
  if (/filter/.test(text)) return { style: "filter-sweep", label: "Filter fade" };
  if (/long|slow|smooth|blend/.test(text)) return { style: /long|slow/.test(text) ? "long-dissolve" : "smooth-crossfade", label: /long|slow/.test(text) ? "Long dissolve" : "Smooth blend" };
  return { style: "smooth-crossfade", label: "Smooth blend" };
}

function parseClockTimestamp(value) {
  const parts = String(value || "").split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function parsePromptTiming(text, activeDeck, activeBpm) {
  const deck = deckState[activeDeck];
  const currentTime = deck.buffer ? currentDeckTime(activeDeck) : 0;
  const duration = deck.buffer?.duration || 0;
  const cueMatch = text.match(/deck\s*([ab])(?:'s)?\s+(\d{1,2}:\d{2})\s+cue/);
  const incomingCueTime = cueMatch ? parseClockTimestamp(cueMatch[2]) : null;
  const relativeEnd = text.match(/(\d+)\s*seconds?\s+before\s+(?:deck\s*[ab]|this\s+(?:track|song)|(?:the\s+)?(?:track|song))?\s*ends?/);
  const beforeClock = text.match(/(?:begin\s+fading|transition|start\s+fading)\s+(\d+)\s*seconds?\s+before\s+(\d{1,2}(?::\d{2}){1,2})/);
  const clockMatches = [...text.matchAll(/\b(\d{1,2}(?::\d{2}){1,2})\b/g)].filter((match) => !cueMatch || match[0] !== cueMatch[2]);
  const natural = text.match(/(\d+)\s*minutes?(?:\s*(?:and\s*)?(\d+)\s*seconds?)?/);
  const relativeSeconds = text.match(/(?:in|after)\s+(\d+)\s*seconds?/);
  const secondMark = text.match(/(?:at\s+(?:the\s+)?|reaches?\s+)(\d+)\s*(?:-|\s)seconds?(?:\s+mark)?/);
  let targetPlaybackTime = null;
  let triggerType = "bars";
  let timestampBasis = "active-deck-playback";
  let interpretation = "Using the requested bar estimate on the active deck.";
  let parsedTimestamp = null;
  if (relativeEnd && duration) {
    targetPlaybackTime = Math.max(0, duration - Number(relativeEnd[1]));
    triggerType = "before-end";
    parsedTimestamp = targetPlaybackTime;
    interpretation = `Begin transitioning ${relativeEnd[1]} seconds before Deck ${activeDeck.toUpperCase()} ends.`;
  } else if (beforeClock) {
    const base = parseClockTimestamp(beforeClock[2]);
    targetPlaybackTime = Math.max(0, base - Number(beforeClock[1]));
    triggerType = "absolute-timestamp";
    parsedTimestamp = base;
    interpretation = `Begin fading ${beforeClock[1]} seconds before Deck ${activeDeck.toUpperCase()} reaches ${formatTime(base)}.`;
  } else if (relativeSeconds) {
    targetPlaybackTime = currentTime + Number(relativeSeconds[1]);
    triggerType = "relative-seconds";
    timestampBasis = "delay-from-now";
    interpretation = `Begin transitioning ${relativeSeconds[1]} seconds from the current Deck ${activeDeck.toUpperCase()} position.`;
  } else if (clockMatches.length) {
    targetPlaybackTime = parseClockTimestamp(clockMatches[0][1]);
    triggerType = "absolute-timestamp";
    parsedTimestamp = targetPlaybackTime;
    interpretation = `Begin transitioning when Deck ${activeDeck.toUpperCase()} reaches ${formatTime(targetPlaybackTime)}.`;
  } else if (natural) {
    targetPlaybackTime = Number(natural[1]) * 60 + Number(natural[2] || 0);
    triggerType = "absolute-timestamp";
    parsedTimestamp = targetPlaybackTime;
    interpretation = `Begin transitioning when Deck ${activeDeck.toUpperCase()} reaches ${formatTime(targetPlaybackTime)}.`;
  } else if (secondMark) {
    targetPlaybackTime = Number(secondMark[1]);
    triggerType = "absolute-timestamp";
    parsedTimestamp = targetPlaybackTime;
    interpretation = `Begin transitioning when Deck ${activeDeck.toUpperCase()} reaches ${formatTime(targetPlaybackTime)}.`;
  }
  const secondsRemaining = targetPlaybackTime === null ? phraseLengthSeconds(activeBpm, 16) : targetPlaybackTime - currentTime;
  return { triggerType, timestampBasis, targetPlaybackTime, currentPlaybackTime: currentTime, secondsRemaining, interpretation, parsedTimestamp, incomingCueTime, duration, relativeDelaySeconds: relativeSeconds ? Number(relativeSeconds[1]) : null };
}

function parseSmartMixPrompt(rawPrompt) {
  const prompt = String(rawPrompt || "").trim();
  const text = prompt.toLowerCase();
  const explicitOutgoingDeck = text.match(/deck\s*([ab])\s+(?:reaches|ends|is playing)/)?.[1]?.toLowerCase();
  const activeDeck = explicitOutgoingDeck || detectActiveDeck() || "a";
  const requestedDeck = text.match(/(?:into|to|use|bring in|start)\s+deck\s*([ab])/i)?.[1]?.toLowerCase();
  const incomingDeck = requestedDeck || (activeDeck === "a" ? "b" : "a");
  const active = deckState[activeDeck];
  const incoming = deckState[incomingDeck];
  const activeRatio = Number(document.querySelector(`#pitch-${activeDeck}`)?.value || 1);
  const activeBpm = Number(active.analysis?.bpm || document.querySelector("#globalBpm")?.value || 120) * activeRatio;
  const originalIncomingBpm = Number(incoming.analysis?.bpm || 0);
  const tempoRelationship = analyzeTempoRelationship(activeBpm, originalIncomingBpm, active.analysis, incoming.analysis);
  const normalizedIncomingBpm = originalIncomingBpm ? tempoRelationship.effectiveIncomingBpm : 0;
  const rawShift = normalizedIncomingBpm ? (activeBpm / normalizedIncomingBpm - 1) * 100 : 0;
  const shiftPercent = Math.abs(rawShift);
  const absoluteBpmDifference = Math.abs(originalIncomingBpm - activeBpm);
  const bpmDifferencePercent = activeBpm ? absoluteBpmDifference / activeBpm * 100 : 0;
  const explicitBars = Number(text.match(/(?:in|wait|after)\s+(4|8|16|32)\s*bars?/)?.[1] || 0);
  let barsUntilTransition = explicitBars || 16;
  let transitionTrigger = explicitBars ? `In ${explicitBars} bars` : "Next estimated 16-bar boundary";
  let targetSection = "Beat-grid estimate";
  const warnings = [];
  const unsupported = [];
  const phraseRequest = /chorus|verse|hook|breakdown|instrumental section/.test(text);
  if (/next\s+bar/.test(text)) { barsUntilTransition = 1; transitionTrigger = "Next bar"; }
  if (/outro/.test(text)) {
    targetSection = "Estimated outro";
    const remaining = active.buffer ? Math.max(1, active.buffer.duration - currentDeckTime(activeDeck) - 12) : phraseLengthSeconds(activeBpm, 16);
    barsUntilTransition = Math.max(1, Math.round(remaining / phraseLengthSeconds(activeBpm, 1)));
    transitionTrigger = "Estimated outro boundary";
    warnings.push("Reliable outro detection is unavailable, using the analyzed mix-out estimate.");
  } else if (/before (?:this )?(?:track|song) ends?|before.*ends?/.test(text)) {
    targetSection = "Before track end";
    const remaining = active.buffer ? Math.max(1, active.buffer.duration - currentDeckTime(activeDeck) - 10) : phraseLengthSeconds(activeBpm, 8);
    barsUntilTransition = Math.max(1, Math.round(remaining / phraseLengthSeconds(activeBpm, 1)));
    transitionTrigger = "Before track end estimate";
  } else if (phraseRequest) {
    const section = text.match(/chorus|verse|hook|breakdown|instrumental section/)?.[0] || "section";
    targetSection = `Next ${section} estimate`;
    transitionTrigger = `Next ${barsUntilTransition}-bar boundary`;
    warnings.push(`${section[0].toUpperCase() + section.slice(1)} detection is unavailable, using the next ${barsUntilTransition}-bar boundary.`);
  }
  const style = supportedPromptStyle(text);
  if (/echo/.test(text)) { unsupported.push("True echo processing is not available yet"); warnings.push("Echo-out is unavailable, using a quick filter-assisted blend."); style.style = "filter-sweep"; style.label = "Filter-assisted quick blend"; }
  if (/acapella|stem\s*swap/.test(text)) unsupported.push("Independent stem routing is not available in Smart Mix");
  if (/keep.*vocal.*over|vocal.*over.*intro/.test(text)) { unsupported.push("Outgoing vocal overlays require independent stem routing"); warnings.push("Vocal overlay routing is unavailable, using a full-mix blend."); }
  if (/loop transition/.test(text)) unsupported.push("Automated loop transitions are not available yet");
  const blendBars = Number(text.match(/(4|8|16|32)[- ]bar\s+(?:blend|transition|mix)/)?.[1] || (/quick|cut/.test(text) ? 4 : /long|slow/.test(text) ? 16 : 8));
  const timing = parsePromptTiming(text, activeDeck, activeBpm);
  if (timing.targetPlaybackTime !== null) {
    const blendSeconds = phraseLengthSeconds(activeBpm, blendBars);
    if (/complete\s+(?:the\s+)?transition\s+by/.test(text)) {
      timing.targetPlaybackTime = Math.max(0, timing.targetPlaybackTime - blendSeconds);
      timing.secondsRemaining = timing.targetPlaybackTime - timing.currentPlaybackTime;
      timing.interpretation = `Begin the blend early enough to complete it by ${formatTime(timing.parsedTimestamp)} on Deck ${activeDeck.toUpperCase()}.`;
    }
    transitionTrigger = timing.interpretation;
    targetSection = "Concrete playback timestamp";
    barsUntilTransition = Math.max(1, Math.round(Math.max(0, timing.secondsRemaining) / phraseLengthSeconds(activeBpm, 1)));
  }
  const recoveryRequested = /return|original bpm|natural tempo|bpm recovery/.test(text) || !/keep incoming.*tempo|no bpm recovery/.test(text);
  const recoveryBars = Number(text.match(/(?:return|recover|original bpm|natural tempo)[^.!]*?(?:over|in)\s+(2|4|8|16)\s*bars?/)?.[1] || 8);
  const recoveryStartBars = Number(text.match(/(?:after|wait)\s+(4|8|16)\s*bars?[^.!]*?(?:return|recover)/)?.[1] || 0);
  const curve = /linear/.test(text) ? "linear" : /ease in/.test(text) ? "ease-in" : /ease out/.test(text) ? "ease-out" : /phrase.?step/.test(text) ? "phrase-stepped" : "smooth";
  const avoidVocalOverlap = /avoid.*vocal|no vocal.*overlap|after the vocal/.test(text);
  if (avoidVocalOverlap && !stemState.stems.length) warnings.push("Vocal clash avoidance uses density estimates because prepared stems are unavailable.");
  const forceTrackSelection = /pick|choose|from ditc|next compatible/.test(text);
  const incomingTrackSource = incoming.buffer && !forceTrackSelection ? `Loaded Deck ${incomingDeck.toUpperCase()}` : forceTrackSelection ? "DITC selection" : smartMixSourceLabel(document.querySelector("#smartMixSource")?.value || "both");
  if (!incoming.buffer && !forceTrackSelection) warnings.push(`Deck ${incomingDeck.toUpperCase()} is empty. Smart Mix will select from ${incomingTrackSource}.`);
  if (!originalIncomingBpm && incoming.buffer) warnings.push("Incoming BPM is unavailable, so temporary BPM matching cannot be planned safely.");
  let safety = "Normal";
  if (tempoRelationship.supported) warnings.push(tempoRelationship.label);
  if (shiftPercent > tempoSafetyPreferences.preferredShift) { safety = "Moderate"; warnings.push(`Temporary tempo shift is ${shiftPercent.toFixed(1)}%, above the preferred ${tempoSafetyPreferences.preferredShift}% range.`); }
  if (shiftPercent > tempoSafetyPreferences.warningThreshold) { safety = "Large"; warnings.push(`The BPM difference exceeds the ${tempoSafetyPreferences.warningThreshold}% warning threshold. A safer transition is recommended.`); }
  if (shiftPercent > tempoSafetyPreferences.absoluteMaximumShift) { safety = "Extreme"; warnings.push(`Automatic beatmatching above ${tempoSafetyPreferences.absoluteMaximumShift}% is blocked until a safer plan is selected.`); }
  if (/key lock/.test(text)) warnings.push("Key lock is not supported by the current Web Audio deck engine.");
  else if (shiftPercent > 0.5) warnings.push("Key lock is unavailable, so temporary tempo matching also changes pitch.");
  const activeTempoChangeRequested = !/do not change|don't change|keep.*tempo|preserve.*tempo/.test(text) && /(?:change|adjust).*(?:deck [ab]|active).*(?:bpm|tempo)/.test(text);
  if (activeTempoChangeRequested) warnings.push("Prompt-controlled active-deck tempo changes are unavailable; the active deck will be preserved.");
  let clarification = phraseRequest && explicitBars && !/then/.test(text)
    ? "Which should control the transition, the requested section estimate or the explicit bar countdown?"
    : "";
  if (requestedDeck === activeDeck) clarification = `Deck ${activeDeck.toUpperCase()} is already active. Edit the prompt if you want Deck ${activeDeck === "a" ? "B" : "A"} as the incoming deck.`;
  const estimatedTimeUntilTransition = timing.targetPlaybackTime === null ? phraseLengthSeconds(activeBpm, barsUntilTransition) : timing.secondsRemaining;
  const confidence = Math.max(35, Math.min(96, 94 - warnings.length * 6 - (shiftPercent > 8 ? 18 : 0) - (phraseRequest ? 8 : 0)));
  return {
    id: createId(), rawPrompt: prompt, activeDeck, incomingDeck, incomingTrackSource,
    incomingWasLoaded: Boolean(incoming.buffer),
    transitionTrigger, barsUntilTransition, estimatedTimeUntilTransition, targetSection,
    triggerType: timing.triggerType, timestampBasis: timing.timestampBasis, targetPlaybackTime: timing.targetPlaybackTime,
    currentPlaybackTime: timing.currentPlaybackTime, secondsRemainingUntilTrigger: timing.secondsRemaining,
    parsedTimestamp: timing.parsedTimestamp, incomingCueTime: timing.incomingCueTime, interpretation: timing.interpretation, relativeDelaySeconds: timing.relativeDelaySeconds,
    transitionStyle: style.style, transitionStyleLabel: style.label, blendLengthBars: blendBars,
    avoidVocalOverlap, preserveActiveDeckTempo: true,
    temporaryIncomingBpm: originalIncomingBpm ? activeBpm : null, originalIncomingBpm: originalIncomingBpm || null,
    tempoAssistRatio: normalizedIncomingBpm ? clamp(activeBpm / normalizedIncomingBpm, 0.88, 1.12) : 1,
    tempoShiftPercent: shiftPercent, absoluteBpmDifference, bpmDifferencePercent, tempoRelationship: tempoRelationship.label, tempoSafety: safety, bpmRecoveryEnabled: recoveryRequested,
    bpmRecoveryStart: recoveryStartBars ? `After ${recoveryStartBars} bars` : "Immediately after transition",
    bpmRecoveryStartBars: recoveryStartBars, bpmRecoveryDurationBars: recoveryBars, bpmRecoveryCurve: curve,
    keyLockEnabled: false, stemInstructions: avoidVocalOverlap ? "Prefer low-vocal estimate" : "Full mix",
    loopInstructions: /loop/.test(text) ? "Requested, unavailable for automation" : "None",
    padInstructions: "None", confidence, warnings, unsupported, clarification,
    forceTrackSelection, requiresSaferPlan: shiftPercent > tempoSafetyPreferences.absoluteMaximumShift,
    explanation: `Deck ${incomingDeck.toUpperCase()} will ${originalIncomingBpm ? `temporarily match ${activeBpm.toFixed(1)} BPM` : "use its available tempo"} while Deck ${activeDeck.toUpperCase()} remains uninterrupted. ${recoveryRequested && originalIncomingBpm ? `After the blend, it will return toward ${originalIncomingBpm} BPM over ${recoveryBars} bars using a ${curve.replace(/-/g, " ")} curve.` : "No automated BPM recovery is planned."}`
  };
}

function renderSmartPromptPlan() {
  const plan = smartPromptState.plan;
  const card = document.querySelector("#smartPromptPlan");
  const clarification = document.querySelector("#smartPromptClarification");
  if (!card) return;
  card.hidden = !plan;
  clarification.hidden = !smartPromptState.clarification;
  clarification.textContent = smartPromptState.clarification;
  const applyButton = document.querySelector("#applySmartPrompt");
  const promptExecutionActive = Boolean(autoMixState.running && autoMixState.promptPlan);
  const samePlanActive = Boolean(promptExecutionActive && transitionController.activePlan?.id === plan?.id);
  applyButton.disabled = !plan || Boolean(smartPromptState.clarification) || plan?.requiresSaferPlan || smartPromptState.executionInProgress || samePlanActive || transitionController.transitionStarted;
  applyButton.textContent = smartPromptState.executionInProgress ? "Validating…" : samePlanActive ? "Plan Active" : promptExecutionActive ? "Replace Plan" : "Apply Plan";
  document.querySelector("#cancelSmartPrompt").disabled = !plan && !promptExecutionActive;
  const errorBox = document.querySelector("#smartPromptExecutionError");
  if (errorBox) errorBox.hidden = !smartPromptState.executionError;
  const errorMessage = document.querySelector("#smartPromptExecutionErrorMessage");
  if (errorMessage) errorMessage.textContent = smartPromptState.executionError;
  if (!plan) return;
  document.querySelector("#smartPromptPlanState").textContent = smartPromptState.state;
  document.querySelector("#smartPromptConfidence").textContent = `${plan.confidence}%`;
  const details = [
    ["Active Deck", `Deck ${plan.activeDeck.toUpperCase()}`], ["Incoming Deck", `Deck ${plan.incomingDeck.toUpperCase()}`],
    ["Source", plan.incomingTrackSource], ["Trigger", plan.transitionTrigger], ["Transition", `${plan.blendLengthBars}-bar ${plan.transitionStyleLabel}`],
    ["Vocal overlap", plan.avoidVocalOverlap ? "Avoid" : "Allowed"], ["Active tempo", plan.preserveActiveDeckTempo ? "Preserve" : "Prompt controlled"],
    ["Blend BPM", plan.temporaryIncomingBpm?.toFixed(1) || "Pending track"], ["Original BPM", plan.originalIncomingBpm || "Pending track"],
    ["BPM recovery", plan.bpmRecoveryEnabled ? `${plan.bpmRecoveryDurationBars} bars, ${plan.bpmRecoveryCurve}` : "Off"],
    ["Safety", `${plan.tempoSafety}${plan.tempoShiftPercent ? ` · ${plan.tempoShiftPercent.toFixed(1)}%` : ""}`], ["Key lock", "Unavailable"]
  ];
  if (Number.isFinite(plan.targetPlaybackTime)) details.push(["Target time", formatTime(plan.targetPlaybackTime)], ["Interpretation", plan.interpretation || "Begin at active-deck timestamp"]);
  document.querySelector("#smartPromptPlanDetails").innerHTML = details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join("");
  const notices = [...plan.warnings, ...plan.unsupported.map((item) => `Unavailable: ${item}.`)];
  document.querySelector("#smartPromptWarnings").textContent = notices.length ? `Warnings: ${notices.join(" ")}` : "No plan warnings.";
  const safety = evaluateTempoSafety(plan);
  const safetyDetails = document.querySelector("#tempoSafetyDetails");
  const showSafety = plan.requiresSaferPlan || Boolean(plan.parentUnsafePlanId) || safety.level !== "safe";
  const saferButton = document.querySelector("#saferSmartPrompt");
  if (saferButton) saferButton.disabled = !plan.requiresSaferPlan && safety.level === "safe";
  safetyDetails.hidden = !showSafety;
  if (showSafety) {
    document.querySelector("#safetyOutgoingBpm").textContent = `Deck ${plan.activeDeck.toUpperCase()}: ${safety.outgoingBpm.toFixed(1)} BPM`;
    document.querySelector("#safetyIncomingBpm").textContent = `Deck ${plan.incomingDeck.toUpperCase()}: ${safety.incomingBpm.toFixed(1)} BPM`;
    document.querySelector("#safetyBpmDifference").textContent = `${safety.absoluteDifference.toFixed(1)} BPM · ${safety.bpmDifferencePercent.toFixed(1)}%`;
    document.querySelector("#safetyRequiredShift").textContent = `${safety.requiredPlaybackShift.toFixed(1)}% playback-rate change`;
    document.querySelector("#safetyConfiguredLimit").textContent = `${safety.configuredLimit}% absolute maximum`;
    document.querySelector("#safetyRecommendation").textContent = plan.safetyStrategy || (safety.level === "moderate" ? "Short filtered blend" : "Natural-tempo quick handoff");
    document.querySelector("#safetyInterpretation").textContent = `${safety.relationship.label}. A long beatmatched blend would cause excessive stretching, so DeckForge recommends a transition with little or no tempo matching.`;
  }
  const alternatives = document.querySelector("#saferTransitionPlans");
  alternatives.hidden = !smartPromptState.saferPlans.length;
  if (smartPromptState.saferPlans.length) alternatives.innerHTML = smartPromptState.saferPlans.map((item) => `<article class="safer-plan-card${item.recommended ? " is-recommended" : ""}"><small>${item.recommended ? "Recommended" : `Alternative ${item.rank}`} · ${item.safetyConfidence}% confidence</small><strong>${escapeHtml(item.safetyStrategy)}</strong><p>${escapeHtml(item.safetyWhy)}</p><p>Trigger: ${escapeHtml(item.transitionTrigger)} · ${item.blendLengthBars} bar${item.blendLengthBars === 1 ? "" : "s"} · ${item.bpmRecoveryEnabled ? "limited match and recovery" : "original BPM preserved"}</p><div><button type="button" data-safer-preview="${item.id}">Preview</button><button type="button" data-safer-apply="${item.id}">${item.bridgeCandidate ? "Use Bridge Track" : "Apply"}</button></div></article>`).join("");
  document.querySelector("#smartPromptExplanation").textContent = plan.explanation;
  document.querySelector("#promptRecoveryBars").value = String(plan.bpmRecoveryDurationBars);
  document.querySelector("#promptRecoveryCurve").value = plan.bpmRecoveryCurve;
  renderSmartPromptLibrary();
}

function renderSmartPromptLibrary() {
  const renderItems = (items, kind) => items.length ? items.map((item, index) => `<button type="button" data-prompt-library="${kind}" data-prompt-index="${index}" title="Reuse ${escapeHtml(item.prompt || item.name)}">${escapeHtml(item.name || item.prompt)}</button>${kind === "history" ? `<button type="button" data-prompt-favorite data-prompt-index="${index}" aria-label="${item.favorite ? "Unfavorite" : "Favorite"} ${escapeHtml(item.prompt)}">${item.favorite ? "★" : "☆"}</button>` : ""}<button type="button" data-prompt-delete="${kind}" data-prompt-index="${index}" aria-label="Delete ${escapeHtml(item.name || item.prompt)}">×</button>`).join("") : `<span>No ${kind} yet.</span>`;
  const history = document.querySelector("#smartPromptHistory");
  const recipes = document.querySelector("#smartPromptRecipes");
  if (history) history.innerHTML = `<strong>History</strong>${renderItems(smartPromptState.history, "history")}`;
  if (recipes) recipes.innerHTML = `<strong>Recipes</strong>${renderItems(smartPromptState.recipes, "recipes")}`;
}

function planSmartPrompt() {
  const input = document.querySelector("#smartMixPrompt");
  const prompt = input.value.trim();
  smartMixExecutionLog("prompt submitted");
  if (!prompt) { showSmartPromptExecutionError("Enter a Smart Mix instruction before planning a transition."); return; }
  clearSmartPromptExecutionError();
  smartPromptState.saferPlans = [];
  smartPromptState.selectedSaferPlanId = null;
  smartPromptState.state = "Parsing Prompt";
  smartPromptState.rawPrompt = prompt;
  try {
    const plan = parseSmartMixPrompt(prompt);
    smartPromptState.parsedIntent = plan;
    smartPromptState.plan = plan;
    smartPromptState.clarification = plan.clarification;
    smartPromptState.state = plan.clarification || plan.requiresSaferPlan ? "Plan Needs Clarification" : "Plan Ready";
    smartMixExecutionLog("plan parsed", { planId: plan.id, trigger: plan.transitionTrigger, style: plan.transitionStyle });
    smartPromptState.history = [{ prompt, favorite: false, createdAt: Date.now() }, ...smartPromptState.history.filter((item) => item.prompt !== prompt)].slice(0, 12);
    writeSmartPromptStorage();
    if (plan.requiresSaferPlan && tempoSafetyPreferences.automaticallySuggest) {
      const saferPlans = generateSaferTransitionPlans(plan);
      if (tempoSafetyPreferences.automaticallyExecute && !tempoSafetyPreferences.askBeforeReplacing && saferPlans[0]) selectSaferTransitionPlan(saferPlans[0].id, true);
    }
  } catch (error) {
    smartPromptState.state = "Error";
    smartPromptState.lastError = error.message || "Prompt parsing failed";
  }
  renderSmartPromptPlan();
}

function applyPromptToTransition(transition, promptPlan) {
  if (!transition || !promptPlan) return transition;
  const activeBpm = Number(transition.from.analysis?.bpm || 120) * Number(document.querySelector(`#pitch-${promptPlan.activeDeck}`)?.value || 1);
  const originalIncomingBpm = Number(transition.to.analysis?.bpm || 0);
  const relationship = analyzeTempoRelationship(activeBpm, originalIncomingBpm, transition.from.analysis, transition.to.analysis);
  const normalizedIncomingBpm = relationship.effectiveIncomingBpm || originalIncomingBpm;
  const analyzedTempoAssistRatio = normalizedIncomingBpm ? activeBpm / normalizedIncomingBpm : 1;
  const tempoAssistRatio = promptPlan.safetyStrategy ? Number(promptPlan.tempoAssistRatio || 1) : analyzedTempoAssistRatio;
  const shiftPercent = Math.abs((tempoAssistRatio - 1) * 100);
  const maximumShift = tempoSafetyPreferences.absoluteMaximumShift;
  promptPlan.originalIncomingBpm = originalIncomingBpm || null;
  promptPlan.temporaryIncomingBpm = originalIncomingBpm ? originalIncomingBpm * tempoAssistRatio : null;
  promptPlan.tempoShiftPercent = shiftPercent;
  promptPlan.absoluteBpmDifference = Math.abs(originalIncomingBpm - activeBpm);
  promptPlan.bpmDifferencePercent = activeBpm ? promptPlan.absoluteBpmDifference / activeBpm * 100 : 0;
  promptPlan.tempoRelationship = relationship.label;
  promptPlan.tempoAssistRatio = clamp(tempoAssistRatio, 0.88, 1.12);
  if (shiftPercent > maximumShift) {
    promptPlan.requiresSaferPlan = true;
    promptPlan.tempoSafety = shiftPercent > 12 ? "Extreme" : "Large";
    promptPlan.warnings.push(`Selected track requires a ${shiftPercent.toFixed(1)}% tempo shift, above the ${maximumShift}% safety limit.`);
  }
  if (shiftPercent > 0.5 && !promptPlan.warnings.some((warning) => warning.includes("Key lock"))) promptPlan.warnings.push("Key lock is unavailable, so temporary tempo matching also changes pitch.");
  const requestedOverlap = phraseLengthSeconds(activeBpm, promptPlan.blendLengthBars);
  const maxOverlap = Math.max(4, Math.min(transition.from.buffer.duration - 0.5, transition.to.buffer.duration - transition.nextCue - 0.5));
  transition.style = promptPlan.transitionStyle;
  transition.overlap = Math.max(2, Math.min(requestedOverlap, maxOverlap));
  const requestedStart = Number.isFinite(promptPlan.targetPlaybackTime) ? promptPlan.targetPlaybackTime : currentDeckTime(promptPlan.activeDeck) + promptPlan.estimatedTimeUntilTransition;
  transition.startAt = Math.max(0, Math.min(transition.from.buffer.duration - transition.overlap - 0.5, requestedStart));
  if (Number.isFinite(promptPlan.incomingCueTime)) transition.nextCue = Math.max(0, Math.min(transition.to.buffer.duration - 0.05, promptPlan.incomingCueTime));
  transition.tempoAssistRatio = promptPlan.tempoAssistRatio;
  transition.tempoRestoreSeconds = phraseLengthSeconds(promptPlan.temporaryIncomingBpm || transition.to.analysis?.bpm || 120, promptPlan.bpmRecoveryDurationBars);
  transition.filterSweep = /filter|bass|long|vocal|drop/.test(transition.style);
  transition.promptPlan = promptPlan;
  transition.note = `${promptPlan.transitionStyleLabel.toLowerCase()} ${promptPlan.transitionTrigger.toLowerCase()} into ${formatTime(transition.nextCue)}`;
  return transition;
}

function promptCandidateMatches(item, promptPlan) {
  const text = promptPlan.rawPrompt.toLowerCase();
  const searchable = `${item.name} ${item.analysis?.genre || ""} ${item.analysis?.mood || ""} ${item.notes || ""}`.toLowerCase();
  const requestedTerms = ["east coast", "west coast", "house", "hip-hop", "hip hop", "r&b", "jungle", "dnb", "dark", "bright", "chill", "high energy", "low energy"].filter((term) => text.includes(term));
  return !requestedTerms.length || requestedTerms.some((term) => searchable.includes(term.replace("high energy", "high").replace("low energy", "low")));
}

function cloneSaferPlan(plan, config) {
  const safer = {
    ...plan,
    id: createId(),
    parentUnsafePlanId: plan.id,
    warnings: [...plan.warnings, config.warning],
    unsupported: [...plan.unsupported],
    transitionStyle: config.style,
    transitionStyleLabel: config.label,
    blendLengthBars: config.bars,
    tempoAssistRatio: config.tempoAssistRatio ?? 1,
    temporaryIncomingBpm: config.tempoAssistRatio && config.tempoAssistRatio !== 1 ? plan.originalIncomingBpm * config.tempoAssistRatio : plan.originalIncomingBpm,
    bpmRecoveryEnabled: Boolean(config.tempoAssistRatio && config.tempoAssistRatio !== 1),
    requiresSaferPlan: false,
    tempoSafety: "Executable safer plan",
    safetyStrategy: config.strategy,
    safetyWhy: config.why,
    safetyConfidence: config.confidence,
    planSource: plan.planSource || "Prompt",
    explanation: `${config.why} The original trigger remains ${plan.transitionTrigger.toLowerCase()}, and Deck ${plan.incomingDeck.toUpperCase()} ${config.tempoAssistRatio && config.tempoAssistRatio !== 1 ? "uses only a limited temporary adjustment" : "stays at its original BPM"}.`
  };
  if (!safer.bpmRecoveryEnabled) safer.bpmRecoveryStartBars = 0;
  return safer;
}

function findTempoBridgeCandidate(plan) {
  if (!tempoSafetyPreferences.allowBridgeSuggestions || !plan.originalIncomingBpm) return null;
  const outgoingBpm = Number(deckState[plan.activeDeck]?.analysis?.bpm || 0);
  const incomingBpm = Number(plan.originalIncomingBpm || 0);
  if (!outgoingBpm || !incomingBpm) return null;
  const low = Math.min(outgoingBpm, incomingBpm);
  const high = Math.max(outgoingBpm, incomingBpm);
  const midpoint = (outgoingBpm + incomingBpm) / 2;
  return sourceFiles
    .filter((source) => source.file && source.analysis?.bpm && source.analysis.bpm > low && source.analysis.bpm < high && source.name !== deckState[plan.activeDeck].trackName && source.name !== deckState[plan.incomingDeck].trackName)
    .map((source) => {
      const genrePenalty = source.analysis.genre && deckState[plan.activeDeck].analysis?.genre && source.analysis.genre !== deckState[plan.activeDeck].analysis.genre ? 5 : 0;
      const energyPenalty = Math.abs(energyRank(source.analysis.energy) - energyRank(deckState[plan.activeDeck].analysis?.energy)) * 2;
      return { source, score: Math.abs(source.analysis.bpm - midpoint) + genrePenalty + energyPenalty, firstShift: Math.abs(outgoingBpm / source.analysis.bpm - 1) * 100, secondShift: Math.abs(source.analysis.bpm / incomingBpm - 1) * 100 };
    })
    .filter((candidate) => candidate.firstShift < plan.tempoShiftPercent && candidate.secondShift < plan.tempoShiftPercent)
    .sort((a, b) => a.score - b.score)[0] || null;
}

function generateSaferTransitionPlans(plan) {
  if (!plan) return [];
  smartPromptState.state = "Generating Safer Plans";
  const safety = evaluateTempoSafety(plan);
  const naturalWarning = "Extreme beatmatching was removed; incoming original BPM is preserved.";
  const strategies = [];
  if (safety.level === "moderate" && !tempoSafetyPreferences.preserveIncomingBpm) {
    const direction = Number(plan.tempoAssistRatio || 1) >= 1 ? 1 : -1;
    const limitedRatio = 1 + direction * tempoSafetyPreferences.preferredShift / 100;
    strategies.push({ strategy: "Short filtered blend with limited tempo assist", style: "filter-sweep", label: "Short filtered blend", bars: 4, tempoAssistRatio: limitedRatio, confidence: 91, warning: "Tempo adjustment was limited to the preferred range.", why: "A four-bar filtered overlap reduces the time spent at a mismatched tempo." });
  }
  const preferred = tempoSafetyPreferences.transitionPreference === "fast" ? "quick-blend" : tempoSafetyPreferences.largeMismatchTransition;
  const preferredLabel = preferred === "filter-sweep" ? "Filter fade and clean handoff" : preferred === "drop-mix" ? "Drop mix at original tempo" : "Quick cut at original tempo";
  strategies.push({ strategy: preferredLabel, style: preferred, label: preferredLabel, bars: safety.level === "extreme" ? 1 : 2, tempoAssistRatio: 1, confidence: safety.level === "extreme" ? 95 : 93, warning: naturalWarning, why: "A short clean handoff avoids tempo stretching and keeps continuous output." });
  strategies.push({ strategy: "Quick cut on the trigger", style: "quick-blend", label: "Quick cut", bars: 1, tempoAssistRatio: 1, confidence: safety.level === "extreme" ? 92 : 87, warning: naturalWarning, why: "The outgoing deck fades quickly while the incoming track starts at natural tempo." });
  if (preferred !== "drop-mix") strategies.push({ strategy: "Incoming drop at original tempo", style: "drop-mix", label: "Drop mix", bars: 1, tempoAssistRatio: 1, confidence: 84, warning: naturalWarning, why: "A downbeat-focused drop avoids a long rhythmic overlap." });
  const bridge = findTempoBridgeCandidate(plan);
  const alternatives = strategies.slice(0, bridge ? 2 : 3).map((strategy, index) => ({ ...cloneSaferPlan(plan, strategy), rank: index + 1, recommended: index === 0 }));
  if (bridge) {
    const bridgePlan = cloneSaferPlan(plan, { strategy: `Tempo bridge via ${bridge.source.name}`, style: "filter-sweep", label: "Tempo bridge", bars: 4, tempoAssistRatio: 1, confidence: 80, warning: "Bridge track requires a two-stage transition.", why: `${bridge.source.name} at ${bridge.source.analysis.bpm} BPM moves toward the final ${plan.originalIncomingBpm} BPM destination.` });
    bridgePlan.rank = alternatives.length + 1;
    bridgePlan.bridgeCandidate = { id: bridge.source.id, name: bridge.source.name, bpm: bridge.source.analysis.bpm };
    bridgePlan.preferredIncomingId = bridge.source.id;
    bridgePlan.forceTrackSelection = true;
    bridgePlan.bridgeFinalDestination = { name: deckState[plan.incomingDeck].trackName, buffer: deckState[plan.incomingDeck].buffer, analysis: deckState[plan.incomingDeck].analysis };
    alternatives.push(bridgePlan);
  }
  smartPromptState.saferPlans = alternatives;
  smartPromptState.state = "Safer Plan Ready";
  return alternatives;
}

function selectSaferTransitionPlan(planId, execute = false) {
  const plan = smartPromptState.saferPlans.find((item) => item.id === planId);
  if (!plan) return false;
  smartPromptState.plan = plan;
  smartPromptState.parsedIntent = plan;
  smartPromptState.selectedSaferPlanId = plan.id;
  smartPromptState.clarification = "";
  smartPromptState.executionError = "";
  smartPromptState.saferPlans = [];
  smartPromptState.state = execute ? "Safer Plan Applied" : "Awaiting User Selection";
  renderSmartPromptPlan();
  if (execute) executeSmartMixPlan(plan);
  return true;
}

function useSaferSmartPrompt() {
  const plan = smartPromptState.plan;
  if (!plan) return;
  const alternatives = generateSaferTransitionPlans(plan);
  if (!alternatives.length) { showSmartPromptExecutionError("No executable safer transition could be generated for the current decks."); return; }
  renderSmartPromptPlan();
  if (tempoSafetyPreferences.automaticallyExecute && !tempoSafetyPreferences.askBeforeReplacing) selectSaferTransitionPlan(alternatives[0].id, true);
}

async function applySmartPromptPlan() {
  const plan = smartPromptState.plan;
  if (!plan) { showSmartPromptExecutionError("Create a transition plan before applying it."); return false; }
  if (smartPromptState.clarification) { showSmartPromptExecutionError(smartPromptState.clarification); return false; }
  if (plan.requiresSaferPlan) { useSaferSmartPrompt(); return false; }
  const maximumShift = tempoSafetyPreferences.absoluteMaximumShift;
  if (plan.tempoShiftPercent > maximumShift && Math.abs(plan.tempoAssistRatio - 1) > 0.005) {
    plan.requiresSaferPlan = true;
    plan.warnings.push(`The planned ${plan.tempoShiftPercent.toFixed(1)}% shift exceeds the selected ${maximumShift}% safety limit.`);
    smartPromptState.state = "Plan Needs Clarification";
    renderSmartPromptPlan();
    showSmartPromptExecutionError(plan.warnings[plan.warnings.length - 1]);
    return false;
  }
  plan.bpmRecoveryDurationBars = Number(document.querySelector("#promptRecoveryBars")?.value || plan.bpmRecoveryDurationBars);
  plan.bpmRecoveryCurve = document.querySelector("#promptRecoveryCurve")?.value || plan.bpmRecoveryCurve;
  return executeSmartMixPlan(plan);
}

function smartMixExecutionLog(message, details = null) {
  if (!DECKFORGE_DEVELOPMENT) return;
  if (details) console.debug(`[DeckForge][SmartMixPrompt] ${message}`, details);
  else console.debug(`[DeckForge][SmartMixPrompt] ${message}`);
}

function showSmartPromptExecutionError(message) {
  const reason = String(message || "The transition scheduler did not initialize.");
  smartPromptState.executionError = reason;
  smartPromptState.lastError = reason;
  smartPromptState.state = "Error";
  smartPromptState.executionInProgress = false;
  smartMixExecutionLog(`execution failed: ${reason}`);
  renderSmartPromptPlan();
  setSmartMixStatus(`Prompt plan error: ${reason}`);
}

function clearSmartPromptExecutionError() {
  smartPromptState.executionError = "";
  if (smartPromptState.lastError !== "None") smartPromptState.lastError = "None";
}

function validateSmartMixExecutionPlan(plan) {
  if (!plan || !plan.id) throw new Error("The parsed transition plan is missing or stale.");
  const activeDeck = deckState[plan.activeDeck]?.playing && deckState[plan.activeDeck]?.buffer ? plan.activeDeck : detectActiveDeck();
  if (!activeDeck) throw new Error("No active deck is playing. Start Deck A or Deck B, then retry the plan.");
  if (!deckState[activeDeck]?.buffer) throw new Error(`Deck ${activeDeck.toUpperCase()} has no playable track loaded.`);
  const currentPlaybackTime = currentDeckTime(activeDeck);
  if (plan.triggerType === "relative-seconds" && Number.isFinite(plan.relativeDelaySeconds)) plan.targetPlaybackTime = currentPlaybackTime + plan.relativeDelaySeconds;
  if (plan.executeImmediately) plan.targetPlaybackTime = currentPlaybackTime;
  if (Number.isFinite(plan.targetPlaybackTime)) {
    if (plan.targetPlaybackTime > deckState[activeDeck].buffer.duration) throw new Error(`The target timestamp ${formatTime(plan.targetPlaybackTime)} exceeds Deck ${activeDeck.toUpperCase()}'s ${formatTime(deckState[activeDeck].buffer.duration)} duration.`);
    if (plan.targetPlaybackTime < currentPlaybackTime - 0.1 && !plan.executeImmediately) throw new Error(`The target timestamp ${formatTime(plan.targetPlaybackTime)} has already passed on Deck ${activeDeck.toUpperCase()}. Choose Execute Now, Next Phrase, Delay From Now, or Cancel.`);
    plan.currentPlaybackTime = currentPlaybackTime;
    plan.secondsRemainingUntilTrigger = Math.max(0, plan.targetPlaybackTime - currentPlaybackTime);
    plan.estimatedTimeUntilTransition = plan.secondsRemainingUntilTrigger;
  }
  const incomingDeck = activeDeck === "a" ? "b" : "a";
  const sourceMode = document.querySelector("#smartMixSource")?.value || "both";
  const hasLocalCandidate = sourceFiles.some((source) => source.file || source.buffer);
  const hasSavedCandidate = (() => { try { return JSON.parse(localStorage.getItem("deckforge-sources") || "[]").length > 0; } catch { return false; } })();
  if (!deckState[incomingDeck].buffer && sourceMode === "decks" && !plan.forceTrackSelection) throw new Error(`Deck ${incomingDeck.toUpperCase()} is empty and the Smart Mix source is limited to loaded decks.`);
  if (!deckState[incomingDeck].buffer && !hasLocalCandidate && !hasSavedCandidate) throw new Error(`Deck ${incomingDeck.toUpperCase()} is empty and no playable Smart Mix source is available.`);
  if (!deckState[incomingDeck].buffer && Number(plan.estimatedTimeUntilTransition || 0) < 5) throw new Error(`Deck ${incomingDeck.toUpperCase()} is empty and more preparation time is required before this deadline.`);
  const supportedStyles = new Set(["smooth-crossfade", "quick-blend", "long-dissolve", "filter-sweep", "bass-swap-phrase", "drop-mix"]);
  if (!supportedStyles.has(plan.transitionStyle)) throw new Error(`The transition style “${plan.transitionStyleLabel || plan.transitionStyle}” is not implemented.`);
  if (!Number.isFinite(plan.barsUntilTransition) || plan.barsUntilTransition < 1 || !Number.isFinite(plan.estimatedTimeUntilTransition) || (plan.estimatedTimeUntilTransition <= 0 && !plan.executeImmediately)) throw new Error("The transition trigger could not be converted to a real bar or time estimate.");
  const maximumShift = tempoSafetyPreferences.absoluteMaximumShift;
  if (Number(plan.tempoShiftPercent || 0) > maximumShift && Math.abs(Number(plan.tempoAssistRatio || 1) - 1) > 0.005) throw new Error(`The planned tempo shift exceeds the selected ${maximumShift}% safety limit.`);
  if (plan.bpmRecoveryEnabled && (!Number.isFinite(plan.bpmRecoveryDurationBars) || plan.bpmRecoveryDurationBars <= 0)) throw new Error("BPM recovery duration is invalid.");
  return { activeDeck, incomingDeck, sourceMode };
}

function cancelSmartMixAutomationForReplacement(reason) {
  const result = cancelScheduledTransition(reason);
  autoMixState.timers.forEach((timer) => { clearTimeout(timer); cancelAnimationFrame(timer); });
  autoMixState.timers = [];
  autoMixState.running = false;
  autoMixState.transition = null;
  autoMixState.handoffArmed = false;
  autoMixState.preparedDeck = null;
  autoMixState.preparedIndex = null;
  autoMixState.estimatedTransitionAt = null;
  autoMixState.promptPlan = null;
  for (const id of ["a", "b"]) setDeckStatus(id, deckState[id].playing ? "playing" : deckState[id].buffer ? "ready" : "empty", { smartMixControlled: false });
  setSmartMixButtons(false);
  return result;
}

async function executeSmartMixPlan(plan) {
  smartMixExecutionLog("apply requested", { planId: plan?.id, state: smartPromptState.state });
  if (smartPromptState.executionInProgress) {
    smartPromptState.executionError = "This plan is already being validated. Wait or cancel before applying it again.";
    renderSmartPromptPlan();
    return false;
  }
  if (transitionController.transitionStarted || autoMixState.transition) {
    showSmartPromptExecutionError("A crossfade is currently active. Wait for it to complete or take manual control before applying another plan.");
    return false;
  }
  smartPromptState.executionInProgress = true;
  const executionToken = ++smartPromptState.executionToken;
  clearSmartPromptExecutionError();
  smartPromptState.state = "Validating";
  renderSmartPromptPlan();
  try {
    const resolved = validateSmartMixExecutionPlan(plan);
    const incomingPriority = transitionPriority(plan.planSource || "Prompt");
    if (transitionController.activePlan && transitionController.activePlan.priority > incomingPriority) throw new Error(`A higher-priority ${transitionController.activePlan.source} transition is already scheduled. Cancel it before applying this plan.`);
    if (autoMixState.running || transitionController.activePlan) {
      const replacementLabel = plan.planSource === "Deck Quick Action" ? "deck quick instruction" : "prompt instruction";
      const replacementMessage = `Previous transition plan replaced by ${replacementLabel}.`;
      const replacementResult = cancelSmartMixAutomationForReplacement(replacementMessage);
      if (!plan.warnings.includes(replacementMessage)) plan.warnings.push(replacementMessage);
      setSmartMixStatus(replacementMessage);
      smartMixExecutionLog("previous plan replaced", { result: replacementResult });
    }
    smartMixExecutionLog("plan validated", { planId: plan.id, triggerSeconds: plan.estimatedTimeUntilTransition });
    smartMixExecutionLog("active deck resolved", { deck: resolved.activeDeck });
    smartMixExecutionLog("incoming deck resolved", { deck: resolved.incomingDeck, loaded: Boolean(deckState[resolved.incomingDeck].buffer) });
    await AudioEngine.init();
    if (executionToken !== smartPromptState.executionToken) return false;
    if (AudioEngine.context?.state !== "running") throw new Error(`AudioContext is ${AudioEngine.context?.state || "not started"}. Press Start Audio and retry.`);
    smartPromptState.state = "Preparing Incoming Deck";
    renderSmartPromptPlan();
    const selectedSource = plan.forceTrackSelection && resolved.sourceMode === "decks" ? "crate" : resolved.sourceMode;
    const started = await startSmartMix(document.querySelector("#smartMixMode")?.value || "club", selectedSource, plan);
    if (executionToken !== smartPromptState.executionToken) {
      if (autoMixState.running && autoMixState.promptPlan === plan) stopAiMix({ keepDecks: true, silent: true });
      return false;
    }
    if (!started && plan.requiresSaferPlan && smartPromptState.saferPlans.length) {
      smartPromptState.executionInProgress = false;
      smartPromptState.state = "Safer Plan Ready";
      renderSmartPromptPlan();
      return false;
    }
    if (!started) throw new Error(autoMixState.lastError !== "None" ? autoMixState.lastError : "No eligible incoming track found.");
    if (!autoMixState.running || !autoMixState.handoffArmed || !Number.isFinite(autoMixState.estimatedTransitionAt)) throw new Error("Transition scheduler did not initialize.");
    smartPromptState.executionInProgress = false;
    smartPromptState.lastExecutionPlanId = plan.id;
    smartPromptState.state = "Waiting for Trigger";
    smartMixExecutionLog("transition scheduled", { planId: plan.id, estimatedTransitionAt: autoMixState.estimatedTransitionAt });
    renderSmartPromptPlan();
    return true;
  } catch (error) {
    if (autoMixState.running && autoMixState.promptPlan === plan) stopAiMix({ keepDecks: true, silent: true });
    showSmartPromptExecutionError(error.message || "Unable to execute the transition plan.");
    return false;
  }
}

function cancelSmartPromptPlan() {
  if (autoMixState.running && autoMixState.promptPlan) {
    if (transitionController.transitionStarted || autoMixState.transition) stopAiMix({ keepDecks: true });
    else cancelSmartMixAutomationForReplacement("Cancelled by user");
  } else if (transitionController.activePlan) cancelScheduledTransition("Cancelled by user");
  if (bpmRecoveryState.plan) cancelBpmRecovery("Cancelled", false, true);
  smartPromptState.plan = null;
  smartPromptState.parsedIntent = null;
  smartPromptState.clarification = "";
  smartPromptState.executionInProgress = false;
  smartPromptState.executionToken += 1;
  smartPromptState.executionError = "";
  smartPromptState.saferPlans = [];
  smartPromptState.selectedSaferPlanId = null;
  smartPromptState.state = "Cancelled";
  setSmartMixStatus("Transition cancelled. Deck audio continues under manual control.");
  renderSmartPromptPlan();
}

function saveSmartPromptRecipe() {
  const plan = smartPromptState.plan;
  if (!plan) return;
  const name = `${plan.transitionStyleLabel} · ${plan.barsUntilTransition} bars`;
  smartPromptState.recipes = [{ name, prompt: plan.rawPrompt, plan: { transitionStyle: plan.transitionStyle, blendLengthBars: plan.blendLengthBars, bpmRecoveryDurationBars: plan.bpmRecoveryDurationBars, bpmRecoveryCurve: plan.bpmRecoveryCurve, avoidVocalOverlap: plan.avoidVocalOverlap }, createdAt: Date.now() }, ...smartPromptState.recipes].slice(0, 12);
  writeSmartPromptStorage();
  renderSmartPromptLibrary();
}

function quickTransitionStyleForDelay(delay) {
  if (delay <= 5) return { prompt: "quick mix", style: "quick-blend", label: "Quick blend" };
  if (delay <= 10) return { prompt: "filter fade", style: "filter-sweep", label: "Filter fade" };
  return { prompt: "smooth blend", style: "smooth-crossfade", label: "Smooth blend" };
}

function createQuickTransitionPlan(outgoingDeck, options = {}) {
  if (!deckState[outgoingDeck]?.buffer || !deckState[outgoingDeck].playing) throw new Error(`Deck ${outgoingDeck.toUpperCase()} must be loaded and playing before scheduling its AI transition.`);
  const incomingDeck = outgoingDeck === "a" ? "b" : "a";
  const current = currentDeckTime(outgoingDeck);
  const activeBpm = Number(deckState[outgoingDeck].analysis?.bpm || 120) * Number(document.querySelector(`#pitch-${outgoingDeck}`)?.value || 1);
  const delay = Math.max(0, Number(options.delaySeconds ?? 10));
  const style = options.style || quickTransitionStyleForDelay(delay);
  const prompt = `Transition to Deck ${incomingDeck.toUpperCase()} in ${delay} seconds using a ${style.prompt}. Return the incoming track to its original BPM over ${options.recoveryBars || 8} bars.`;
  const plan = parseSmartMixPrompt(prompt);
  plan.activeDeck = outgoingDeck;
  plan.incomingDeck = incomingDeck;
  plan.incomingWasLoaded = Boolean(deckState[incomingDeck].buffer);
  plan.planSource = "Deck Quick Action";
  plan.priority = transitionPriority(plan.planSource);
  plan.transitionStyle = style.style;
  plan.transitionStyleLabel = style.label;
  plan.blendLengthBars = Number(options.durationBars || (delay <= 5 ? 4 : 8));
  plan.bpmRecoveryDurationBars = Number(options.recoveryBars || 8);
  plan.avoidVocalOverlap = Boolean(options.avoidVocalOverlap);
  plan.forceTrackSelection = options.useLoaded === false;
  plan.clarification = "";
  plan.triggerType = options.triggerType || "relative-seconds";
  plan.relativeDelaySeconds = delay;
  plan.currentPlaybackTime = current;
  plan.targetPlaybackTime = Number.isFinite(options.targetPlaybackTime) ? options.targetPlaybackTime : current + delay;
  plan.estimatedTimeUntilTransition = Math.max(0, plan.targetPlaybackTime - current);
  plan.secondsRemainingUntilTrigger = plan.estimatedTimeUntilTransition;
  plan.executeImmediately = delay === 0 && !Number.isFinite(options.targetPlaybackTime);
  plan.transitionTrigger = options.interpretation || `Begin transition in ${delay} seconds`;
  plan.interpretation = plan.transitionTrigger;
  plan.barsUntilTransition = Math.max(1, Math.round(Math.max(0.1, plan.estimatedTimeUntilTransition) / phraseLengthSeconds(activeBpm, 1)));
  const quickSafetyLimit = delay <= 5 ? tempoSafetyPreferences.preferredShift : delay <= 10 ? tempoSafetyPreferences.warningThreshold : tempoSafetyPreferences.absoluteMaximumShift;
  if (plan.tempoShiftPercent > quickSafetyLimit) {
    plan.tempoAssistRatio = 1;
    plan.bpmRecoveryEnabled = false;
    plan.tempoSafety = "Natural-tempo quick transition";
    plan.safetyStrategy = delay <= 5 ? "Fast natural-tempo quick cut" : delay <= 10 ? "Natural-tempo filter fade" : "Short natural-tempo handoff";
    plan.transitionStyle = delay <= 5 ? "quick-blend" : tempoSafetyPreferences.largeMismatchTransition;
    plan.transitionStyleLabel = delay <= 5 ? "Quick cut" : plan.transitionStyle === "filter-sweep" ? "Filter fade" : plan.transitionStyle === "drop-mix" ? "Drop mix" : "Quick blend";
    plan.blendLengthBars = delay <= 5 ? 1 : 2;
    plan.warnings.push(`The ${delay}-second deadline automatically uses a non-beatmatched ${plan.transitionStyleLabel.toLowerCase()} because the BPM difference exceeds the safe ${quickSafetyLimit}% range.`);
    plan.requiresSaferPlan = false;
  }
  return plan;
}

async function executeQuickTransition(outgoingDeck, options = {}) {
  try {
    const incomingDeck = outgoingDeck === "a" ? "b" : "a";
    const delay = Number(options.delaySeconds ?? 10);
    if (!deckState[incomingDeck].buffer && delay < 15 && options.triggerType !== "phrase-boundary") {
      throw new Error(`Deck ${incomingDeck.toUpperCase()} is empty. More preparation time is required; extend to 15 seconds, use Next Phrase, or choose a track manually.`);
    }
    const plan = createQuickTransitionPlan(outgoingDeck, options);
    smartPromptState.plan = plan;
    smartPromptState.parsedIntent = plan;
    smartPromptState.rawPrompt = plan.rawPrompt;
    smartPromptState.clarification = "";
    smartPromptState.state = "Plan Ready";
    clearSmartPromptExecutionError();
    renderSmartPromptPlan();
    return executeSmartMixPlan(plan);
  } catch (error) {
    const fallback = smartPromptState.plan || parseSmartMixPrompt(`Transition to Deck ${outgoingDeck === "a" ? "B" : "A"} in 15 seconds using a smooth blend`);
    fallback.planSource = "Deck Quick Action";
    smartPromptState.plan = fallback;
    renderSmartPromptPlan();
    showSmartPromptExecutionError(error.message || "Unable to schedule the deck quick transition.");
    return false;
  }
}

function openQuickTransitionPanel(deckId, timingMode = "seconds") {
  quickTransitionState.deckId = deckId;
  document.querySelector("#quickTransitionTitle").textContent = `Deck ${deckId.toUpperCase()} → Deck ${deckId === "a" ? "B" : "A"}`;
  document.querySelector("#quickTimingMode").value = timingMode;
  document.querySelector("#quickTimingValue").value = timingMode === "timestamp" ? formatTime(currentDeckTime(deckId) + 15) : "10";
  document.querySelector("#quickTransitionCustom").hidden = false;
  document.querySelector("#quickTimingValue").focus();
}

function scheduleCustomQuickTransition() {
  const deckId = quickTransitionState.deckId;
  const mode = document.querySelector("#quickTimingMode").value;
  const value = document.querySelector("#quickTimingValue").value.trim();
  const durationBars = Number(document.querySelector("#quickTransitionDuration").value);
  const recoveryBars = Number(document.querySelector("#quickRecoveryBars").value);
  const styleValue = document.querySelector("#quickTransitionStyle").value;
  const styleMap = { smooth: { prompt: "smooth blend", style: "smooth-crossfade", label: "Smooth blend" }, filter: { prompt: "filter fade", style: "filter-sweep", label: "Filter fade" }, quick: { prompt: "quick mix", style: "quick-blend", label: "Quick blend" }, bass: { prompt: "bass swap", style: "bass-swap-phrase", label: "Bass swap" }, drop: { prompt: "drop mix", style: "drop-mix", label: "Drop mix" } };
  const current = currentDeckTime(deckId);
  const bpm = Number(deckState[deckId].analysis?.bpm || 120);
  let delaySeconds = Number(value);
  let targetPlaybackTime = null;
  let triggerType = mode;
  if (mode === "bars") delaySeconds = phraseLengthSeconds(bpm, Number(value));
  if (mode === "timestamp") { targetPlaybackTime = parseClockTimestamp(value); delaySeconds = targetPlaybackTime - current; triggerType = "absolute-timestamp"; }
  if (mode === "before-end") { targetPlaybackTime = deckState[deckId].buffer.duration - Number(value); delaySeconds = targetPlaybackTime - current; triggerType = "before-end"; }
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0) { showSmartPromptExecutionError("The custom transition time is invalid or has already passed."); return; }
  if (document.querySelector("#quickTimingInterpretation").value === "complete") {
    const blendSeconds = phraseLengthSeconds(bpm, durationBars);
    delaySeconds = Math.max(0, delaySeconds - blendSeconds);
    if (targetPlaybackTime !== null) targetPlaybackTime = current + delaySeconds;
  }
  document.querySelector("#quickTransitionCustom").hidden = true;
  executeQuickTransition(deckId, {
    delaySeconds, targetPlaybackTime, triggerType, durationBars, recoveryBars, style: styleMap[styleValue],
    avoidVocalOverlap: document.querySelector("#quickAvoidVocals").checked,
    useLoaded: document.querySelector("#quickUseLoaded").checked,
    interpretation: `${document.querySelector("#quickTimingInterpretation").value === "complete" ? "Complete" : "Begin"} transition using ${mode} timing`
  });
}

function continueTempoBridgePlan(bridgePlan, activeBridgeDeck, destinationDeck) {
  const destination = bridgePlan.bridgeFinalDestination;
  if (!destination?.buffer) { setSmartMixStatus("Bridge transition completed, but the original destination is no longer available."); return; }
  loadBufferToDeck(destination.buffer, destination.name, destinationDeck, { analysis: destination.analysis, smartMixControlled: true });
  const followup = parseSmartMixPrompt(`Transition to Deck ${destinationDeck.toUpperCase()} in 16 seconds using a filter fade`);
  followup.activeDeck = activeBridgeDeck;
  followup.incomingDeck = destinationDeck;
  followup.planSource = "Prompt";
  followup.safetyStrategy = "Bridge completion at original tempo";
  followup.transitionStyle = "filter-sweep";
  followup.transitionStyleLabel = "Bridge completion filter fade";
  followup.blendLengthBars = 2;
  followup.tempoAssistRatio = 1;
  followup.bpmRecoveryEnabled = false;
  followup.requiresSaferPlan = false;
  followup.incomingWasLoaded = true;
  followup.relativeDelaySeconds = 16;
  followup.currentPlaybackTime = currentDeckTime(activeBridgeDeck);
  followup.targetPlaybackTime = followup.currentPlaybackTime + 16;
  followup.estimatedTimeUntilTransition = 16;
  followup.bridgeStage = "final-destination";
  smartPromptState.plan = followup;
  smartPromptState.parsedIntent = followup;
  smartPromptState.state = "Safer Plan Applied";
  setSmartMixStatus(`Tempo bridge active. Preparing the original destination ${destination.name} for the final handoff.`);
  renderSmartPromptPlan();
  setTimeout(() => executeSmartMixPlan(followup), 0);
}

async function startAiMix(mode = document.querySelector("#smartMixMode")?.value || "club") {
  await startSmartMix(mode, document.querySelector("#smartMixSource")?.value || "both");
}

function detectActiveDeck() {
  const playing = ["a", "b"].filter((id) => deckState[id].playing && deckState[id].buffer);
  if (playing.length === 1) return playing[0];
  if (playing.length === 2) return Number(document.querySelector("#crossfader")?.value || 0.5) <= 0.5 ? "a" : "b";
  return null;
}

function deckAsSmartMixItem(id, mode) {
  const deck = deckState[id];
  if (!deck.buffer) return null;
  return prepareSmartMixItem({
    id: `deck-${id}`,
    source: `Deck ${id.toUpperCase()}`,
    name: deck.trackName || `Deck ${id.toUpperCase()}`,
    buffer: deck.buffer,
    analysis: deck.analysis
  }, mode);
}

async function startSmartMix(mode = "club", sourceMode = "both", promptPlan = null) {
  autoMixState.state = "Analyzing Active Deck";
  setSmartMixStatus(`Analyzing ${smartMixSourceLabel(sourceMode).toLowerCase()}...`);
  renderSmartMixPanel();
  const activeDeck = promptPlan?.activeDeck && deckState[promptPlan.activeDeck]?.playing && deckState[promptPlan.activeDeck]?.buffer ? promptPlan.activeDeck : detectActiveDeck();
  const oppositeDeck = activeDeck === "a" ? "b" : activeDeck === "b" ? "a" : null;
  if (promptPlan && activeDeck) {
    promptPlan.activeDeck = activeDeck;
    promptPlan.incomingDeck = oppositeDeck;
  }
  let items = await collectAutoMixItems(mode, sourceMode);
  if (promptPlan && !promptPlan.incomingWasLoaded && Number.isFinite(promptPlan.targetPlaybackTime) && promptPlan.targetPlaybackTime - currentDeckTime(activeDeck || promptPlan.activeDeck) < 2) {
    autoMixState.lastError = "Incoming track preparation could not finish before the requested deadline. Extend the transition time or transition when ready.";
    setSmartMixStatus(autoMixState.lastError);
    return false;
  }
  if (promptPlan?.forceTrackSelection) items = items.filter((item) => !item.id.startsWith("deck-") && (promptPlan.preferredIncomingId ? item.id === promptPlan.preferredIncomingId : promptCandidateMatches(item, promptPlan)));
  if (activeDeck) {
    const activeItem = deckAsSmartMixItem(activeDeck, mode);
    const incomingItem = promptPlan?.forceTrackSelection ? null : deckAsSmartMixItem(oppositeDeck, mode);
    items = [activeItem, incomingItem, ...items]
      .filter(Boolean)
      .filter((item, index, array) => array.findIndex((candidate) => candidate.buffer === item.buffer) === index);
  }
  if (!items.length) {
    autoMixState.items = [];
    autoMixState.plan = [];
    autoMixState.state = "No Eligible Track Found";
    autoMixState.lastError = "No playable track matched the current Smart Mix source.";
    setSmartMixStatus(`${autoMixState.lastError} Add local audio, change source, or load a track manually.`);
    renderSmartMixPanel();
    return false;
  }
  if (activeDeck && items.length < 2) {
    autoMixState.items = items;
    autoMixState.plan = [];
    autoMixState.state = "No Eligible Track Found";
    autoMixState.lastError = promptPlan?.forceTrackSelection ? "No eligible incoming DITC track matched the prompt constraints." : "No eligible incoming track found.";
    setSmartMixStatus(promptPlan?.forceTrackSelection
      ? "The active deck will keep playing. No DITC track matched the prompt constraints; broaden the request or load the incoming deck manually."
      : "The active deck will keep playing. Add another playable track or broaden the Smart Mix source.");
    renderSmartMixPanel();
    return false;
  }
  if (autoMixState.running) stopAiMix({ keepDecks: true, silent: true });
  const plan = buildSmartMixPlan(items, mode, activeDeck ? "decks" : sourceMode);
  if (promptPlan && plan.transitions[0]) applyPromptToTransition(plan.transitions[0], promptPlan);
  if (promptPlan?.requiresSaferPlan) {
    smartPromptState.state = "Unsafe Plan Detected";
    smartPromptState.plan = promptPlan;
    if (tempoSafetyPreferences.automaticallySuggest) generateSaferTransitionPlans(promptPlan);
    setSmartMixStatus("The selected incoming track exceeds the configured tempo safety limit. Use the safer plan or choose another track; the active deck continues unchanged.");
    renderSmartPromptPlan();
    renderSmartMixPanel();
    autoMixState.lastError = "The selected incoming track exceeds the configured tempo safety limit.";
    return false;
  }
  autoMixState.running = true;
  autoMixState.state = activeDeck ? "Preparing Transition" : "Selecting Next Track";
  autoMixState.mode = mode;
  autoMixState.sourceMode = sourceMode;
  autoMixState.items = plan.items;
  autoMixState.plan = plan.transitions;
  autoMixState.index = 0;
  autoMixState.activeDeck = activeDeck || "a";
  autoMixState.incomingDeck = autoMixState.activeDeck === "a" ? "b" : "a";
  autoMixState.lastManualOverride = "None";
  autoMixState.lastError = "None";
  autoMixState.promptPlan = promptPlan;
  emitProjectContextChange("smartMix", "plan-created", { summary: `Created a ${getSmartMixProfile(mode).name} Smart Mix plan`, decision: { domain: "Smart Mix", action: "Plan created", summary: `Created ${plan.transitions.length} Smart Mix transition${plan.transitions.length === 1 ? "" : "s"} in ${getSmartMixProfile(mode).name}`, after: { mode, sourceMode, transitionCount: plan.transitions.length }, initiatedBy: promptPlan ? "user" : "AI" } });
  setSmartMixButtons(true);
  if (activeDeck) {
    setDeckStatus(activeDeck, "playing", { smartMixControlled: true, manualOverride: false });
  } else {
    setCrossfaderValue(0);
    resetSmartDeckControls("a");
    resetSmartDeckControls("b");
    loadBufferToDeck(plan.items[0].buffer, plan.items[0].name, "a", { analysis: plan.items[0].analysis, smartMixControlled: true });
    seekDeck("a", plan.items[0].cueIn);
    applySmartMixPitchPolicy("a", plan.items[0]);
    playDeck("a");
  }
  prepareNextSmartMixDeck();
  setSmartMixStatus(activeDeck
    ? `Smart Mix joined Deck ${activeDeck.toUpperCase()} without restarting it. Preparing Deck ${oppositeDeck.toUpperCase()} from ${smartMixSourceLabel(sourceMode)}.`
    : `Smart Mix ${getSmartMixProfile(mode).name}: ${plan.summary}`);
  scheduleNextAutoMix();
  renderSmartMixPanel();
  switchView("decks");
  return Boolean(autoMixState.running && autoMixState.handoffArmed && Number.isFinite(autoMixState.estimatedTransitionAt));
}

async function collectAutoMixItems(mode = "club", sourceMode = "both") {
  const items = [];
  const selectedLocal = selectedCrateItems().filter((item) => item.kind === "local");
  const selectedIds = new Set(selectedLocal.map((item) => item.id));
  const localSources = selectedLocal.length
    ? sourceFiles.filter((source) => selectedIds.has(source.id))
    : sourceFiles;
  if (sourceMode !== "crate") {
    for (const id of ["a", "b"]) {
      const deck = deckState[id];
      if (deck.buffer) {
        items.push({
          id: `deck-${id}`,
          source: `Deck ${id.toUpperCase()}`,
          name: document.querySelector(`#title-${id}`).textContent,
          buffer: deck.buffer
        });
      }
    }
  }
  if (sourceMode !== "decks") {
    for (const source of localSources) {
      const buffer = await getSourceFileBuffer(source.id);
      if (buffer) {
        if (!source.analysis) source.analysis = analyzeAudioBuffer(buffer, source.name);
        items.push({ id: source.id, source: "Crate", name: source.name, buffer, analysis: source.analysis, notes: source.notes || "" });
      }
    }
    const savedSources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
    for (const source of savedSources) {
      try {
        const buffer = await loadAudioFromUrl(source.url);
        items.push({ id: createId(), source: "Direct link", name: source.name, buffer });
      } catch {
        /* Skip links the browser cannot decode as direct audio. */
      }
    }
  }
  const unique = items
    .filter((item, index, array) => array.findIndex((other) => other.buffer === item.buffer) === index)
    .map((item) => prepareSmartMixItem(item, mode));
  return unique;
}

function prepareSmartMixItem(item, mode) {
  const analysis = enrichSmartAnalysis(item.analysis || analyzeAudioBuffer(item.buffer, item.name), item.buffer, item.name, mode);
  return {
    ...item,
    analysis,
    cueIn: analysis.cueIn,
    mixOut: analysis.mixOut,
    outroStart: analysis.outroStart,
    hotCues: analysis.hotCues
  };
}

function enrichSmartAnalysis(analysis, buffer, name, mode) {
  const profile = getSmartMixProfile(mode);
  const duration = buffer.duration;
  const bpm = analysis.bpm || 120;
  const phraseSeconds = phraseLengthSeconds(bpm, profile.phraseBars);
  const introEnd = Math.min(duration * 0.22, Math.max(8, phraseSeconds));
  const outroStart = Math.max(introEnd + 4, duration - Math.max(12, phraseSeconds));
  const cueIn = duration > 18 ? findSectionCue(buffer, 0, introEnd, "intro") : 0;
  const breakdown = findQuietSection(buffer, Math.min(duration * 0.2, 24), Math.max(duration * 0.78, duration - 12));
  const drop = Math.min(duration - 1, breakdown ? breakdown + Math.min(16, phraseSeconds / 2) : introEnd + phraseSeconds);
  const mixOut = duration > 35 ? Math.max(introEnd + 6, outroStart - profile.overlapSeconds * 0.35) : Math.max(0, duration - Math.min(8, duration * 0.35));
  const density = estimateVocalDensityFromName(name, analysis.genre);
  const percussion = estimatePercussionIntensity(analysis.bpm, analysis.genre, analysis.energy);
  return {
    ...analysis,
    mode,
    loudness: analysis.loudness || estimateBufferLoudness(buffer),
    mood: inferMoodFromAnalysis(name, analysis),
    vocalDensity: density,
    percussionIntensity: percussion,
    phraseSeconds,
    phraseStructure: `${profile.phraseBars}-bar phrases, cue around ${formatTime(cueIn)}, mix out around ${formatTime(mixOut)}`,
    cueIn,
    introEnd,
    outroStart,
    mixOut,
    breakdown,
    drop,
    instrumentalSections: density === "Low" ? [{ start: cueIn, end: Math.min(duration, cueIn + phraseSeconds) }] : [{ start: outroStart, end: duration }],
    stemAvailability: stemState.stems.length ? stemState.stems.map((stem) => stem.name).join(", ") : "No prepared stems",
    hotCues: [
      { label: "Cue", time: cueIn },
      { label: "Intro Phrase", time: introEnd },
      { label: "Breakdown", time: breakdown || Math.max(cueIn, duration * 0.45) },
      { label: "Drop", time: drop },
      { label: "Mix Out", time: mixOut }
    ]
  };
}

function buildSmartMixPlan(items, mode, sourceMode = "both") {
  const profile = getSmartMixProfile(mode);
  const ordered = sourceMode === "decks" ? items : orderSmartMixItems(items, profile);
  const targetBpm = Math.round(weightedAverageBpm(ordered, profile));
  const transitions = ordered.map((item, index) => {
    const next = ordered[(index + 1) % ordered.length];
    return index === ordered.length - 1 && ordered.length < 2 ? null : planSmartTransition(item, next, profile, targetBpm);
  }).filter(Boolean);
  return {
    items: ordered,
    transitions,
    targetBpm,
    summary: `${ordered.length} track${ordered.length === 1 ? "" : "s"} analyzed. Smart Mix may briefly align BPM during blends, then returns the incoming song to original speed. ${transitions[0] ? `First transition: ${transitions[0].style}.` : "Single-track deck control ready."}`
  };
}

function orderSmartMixItems(items, profile) {
  const ordered = [...items].sort((a, b) => {
    const energyDelta = energyRank(a.analysis.energy) - energyRank(b.analysis.energy);
    const bpmDelta = Math.abs(a.analysis.bpm - profile.targetBpm) - Math.abs(b.analysis.bpm - profile.targetBpm);
    if (profile.energyCurve === "rise") return energyDelta || bpmDelta;
    if (profile.energyCurve === "peak") return bpmDelta || energyDelta;
    if (profile.energyCurve === "smooth") return energyDelta || keyDistance(a.analysis.key, b.analysis.key);
    return bpmDelta || energyDelta;
  });
  if (profile.energyCurve === "party") {
    return ordered.sort((a, b) => {
      const energyDelta = energyRank(b.analysis.energy) - energyRank(a.analysis.energy);
      const bpmDelta = Math.abs(a.analysis.bpm - profile.targetBpm) - Math.abs(b.analysis.bpm - profile.targetBpm);
      return energyDelta || bpmDelta;
    });
  }
  return ordered;
}

function weightedAverageBpm(items, profile) {
  if (!items.length) return profile.targetBpm;
  const usable = items.map((item) => normalizeBpmForMix(item.analysis.bpm, profile.targetBpm));
  const avg = usable.reduce((sum, bpm) => sum + bpm, 0) / usable.length;
  return Math.round((avg + profile.targetBpm) / 2);
}

function planSmartTransition(current, next, profile, targetBpm) {
  const bpmDelta = Math.abs(normalizeBpmForMix(current.analysis.bpm, targetBpm) - normalizeBpmForMix(next.analysis.bpm, targetBpm));
  const outgoingBpm = normalizeBpmForMix(current.analysis.bpm, next.analysis.bpm);
  const incomingBpm = normalizeBpmForMix(next.analysis.bpm, outgoingBpm);
  const tempoAssistRatio = bpmDelta > 3 ? clamp(outgoingBpm / incomingBpm, 0.92, 1.08) : 1;
  const harmonic = areKeysCompatible(current.analysis.key, next.analysis.key);
  const vocalClash = current.analysis.vocalDensity === "High" && next.analysis.vocalDensity === "High";
  const energyDelta = energyRank(next.analysis.energy) - energyRank(current.analysis.energy);
  let style = "smooth-crossfade";
  if (profile.id === "aiDj") style = vocalClash ? "vocal-to-instrumental" : harmonic && bpmDelta < 8 ? "bass-swap-phrase" : "filter-sweep";
  if (profile.id === "hiphop" || profile.id === "open") style = bpmDelta > 10 ? "echo-out-drop" : "quick-blend";
  if (profile.id === "house" || profile.id === "edm" || profile.id === "club") style = harmonic && bpmDelta < 8 ? "bass-swap-phrase" : "filter-sweep";
  if (profile.id === "rnb" || profile.id === "chill" || profile.id === "lounge") style = vocalClash ? "vocal-to-instrumental" : "long-dissolve";
  if (profile.id === "festival" || profile.id === "party") style = energyDelta >= 0 ? "drop-mix" : "echo-out-drop";
  const overlap = Math.max(4, Math.min(profile.overlapSeconds, current.buffer.duration - current.mixOut, next.buffer.duration - next.cueIn));
  const endHandoffStart = current.buffer.duration - overlap - 4;
  const safeStart = Math.max(0, Math.min(Math.max(current.mixOut, endHandoffStart), current.buffer.duration - overlap - 0.5));
  return {
    from: current,
    to: next,
    style,
    targetBpm,
    harmonic,
    vocalClash,
    energyDelta,
    startAt: safeStart,
    nextCue: next.cueIn,
    overlap,
    tempoAssistRatio,
    tempoRestoreSeconds: profile.restoreSeconds || 3,
    filterSweep: /filter|bass|long|vocal|drop/.test(style),
    bassSwapAt: style === "bass-swap-phrase" ? 0.55 : 0.35,
    note: `${style.replace(/-/g, " ")} from ${formatTime(current.mixOut)} into ${formatTime(next.cueIn)}`
  };
}

function energyRank(energy) {
  if (energy === "Low") return 0;
  if (energy === "Medium") return 1;
  if (energy === "High") return 2;
  return 1;
}

function getSmartMixProfile(mode) {
  const profiles = {
    aiDj: { id: "aiDj", name: "AI DJ Flow", targetBpm: 106, overlapSeconds: 14, phraseBars: 8, energyCurve: "rise", aggression: 0.62, restoreSeconds: 3 },
    club: { id: "club", name: "Club Mix", targetBpm: 124, overlapSeconds: 18, phraseBars: 16, energyCurve: "rise", aggression: 0.62, restoreSeconds: 3 },
    festival: { id: "festival", name: "Festival Set", targetBpm: 128, overlapSeconds: 12, phraseBars: 8, energyCurve: "peak", aggression: 0.86, restoreSeconds: 2 },
    open: { id: "open", name: "Open Format", targetBpm: 104, overlapSeconds: 9, phraseBars: 8, energyCurve: "party", aggression: 0.72, restoreSeconds: 2.5 },
    hiphop: { id: "hiphop", name: "Hip-Hop Blend", targetBpm: 92, overlapSeconds: 7, phraseBars: 8, energyCurve: "party", aggression: 0.78, restoreSeconds: 2 },
    rnb: { id: "rnb", name: "R&B Slow Jam", targetBpm: 82, overlapSeconds: 20, phraseBars: 16, energyCurve: "smooth", aggression: 0.34, restoreSeconds: 4 },
    house: { id: "house", name: "House Mix", targetBpm: 124, overlapSeconds: 24, phraseBars: 16, energyCurve: "rise", aggression: 0.58, restoreSeconds: 4 },
    edm: { id: "edm", name: "EDM Continuous Mix", targetBpm: 128, overlapSeconds: 18, phraseBars: 16, energyCurve: "peak", aggression: 0.82, restoreSeconds: 2.5 },
    radio: { id: "radio", name: "Radio Mix", targetBpm: 100, overlapSeconds: 8, phraseBars: 8, energyCurve: "smooth", aggression: 0.5, restoreSeconds: 2 },
    lounge: { id: "lounge", name: "Lounge", targetBpm: 96, overlapSeconds: 26, phraseBars: 16, energyCurve: "smooth", aggression: 0.28, restoreSeconds: 5 },
    chill: { id: "chill", name: "Chill", targetBpm: 88, overlapSeconds: 24, phraseBars: 16, energyCurve: "smooth", aggression: 0.22, restoreSeconds: 5 },
    party: { id: "party", name: "Party Mode", targetBpm: 110, overlapSeconds: 10, phraseBars: 8, energyCurve: "party", aggression: 0.88, restoreSeconds: 2 }
  };
  return profiles[mode] || profiles.club;
}

function phraseLengthSeconds(bpm, bars = 16) {
  return (60 / Math.max(60, bpm || 120)) * 4 * bars;
}

function normalizeBpmForMix(bpm, target = 124) {
  let value = bpm || target;
  while (Math.abs(value * 2 - target) < Math.abs(value - target)) value *= 2;
  while (Math.abs(value / 2 - target) < Math.abs(value - target)) value /= 2;
  return value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setDeckPitchRatio(id, ratio) {
  const nextRatio = clamp(Number(ratio) || 1, 0.5, 1.5);
  const pitch = document.querySelector(`#pitch-${id}`);
  if (pitch) pitch.value = nextRatio.toFixed(2);
  if (deckState[id].source) deckState[id].source.playbackRate.value = nextRatio;
}

function keepDeckNaturalPitch(id) {
  setDeckPitchRatio(id, 1);
}

function applySmartMixPitchPolicy(id, item) {
  if (item?.source?.startsWith("Deck")) return;
  keepDeckNaturalPitch(id);
}

function rampDeckPitchToNatural(id, seconds = 3) {
  const pitch = document.querySelector(`#pitch-${id}`);
  const start = Number(pitch?.value || 1);
  if (Math.abs(start - 1) < 0.01) {
    keepDeckNaturalPitch(id);
    return;
  }
  const startedAt = performance.now();
  function step(now) {
    if (!autoMixState.running) return;
    const progress = Math.min(1, (now - startedAt) / (seconds * 1000));
    setDeckPitchRatio(id, start + (1 - start) * easeInOut(progress));
    if (progress < 1) {
      autoMixState.timers.push(requestAnimationFrame(step));
    } else {
      keepDeckNaturalPitch(id);
      setSmartMixStatus(`Deck ${id.toUpperCase()} returned to the song's original BPM.`);
    }
  }
  autoMixState.timers.push(requestAnimationFrame(step));
}

function recoveryCurveValue(progress, curve) {
  if (curve === "linear") return progress;
  if (curve === "ease-in") return progress * progress;
  if (curve === "ease-out") return 1 - Math.pow(1 - progress, 2);
  if (curve === "phrase-stepped") return Math.floor(progress * 8) / 8;
  return easeInOut(progress);
}

function renderBpmRecovery() {
  const panel = document.querySelector("#bpmRecoveryPanel");
  if (!panel) return;
  panel.hidden = !bpmRecoveryState.plan;
  if (!bpmRecoveryState.plan) return;
  const currentBpm = bpmRecoveryState.originalBpm * bpmRecoveryState.currentRatio;
  document.querySelector("#bpmRecoveryState").textContent = bpmRecoveryState.manualOverride ? "Manual tempo override" : bpmRecoveryState.active ? "BPM Recovery Active" : bpmRecoveryState.pending ? "BPM Recovery Pending" : bpmRecoveryState.progress >= 1 ? "BPM Recovery Complete" : "Recovery paused";
  document.querySelector("#bpmOriginal").textContent = bpmRecoveryState.originalBpm.toFixed(1);
  document.querySelector("#bpmBlend").textContent = bpmRecoveryState.blendBpm.toFixed(1);
  document.querySelector("#bpmCurrent").textContent = currentBpm.toFixed(1);
  document.querySelector("#bpmTarget").textContent = bpmRecoveryState.originalBpm.toFixed(1);
  const percent = Math.round(bpmRecoveryState.progress * 100);
  document.querySelector("#bpmRecoveryProgress").style.width = `${percent}%`;
  document.querySelector("#bpmRecoveryProgress").parentElement.setAttribute("aria-valuenow", String(percent));
  document.querySelector("#bpmRecoveryBars").textContent = `${(bpmRecoveryState.progress * bpmRecoveryState.durationBars).toFixed(1)} of ${bpmRecoveryState.durationBars} bars`;
  document.querySelector("#bpmRecoveryCurve").textContent = bpmRecoveryState.curve.replace(/(^|-)(\w)/g, (_, separator, letter) => `${separator ? " " : ""}${letter.toUpperCase()}`);
  document.querySelector("#resumeBpmRecovery").disabled = bpmRecoveryState.active || bpmRecoveryState.progress >= 1;
}

function cancelBpmRecovery(reason = "Cancelled", manualOverride = false, clearPlan = false) {
  if (bpmRecoveryState.frame) cancelAnimationFrame(bpmRecoveryState.frame);
  if (bpmRecoveryState.delayTimer) clearTimeout(bpmRecoveryState.delayTimer);
  bpmRecoveryState.frame = null;
  bpmRecoveryState.delayTimer = null;
  bpmRecoveryState.active = false;
  bpmRecoveryState.pending = false;
  bpmRecoveryState.manualOverride = manualOverride;
  if (manualOverride) {
    smartPromptState.state = "Manual Override";
    setSmartMixStatus("Manual tempo override. BPM recovery stopped and the selected tempo was preserved.");
  } else if (reason) {
    setSmartMixStatus(`BPM recovery ${reason.toLowerCase()}.`);
  }
  if (clearPlan) bpmRecoveryState.plan = null;
  renderBpmRecovery();
}

function runBpmRecovery() {
  if (!bpmRecoveryState.plan || !bpmRecoveryState.deckId) return;
  if (bpmRecoveryState.frame) cancelAnimationFrame(bpmRecoveryState.frame);
  bpmRecoveryState.pending = false;
  bpmRecoveryState.active = true;
  bpmRecoveryState.manualOverride = false;
  bpmRecoveryState.startRatio = Number(document.querySelector(`#pitch-${bpmRecoveryState.deckId}`)?.value || bpmRecoveryState.currentRatio || 1);
  bpmRecoveryState.currentRatio = bpmRecoveryState.startRatio;
  bpmRecoveryState.startedAt = performance.now();
  smartPromptState.state = "BPM Recovery Active";
  function step(now) {
    if (!bpmRecoveryState.active) return;
    const rawProgress = Math.min(1, (now - bpmRecoveryState.startedAt) / Math.max(100, bpmRecoveryState.durationSeconds * 1000));
    const curved = recoveryCurveValue(rawProgress, bpmRecoveryState.curve);
    bpmRecoveryState.progress = rawProgress;
    bpmRecoveryState.currentRatio = bpmRecoveryState.startRatio + (bpmRecoveryState.targetRatio - bpmRecoveryState.startRatio) * curved;
    setDeckPitchRatio(bpmRecoveryState.deckId, bpmRecoveryState.currentRatio);
    renderBpmRecovery();
    if (rawProgress < 1) {
      bpmRecoveryState.frame = requestAnimationFrame(step);
    } else {
      bpmRecoveryState.active = false;
      bpmRecoveryState.frame = null;
      bpmRecoveryState.currentRatio = bpmRecoveryState.targetRatio;
      keepDeckNaturalPitch(bpmRecoveryState.deckId);
      smartPromptState.state = "BPM Recovery Complete";
      setSmartMixStatus(`Deck ${bpmRecoveryState.deckId.toUpperCase()} returned smoothly to its original BPM.`);
      renderBpmRecovery();
      renderSmartPromptPlan();
    }
  }
  bpmRecoveryState.frame = requestAnimationFrame(step);
  renderBpmRecovery();
}

function startPlannedBpmRecovery(id, transition) {
  const plan = transition.promptPlan;
  if (DECKFORGE_DEVELOPMENT) console.debug("[DeckForge][SmartMix] bpm recovery started", { deck: id, planId: plan?.id });
  if (!plan?.bpmRecoveryEnabled || Math.abs(Number(document.querySelector(`#pitch-${id}`)?.value || 1) - 1) < 0.005) {
    rampDeckPitchToNatural(id, transition.tempoRestoreSeconds);
    return;
  }
  cancelBpmRecovery("Recalculated", false, true);
  const originalBpm = Number(deckState[id].analysis?.bpm || plan.originalIncomingBpm || 120);
  const startRatio = Number(document.querySelector(`#pitch-${id}`)?.value || 1);
  bpmRecoveryState.deckId = id;
  bpmRecoveryState.active = false;
  bpmRecoveryState.pending = true;
  bpmRecoveryState.manualOverride = false;
  bpmRecoveryState.startRatio = startRatio;
  bpmRecoveryState.currentRatio = startRatio;
  bpmRecoveryState.targetRatio = 1;
  bpmRecoveryState.originalBpm = originalBpm;
  bpmRecoveryState.blendBpm = originalBpm * startRatio;
  bpmRecoveryState.durationBars = plan.bpmRecoveryDurationBars;
  bpmRecoveryState.durationSeconds = phraseLengthSeconds(originalBpm * startRatio, plan.bpmRecoveryDurationBars);
  bpmRecoveryState.curve = plan.bpmRecoveryCurve;
  bpmRecoveryState.progress = 0;
  bpmRecoveryState.plan = plan;
  smartPromptState.state = "BPM Recovery Pending";
  renderSmartPromptPlan();
  const delaySeconds = phraseLengthSeconds(originalBpm * startRatio, plan.bpmRecoveryStartBars || 0);
  if (delaySeconds > 0) bpmRecoveryState.delayTimer = setTimeout(runBpmRecovery, delaySeconds * 1000);
  else runBpmRecovery();
  renderBpmRecovery();
}

function smartMixSourceLabel(sourceMode) {
  if (sourceMode === "decks") return "loaded decks";
  if (sourceMode === "crate") return "crate tracks";
  return "loaded decks and crate tracks";
}

function resetSmartDeckControls(id) {
  const channel = document.querySelector(`#channel-${id}`);
  const filter = document.querySelector(`#filter-${id}`);
  const mixerFilter = document.querySelector(`#mixer-filter-${id}`);
  if (channel) channel.value = 1;
  if (filter) filter.value = 16000;
  if (mixerFilter) mixerFilter.value = 16000;
  if (deckState[id].filter) deckState[id].filter.frequency.value = 16000;
  updateDeckGain(id);
}

function easeInOut(value) {
  return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function setSmartMixStatus(message) {
  const status = document.querySelector("#smartMixStatus");
  if (status) status.textContent = message;
}

function renderSmartMixPanel() {
  const current = autoMixState.items[autoMixState.index] || null;
  const next = autoMixState.items.length > 1 ? autoMixState.items[(autoMixState.index + 1) % autoMixState.items.length] : null;
  const transition = autoMixState.transition || (autoMixState.running ? currentSmartTransition() : null);
  const bpmDifference = current && next ? Math.abs((current.analysis?.bpm || 0) - (next.analysis?.bpm || 0)) : null;
  const values = {
    smartMixState: autoMixState.state,
    smartMixActiveDeck: autoMixState.running ? `Deck ${autoMixState.activeDeck.toUpperCase()}` : "None",
    smartMixIncomingDeck: autoMixState.incomingDeck ? `Deck ${autoMixState.incomingDeck.toUpperCase()}` : "None",
    smartMixCurrentTrack: current?.name || deckState[autoMixState.activeDeck]?.trackName || "None",
    smartMixNextTrack: next?.name || "None",
    smartMixSourceSummary: `${smartMixSourceLabel(autoMixState.sourceMode)} · ${autoMixState.items.length} eligible`,
    smartMixTransitionStyle: transition ? transition.style.replace(/-/g, " ") : "Not planned",
    smartMixBpmDifference: bpmDifference === null ? "Unknown" : `${bpmDifference} BPM`,
    smartMixKeyCompatibility: transition ? (transition.harmonic ? "Compatible" : "Not matched") : "Unknown",
    smartMixConfidence: transition ? `${transition.harmonic && bpmDifference < 8 ? "High" : bpmDifference < 15 ? "Medium" : "Low"} heuristic` : "Not analyzed",
    smartMixOverride: autoMixState.lastManualOverride
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.querySelector(`#${id}`);
    if (element) element.textContent = value;
  });
  const countdown = document.querySelector("#smartMixCountdown");
  if (countdown) {
    if (["Transitioning", "Executing Safe Transition"].includes(autoMixState.state)) countdown.textContent = "Transition starting";
    else if (transitionController.schedulerActive && Number.isFinite(transitionController.secondsRemaining)) countdown.textContent = deckState[transitionController.activePlan?.activeDeck]?.playing ? `Transition in ${Math.max(0, transitionController.secondsRemaining).toFixed(1)} seconds` : "Countdown paused with outgoing deck";
    else if (autoMixState.estimatedTransitionAt) countdown.textContent = `Estimated transition in ${Math.max(0, Math.ceil((autoMixState.estimatedTransitionAt - performance.now()) / 1000))} seconds`;
    else if (autoMixState.state === "Transition Complete") countdown.textContent = "Transition complete";
    else countdown.textContent = "No transition planned";
  }
  const crossfaderValue = Number(document.querySelector("#crossfader")?.value || 0.5);
  const transitionPercent = autoMixState.running
    ? Math.round((autoMixState.incomingDeck === "a" ? 1 - crossfaderValue : crossfaderValue) * 100)
    : 50;
  const outgoing = document.querySelector("#transitionOutgoing");
  const incoming = document.querySelector("#transitionIncoming");
  const progress = document.querySelector("#transitionProgress");
  const progressTrack = progress?.parentElement;
  if (outgoing) outgoing.textContent = `Deck ${autoMixState.activeDeck?.toUpperCase() || "A"}`;
  if (incoming) incoming.textContent = `Deck ${autoMixState.incomingDeck?.toUpperCase() || "B"}`;
  if (progress) progress.style.width = `${transitionPercent}%`;
  if (progressTrack) progressTrack.setAttribute("aria-valuenow", String(transitionPercent));
  const eqBlend = document.querySelector("#transitionEqBlend");
  if (eqBlend) eqBlend.textContent = `EQ blend: ${autoMixState.state === "Transitioning" ? `${transitionPercent}%` : "neutral"}`;
  const stemUsage = document.querySelector("#transitionStemUsage");
  if (stemUsage) stemUsage.textContent = "Stems: full mix";
  const planSource = document.querySelector("#transitionPlanSource");
  if (planSource) planSource.textContent = `Plan: ${transitionController.activePlan?.source || "none"}`;
  const triggerDetail = document.querySelector("#transitionTriggerDetail");
  if (triggerDetail) triggerDetail.textContent = transitionController.activePlan ? `Trigger: ${transitionController.activePlan.triggerType} · ${formatTime(transitionController.activePlan.targetPlaybackTime)}` : "Trigger: none";
  const diagnostics = document.querySelector("#smartMixDiagnostics");
  if (diagnostics) diagnostics.hidden = !DECKFORGE_DEVELOPMENT;
  const output = document.querySelector("#smartMixDiagnosticsOutput");
  if (output && DECKFORGE_DEVELOPMENT) {
    output.textContent = JSON.stringify({
      activeDeck: autoMixState.activeDeck,
      incomingDeck: autoMixState.incomingDeck,
      deckA: deckState.a.status,
      deckB: deckState.b.status,
      smartMixState: autoMixState.state,
      source: autoMixState.sourceMode,
      selectedNextTrack: next?.name || null,
      transitionTimerSeconds: autoMixState.estimatedTransitionAt ? Math.max(0, Math.ceil((autoMixState.estimatedTransitionAt - performance.now()) / 1000)) : null,
      crossfader: Number(document.querySelector("#crossfader")?.value || 0.5),
      schedulerArmed: autoMixState.handoffArmed,
      rawPrompt: smartPromptState.rawPrompt,
      parsedIntent: smartPromptState.parsedIntent,
      promptState: smartPromptState.state,
      promptTrigger: smartPromptState.plan?.transitionTrigger || null,
      promptTransitionStyle: smartPromptState.plan?.transitionStyle || null,
      promptExecutionInProgress: smartPromptState.executionInProgress,
      promptExecutionError: smartPromptState.executionError || null,
      lastExecutionPlanId: smartPromptState.lastExecutionPlanId,
      tempoSafety: smartPromptState.plan ? evaluateTempoSafety(smartPromptState.plan) : null,
      tempoSafetyPreferences,
      saferPlanIds: smartPromptState.saferPlans.map((plan) => plan.id),
      selectedSaferPlanId: smartPromptState.selectedSaferPlanId,
      incomingSource: smartPromptState.plan?.incomingTrackSource || null,
      activeBpm: smartPromptState.plan?.temporaryIncomingBpm || null,
      incomingOriginalBpm: smartPromptState.plan?.originalIncomingBpm || null,
      temporaryBpm: smartPromptState.plan?.temporaryIncomingBpm || null,
      recoveryStart: smartPromptState.plan?.bpmRecoveryStart || null,
      recoveryDurationBars: bpmRecoveryState.durationBars,
      recoveryCurve: bpmRecoveryState.curve,
      recoveryProgress: bpmRecoveryState.progress,
      recoveryManualOverride: bpmRecoveryState.manualOverride,
      authoritativeTransition: {
        activePlanId: transitionController.activePlan?.id || null,
        planSource: transitionController.activePlan?.source || null,
        previousPlanCancellationResult: transitionController.previousCancellationResult,
        parsedTimestamp: smartPromptState.plan?.parsedTimestamp || null,
        activeDeckCurrentTime: transitionController.activePlan ? currentDeckTime(transitionController.activePlan.activeDeck) : null,
        targetCurrentTime: transitionController.activePlan?.targetPlaybackTime || null,
        secondsRemaining: transitionController.secondsRemaining,
        schedulerActive: transitionController.schedulerActive,
        incomingDeckReady: transitionController.activePlan ? Boolean(deckState[transitionController.activePlan.incomingDeck]?.buffer) : false,
        transitionStarted: transitionController.transitionStarted,
        crossfaderAutomationActive: transitionController.crossfaderAutomationActive,
        lastFailure: transitionController.lastFailure
      },
      lastManualOverride: autoMixState.lastManualOverride,
      lastError: smartPromptState.lastError !== "None" ? smartPromptState.lastError : autoMixState.lastError
    }, null, 2);
  }
}

function renderGlobalTransport() {
  const registry = window.AudioPlaybackRegistry;
  if (!registry) return;
  const snapshot = registry.snapshot();
  const active = snapshot.filter((source) => source.playing || source.paused);
  const audible = active.filter((source) => source.playing);
  const primary = audible[0] || active[0] || null;
  const contextState = AudioEngine.context?.state || "not started";
  const state = globalTransportState.paused ? "Paused" : audible.length ? "Playing" : active.length ? "Paused" : contextState === "running" ? "Ready" : "Audio not started";
  document.querySelector("#globalPlaybackState").textContent = `${state} · Output ${contextState}`;
  document.querySelector("#globalPlaybackSource").textContent = audible.length > 1 ? "Multiple Sources Playing" : primary ? `${primary.displayName}, ${primary.metadata?.name || "Active"}` : "No active source";
  document.querySelector("#globalPlaybackTime").textContent = formatTime(primary?.metadata?.elapsed || 0);
  document.querySelector("#globalResume").disabled = contextState === "running" && !globalTransportState.paused;
  document.querySelector("#globalPause").disabled = contextState !== "running" || !audible.length || globalTransportState.paused;
  document.querySelector("#globalRestart").disabled = !primary || typeof primary.restart !== "function";
  document.querySelector("#globalStop").disabled = !active.length;
  document.querySelector("#globalPlaybackSourceList").innerHTML = active.length ? active.map((source) => `<div class="global-source-row"><span>${escapeHtml(source.displayName)}<small>${escapeHtml(source.metadata?.name || "")}</small></span><button data-global-stop-source="${source.id}" aria-label="Stop ${escapeHtml(source.displayName)}">Stop</button></div>`).join("") : "No active sources.";
  const pageMap = { deck: "decks", preview: ditcState.previewTrackId ? "sources" : "stems", performance: null, timeline: "editor", automation: "decks" };
  document.querySelectorAll(".tab-button").forEach((button) => button.classList.remove("has-audio"));
  active.forEach((source) => {
    let target = pageMap[source.type];
    if (source.id === "pads") target = "sampler";
    if (source.id === "drums") target = "drums";
    if (source.id === "keys") target = "keys";
    if (target) document.querySelector(`.tab-button[data-target="${target}"]`)?.classList.add("has-audio");
  });
  const details = document.querySelector("#globalAudioDiagnostics");
  if (details) details.hidden = !DECKFORGE_DEVELOPMENT;
  const output = document.querySelector("#globalAudioDiagnosticsOutput");
  if (output && DECKFORGE_DEVELOPMENT) output.textContent = JSON.stringify({ audioContextState: contextState, registeredSources: snapshot.map((source) => source.id), activeSources: active.map((source) => source.id), pausedSources: snapshot.filter((source) => source.paused).map((source) => source.id), loopingSources: snapshot.filter((source) => source.looping).map((source) => source.id), automatedSources: snapshot.filter((source) => source.automated).map((source) => source.id), masterVolume: Number(document.querySelector("#masterVolume")?.value || 0), activeTimers: { drums: Boolean(drums.timer), smartMix: autoMixState.timers.length, arrangementNodes: editorState.scheduled.length }, lastPlaybackEvent: registry.lastPlaybackEvent, lastStopEvent: registry.lastStopEvent, lastAudioError: globalTransportState.lastError !== "None" ? globalTransportState.lastError : registry.lastError, deckOwnership: { a: deckState.a.smartMixControlled ? "Smart Mix" : "Manual", b: deckState.b.smartMixControlled ? "Smart Mix" : "Manual" }, smartMixState: autoMixState.state }, null, 2);
}

function setSmartMixButtons(isRunning) {
  const deckStart = document.querySelector("#smartMixToggle");
  const deckStop = document.querySelector("#smartMixStop");
  const aiStart = document.querySelector("#startAiMix");
  const aiStop = document.querySelector("#stopAiMix");
  if (deckStart) deckStart.textContent = isRunning ? "Mixing..." : "Smart Mix";
  if (deckStart) deckStart.disabled = isRunning;
  if (deckStop) deckStop.disabled = !isRunning;
  if (aiStart) aiStart.disabled = isRunning ? true : false;
  if (aiStop) aiStop.disabled = !isRunning;
}

function keyDistance(a, b) {
  const keys = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];
  const rootA = String(a || "C").match(/[A-G](?:#|b)?/)?.[0] || "C";
  const rootB = String(b || "C").match(/[A-G](?:#|b)?/)?.[0] || "C";
  const indexA = keys.indexOf(rootA);
  const indexB = keys.indexOf(rootB);
  if (indexA < 0 || indexB < 0) return 6;
  const diff = Math.abs(indexA - indexB);
  return Math.min(diff, 12 - diff);
}

function areKeysCompatible(a, b) {
  const distance = keyDistance(a, b);
  return distance === 0 || distance === 1 || distance === 5 || distance === 7;
}

function estimateBufferLoudness(buffer) {
  const data = buffer.getChannelData(0);
  const stride = Math.max(1, Math.floor(data.length / 12000));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += stride) {
    sum += data[i] * data[i];
    count += 1;
  }
  return Math.sqrt(sum / Math.max(1, count));
}

function estimatePercussionIntensity(bpm, genre, energy) {
  if (/house|edm|jungle|dnb|hip-hop|trap/i.test(genre) || bpm > 125 || energy === "High") return "High";
  if (bpm > 95 || energy === "Medium") return "Medium";
  return "Low";
}

function estimateVocalDensityFromName(name, genre) {
  const text = `${name} ${genre}`.toLowerCase();
  if (/instrumental|dub|beats?|break|intro|outro|edit/.test(text)) return "Low";
  if (/acapella|vocal|r&b|soul|radio|song/.test(text)) return "High";
  return "Medium";
}

function inferMoodFromAnalysis(name, analysis) {
  const text = name.toLowerCase();
  if (/dark|night|minor|moody|deep/.test(text)) return "Dark";
  if (/party|club|festival|anthem|banger/.test(text) || analysis.energy === "High") return "Energetic";
  if (/chill|lounge|smooth|slow|love/.test(text)) return "Smooth";
  return "Balanced";
}

function findSectionCue(buffer, start, end) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const first = Math.max(0, Math.floor(start * sampleRate));
  const last = Math.min(data.length, Math.floor(end * sampleRate));
  const window = Math.max(1, Math.floor(sampleRate * 0.5));
  let best = first;
  let bestEnergy = Infinity;
  for (let i = first; i < last; i += window) {
    let sum = 0;
    for (let j = 0; j < window && i + j < data.length; j += 1) sum += Math.abs(data[i + j]);
    const energy = sum / window;
    if (energy < bestEnergy) {
      bestEnergy = energy;
      best = i;
    }
  }
  return Math.max(0, best / sampleRate);
}

function findQuietSection(buffer, start, end) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const first = Math.max(0, Math.floor(start * sampleRate));
  const last = Math.min(data.length, Math.floor(end * sampleRate));
  const window = Math.max(1, Math.floor(sampleRate * 2));
  let quietest = null;
  let bestEnergy = Infinity;
  for (let i = first; i < last; i += window) {
    let sum = 0;
    for (let j = 0; j < window && i + j < data.length; j += 1) sum += Math.abs(data[i + j]);
    const energy = sum / window;
    if (energy < bestEnergy) {
      bestEnergy = energy;
      quietest = i / sampleRate;
    }
  }
  return quietest;
}

function transitionPriority(source) {
  if (source === "Deck Quick Action") return 4;
  if (source === "Prompt") return 3;
  if (source === "Smart Mix") return 2;
  return 1;
}

function cancelScheduledTransition(reason = "Cancelled", options = {}) {
  if (transitionController.pollTimer) clearTimeout(transitionController.pollTimer);
  transitionController.pollTimer = null;
  transitionController.version += 1;
  transitionController.schedulerActive = false;
  transitionController.secondsRemaining = null;
  transitionController.lastPlaybackTime = null;
  transitionController.previousCancellationResult = transitionController.activePlan ? `${transitionController.activePlan.id}: ${reason}` : `No active plan: ${reason}`;
  if (!options.keepPlan) transitionController.activePlan = null;
  autoMixState.handoffArmed = false;
  autoMixState.estimatedTransitionAt = null;
  return transitionController.previousCancellationResult;
}

function scheduleTransition(plan) {
  if (!plan?.transition || !Number.isFinite(plan.targetPlaybackTime)) throw new Error("Transition controller received an incomplete concrete plan.");
  if (transitionController.transitionStarted || autoMixState.transition) throw new Error("Transition controller is locked while a crossfade is active.");
  if (transitionController.activePlan) {
    const existingPriority = transitionController.activePlan.priority || transitionPriority(transitionController.activePlan.source);
    const incomingPriority = plan.priority || transitionPriority(plan.source);
    if (incomingPriority < existingPriority) throw new Error(`A higher-priority ${transitionController.activePlan.source} transition is already scheduled.`);
    cancelScheduledTransition(`Replaced by ${plan.source}`);
  }
  const version = ++transitionController.version;
  transitionController.activePlan = { ...plan, version, priority: plan.priority || transitionPriority(plan.source), status: "Waiting for Trigger" };
  transitionController.schedulerActive = true;
  transitionController.transitionStarted = false;
  transitionController.lastFailure = "None";
  autoMixState.handoffArmed = true;
  autoMixState.state = "Waiting for Trigger";
  const initialCurrentTime = currentDeckTime(plan.activeDeck);
  transitionController.secondsRemaining = plan.targetPlaybackTime - initialCurrentTime;
  autoMixState.estimatedTransitionAt = performance.now() + Math.max(0, transitionController.secondsRemaining) * 1000;
  function poll() {
    const activePlan = transitionController.activePlan;
    if (!activePlan || activePlan.version !== version || !transitionController.schedulerActive) return;
    const deck = deckState[activePlan.activeDeck];
    if (!autoMixState.running || !deck?.buffer) {
      transitionController.lastFailure = "Smart Mix stopped before the transition trigger.";
      cancelScheduledTransition(transitionController.lastFailure);
      return;
    }
    const currentTime = currentDeckTime(activePlan.activeDeck);
    const previousTime = transitionController.lastPlaybackTime;
    const remaining = activePlan.targetPlaybackTime - currentTime;
    transitionController.secondsRemaining = remaining;
    transitionController.lastPlaybackTime = currentTime;
    autoMixState.estimatedTransitionAt = deck.playing ? performance.now() + Math.max(0, remaining) * 1000 : null;
    activePlan.status = deck.playing ? "Waiting for Trigger" : "Paused with outgoing deck";
    if (deck.playing && previousTime !== null && previousTime < activePlan.targetPlaybackTime - 0.5 && currentTime > activePlan.targetPlaybackTime + 0.75) {
      transitionController.schedulerActive = false;
      activePlan.status = "Target Passed After Seek";
      showSmartPromptExecutionError("The outgoing deck was seeked past the transition timestamp. Choose Execute Now, Next Phrase, Delay From Now, or Cancel.");
      renderSmartMixPanel();
      return;
    }
    if (deck.playing && remaining <= 0) {
      executeTransition(activePlan);
      return;
    }
    renderSmartMixPanel();
    transitionController.pollTimer = setTimeout(poll, 100);
  }
  transitionController.pollTimer = setTimeout(poll, 0);
  return transitionController.activePlan;
}

function replaceScheduledTransition(plan) {
  const previous = transitionController.activePlan ? cancelScheduledTransition(`Replaced by ${plan.source}`) : "No previous transition plan";
  const scheduled = scheduleTransition(plan);
  transitionController.previousCancellationResult = previous;
  return scheduled;
}

function executeTransition(plan = transitionController.activePlan) {
  if (!plan || !transitionController.schedulerActive) return false;
  if (plan.version !== transitionController.version) return false;
  if (transitionController.pollTimer) clearTimeout(transitionController.pollTimer);
  transitionController.pollTimer = null;
  transitionController.schedulerActive = false;
  transitionController.transitionStarted = true;
  transitionController.crossfaderAutomationActive = true;
  plan.status = "Transitioning";
  autoMixState.plan[autoMixState.index] = plan.transition;
  transitionToNextAutoMixItem();
  return Boolean(autoMixState.transition);
}

function completeTransition(planId = transitionController.activePlan?.id) {
  if (transitionController.activePlan && planId && transitionController.activePlan.id !== planId) return false;
  transitionController.transitionStarted = false;
  transitionController.crossfaderAutomationActive = false;
  if (transitionController.activePlan) transitionController.activePlan.status = "Complete";
  transitionController.schedulerActive = false;
  transitionController.pollTimer = null;
  transitionController.activePlan = null;
  return true;
}

function scheduleNextAutoMix() {
  if (!autoMixState.running || autoMixState.items.length < 2) return;
  prepareNextSmartMixDeck();
  const transition = autoMixState.plan[autoMixState.index] || planSmartTransition(
    autoMixState.items[autoMixState.index],
    autoMixState.items[(autoMixState.index + 1) % autoMixState.items.length],
    getSmartMixProfile(autoMixState.mode),
    Number(document.querySelector("#globalBpm").value) || 124
  );
  const currentTime = currentDeckTime(autoMixState.activeDeck);
  const delay = Math.max(1, transition.startAt - currentTime);
  autoMixState.state = autoMixState.promptPlan ? "Waiting for Trigger" : "Waiting for Transition Point";
  if (autoMixState.promptPlan) { smartPromptState.state = "Waiting for Trigger"; renderSmartPromptPlan(); }
  const planSource = autoMixState.promptPlan?.planSource || (autoMixState.promptPlan ? "Prompt" : "Smart Mix");
  const concretePlan = {
    id: autoMixState.promptPlan?.id || createId(), source: planSource, priority: transitionPriority(planSource),
    activeDeck: autoMixState.activeDeck, incomingDeck: autoMixState.activeDeck === "a" ? "b" : "a",
    triggerType: autoMixState.promptPlan?.triggerType || "analyzed-mix-out", targetPlaybackTime: transition.startAt,
    originalDelaySeconds: delay, transition, status: "Preparing"
  };
  const scheduled = transitionController.activePlan ? replaceScheduledTransition(concretePlan) : scheduleTransition(concretePlan);
  setSmartMixStatus(`Smart Mix preparing: ${transition.note}. Estimated transition in ${Math.ceil(delay)} seconds.`);
  renderSmartMixPanel();
  return scheduled;
}

function currentSmartTransition() {
  if (!autoMixState.items.length) return null;
  return autoMixState.plan[autoMixState.index] || planSmartTransition(
    autoMixState.items[autoMixState.index],
    autoMixState.items[(autoMixState.index + 1) % autoMixState.items.length],
    getSmartMixProfile(autoMixState.mode),
    Number(document.querySelector("#globalBpm").value) || 124
  );
}

function monitorSmartMixHandoff() {
  if (transitionController.activePlan || transitionController.schedulerActive || transitionController.transitionStarted) return;
  if (!autoMixState.running || autoMixState.items.length < 2 || autoMixState.transition || !autoMixState.handoffArmed) return;
  const active = deckState[autoMixState.activeDeck];
  if (!active?.buffer) return;
  prepareNextSmartMixDeck();
  const transition = currentSmartTransition();
  if (!transition) return;
  const current = currentDeckTime(autoMixState.activeDeck);
  const remaining = active.buffer.duration - current;
  const transitionWindow = Math.max(transition.overlap + 1, Math.min(18, active.buffer.duration * 0.18));
  const shouldStartByCue = current >= Math.max(0, transition.startAt - 0.15);
  const shouldStartByEnd = remaining <= transitionWindow;
  if (shouldStartByCue || shouldStartByEnd) {
    transitionToNextAutoMixItem();
  }
}

function prepareNextSmartMixDeck() {
  if (!autoMixState.running || autoMixState.items.length < 2) return null;
  const nextIndex = (autoMixState.index + 1) % autoMixState.items.length;
  const nextDeck = autoMixState.activeDeck === "a" ? "b" : "a";
  if (autoMixState.preparedDeck === nextDeck && autoMixState.preparedIndex === nextIndex) {
    return { deck: nextDeck, index: nextIndex };
  }
  const next = autoMixState.items[nextIndex];
  const transition = autoMixState.plan[autoMixState.index] || planSmartTransition(
    autoMixState.items[autoMixState.index],
    next,
    getSmartMixProfile(autoMixState.mode),
    next.analysis.bpm
  );
  autoMixState.state = autoMixState.promptPlan ? "Preparing Incoming Deck" : deckState[nextDeck].buffer ? "Preparing Transition" : "Loading Incoming Deck";
  if (autoMixState.promptPlan) { smartPromptState.state = "Preparing Incoming Deck"; renderSmartPromptPlan(); }
  autoMixState.incomingDeck = nextDeck;
  if (deckState[nextDeck].buffer !== next.buffer) {
    loadBufferToDeck(next.buffer, next.name, nextDeck, { analysis: next.analysis, smartMixControlled: true });
  } else {
    deckState[nextDeck].trackName = next.name;
    deckState[nextDeck].analysis = next.analysis;
    setDeckStatus(nextDeck, "ready", { smartMixControlled: true, manualOverride: false });
  }
  seekDeck(nextDeck, transition.nextCue);
  setDeckPitchRatio(nextDeck, transition.tempoAssistRatio);
  const channel = document.querySelector(`#channel-${nextDeck}`);
  if (channel) {
    channel.value = 0;
    updateDeckGain(nextDeck);
  }
  autoMixState.preparedDeck = nextDeck;
  autoMixState.preparedIndex = nextIndex;
  setSmartMixStatus(`Smart Mix cued ${next.name} on Deck ${nextDeck.toUpperCase()} for the next handoff${transition.tempoAssistRatio !== 1 ? ` with a temporary BPM assist (${transition.tempoAssistRatio.toFixed(2)}x)` : ""}.`);
  renderSmartMixPanel();
  return { deck: nextDeck, index: nextIndex };
}

function transitionToNextAutoMixItem() {
  if (!autoMixState.running || autoMixState.transition || !autoMixState.handoffArmed) return;
  if (DECKFORGE_DEVELOPMENT) console.debug("[DeckForge][SmartMix] transition started", { activeDeck: autoMixState.activeDeck, incomingDeck: autoMixState.incomingDeck, planId: autoMixState.promptPlan?.id || null });
  autoMixState.handoffArmed = false;
  const nextIndex = (autoMixState.index + 1) % autoMixState.items.length;
  const controllerPlanId = transitionController.activePlan?.id || null;
  const nextDeck = autoMixState.activeDeck === "a" ? "b" : "a";
  const fromDeck = autoMixState.activeDeck;
  const next = autoMixState.items[nextIndex];
  const transition = autoMixState.plan[autoMixState.index] || planSmartTransition(
    autoMixState.items[autoMixState.index],
    next,
    getSmartMixProfile(autoMixState.mode),
    next.analysis.bpm
  );
  if (autoMixState.preparedDeck !== nextDeck || autoMixState.preparedIndex !== nextIndex) {
    prepareNextSmartMixDeck();
  }
  playDeck(nextDeck);
  autoMixState.transition = transition;
  autoMixState.state = transition.promptPlan?.safetyStrategy ? "Executing Safe Transition" : "Transitioning";
  if (transition.promptPlan) { smartPromptState.state = transition.promptPlan.safetyStrategy ? "Executing Safe Transition" : "Transitioning"; renderSmartPromptPlan(); }
  autoMixState.estimatedTransitionAt = null;
  setDeckStatus(fromDeck, "transitioning-out", { smartMixControlled: true });
  setDeckStatus(nextDeck, "transitioning-in", { smartMixControlled: true });
  setSmartMixStatus(`Smart Mix handoff: Deck ${fromDeck.toUpperCase()} to Deck ${nextDeck.toUpperCase()} with ${transition.style.replace(/-/g, " ")}. Returning Deck ${nextDeck.toUpperCase()} to original BPM after the blend.`);
  renderSmartMixPanel();
  performSmartTransition(fromDeck, nextDeck, transition, () => {
    stopDeck(fromDeck);
    resetSmartDeckControls(fromDeck);
    resetSmartDeckControls(nextDeck);
    if (transition.promptPlan) startPlannedBpmRecovery(nextDeck, transition);
    else rampDeckPitchToNatural(nextDeck, transition.tempoRestoreSeconds);
    autoMixState.index = nextIndex;
    autoMixState.activeDeck = nextDeck;
    autoMixState.incomingDeck = fromDeck;
    autoMixState.preparedDeck = null;
    autoMixState.preparedIndex = null;
    autoMixState.transition = null;
    autoMixState.state = "Transition Complete";
    completeTransition(controllerPlanId);
    emitProjectContextChange("smartMix", "transition-completed", { summary: `Completed transition from Deck ${fromDeck.toUpperCase()} to Deck ${nextDeck.toUpperCase()}`, decision: { domain: "Smart Mix", action: "Transition completed", summary: `Completed ${transition.style.replace(/-/g, " ")} from Deck ${fromDeck.toUpperCase()} to Deck ${nextDeck.toUpperCase()}`, after: { outgoingDeck: fromDeck, incomingDeck: nextDeck, style: transition.style }, initiatedBy: transition.promptPlan ? "user" : "AI" } });
    if (transition.promptPlan) {
      autoMixState.running = false;
      autoMixState.promptPlan = null;
      autoMixState.handoffArmed = false;
      setSmartMixButtons(false);
      setDeckStatus(nextDeck, "playing", { smartMixControlled: false });
      smartPromptState.state = bpmRecoveryState.active || bpmRecoveryState.pending ? smartPromptState.state : "Complete";
      renderSmartPromptPlan();
      if (transition.promptPlan.bridgeFinalDestination) continueTempoBridgePlan(transition.promptPlan, nextDeck, fromDeck);
    } else {
      setDeckStatus(nextDeck, "playing", { smartMixControlled: true });
      prepareNextSmartMixDeck();
      scheduleNextAutoMix();
    }
  });
}

function performSmartTransition(fromDeck, nextDeck, transition, done) {
  const target = nextDeck === "a" ? 0 : 1;
  fadeCrossfaderTo(target, transition.overlap, (progress) => {
    applySmartTransitionFrame(fromDeck, nextDeck, transition, progress);
  }, done);
}

function applySmartTransitionFrame(fromDeck, nextDeck, transition, progress) {
  const eased = easeInOut(progress);
  const fromChannel = document.querySelector(`#channel-${fromDeck}`);
  const nextChannel = document.querySelector(`#channel-${nextDeck}`);
  if (fromChannel && nextChannel) {
    const nextLevel = Math.min(1.12, Math.max(0.18, eased * 1.08));
    const fromLevel = Math.max(0, 1 - Math.max(0, eased - 0.18) / 0.82);
    nextChannel.value = nextLevel;
    fromChannel.value = transition.style === "quick-blend" || transition.style === "drop-mix" ? Math.max(0, 1 - eased * 1.35) : fromLevel;
    updateDeckGain(fromDeck);
    updateDeckGain(nextDeck);
  }
  if (transition.filterSweep) {
    const fromFilter = document.querySelector(`#filter-${fromDeck}`);
    const nextFilter = document.querySelector(`#filter-${nextDeck}`);
    const fromMixerFilter = document.querySelector(`#mixer-filter-${fromDeck}`);
    const nextMixerFilter = document.querySelector(`#mixer-filter-${nextDeck}`);
    const fromFreq = Math.max(650, 16000 - eased * 13000);
    const nextFreq = Math.min(16000, 900 + eased * 15100);
    if (fromFilter) fromFilter.value = fromFreq;
    if (nextFilter) nextFilter.value = nextFreq;
    if (fromMixerFilter) fromMixerFilter.value = fromFreq;
    if (nextMixerFilter) nextMixerFilter.value = nextFreq;
    if (deckState[fromDeck].filter) deckState[fromDeck].filter.frequency.value = fromFreq;
    if (deckState[nextDeck].filter) deckState[nextDeck].filter.frequency.value = nextFreq;
  }
  if (transition.style === "echo-out-drop" && progress > 0.72) {
    const fromChannel = document.querySelector(`#channel-${fromDeck}`);
    if (fromChannel) {
      fromChannel.value = Math.max(0, 1 - progress * 1.4);
      updateDeckGain(fromDeck);
    }
  }
  if (transition.style === "bass-swap-phrase" && progress > transition.bassSwapAt) {
    const nextFilter = document.querySelector(`#filter-${nextDeck}`);
    if (nextFilter) nextFilter.value = Math.min(16000, Number(nextFilter.value) + 1200);
  }
}

function fadeCrossfaderTo(target, seconds, frame, done) {
  const crossfader = document.querySelector("#crossfader");
  const start = Number(crossfader.value);
  const startedAt = performance.now();
  function step(now) {
    if (!autoMixState.running) return;
    const progress = Math.min(1, (now - startedAt) / (seconds * 1000));
    const eased = easeInOut(progress);
    setCrossfaderValue(start + (target - start) * eased);
    if (frame) frame(progress);
    if (progress < 1) {
      autoMixState.timers.push(requestAnimationFrame(step));
    } else if (done) {
      done();
    }
  }
  requestAnimationFrame(step);
}

function stopAiMix(options = {}) {
  const hadPromptPlan = Boolean(autoMixState.promptPlan);
  autoMixState.running = false;
  cancelScheduledTransition(options.manualOverride ? "Manual override" : "Smart Mix stopped");
  transitionController.transitionStarted = false;
  transitionController.crossfaderAutomationActive = false;
  if (!options.preserveRecoveryPlan && bpmRecoveryState.plan) cancelBpmRecovery(options.manualOverride ? "Manual override" : "Cancelled", false, true);
  autoMixState.timers.forEach((timer) => {
    clearTimeout(timer);
    cancelAnimationFrame(timer);
  });
  autoMixState.timers = [];
  autoMixState.transition = null;
  autoMixState.handoffArmed = false;
  autoMixState.preparedDeck = null;
  autoMixState.preparedIndex = null;
  autoMixState.estimatedTransitionAt = null;
  autoMixState.incomingDeck = null;
  autoMixState.promptPlan = null;
  if (options.stopDecks) {
    stopDeck("a");
    stopDeck("b");
  }
  resetSmartDeckControls("a");
  resetSmartDeckControls("b");
  for (const id of ["a", "b"]) {
    setDeckStatus(id, deckState[id].playing ? "playing" : deckState[id].buffer ? "paused" : "empty", {
      smartMixControlled: false
    });
  }
  setSmartMixButtons(false);
  if (!options.silent) {
    autoMixState.state = options.manualOverride ? "Manual Override" : "Idle";
    setSmartMixStatus(options.manualOverride
      ? `Manual Override: ${options.manualOverride}. Automation stopped and deck audio was left under manual control.`
      : "Smart Mix stopped. Deck audio continues under manual control.");
  }
  if (hadPromptPlan) {
    smartPromptState.state = options.manualOverride ? "Manual Override" : "Cancelled";
    renderSmartPromptPlan();
  }
  renderSmartMixPanel();
}

function triggerManualOverride(reason, deckId = null) {
  if (!autoMixState.running) return;
  autoMixState.lastManualOverride = reason;
  if (deckId && deckState[deckId]) deckState[deckId].manualOverride = true;
  stopAiMix({ keepDecks: true, manualOverride: reason, preserveRecoveryPlan: bpmRecoveryState.manualOverride });
  emitProjectContextChange("smartMix", "manual-override", { summary: reason, decision: { domain: "Smart Mix", action: "Manual override", summary: reason, after: { deckId, automationStopped: true }, initiatedBy: "user" } });
}

const globalTransportState = { paused: false, lastError: "None" };

function initializePlaybackRegistry() {
  const registry = window.AudioPlaybackRegistry;
  if (!registry) return;
  ["a", "b"].forEach((id) => registry.register({
    id: `deck-${id}`, type: "deck", displayName: `Deck ${id.toUpperCase()}`, overlapAllowed: true,
    stop: () => stopDeck(id), pause: () => pauseDeck(id), resume: () => playDeck(id), restart: () => restartDeck(id),
    getState: () => ({ playing: deckState[id].playing, paused: deckState[id].status === "paused", looping: deckState[id].loop, automated: deckState[id].smartMixControlled, metadata: { name: deckState[id].trackName || `Deck ${id.toUpperCase()}`, elapsed: currentDeckTime(id) } })
  }));
  registry.register({ id: "ditc-preview", type: "preview", displayName: "DITC Preview", preview: true, stop: stopDitcPreview, getState: () => ({ playing: Boolean(ditcState.previewTrackId && stemState.previewSource), metadata: { name: sourceFiles.find((item) => item.id === ditcState.previewTrackId)?.title || "DITC track", elapsed: 0 } }) });
  registry.register({ id: "pads", type: "performance", displayName: "Pads", overlapAllowed: true, stop: stopAllPads, getState: () => { const active = sampler.active.map((source, index) => source ? index : -1).filter((index) => index >= 0); const loops = active.filter((index) => sampler.active[index]?.source.loop); const held = active.filter((index) => sampler.held.has(index)); const latest = active.at(-1); return { playing: active.length > 0, looping: loops.length > 0, recording: Boolean(editorState.recording), metadata: { name: active.length ? `Pads, ${active.length} active${loops.length ? `, ${loops.length} loops` : ""}${held.length ? `, ${held.length} held` : ""}${latest !== undefined ? ` · Pad ${latest + 1}, ${sampler.names[latest]}` : ""}` : "Pads idle", elapsed: 0, activePads: active, loopingPads: loops, heldPads: held, chokeGroups: sampler.chokes } }; } });
  registry.register({ id: "drums", type: "performance", displayName: "Beat Forge", overlapAllowed: true, stop: () => { stopDrums(); stopBeatPreview(); }, pause: pauseDrums, resume: startDrums, restart: () => { stopDrums(); drums.step = 0; startDrums(); }, getState: () => ({ playing: drums.playing || drums.previewing, paused: drums.paused, looping: drums.playing && drums.loop, recording: drums.recording, preview: drums.previewing, metadata: { name: drums.previewing ? "Beat Forge preview" : drums.recording ? `Beat Forge, recording · ${drums.name}` : `Beat Forge, ${drums.name}`, elapsed: drums.step * (60 / (Number(document.querySelector("#globalBpm")?.value) || 124) / 4), pattern: drums.patternId, schedulerActive: Boolean(drums.timer), patternVersion: drums.version } }) });
  registry.register({ id: "keys", type: "performance", displayName: "Harmony Lab", overlapAllowed: true, stop: stopHarmonyPattern, pause: pauseHarmonyPattern, resume: playHarmonyPattern, restart: () => { stopHarmonyPattern(); instrument.patternPlayhead = 0; playHarmonyPattern(); }, getState: () => ({ playing: instrument.patternPlaying || instrument.activeVoices.length > 0, paused: instrument.patternPaused, looping: instrument.patternPlaying && instrument.patternLoop, recording: instrument.recording, preview: instrument.previewing, metadata: { name: instrument.previewing ? "Harmony Lab preview" : instrument.recording ? `Harmony Lab recording · ${instrument.pattern.name}` : instrument.patternPlaying ? `Harmony Lab · ${instrument.pattern.name}` : `${instrument.activeVoices.length} live Harmony voice${instrument.activeVoices.length === 1 ? "" : "s"}`, elapsed: instrument.patternPlayhead, key: instrument.key, scale: instrument.scale, patternVersion: instrument.pattern.version } }) });
  registry.register({ id: "stems-preview", type: "preview", displayName: "Stem Preview", preview: true, stop: stopStemPreview, getState: () => ({ playing: Boolean(stemState.previewSource && !ditcState.previewTrackId), metadata: { name: stemState.sourceName || "Stem preview", elapsed: 0 } }) });
  registry.register({ id: "arrangement", type: "timeline", displayName: "Arrangement", stop: stopEditorArrangement, pause: pauseEditorArrangement, resume: playEditorArrangement, restart: () => { stopEditorArrangement(); editorState.playhead = 0; playEditorArrangement(); }, getState: () => ({ playing: editorState.playing, paused: editorState.paused, metadata: { name: `Arrangement at ${formatTime(editorState.playhead)}`, elapsed: editorState.playhead } }) });
  registry.register({ id: "smart-mix", type: "automation", displayName: "Smart Mix", stop: () => stopAiMix({ keepDecks: true }), getState: () => ({ playing: autoMixState.running, automated: autoMixState.running, metadata: { name: autoMixState.state, elapsed: 0 } }) });
  registry.register({ id: "mix-recording", type: "recording", displayName: "Mix Recording", stop: () => { if (AudioEngine.recorder?.state === "recording") AudioEngine.recorder.stop(); }, getState: () => ({ playing: AudioEngine.recorder?.state === "recording", metadata: { name: "Mix recording", elapsed: 0 } }) });
}

async function stopAllAudio() {
  globalTransportState.paused = false;
  if (window.AudioPlaybackRegistry) await window.AudioPlaybackRegistry.stopAll();
  if (editorState.recording) stopEditorPerformanceRecording();
  ditcState.previewTrackId = null;
  renderSources();
  renderGlobalTransport();
  emitProjectContextChange("playback", "global-stop", { summary: "Stopped all active audio", decision: { domain: "Playback", action: "Global stop", summary: "Stopped all active audio", initiatedBy: "user" } });
}

function panicStopAllAudio() { stopAllAudio(); }

async function pauseGlobalAudio() {
  if (!AudioEngine.context || AudioEngine.context.state !== "running") return;
  try { await AudioEngine.context.suspend(); globalTransportState.paused = true; renderGlobalTransport(); emitProjectContextChange("playback", "global-paused", { summary: "Paused the global audio context" }); }
  catch (error) { globalTransportState.lastError = error.message || "AudioContext pause failed"; }
}

async function resumeGlobalAudio() {
  try { await AudioEngine.init(); globalTransportState.paused = false; renderGlobalTransport(); emitProjectContextChange("playback", "global-resumed", { summary: "Resumed the global audio context" }); }
  catch (error) { globalTransportState.lastError = error.message || "AudioContext resume failed"; }
}

async function resumeContextualPlayback() {
  await resumeGlobalAudio();
  const registry = window.AudioPlaybackRegistry;
  const paused = registry?.snapshot().find((source) => source.paused && typeof source.resume === "function");
  if (paused) {
    await registry.invoke(paused, "resume");
    return;
  }
  if (registry?.snapshot().some((source) => source.playing)) return;
  const loadedDeck = ["a", "b"].find((id) => deckState[id].buffer);
  if (loadedDeck) playDeck(loadedDeck);
}

async function restartContextualPlayback() {
  await resumeGlobalAudio();
  await window.AudioPlaybackRegistry?.restartPrimary();
  renderGlobalTransport();
}

function renderInstrumentOptions() {
  const select = document.querySelector("#instrumentPreset");
  const machineSelect = document.querySelector("#synthMachine");
  select.innerHTML = "";
  machineSelect.innerHTML = "";
  instrumentPresets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    select.appendChild(option);
  });
  synthMachines.forEach((machine) => {
    const option = document.createElement("option");
    option.value = machine.id;
    option.textContent = machine.name;
    machineSelect.appendChild(option);
  });
  select.value = instrument.preset;
  machineSelect.value = instrument.machine;
  updateInstrumentNotes();
}

function updateInstrumentNotes() {
  const preset = getInstrumentPreset();
  const machine = getSynthMachine();
  document.querySelector("#instrumentNotes").textContent = preset && machine ? `${machine.notes} ${preset.notes}` : "";
}

function getInstrumentPreset() {
  return instrumentPresets.find((preset) => preset.id === instrument.preset) || instrumentPresets[0];
}

function getSynthMachine() {
  return synthMachines.find((machine) => machine.id === instrument.machine) || synthMachines[0];
}

function renderKeyboard() {
  const keyboard = document.querySelector("#keyboard");
  const bassKeys = document.querySelector("#bassKeys");
  keyboard.innerHTML = "";
  bassKeys.innerHTML = "";

  instrument.keyboard.forEach((note) => {
    const button = document.createElement("button");
    const rootIndex = harmonyRoots.indexOf(instrument.key);
    const relative = (note.offset - rootIndex + 12) % 12;
    const inScale = harmonyScales[instrument.scale]?.includes(relative);
    button.className = `key-button${note.black ? " is-black" : ""}${note.offset % 12 === rootIndex ? " is-root" : inScale ? " is-scale" : ""}`;
    button.innerHTML = `<strong>${note.label}</strong><small>${note.key}</small>`;
    button.addEventListener("pointerdown", async (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); button._harmonyVoice = await playInstrumentNote(note.offset, false, button, instrument.sustain ? 30 : 4, event.pressure || instrument.velocity); });
    button.addEventListener("pointerup", () => { if (!instrument.sustain) releaseSynthVoice(button._harmonyVoice); button._harmonyVoice = null; });
    button.addEventListener("pointercancel", () => { if (!instrument.sustain) releaseSynthVoice(button._harmonyVoice); button._harmonyVoice = null; });
    keyboard.appendChild(button);
  });

  instrument.bass.forEach((note) => {
    const button = document.createElement("button");
    button.className = "bass-button";
    button.innerHTML = `<strong>${note.label}</strong><small>Bass</small>`;
    button.addEventListener("pointerdown", async (event) => { button._harmonyVoice = await playInstrumentNote(note.offset, true, button, instrument.sustain ? 30 : 4, event.pressure || instrument.velocity); });
    button.addEventListener("pointerup", () => { if (!instrument.sustain) releaseSynthVoice(button._harmonyVoice); button._harmonyVoice = null; });
    bassKeys.appendChild(button);
  });
}

function setBassMode(enabled) {
  instrument.bassMode = enabled;
  const button = document.querySelector("#bassMode");
  button.classList.toggle("is-active", enabled);
  button.setAttribute("aria-pressed", String(enabled));
  button.textContent = enabled ? "Bass On" : "Bass Mode";
}

async function playInstrumentNote(offset, forceBass = false, button = null, duration = 0.7, velocity = instrument.velocity) {
  await AudioEngine.init();
  const preset = getInstrumentPreset();
  const isBass = forceBass || instrument.bassMode;
  let playableOffset = offset;
  if (document.querySelector("#harmonyScaleAssist")?.checked) { const rootIndex = harmonyRoots.indexOf(instrument.key); const scale = harmonyScales[instrument.scale] || harmonyScales.chromatic; const relative = (offset - rootIndex + 12) % 12; if (!scale.includes(relative)) playableOffset += scale.find((degree) => degree > relative) !== undefined ? scale.find((degree) => degree > relative) - relative : 12 - relative; }
  const midi = preset.root + playableOffset + (isBass ? -12 : 12);
  if (document.querySelector("#oneFingerChords")?.checked && !isBass) { await playInstrumentChord(instrument.chordMode, offset); return null; }
  const frequency = midiToFrequency(midi);
  const effectiveVelocity = Math.max(.05, Math.min(1, isBass ? Math.max(velocity, .82) : velocity));
  recordEditorPerformanceEvent({ kind: "key", midi, isBass, duration, presetId: preset.id, machineId: instrument.machine, velocity: effectiveVelocity, sustain: instrument.sustain, pitchBend: instrument.pitchBend, modulation: instrument.modulation });
  if (instrument.recording) recordHarmonyNote(midi, effectiveVelocity, isBass, duration);
  const voice = playSynthVoice(frequency, preset, isBass, duration, 0, effectiveVelocity);
  flashInstrumentButton(button);
  renderHarmonyDiagnostics();
  return voice;
}

async function playInstrumentChord(type, rootOverride = null) {
  await AudioEngine.init();
  const preset = getInstrumentPreset();
  const chord = instrument.chords[type] || instrument.chords.minor7;
  const rootOffset = rootOverride ?? (instrument.bassMode ? -12 : harmonyRoots.indexOf(instrument.key));
  let orderedChord = [...chord];
  if (instrument.arpeggiator.enabled && instrument.arpeggiator.direction === "down") orderedChord.reverse();
  if (instrument.arpeggiator.enabled && instrument.arpeggiator.direction === "updown") orderedChord = [...orderedChord, ...orderedChord.slice(1, -1).reverse()];
  const arpStep = instrument.arpeggiator.rate === "1/16" ? harmonyStepSeconds() : harmonyStepSeconds() * 2;
  orderedChord.forEach((offset, index) => {
    const midi = preset.root + rootOffset + offset + 12;
    const frequency = midiToFrequency(midi);
    const duration = instrument.arpeggiator.enabled ? arpStep * .82 : type === "stab" ? .22 : .95;
    recordEditorPerformanceEvent({ kind: "key", midi, isBass: false, duration, presetId: preset.id, machineId: instrument.machine, velocity: instrument.velocity, chord: type, arpeggiated: instrument.arpeggiator.enabled });
    if (instrument.recording) recordHarmonyNote(midi, instrument.velocity, false, duration);
    playSynthVoice(frequency, preset, false, instrument.sustain ? 30 : duration, instrument.arpeggiator.enabled ? index * arpStep : index * .006, instrument.velocity);
  });
  const button = document.querySelector(`[data-chord="${type}"]`);
  flashInstrumentButton(button);
}

function playSynthVoice(frequency, preset, isBass, duration, delay = 0, velocityScale = 1, options = {}) {
  const ctx = AudioEngine.context;
  const machine = getSynthMachine();
  const now = ctx.currentTime + delay;
  const output = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const oscA = ctx.createOscillator();
  const oscB = ctx.createOscillator();
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  const wave = isBass ? machine.bassWave || preset.bassWave : machine.wave || preset.wave;
  const gain = (isBass ? Math.min(0.72, preset.gain * 1.7) : preset.gain) * machine.gainScale * velocityScale;
  const attack = (isBass ? Math.max(0.002, preset.attack * 0.55) : preset.attack) * machine.attackScale;
  const release = (isBass ? Math.max(0.08, preset.release * 0.65) : preset.release) * machine.releaseScale;

  oscA.type = wave;
  oscB.type = wave;
  subOsc.type = "sine";
  oscA.frequency.setValueAtTime(frequency, now);
  oscB.frequency.setValueAtTime(frequency, now);
  subOsc.frequency.setValueAtTime(frequency * 0.5, now);
  oscB.detune.setValueAtTime(isBass ? 0 : preset.detune + machine.detuneAdd, now);
  subGain.gain.setValueAtTime(isBass ? machine.subMix : machine.subMix * 0.45, now);

  filter.type = "lowpass";
  const voicePitchBend = options.pitchBend ?? instrument.pitchBend;
  const voiceModulation = options.modulation ?? instrument.modulation;
  const bentFrequency = frequency * 2 ** (voicePitchBend / 12);
  oscA.frequency.setValueAtTime(bentFrequency, now);
  oscB.frequency.setValueAtTime(bentFrequency, now);
  subOsc.frequency.setValueAtTime(bentFrequency * 0.5, now);
  filter.frequency.setValueAtTime((isBass ? Math.min(900, preset.filter * machine.filterBoost) : preset.filter * machine.filterBoost) * (1 + voiceModulation * .8), now);
  filter.Q.setValueAtTime(isBass ? Math.max(4, machine.q) : machine.q, now);
  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(gain, now + attack);
  output.gain.exponentialRampToValueAtTime(Math.max(0.001, gain * preset.sustain), now + attack + preset.decay);
  output.gain.setValueAtTime(Math.max(0.001, gain * preset.sustain), now + duration);
  output.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

  oscA.connect(filter);
  oscB.connect(filter);
  subOsc.connect(subGain);
  subGain.connect(filter);
  filter.connect(output);
  output.connect(AudioEngine.masterAnalyser);
  const voice = { oscA, oscB, subOsc, output, filter, baseFrequency: frequency, preset, isBass, released: false };
  instrument.activeVoices.push(voice);
  const cleanup = () => {
    instrument.activeVoices = instrument.activeVoices.filter((activeVoice) => activeVoice !== voice);
  };
  oscA.onended = cleanup;
  oscA.start(now);
  oscB.start(now);
  subOsc.start(now);
  oscA.stop(now + duration + release + 0.04);
  oscB.stop(now + duration + release + 0.04);
  subOsc.stop(now + duration + release + 0.04);
  return voice;
}

function releaseSynthVoice(voice) {
  if (!voice || voice.released || !AudioEngine.context) return;
  voice.released = true; const now = AudioEngine.context.currentTime;
  try { voice.output.gain.cancelScheduledValues(now); voice.output.gain.setValueAtTime(Math.max(.0001, voice.output.gain.value), now); voice.output.gain.exponentialRampToValueAtTime(.0001, now + .12); voice.oscA.stop(now + .14); voice.oscB.stop(now + .14); voice.subOsc.stop(now + .14); } catch { /* Voice may already have ended. */ }
}

function stopAllInstrumentVoices() {
  const voices = [...instrument.activeVoices];
  instrument.activeVoices = [];
  instrument.heldComputerVoices?.clear();
  voices.forEach((voice) => {
    voice.oscA.onended = null;
    try {
      voice.output.gain.cancelScheduledValues(AudioEngine.context.currentTime);
      voice.output.gain.setValueAtTime(0.0001, AudioEngine.context.currentTime);
      voice.oscA.stop();
      voice.oscB.stop();
      voice.subOsc.stop();
    } catch {
      /* Voice may already have ended. */
    }
  });
  renderHarmonyDiagnostics();
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function flashInstrumentButton(button) {
  if (!button) return;
  button.classList.add("is-active");
  setTimeout(() => button.classList.remove("is-active"), 150);
}

function snapshotHarmony(label = "Edit") {
  instrument.undoStack.push({ label, pattern: JSON.parse(JSON.stringify(instrument.pattern)), preset: instrument.preset, machine: instrument.machine, key: instrument.key, scale: instrument.scale });
  if (instrument.undoStack.length > 30) instrument.undoStack.shift();
}

function touchHarmony(source = "Manual") {
  instrument.pattern.version += 1; instrument.pattern.source = source; saveHarmonyState(); renderHarmonyLab();
  const generated = /AI Composer|Harmony Match|Live Recording|Apply/i.test(source);
  emitProjectContextChange("harmonyLab", "harmony-pattern-changed", { summary: `${instrument.pattern.name} updated from ${source}`, decision: generated ? { domain: "Harmony Lab", action: /Live/.test(source) ? "Harmony recorded" : "Harmony generated", summary: `${instrument.pattern.name}: ${instrument.pattern.notes.length} notes in ${instrument.key} ${instrument.scale}`, after: { pattern: instrument.pattern.name, notes: instrument.pattern.notes.length, key: instrument.key, scale: instrument.scale, source }, initiatedBy: /AI|Match/.test(source) ? "AI" : "user" } : null });
}

function renderHarmonyLab() {
  document.querySelector("#keys")?.setAttribute("data-harmony-mode", instrument.workspaceMode);
  const values = { harmonyMode: instrument.workspaceMode, harmonyKey: instrument.key, harmonyScale: instrument.scale, harmonyChordMode: instrument.chordMode, harmonyVelocity: instrument.velocity, harmonyPitchBend: instrument.pitchBend, harmonyModulation: instrument.modulation, harmonyArpRate: instrument.arpeggiator.rate, harmonyArpDirection: instrument.arpeggiator.direction };
  Object.entries(values).forEach(([id, value]) => { const control = document.querySelector(`#${id}`); if (control) control.value = value; });
  document.querySelector("#oneFingerChords").checked = Boolean(instrument.oneFingerChords); document.querySelector("#harmonyArp").checked = instrument.arpeggiator.enabled;
  document.querySelector("#harmonyPatternName").textContent = instrument.pattern.name;
  renderKeyboard(); renderHarmonyEditor(); renderHarmonyInstrumentBrowser(); renderHarmonyMatch(); renderHarmonyDiagnostics();
}

function instrumentCategory(preset) {
  const text = `${preset.name} ${preset.notes}`.toLowerCase();
  if (/bass|sub|reese/.test(text)) return "Bass"; if (/organ/.test(text)) return "Organ"; if (/string/.test(text)) return "Strings"; if (/house/.test(text)) return "House Stabs"; if (/electric|r&b/.test(text)) return "Rhodes"; if (/pad|atmos/.test(text)) return "Pads"; if (/pluck|clav/.test(text)) return "Plucks"; if (/rap|boom/.test(text)) return "Boom Bap Keys"; if (/soul/.test(text)) return "Neo Soul"; if (/new wave|vintage/.test(text)) return "Vintage"; return "Synth Leads";
}

function renderHarmonyInstrumentBrowser() {
  const categories = document.querySelector("#harmonyInstrumentCategories"); const results = document.querySelector("#harmonyInstrumentResults"); if (!categories || !results) return;
  categories.innerHTML = harmonyInstrumentCategories.map((category) => `<button type="button" class="secondary-button harmony-category${instrument.instrumentCategory === category ? " is-active" : ""}" data-harmony-category="${category}">${category}</button>`).join("");
  const query = document.querySelector("#harmonyInstrumentSearch")?.value.trim().toLowerCase() || "";
  const filtered = instrumentPresets.filter((preset) => { const category = instrumentCategory(preset); const matches = instrument.instrumentCategory === "All" || instrument.instrumentCategory === category || (instrument.instrumentCategory === "Favorites" && instrument.favorites.includes(preset.id)) || (instrument.instrumentCategory === "Recently Used" && preset.id === instrument.preset); return matches && (!query || `${preset.name} ${preset.notes}`.toLowerCase().includes(query)); });
  instrument.filteredPresets = filtered; if (instrument.selectedInstrumentIndex >= filtered.length) instrument.selectedInstrumentIndex = 0;
  results.innerHTML = filtered.length ? filtered.map((preset, index) => `<button type="button" class="harmony-instrument-result${preset.id === instrument.preset || index === instrument.selectedInstrumentIndex ? " is-active" : ""}" data-harmony-instrument-index="${index}"><strong>${preset.name}</strong><small>${instrumentCategory(preset)} · ${instrument.favorites.includes(preset.id) ? "Favorite · " : ""}${preset.notes}</small></button>`).join("") : `<p class="fine-print">No built-in instrument matches this category. Generated and custom sample instruments are Coming Soon.</p>`;
}

async function previewHarmonyInstrument() {
  const preset = instrument.filteredPresets?.[instrument.selectedInstrumentIndex]; if (!preset) return; await AudioEngine.init(); stopAllInstrumentVoices(); const old = instrument.preset; instrument.preset = preset.id; [0, 4, 7, 11].forEach((offset, index) => playSynthVoice(midiToFrequency(preset.root + 12 + offset), preset, false, .55, index * .18, .55)); instrument.preset = old;
}

function loadHarmonyInstrument() {
  const preset = instrument.filteredPresets?.[instrument.selectedInstrumentIndex]; if (!preset) return; instrument.preset = preset.id; document.querySelector("#instrumentPreset").value = preset.id; updateInstrumentNotes(); saveHarmonyState(); renderHarmonyInstrumentBrowser();
}

function harmonyStepSeconds() { return 60 / (Number(document.querySelector("#globalBpm")?.value) || 124) / 4; }

function recordHarmonyNote(midi, velocity, isBass, durationSeconds) {
  if (!instrument.recording || !AudioEngine.context) return;
  const elapsed = AudioEngine.context.currentTime - instrument.recordStartedAt; const step = Math.max(0, Math.min(instrument.pattern.bars * 16 - 1, Math.round(elapsed / harmonyStepSeconds()) % (instrument.pattern.bars * 16)));
  instrument.pattern.notes.push({ id: createId(), midi, start: step, duration: Math.max(1, Math.round(durationSeconds / harmonyStepSeconds())), velocity, type: isBass ? "bass" : "melody", automation: { modulation: instrument.modulation, pitchBend: instrument.pitchBend } }); touchHarmony("Live Recording");
}

function renderHarmonyEditor() {
  const editor = document.querySelector("#harmonyEditor"); if (!editor) return; const root = getInstrumentPreset().root; const pitches = Array.from({ length: 13 }, (_, index) => root + 24 - index);
  editor.innerHTML = "";
  pitches.forEach((midi) => { const row = document.createElement("div"); row.className = "harmony-note-grid"; row.innerHTML = `<span>${harmonyRoots[midi % 12]}${Math.floor(midi / 12) - 1}</span>`; for (let localStep = 0; localStep < 16; localStep += 1) { const note = instrument.pattern.notes.find((item) => item.midi === midi && item.start === localStep); if (instrument.harmonyView === "velocity" || instrument.harmonyView === "automation") { const input = document.createElement("input"); input.type = "range"; input.min = instrument.harmonyView === "velocity" ? .05 : 0; input.max = 1; input.step = .01; input.value = instrument.harmonyView === "velocity" ? note?.velocity || .05 : note?.automation?.modulation || 0; input.disabled = !note; input.className = "harmony-velocity-cell"; input.ariaLabel = `${instrument.harmonyView} for ${harmonyRoots[midi % 12]} step ${localStep + 1}`; input.addEventListener("input", () => { if (instrument.harmonyView === "velocity") note.velocity = Number(input.value); else { note.automation ||= {}; note.automation.modulation = Number(input.value); } instrument.selectedNoteId = note.id; touchHarmony(); }); row.appendChild(input); continue; } const cell = document.createElement("button"); cell.type = "button"; cell.className = `harmony-note-cell${note ? " is-on" : ""}`; cell.ariaLabel = `${harmonyRoots[midi % 12]} step ${localStep + 1}${note ? ", active" : ""}`; cell.addEventListener("click", () => { snapshotHarmony("Piano roll edit"); if (note) { instrument.selectedNoteId = note.id; } else { const created = { id: createId(), midi, start: localStep, duration: 1, velocity: instrument.velocity, type: "melody", automation: { modulation: instrument.modulation, pitchBend: instrument.pitchBend } }; instrument.pattern.notes.push(created); instrument.selectedNoteId = created.id; } touchHarmony(); }); row.appendChild(cell); } editor.appendChild(row); });
  const selected = instrument.pattern.notes.find((note) => note.id === instrument.selectedNoteId); const duration = document.querySelector("#harmonyNoteDuration"); if (duration) { duration.value = selected?.duration || 1; duration.disabled = !selected; }
}

function scheduleHarmonyPattern(pattern = instrument.pattern, preview = false) {
  if (!AudioEngine.context || !pattern.notes.length) return 0; const startAt = AudioEngine.context.currentTime + .04; const stepSeconds = harmonyStepSeconds(); const preset = getInstrumentPreset();
  pattern.notes.forEach((note) => playSynthVoice(midiToFrequency(note.midi), preset, note.type === "bass", Math.max(.08, note.duration * stepSeconds * .92), note.start * stepSeconds + .04, note.velocity, note.automation || {}));
  if (preview) instrument.previewing = true;
  return pattern.bars * 16 * stepSeconds;
}

async function playHarmonyPattern() {
  if (instrument.patternPlaying || instrument.patternTimer) return; await AudioEngine.init(); if (!instrument.pattern.notes.length) { document.querySelector("#harmonyAiMessage").textContent = "Add or generate notes before playing the Harmony pattern."; return; }
  instrument.patternPlaying = true; instrument.patternPaused = false; instrument.patternStartedAt = AudioEngine.context.currentTime; const duration = scheduleHarmonyPattern(); document.querySelector("#harmonyPlay").textContent = "Playing";
  instrument.patternTimer = setTimeout(() => { instrument.patternTimer = null; if (instrument.patternLoop && instrument.patternPlaying) { instrument.patternPlaying = false; playHarmonyPattern(); } else stopHarmonyPattern(); }, duration * 1000);
  renderHarmonyDiagnostics();
  emitProjectContextChange("harmonyLab", "playback-started", { summary: `Playing Harmony pattern ${instrument.pattern.name}` });
}

function stopHarmonyPattern() { const wasActive = instrument.patternPlaying || instrument.patternPaused || instrument.previewing || instrument.recording; clearTimeout(instrument.patternTimer); instrument.patternTimer = null; instrument.patternPlaying = false; instrument.patternPaused = false; instrument.previewing = false; instrument.recording = false; stopAllInstrumentVoices(); const play = document.querySelector("#harmonyPlay"); if (play) play.textContent = "Play Pattern"; const record = document.querySelector("#harmonyRecord"); if (record) { record.textContent = "Record"; record.classList.remove("is-active"); } renderHarmonyDiagnostics(); if (wasActive) emitProjectContextChange("harmonyLab", "playback-stopped", { summary: "Stopped Harmony playback" }); }
function pauseHarmonyPattern() { const wasPlaying = instrument.patternPlaying; clearTimeout(instrument.patternTimer); instrument.patternTimer = null; instrument.patternPlaying = false; instrument.patternPaused = true; stopAllInstrumentVoices(); document.querySelector("#harmonyPlay").textContent = "Resume"; if (wasPlaying) emitProjectContextChange("harmonyLab", "playback-paused", { summary: "Paused Harmony playback" }); }

function updateHarmonyPosition() { if (!instrument.patternPlaying || !AudioEngine.context) return; const elapsed = AudioEngine.context.currentTime - instrument.patternStartedAt; const step = Math.floor(elapsed / harmonyStepSeconds()) % (instrument.pattern.bars * 16); instrument.patternPlayhead = step * harmonyStepSeconds(); const display = document.querySelector("#harmonyPosition"); if (display) display.textContent = `Bar ${Math.floor(step / 16) + 1} · Beat ${Math.floor((step % 16) / 4) + 1}`; }

function generateHarmonyNotes(kind = "composer", variation = false) {
  const prompt = document.querySelector("#harmonyPrompt")?.value.trim() || "Create soulful minor chords"; const lower = prompt.toLowerCase(); const root = getInstrumentPreset().root + harmonyRoots.indexOf(instrument.key); const bars = 4; const seed = (Date.now() % 100000) + (variation ? 37 : 0); const random = createSeededGenerator(seed); const notes = [];
  const bass = kind === "bass" || /bass|808/.test(lower); const pad = /pad|cinematic|transition/.test(lower); const progression = lower.includes("dark") ? [0, -2, -5, -7] : lower.includes("house") ? [0, 5, 7, 3] : [0, 5, 3, 7];
  if (bass) { for (let step = 0; step < bars * 16; step += 4) { const degree = progression[Math.floor(step / 16) % progression.length]; notes.push({ id: createId(), midi: root - 12 + degree + (random() > .72 ? 7 : 0), start: step, duration: lower.includes("808") ? 4 : 2, velocity: .72 + random() * .25, type: "bass", automation: {} }); } }
  else progression.forEach((degree, bar) => { const chord = lower.includes("major") ? instrument.chords.major7 : lower.includes("sus") ? instrument.chords.sus : instrument.chords.minor7; chord.forEach((offset) => notes.push({ id: createId(), midi: root + 12 + degree + offset, start: bar * 16, duration: pad ? 15 : 8, velocity: pad ? .52 : .66 + random() * .16, type: pad ? "pad" : "chord", automation: {} })); });
  return { id: createId(), name: bass ? `${document.querySelector("#bassGeneratorStyle")?.value || "Bass"} Idea` : `${instrument.key} ${instrument.scale} ${pad ? "Pad" : "Chords"}`, bars, stepsPerBar: 16, notes, version: instrument.pattern.version + 1, source: kind === "match" ? "Harmony Match" : "AI Composer", type: bass ? "bass" : pad ? "pad" : "chords", seed, prompt };
}

function buildHarmonyPlan(variation = false) { const pattern = generateHarmonyNotes("composer", variation); instrument.pendingPlan = pattern; instrument.lastPrompt = pattern.prompt; document.querySelector("#harmonyPlanOutput").textContent = JSON.stringify({ type: pattern.type, key: instrument.key, scale: instrument.scale, bars: pattern.bars, notes: pattern.notes.length, instrument: getInstrumentPreset().name, BPM: Number(document.querySelector("#globalBpm")?.value) || 124, source: pattern.source, explanation: pattern.type === "bass" ? "Root movement follows a four-bar project pocket and leaves space between attacks." : "Four-bar voice leading uses the selected key and scale with stable chord tones.", seed: pattern.seed }, null, 2); ["previewHarmonyPlan", "explainHarmonyPlan", "applyHarmonyPlan"].forEach((id) => { document.querySelector(`#${id}`).disabled = false; }); }

async function previewHarmonyPattern(pattern = instrument.pendingPlan) { if (!pattern) return; await AudioEngine.init(); stopHarmonyPattern(); const duration = scheduleHarmonyPattern(pattern, true); instrument.patternTimer = setTimeout(stopHarmonyPattern, duration * 1000); }
function applyHarmonyPlan(pattern = instrument.pendingPlan) { if (!pattern) return; snapshotHarmony("Apply composition plan"); instrument.pattern = JSON.parse(JSON.stringify(pattern)); instrument.selectedNoteId = null; instrument.pendingPlan = null; touchHarmony(pattern.source); document.querySelector("#harmonyAiMessage").textContent = `Applied ${pattern.name}. Manual editing and Undo remain available.`; }

function generateBassPlan(variation = false) { const field = document.querySelector("#harmonyPrompt"); const old = field.value; field.value = `${document.querySelector("#bassGeneratorStyle").value}${variation ? " variation" : ""} in ${instrument.key} ${instrument.scale}`; instrument.pendingBass = generateHarmonyNotes("bass", variation); field.value = old; document.querySelector("#harmonyAiMessage").textContent = `Prepared ${instrument.pendingBass.name}. Preview or Apply when ready.`; }

function undoHarmony() { const previous = instrument.undoStack.pop(); if (!previous) return; instrument.pattern = previous.pattern; instrument.preset = previous.preset; instrument.machine = previous.machine; instrument.key = previous.key; instrument.scale = previous.scale; saveHarmonyState(); renderInstrumentOptions(); renderHarmonyLab(); }

function sendHarmonyToArrangement() { const bpm = Number(document.querySelector("#globalBpm")?.value) || 124; const stepSeconds = 60 / bpm / 4; const events = instrument.pattern.notes.map((note) => ({ kind: "key", midi: note.midi, isBass: note.type === "bass", time: note.start * stepSeconds, duration: note.duration * stepSeconds, velocity: note.velocity, presetId: instrument.preset, machineId: instrument.machine, automation: note.automation })); const clip = { id: createId(), sourceKind: "performance", type: "keys", name: instrument.pattern.name, trackIndex: 1, start: editorState.playhead, duration: instrument.pattern.bars * 16 * stepSeconds, sourceStart: 0, volume: 1, fadeIn: 0, fadeOut: 0, stretch: 1, loop: true, muted: false, solo: false, filter: 16000, eq: 0, effect: "none", color: editorClipColor("keys"), events }; editorState.clips.push(clip); editorState.selectedClipId = clip.id; renderEditor(); editorStatus(`Sent ${instrument.pattern.name} from Harmony Lab to Arrangement.`); emitProjectContextChange("arrangement", "harmony-clip-added", { summary: `Added ${instrument.pattern.name} from Harmony Lab`, decision: { domain: "Arrangement", action: "Harmony clip added", summary: `Added ${instrument.pattern.name} from Harmony Lab`, after: { clipId: clip.id, duration: clip.duration }, initiatedBy: "user" } }); }

function renderHarmonyMatch() { const deck = deckState.a.buffer ? deckState.a : deckState.b.buffer ? deckState.b : null; const output = document.querySelector("#harmonyMatchSuggestion"); if (!output) return; const deckKey = deck?.analysis?.key || instrument.key; const bpm = deck?.analysis?.bpm || Number(document.querySelector("#globalBpm")?.value) || 124; const groove = activeDrumGroove()?.name || "current Beat Forge groove"; instrument.matchPlan = generateHarmonyNotes("match", false); output.textContent = deck ? `Deck ${deck.id.toUpperCase()} is near ${Math.round(bpm)} BPM${deckKey ? ` in ${deckKey}` : ""}. Try ${getInstrumentPreset().name} chords with a sparse bass counterline over ${groove}.` : `Beat Forge suggests a ${groove} pocket. Use restrained ${instrument.key} ${instrument.scale} harmony to preserve rhythmic space.`; }

async function enableHarmonyMidi() { if (!navigator.requestMIDIAccess) { instrument.lastError = "Web MIDI is unavailable in this browser."; renderHarmonyDiagnostics(); return; } try { const access = await navigator.requestMIDIAccess(); instrument.midiEnabled = true; instrument.midiInputs = [...access.inputs.values()].map((input) => input.name); access.inputs.forEach((input) => { input.onmidimessage = (event) => { const [status, note, velocity] = event.data; const command = status & 0xf0; if (command === 0x90 && velocity > 0) playInstrumentNote(note - getInstrumentPreset().root - 12, false, null, instrument.sustain ? 30 : 4, velocity / 127); if (command === 0x80 || (command === 0x90 && velocity === 0)) { if (!instrument.sustain) stopAllInstrumentVoices(); } if (command === 0xe0) { instrument.pitchBend = (((velocity << 7) | note) - 8192) / 4096; updateHarmonyVoiceModulation(); } if (command === 0xb0 && note === 1) { instrument.modulation = velocity / 127; updateHarmonyVoiceModulation(); } }; }); document.querySelector("#enableHarmonyMidi").textContent = `MIDI On (${instrument.midiInputs.length})`; } catch (error) { instrument.lastError = error.message; } renderHarmonyDiagnostics(); }

function updateHarmonyVoiceModulation() { instrument.activeVoices.forEach((voice) => { const now = AudioEngine.context.currentTime; const bent = voice.baseFrequency * 2 ** (instrument.pitchBend / 12); voice.oscA.frequency.setTargetAtTime(bent, now, .01); voice.oscB.frequency.setTargetAtTime(bent, now, .01); voice.subOsc.frequency.setTargetAtTime(bent * .5, now, .01); voice.filter.frequency.setTargetAtTime(Math.min(18000, voice.preset.filter * (1 + instrument.modulation * .8)), now, .02); }); }

function saveHarmonyState() { localStorage.setItem("deckforge-harmony-lab", JSON.stringify({ preset: instrument.preset, machine: instrument.machine, workspaceMode: instrument.workspaceMode, key: instrument.key, scale: instrument.scale, chordMode: instrument.chordMode, pattern: instrument.pattern, patterns: instrument.patterns.slice(-30), promptHistory: instrument.promptHistory.slice(-30), favorites: instrument.favorites, arpeggiator: instrument.arpeggiator })); }
function restoreHarmonyState() { try { const saved = JSON.parse(localStorage.getItem("deckforge-harmony-lab") || "null"); if (!saved) return; Object.assign(instrument, saved, { activeVoices: [], patternPlaying: false, patternPaused: false, patternTimer: null, undoStack: [], pendingPlan: null }); } catch (error) { instrument.lastError = error.message; } }
function renderHarmonyDiagnostics() { const details = document.querySelector("#harmonyDiagnostics"); if (details) details.hidden = !DECKFORGE_DEVELOPMENT; const output = document.querySelector("#harmonyDiagnosticsOutput"); if (!output || !DECKFORGE_DEVELOPMENT) return; output.textContent = JSON.stringify({ instrument: getInstrumentPreset().name, engine: getSynthMachine().name, key: instrument.key, scale: instrument.scale, activeVoices: instrument.activeVoices.length, sustain: instrument.sustain, pitchBend: instrument.pitchBend, modulation: instrument.modulation, pattern: instrument.pattern.name, patternVersion: instrument.pattern.version, notes: instrument.pattern.notes.length, playing: instrument.patternPlaying, recording: instrument.recording, loop: instrument.patternLoop, midiEnabled: instrument.midiEnabled, midiInputs: instrument.midiInputs, pendingPlan: instrument.pendingPlan?.name || null, lastError: instrument.lastError }, null, 2); }

async function loadStemFile(file) {
  if (!isSupportedAudioFile(file)) return;
  stemState.file = file;
  stemState.sourceName = file.name.replace(/\.[^/.]+$/, "");
  stemState.sourceBuffer = await loadAudioFile(file);
  stemState.stems = [];
  document.querySelector("#splitStems").disabled = false;
  document.querySelector("#stemStatus").textContent = `Loaded ${file.name}. Ready to split.`;
  renderStemResults();
}

async function splitCurrentStemFile() {
  if (!stemState.sourceBuffer) return;
  const button = document.querySelector("#splitStems");
  button.disabled = true;
  stopStemPreview();
  document.querySelector("#stemStatus").textContent = "Checking for local AI stem server...";
  if (stemState.file) {
    try {
      stemState.stems = await splitStemsWithServer(stemState.file);
      document.querySelector("#stemStatus").textContent = `Created ${stemState.stems.length} isolated AI stems from ${stemState.sourceName}.`;
      button.disabled = false;
      renderStemResults();
      renderAiContext();
      emitProjectContextChange("stems", "stems-separated", { summary: `Separated ${stemState.stems.length} stems from ${stemState.sourceName}`, decision: { domain: "Stems", action: "Stems separated", summary: `Created ${stemState.stems.length} stems from ${stemState.sourceName}`, after: { source: stemState.sourceName, stemTypes: stemState.stems.map((stem) => stem.name) }, initiatedBy: "user" } });
      return;
    } catch {
      document.querySelector("#stemStatus").textContent = "AI stem server unavailable. Creating rough browser fallback stems...";
    }
  } else {
    document.querySelector("#stemStatus").textContent = "This source came from a decoded URL, so browser fallback stems are being created.";
  }
  await splitStemsWithBrowserFallback();
  button.disabled = false;
  renderStemResults();
  emitProjectContextChange("stems", "stems-separated", { summary: `Created ${stemState.stems.length} browser stems from ${stemState.sourceName}`, decision: { domain: "Stems", action: "Stems separated", summary: `Created ${stemState.stems.length} browser fallback stems from ${stemState.sourceName}`, after: { source: stemState.sourceName, stemTypes: stemState.stems.map((stem) => stem.name) }, initiatedBy: "user" } });
}

async function splitStemsWithServer(file) {
  const formData = new FormData();
  formData.append("audio", file);
  const response = await fetch("/api/stems", {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    throw new Error("Stem server unavailable.");
  }
  const payload = await response.json();
  const stems = [];
  for (const stem of payload.stems) {
    const audioResponse = await fetch(stem.url);
    if (!audioResponse.ok) throw new Error("Unable to fetch separated stem.");
    const buffer = await AudioEngine.context.decodeAudioData(await audioResponse.arrayBuffer());
    stems.push({
      id: stem.id,
      name: stem.name,
      buffer,
      fileName: stem.fileName || `${stemState.sourceName}-${stem.id}.wav`,
      quality: "AI isolated"
    });
  }
  return stems;
}

async function splitStemsWithBrowserFallback() {
  const specs = [
    { id: "vocals", name: "Vocals", filters: [{ type: "bandpass", frequency: 1450, q: 0.85 }], gain: 1.15, quality: "Rough browser stem" },
    { id: "drums", name: "Drums", filters: [{ type: "highpass", frequency: 110, q: 0.7 }, { type: "bandpass", frequency: 2400, q: 0.95 }], gain: 1.1, quality: "Rough browser stem" },
    { id: "bass", name: "Bass", filters: [{ type: "lowpass", frequency: 180, q: 0.9 }], gain: 1.28, quality: "Rough browser stem" },
    { id: "guitar", name: "Guitar", filters: [{ type: "bandpass", frequency: 720, q: 0.7 }], gain: 1.05, quality: "Rough browser stem" },
    { id: "keysSynth", name: "Keys/Synth", filters: [{ type: "bandpass", frequency: 1850, q: 0.75 }], gain: 1.02, quality: "Rough browser stem" },
    { id: "air", name: "Air/FX", filters: [{ type: "highpass", frequency: 4200, q: 0.7 }], gain: 0.95, quality: "Rough browser stem" }
  ];

  const stems = [];
  for (const spec of specs) {
    const buffer = await renderFilteredStem(stemState.sourceBuffer, spec);
    stems.push({
      ...spec,
      buffer,
      fileName: `${stemState.sourceName}-${spec.id}.wav`
    });
  }
  stemState.stems = stems;
  document.querySelector("#stemStatus").textContent = `Created ${stems.length} rough fallback stems from ${stemState.sourceName}.`;
  renderAiContext();
}

async function renderFilteredStem(buffer, spec) {
  const sampleRate = buffer.sampleRate;
  const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, sampleRate);
  const source = offline.createBufferSource();
  const gain = offline.createGain();
  let node = source;
  source.buffer = buffer;

  spec.filters.forEach((filterSpec) => {
    const filter = offline.createBiquadFilter();
    filter.type = filterSpec.type;
    filter.frequency.value = filterSpec.frequency;
    filter.Q.value = filterSpec.q;
    node.connect(filter);
    node = filter;
  });

  gain.gain.value = spec.gain;
  node.connect(gain);
  gain.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

function renderStemResults() {
  const results = document.querySelector("#stemResults");
  renderEditorSourceBin();
  results.innerHTML = "";
  stemState.stems.forEach((stem) => {
    const card = document.createElement("article");
    card.className = "stem-card";
    card.innerHTML = `
      <div>
        <strong>${stem.name}</strong>
        <small>${stem.fileName}</small>
        <small>${stem.quality || "Stem"}</small>
      </div>
      <div class="stem-actions">
        <button data-stem-action="preview" data-stem="${stem.id}">Preview</button>
        <button data-stem-action="deck-a" data-stem="${stem.id}">Deck A</button>
        <button data-stem-action="deck-b" data-stem="${stem.id}">Deck B</button>
        <button data-stem-action="pad" data-stem="${stem.id}">Pad</button>
        <button data-stem-action="download" data-stem="${stem.id}">WAV</button>
        <button data-stem-action="delete" data-stem="${stem.id}">Delete</button>
      </div>
    `;
    results.appendChild(card);
  });
}

async function handleStemAction(action, stemId) {
  const stem = stemState.stems.find((item) => item.id === stemId);
  if (!stem) return;
  await AudioEngine.init();
  if (action === "preview") {
    playBufferPreview(stem.buffer);
  }
  if (action === "deck-a") {
    loadBufferToDeck(stem.buffer, stem.fileName, "a");
  }
  if (action === "deck-b") {
    loadBufferToDeck(stem.buffer, stem.fileName, "b");
  }
  if (action === "pad") {
    addBufferToPad(stem.buffer, stem.name);
  }
  if (action === "download") {
    downloadBufferAsWav(stem.buffer, stem.fileName);
  }
  if (action === "delete") {
    deleteStem(stemId);
  }
}

function deleteStem(stemId) {
  stopStemPreview();
  stemState.stems = stemState.stems.filter((stem) => stem.id !== stemId);
  renderStemResults();
  renderAiContext();
}

function playBufferPreview(buffer, options = {}) {
  if (!AudioEngine.context) return;
  stopStemPreview();
  if (!options.ditcTrackId) ditcState.previewTrackId = null;
  const source = AudioEngine.context.createBufferSource();
  const gain = AudioEngine.context.createGain();
  source.buffer = buffer;
  gain.gain.value = 0.9;
  source.connect(gain);
  gain.connect(AudioEngine.masterAnalyser);
  stemState.previewSource = source;
  stemState.previewGain = gain;
  document.querySelector("#stopStemPreview").disabled = false;
  source.onended = () => {
    stemState.previewSource = null;
    stemState.previewGain = null;
    document.querySelector("#stopStemPreview").disabled = true;
    if (options.onended) options.onended();
  };
  source.start();
}

function stopDitcPreview() {
  stopStemPreview();
  ditcState.previewTrackId = null;
  renderSources();
}

function stopStemPreview() {
  if (stemState.previewSource) {
    const source = stemState.previewSource;
    stemState.previewSource = null;
    stemState.previewGain = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      /* Preview may have already ended. */
    }
  }
  const button = document.querySelector("#stopStemPreview");
  if (button) button.disabled = true;
}

function downloadBufferAsWav(buffer, fileName) {
  const blob = new Blob([audioBufferToWav(buffer)], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function audioBufferToWav(buffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = samples * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return arrayBuffer;
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function drumStepCount() {
  return drums.bars * drums.stepsPerBar;
}

function normalizeDrumPatternModel(stepCount = drumStepCount()) {
  const resize = (row, fill) => Array.from({ length: stepCount }, (_, index) => row?.[index] ?? fill);
  drums.pattern = drums.rows.map((_, index) => resize(drums.pattern[index], 0));
  drums.velocities = drums.rows.map((_, index) => resize(drums.velocities[index], 0.85));
  drums.probabilities = drums.rows.map((_, index) => resize(drums.probabilities[index], 1));
  drums.timingOffsets = drums.rows.map((_, index) => resize(drums.timingOffsets[index], 0));
  drums.automation = drums.rows.map((_, index) => resize(drums.automation[index], 1));
  drums.lanes = drums.rows.map((name, index) => ({ name, volume: 1, pan: 0, filter: 16000, pitch: 0, choke: 0, muted: false, solo: false, sample: "Synthesized voice", layers: [], ...(drums.lanes[index] || {}) }));
  drums.currentBar = Math.min(drums.currentBar, drums.bars - 1);
  drums.step %= stepCount;
}

function snapshotDrumPattern(label = "Edit") {
  drums.undoStack.push({ label, pattern: drums.pattern.map((row) => [...row]), velocities: drums.velocities.map((row) => [...row]), probabilities: drums.probabilities.map((row) => [...row]), timingOffsets: drums.timingOffsets.map((row) => [...row]), automation: drums.automation.map((row) => [...row]), groove: drums.groove, grooveIntensity: drums.grooveIntensity, bars: drums.bars, section: drums.section, name: drums.name, seed: drums.seed, version: drums.version });
  if (drums.undoStack.length > 30) drums.undoStack.shift();
}

function touchDrumPattern(source = "User Edited") {
  drums.version += 1;
  drums.source = source;
  if (!source.startsWith("Groove")) { drums.grooveAnchor = null; drums.grooveCandidate = null; drums.grooveCandidateIntensity = null; drums.grooveMetrics = null; }
  saveBeatForgeState();
  renderBeatForgeSummary();
  renderBeatDiagnostics();
  const generated = /AI|Groove Applied|Imported|Live Recording|Prompt|Match/i.test(source);
  emitProjectContextChange("beatForge", "beat-pattern-changed", { summary: `${drums.name} updated from ${source}`, decision: generated ? { domain: "Beat Forge", action: /Groove/.test(source) ? "Groove applied" : "Pattern generated", summary: `${drums.name}: ${drums.groove} groove, version ${drums.version}`, after: { pattern: drums.name, groove: drums.groove, version: drums.version, source }, initiatedBy: /AI|Prompt|Match/.test(source) ? "AI" : "user" } : null });
}

function visibleDrumStep(localStep) {
  return drums.currentBar * drums.stepsPerBar + localStep;
}

function renderSequencer() {
  const sequencer = document.querySelector("#sequencer");
  if (!sequencer) return;
  normalizeDrumPatternModel();
  sequencer.innerHTML = "";
  drums.rows.forEach((row, rowIndex) => {
    const rowEl = document.createElement("div");
    rowEl.className = "beat-editor-row";
    const label = document.createElement("button");
    label.type = "button";
    label.className = `beat-lane-label${drums.selectedLane === rowIndex ? " is-selected" : ""}`;
    label.innerHTML = `<strong>${row}</strong><small>${drums.lanes[rowIndex].muted ? "Muted" : drums.lanes[rowIndex].solo ? "Solo" : drums.lanes[rowIndex].sample}</small>`;
    label.addEventListener("click", () => { drums.selectedLane = rowIndex; renderSequencer(); renderBeatInspector(); });
    rowEl.appendChild(label);
    for (let localStep = 0; localStep < drums.stepsPerBar; localStep += 1) {
      const step = visibleDrumStep(localStep);
      if (drums.view === "velocity" || drums.view === "automation") {
        const input = document.createElement("input");
        input.type = "range"; input.min = 0; input.max = 1; input.step = 0.01;
        input.className = drums.view === "velocity" ? "velocity-cell" : "automation-cell";
        input.value = drums.view === "velocity" ? drums.velocities[rowIndex][step] : drums.automation[rowIndex][step];
        input.disabled = drums.view === "velocity" && !drums.pattern[rowIndex][step];
        input.ariaLabel = `${row} step ${step + 1} ${drums.view}`;
        input.addEventListener("pointerdown", () => snapshotDrumPattern(`${drums.view} edit`), { once: true });
        input.addEventListener("input", () => { (drums.view === "velocity" ? drums.velocities : drums.automation)[rowIndex][step] = Number(input.value); drums.selectedLane = rowIndex; drums.selectedStep = step; touchDrumPattern(); });
        rowEl.appendChild(input);
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      const piano = drums.view === "piano";
      button.className = `${piano ? "piano-note" : "step beat-step-meta"}${drums.pattern[rowIndex][step] ? " is-on" : ""}`;
      button.dataset.globalStep = step;
      button.dataset.velocity = drums.pattern[rowIndex][step] ? Math.round(drums.velocities[rowIndex][step] * 100) : "";
      button.style.setProperty("--step-probability", drums.probabilities[rowIndex][step]);
      button.ariaLabel = `${row} bar ${drums.currentBar + 1} step ${localStep + 1}, ${drums.pattern[rowIndex][step] ? "on" : "off"}, velocity ${Math.round(drums.velocities[rowIndex][step] * 100)}, probability ${Math.round(drums.probabilities[rowIndex][step] * 100)} percent`;
      button.addEventListener("click", () => {
        snapshotDrumPattern("Toggle step"); drums.pattern[rowIndex][step] = drums.pattern[rowIndex][step] ? 0 : 1; drums.selectedLane = rowIndex; drums.selectedStep = step; touchDrumPattern(); renderSequencer(); renderBeatInspector();
      });
      rowEl.appendChild(button);
    }
    sequencer.appendChild(rowEl);
  });
  document.querySelector("#beatBarLabel").textContent = `Bar ${drums.currentBar + 1} of ${drums.bars}`;
  document.querySelector("#beatBars").value = drums.bars;
  renderBeatInspector();
}

function renderPresetOptions() {
  const select = document.querySelector("#drumPreset");
  const machineSelect = document.querySelector("#drumMachine");
  select.innerHTML = "";
  machineSelect.innerHTML = "";
  drumPresets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    select.appendChild(option);
  });
  drumMachines.forEach((machine) => {
    const option = document.createElement("option");
    option.value = machine.id;
    option.textContent = machine.name;
    machineSelect.appendChild(option);
  });
  select.value = drums.preset;
  machineSelect.value = drums.machine;
  updatePresetNotes();
}

function updatePresetNotes() {
  const preset = drumPresets.find((item) => item.id === document.querySelector("#drumPreset").value);
  const machine = drumMachines.find((item) => item.id === document.querySelector("#drumMachine").value);
  document.querySelector("#presetNotes").textContent = preset && machine ? `${machine.notes} ${preset.notes}` : "";
}

function applyDrumPreset(id) {
  const preset = drumPresets.find((item) => item.id === id);
  const machine = drumMachines.find((item) => item.id === document.querySelector("#drumMachine").value) || drumMachines[0];
  if (!preset) return;
  drums.preset = preset.id;
  drums.machine = machine.id;
  snapshotDrumPattern("Load preset");
  drums.bars = 1;
  drums.pattern = (machine.pattern || preset.pattern).map((row) => [...row]);
  drums.kit = {
    ...preset.kit,
    ...machine.kit,
    swing: Math.max(machine.kit.swing || 0, preset.swing)
  };
  drums.step = 0;
  drums.currentBar = 0;
  drums.name = `${preset.name} Pattern`;
  drums.section = "Verse";
  drums.groove = preset.swing >= 0.2 ? "loose-pocket" : preset.swing >= 0.1 ? "boom-bap" : "straight";
  normalizeDrumPatternModel(16);
  document.querySelector("#globalBpm").value = preset.bpm;
  document.querySelector("#drumPreset").value = preset.id;
  updatePresetNotes();
  renderSequencer();
  touchDrumPattern("Preset");
  renderBeatForge();
  if (drums.playing) {
    stopDrums();
    startDrums();
  }
}

function startDrums() {
  if (drums.playing || drums.timer) return;
  drums.playing = true;
  drums.paused = false;
  drums.schedulerVersion += 1;
  drums.schedulerLoadedVersion = drums.version;
  if (DECKFORGE_DEVELOPMENT) console.debug("[DeckForge][Groove] scheduler loaded pattern version", drums.schedulerLoadedVersion);
  document.querySelector("#drumPlay").textContent = "Playing";
  tickDrums(drums.schedulerVersion);
  renderBeatDiagnostics();
  emitProjectContextChange("beatForge", "playback-started", { summary: `Playing Beat Forge pattern ${drums.name}` });
}

function stopDrums() {
  const wasActive = drums.playing || drums.paused || drums.previewing || drums.recording;
  drums.playing = false;
  drums.paused = false;
  clearTimeout(drums.timer);
  drums.timer = null;
  drums.schedulerVersion += 1;
  clearTimeout(drums.previewTimer);
  drums.previewTimer = null;
  drums.previewing = false;
  drums.recording = false;
  drums.overdub = false;
  drums.voices.splice(0).forEach((voice) => { try { voice.stop(); } catch { /* Voice already ended. */ } });
  document.querySelector("#drumPlay").textContent = "Play";
  document.querySelector("#beatRecord")?.classList.remove("is-active");
  document.querySelector("#beatOverdub")?.classList.remove("is-active");
  document.querySelectorAll(".step").forEach((step) => step.classList.remove("is-current"));
  renderBeatDiagnostics();
  if (wasActive) emitProjectContextChange("beatForge", "playback-stopped", { summary: "Stopped Beat Forge playback" });
}

function pauseDrums() {
  if (!drums.playing) return;
  drums.playing = false;
  drums.paused = true;
  clearTimeout(drums.timer);
  drums.timer = null;
  drums.schedulerVersion += 1;
  document.querySelector("#drumPlay").textContent = "Resume";
  document.querySelectorAll(".step").forEach((step) => step.classList.remove("is-current"));
  emitProjectContextChange("beatForge", "playback-paused", { summary: "Paused Beat Forge playback" });
}

function seededDrumValue(laneIndex, step, salt = 0) {
  const value = Math.sin((drums.seed + laneIndex * 101 + step * 37 + salt * 17) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function activeDrumGroove() {
  return drumGrooves.find((groove) => groove.id === drums.groove) || drumGrooves[0];
}

function tickDrums(schedulerVersion = drums.schedulerVersion) {
  if (!drums.playing || schedulerVersion !== drums.schedulerVersion) return;
  if (drums.schedulerLoadedVersion !== drums.version) { drums.schedulerLoadedVersion = drums.version; if (DECKFORGE_DEVELOPMENT) console.debug("[DeckForge][Groove] scheduler loaded pattern version", drums.schedulerLoadedVersion); }
  document.querySelectorAll(".step").forEach((step) => step.classList.remove("is-current"));
  const totalSteps = drumStepCount();
  const step = drums.step % totalSteps;
  const bar = Math.floor(step / drums.stepsPerBar);
  const localStep = step % drums.stepsPerBar;
  drums.currentBar = bar;
  const soloActive = drums.lanes.some((lane) => lane.solo);
  drums.rows.forEach((row, rowIndex) => {
    const cell = document.querySelector(`.beat-editor-row:nth-child(${rowIndex + 1}) [data-global-step="${step}"]`);
    if (cell) cell.classList.add("is-current");
    const lane = drums.lanes[rowIndex];
    const allowed = !lane.muted && (!soloActive || lane.solo) && seededDrumValue(rowIndex, step, drums.version + drums.cycle * 13) <= drums.probabilities[rowIndex][step];
    if (drums.pattern[rowIndex][step] && allowed) playDrum(row, rowIndex, step);
  });
  if (drums.metronome && localStep % 4 === 0) playDrumVoice("Hat", AudioEngine.context.currentTime, localStep === 0 ? 0.35 : 0.2, { laneIndex: 2, filter: 12000 });
  document.querySelector("#beatPosition").textContent = `Bar ${bar + 1} · Beat ${Math.floor(localStep / 4) + 1}`;
  if (localStep === 0) renderSequencer();
  drums.step = (step + 1) % totalSteps;
  if (drums.step === 0) drums.cycle += 1;
  if (!drums.loop && drums.step === 0) { stopDrums(); return; }
  const bpm = Number(document.querySelector("#globalBpm").value) || 124;
  const baseInterval = (60 / bpm / 4) * 1000;
  const groove = activeDrumGroove();
  const intensity = drums.grooveIntensity / 100;
  const swing = (groove.swing * intensity + (drums.kit.swing || 0) * 0.35) * baseInterval;
  const swingOffset = drums.step % 2 === 0 ? swing : -swing;
  drums.timer = setTimeout(() => tickDrums(schedulerVersion), Math.max(30, baseInterval + swingOffset));
  renderBeatDiagnostics();
}

function playDrum(name, laneIndex = drums.rows.indexOf(name), step = drums.step) {
  if (!AudioEngine.context) return;
  const kit = drums.kit;
  const tone = name === "Kick" ? kit.kick : name === "Sub" ? kit.sub : name === "Hat" ? kit.hat : name === "Clap" ? kit.clap : kit.snare;
  const groove = activeDrumGroove();
  const humanVelocity = 1 + (seededDrumValue(laneIndex, step, 2) - 0.5) * groove.velocity * (drums.grooveIntensity / 100);
  const velocity = drums.velocities[laneIndex]?.[step] ?? 0.85;
  const automation = drums.automation[laneIndex]?.[step] ?? 1;
  const timing = (drums.timingOffsets[laneIndex]?.[step] || 0) / 1000 + (seededDrumValue(laneIndex, step, 3) - 0.5) * groove.timing * (drums.grooveIntensity / 100);
  const schedulerLookahead = 0.045;
  const when = Math.max(AudioEngine.context.currentTime, AudioEngine.context.currentTime + schedulerLookahead + timing);
  recordEditorPerformanceEvent({ kind: "drum", name, velocity, duration: tone.decay || 0.12, kit: drums.machine, preset: drums.preset, timingOffset: timing, patternId: drums.patternId, patternVersion: drums.version });
  playDrumVoice(name, when, velocity * humanVelocity * automation, { laneIndex });
}

function playDrumVoice(name, when, velocityScale = 1, options = {}) {
  if (!AudioEngine.context) return;
  const ctx = AudioEngine.context;
  const gain = ctx.createGain();
  const lane = drums.lanes[options.laneIndex ?? drums.rows.indexOf(name)] || {};
  if (lane.choke) drums.voices.filter((voice) => voice._beatChoke === lane.choke).forEach((voice) => { try { voice.stop(when); } catch { /* Choked voice already ended. */ } });
  const filterOut = ctx.createBiquadFilter();
  const pan = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
  filterOut.type = "lowpass"; filterOut.frequency.value = options.filter || lane.filter || 16000;
  gain.connect(filterOut);
  if (pan) { filterOut.connect(pan); pan.pan.value = lane.pan || 0; pan.connect(AudioEngine.masterAnalyser); } else filterOut.connect(AudioEngine.masterAnalyser);
  const kit = drums.kit;

  if (name === "Kick" || name === "Sub") {
    const tone = name === "Kick" ? kit.kick : kit.sub;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const pitch = 2 ** ((lane.pitch || 0) / 12);
    osc.frequency.setValueAtTime(tone.start * pitch, when);
    osc.frequency.exponentialRampToValueAtTime(tone.end * pitch, when + tone.decay * 0.85);
    gain.gain.setValueAtTime(Math.max(0.001, tone.gain * velocityScale * (lane.volume ?? 1)), when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + tone.decay);
    osc.connect(gain);
    osc.start(when);
    osc.stop(when + tone.decay + 0.02);
    osc._beatChoke = lane.choke || 0; drums.voices.push(osc); osc.onended = () => { drums.voices = drums.voices.filter((voice) => voice !== osc); };
    return;
  }

  const tone = name === "Hat" ? kit.hat : name === "Clap" ? kit.clap : kit.snare;
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  noise.buffer = noiseBuffer;
  filter.type = name === "Hat" ? "highpass" : "bandpass";
  filter.frequency.value = tone.frequency;
  gain.gain.setValueAtTime(Math.max(0.001, tone.gain * velocityScale * (lane.volume ?? 1)), when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + tone.decay);
  noise.connect(filter);
  filter.connect(gain);
  noise.start(when);
  noise.stop(when + Math.max(0.05, tone.decay + 0.04));
  noise._beatChoke = lane.choke || 0; drums.voices.push(noise); noise.onended = () => { drums.voices = drums.voices.filter((voice) => voice !== noise); };
}

function renderBeatForge() {
  document.querySelector("#drums")?.setAttribute("data-beat-mode", drums.workspaceMode || "simple");
  const mode = document.querySelector("#beatForgeMode"); if (mode) mode.value = drums.workspaceMode || "simple";
  renderBeatForgeSummary(); renderDrumPerformancePads(); renderKitBrowser(); renderBeatGrooves(); renderBeatPromptHistory(); renderSequencer(); renderBeatMatch(); renderBeatDiagnostics();
}

function renderBeatPromptHistory() { const select = document.querySelector("#beatPromptHistory"); if (!select) return; select.innerHTML = `<option value="">Saved prompts</option>${drums.promptHistory.slice().reverse().map((prompt, index) => `<option value="${index}">${escapeHtml(prompt)}</option>`).join("")}`; }

function renderBeatForgeSummary() {
  const machine = drumMachines.find((item) => item.id === drums.machine);
  const groove = activeDrumGroove();
  const bpm = Number(document.querySelector("#globalBpm")?.value) || 124;
  const summary = document.querySelector("#beatConfigSummary");
  if (summary) summary.textContent = `Pattern: ${drums.name} · Kit: ${machine?.name || drums.machine} · Groove: ${groove.name} · Section: ${drums.section} · BPM: ${bpm} · Length: ${drums.bars} bar${drums.bars === 1 ? "" : "s"}`;
  const name = document.querySelector("#beatTransportPattern"); if (name) name.textContent = drums.name;
  const section = document.querySelector("#beatSection"); if (section) section.value = drums.section;
}

function renderDrumPerformancePads() {
  const grid = document.querySelector("#drumPerformancePads"); if (!grid) return;
  const labels = ["Kick", "Snare", "Hat", "Clap", "Sub", "Kick Accent", "Snare Accent", "Hat Accent", "Clap Accent", "Sub Accent", "Kick Soft", "Snare Soft", "Hat Soft", "Clap Soft", "Sub Soft", "Hat Ghost"];
  const keys = ["1", "2", "3", "4", "q", "w", "e", "r", "a", "s", "d", "f", "z", "x", "c", "v"];
  grid.innerHTML = labels.map((label, index) => `<button type="button" class="drum-performance-pad" data-drum-pad="${index}" aria-label="${label}, keyboard ${keys[index].toUpperCase()}">${label}<small>${keys[index].toUpperCase()}</small></button>`).join("");
}

function triggerDrumPerformancePad(index, velocity = 0.9) {
  const laneIndex = index % drums.rows.length;
  const laneName = drums.rows[laneIndex];
  const accent = index >= 5 && index < 10 ? 1 : index >= 10 ? -0.2 : 0;
  const adjusted = Math.max(0.15, Math.min(1, velocity + accent * 0.2));
  playDrumVoice(laneName, AudioEngine.context.currentTime, adjusted, { laneIndex });
  recordEditorPerformanceEvent({ kind: "drum", name: laneName, velocity: adjusted, duration: drums.kit[laneName.toLowerCase()]?.decay || 0.12, kit: drums.machine, preset: drums.preset });
  if (drums.recording) {
    const bpm = Number(document.querySelector("#globalBpm")?.value) || 124;
    const stepSeconds = 60 / bpm / 4;
    const step = drums.loop ? Math.round((AudioEngine.context.currentTime - drums.recordStartedAt) / stepSeconds) % drumStepCount() : Math.min(drumStepCount() - 1, Math.round((AudioEngine.context.currentTime - drums.recordStartedAt) / stepSeconds));
    if (!drums.overdub && !drums.liveEvents.length) snapshotDrumPattern("Live recording");
    drums.pattern[laneIndex][step] = 1; drums.velocities[laneIndex][step] = adjusted; drums.liveEvents.push({ laneIndex, step, velocity: adjusted, time: AudioEngine.context.currentTime - drums.recordStartedAt }); touchDrumPattern("Live Recording"); renderSequencer();
  }
}

function renderKitBrowser() {
  const categories = document.querySelector("#kitCategories"); const results = document.querySelector("#kitResults"); if (!categories || !results) return;
  const names = ["All", "808", "909", "Boom Bap", "House", "Breakbeat", "Custom Kits", "Favorites", "Recently Used", "Generated Kits"];
  drums.kitCategory ||= "All";
  drums.kitIndex ||= 0;
  categories.innerHTML = names.map((name) => `<button type="button" class="secondary-button kit-category${drums.kitCategory === name ? " is-active" : ""}" data-kit-category="${name}">${name}</button>`).join("");
  const query = document.querySelector("#kitSearch")?.value.trim().toLowerCase() || "";
  const favorites = new Set(JSON.parse(localStorage.getItem("deckforge-beat-kit-favorites") || "[]"));
  const filtered = drumMachines.filter((machine) => { const haystack = `${machine.name} ${machine.notes}`.toLowerCase(); const category = drums.kitCategory; const matchesCategory = category === "All" || (category === "808" && haystack.includes("808")) || (category === "909" && haystack.includes("909")) || (category === "Boom Bap" && /boom|sampler|sp/.test(haystack)) || (category === "House" && /house|909/.test(haystack)) || (category === "Breakbeat" && /break|jungle/.test(haystack)) || (category === "Favorites" && favorites.has(machine.id)) || (["Custom Kits", "Generated Kits"].includes(category) ? false : category === "Recently Used" && machine.id === drums.machine); return matchesCategory && (!query || haystack.includes(query)); });
  drums.filteredKits = filtered;
  if (drums.kitIndex >= filtered.length) drums.kitIndex = 0;
  results.innerHTML = filtered.length ? filtered.map((machine, index) => `<button type="button" class="kit-result${machine.id === drums.machine || index === drums.kitIndex ? " is-active" : ""}" data-kit-id="${machine.id}" data-kit-index="${index}"><strong>${machine.name}</strong><small>${favorites.has(machine.id) ? "Favorite · " : ""}${machine.notes}</small></button>`).join("") : `<p class="fine-print">No built-in kits match this category. Custom sample kits are Coming Soon.</p>`;
}

function loadSelectedDrumKit() {
  const machine = drums.filteredKits?.[drums.kitIndex] || drumMachines.find((item) => item.id === drums.machine);
  if (!machine) return;
  const preservedPattern = drums.pattern.map((row) => [...row]);
  drums.machine = machine.id; drums.kit = { ...drums.kit, ...machine.kit }; drums.pattern = preservedPattern;
  document.querySelector("#drumMachine").value = machine.id; updatePresetNotes(); touchDrumPattern("Kit Changed"); renderKitBrowser();
  document.querySelector("#presetNotes").textContent = `${machine.name} loaded. The active pattern was preserved.`;
}

function loadSelectedDrumKitAndPattern() {
  const machine = drums.filteredKits?.[drums.kitIndex] || drumMachines.find((item) => item.id === drums.machine); if (!machine) return;
  const recommended = machine.id === "house909" ? "stadiumSoul" : machine.id === "analog808" ? "atlantaDark808" : machine.id === "jungleBreaks" ? "jungleBreakbeat" : machine.id === "spBoomBap" ? "boomBapCuts" : drums.preset;
  document.querySelector("#drumMachine").value = machine.id;
  applyDrumPreset(drumPresets.some((preset) => preset.id === recommended) ? recommended : drums.preset);
  document.querySelector("#presetNotes").textContent = `${machine.name} and its recommended complete pattern were loaded by explicit request.`;
}

async function previewSelectedDrumKit() {
  await AudioEngine.init(); stopDrums(); stopBeatPreview();
  const machine = drums.filteredKits?.[drums.kitIndex] || drumMachines.find((item) => item.id === drums.machine); if (!machine) return;
  drums.previewing = true; const oldKit = drums.kit; drums.kit = { ...oldKit, ...machine.kit };
  const demo = [[0, "Kick"], [2, "Hat"], [4, "Snare"], [6, "Hat"], [8, "Kick"], [10, "Hat"], [12, "Clap"], [14, "Hat"]];
  const interval = 60 / (Number(document.querySelector("#globalBpm")?.value) || 124) / 4;
  demo.forEach(([step, name]) => playDrumVoice(name, AudioEngine.context.currentTime + step * interval, 0.72, { laneIndex: drums.rows.indexOf(name) }));
  drums.kit = oldKit; drums.previewTimer = setTimeout(stopBeatPreview, interval * 16 * 1000 + 100); renderBeatDiagnostics();
}

function stopBeatPreview() { clearTimeout(drums.previewTimer); drums.previewTimer = null; drums.previewing = false; drums.voices.splice(0).forEach((voice) => { try { voice.stop(); } catch { /* Voice already ended. */ } }); renderBeatDiagnostics(); }

function renderBeatGrooves() {
  const select = document.querySelector("#beatGroove"); if (!select) return;
  select.innerHTML = drumGrooves.map((groove) => `<option value="${groove.id}">${groove.name}</option>`).join(""); select.value = drums.grooveCandidate?.groove || drums.groove;
  const displayedIntensity = drums.grooveCandidateIntensity ?? drums.grooveIntensity;
  document.querySelector("#grooveIntensity").value = displayedIntensity;
  document.querySelector("#grooveDescription").textContent = (drumGrooves.find((groove) => groove.id === (drums.grooveCandidate?.groove || drums.groove)) || activeDrumGroove()).description;
  document.querySelector("#grooveIntensityLabel").textContent = `${displayedIntensity < 34 ? "Subtle" : displayedIntensity < 67 ? "Medium" : "Strong"} · ${displayedIntensity}%`;
  document.querySelectorAll("[data-groove-lock]").forEach((input) => { input.checked = Boolean(drums.grooveLocks[input.dataset.grooveLock]); });
  const difference = document.querySelector("#grooveDifference");
  if (difference) difference.textContent = drums.grooveMetrics ? `Candidate difference ${drums.grooveMetrics.score}/100 · ${drums.grooveMetrics.added} added · ${drums.grooveMetrics.removed} removed · timing ${drums.grooveMetrics.timingRange[0]} to ${drums.grooveMetrics.timingRange[1]} ms` : "Select a groove to build a safe comparison.";
}

function captureGrooveModel() {
  return { pattern: drums.pattern.map((row) => [...row]), velocities: drums.velocities.map((row) => [...row]), probabilities: drums.probabilities.map((row) => [...row]), timingOffsets: drums.timingOffsets.map((row) => [...row]), automation: drums.automation.map((row) => [...row]), bars: drums.bars, stepsPerBar: drums.stepsPerBar, section: drums.section, groove: drums.groove, grooveIntensity: drums.grooveIntensity, kit: drums.machine, lanes: drums.lanes.map((lane) => ({ ...lane, layers: [...(lane.layers || [])] })), version: drums.version };
}

function cloneGrooveModel(model) {
  return { ...model, pattern: model.pattern.map((row) => [...row]), velocities: model.velocities.map((row) => [...row]), probabilities: model.probabilities.map((row) => [...row]), timingOffsets: model.timingOffsets.map((row) => [...row]), automation: model.automation.map((row) => [...row]), lanes: model.lanes.map((lane) => ({ ...lane, layers: [...(lane.layers || [])] })) };
}

function grooveLaneLocked(lane) {
  if (lane === 0) return drums.grooveLocks.kick;
  if (lane === 1) return drums.grooveLocks.snare;
  if (lane === 2) return drums.grooveLocks.hats;
  return drums.grooveLocks.percussion;
}

function setGrooveHit(model, lane, step, active, velocity = null, probability = null) {
  if (grooveLaneLocked(lane) || step < 0 || step >= model.pattern[lane].length) return;
  model.pattern[lane][step] = active ? 1 : 0;
  if (velocity !== null && !drums.grooveLocks.velocity) model.velocities[lane][step] = Math.max(0.05, Math.min(1, velocity));
  if (probability !== null) model.probabilities[lane][step] = Math.max(0, Math.min(1, probability));
}

function setGrooveTiming(model, lane, step, milliseconds) {
  if (grooveLaneLocked(lane) || drums.grooveLocks.timing || !model.pattern[lane][step]) return;
  model.timingOffsets[lane][step] = Math.max(-40, Math.min(40, Math.round(milliseconds)));
}

function setGrooveVelocity(model, lane, step, velocity) {
  if (grooveLaneLocked(lane) || drums.grooveLocks.velocity || !model.pattern[lane][step]) return;
  model.velocities[lane][step] = Math.max(0.05, Math.min(1, velocity));
}

function buildGrooveCandidate(grooveId = document.querySelector("#beatGroove")?.value || drums.groove) {
  drums.grooveAnchor ||= captureGrooveModel();
  drums.grooveCandidateIntensity ??= drums.grooveIntensity;
  const original = drums.grooveAnchor;
  const model = cloneGrooveModel(original);
  const profile = drumGrooves.find((groove) => groove.id === grooveId) || drumGrooves[0];
  const amount = Math.max(0, Math.min(1, drums.grooveCandidateIntensity / 100));
  const strength = amount;
  const random = createSeededGenerator(drums.seed + grooveId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0));
  const total = model.bars * model.stepsPerBar;
  model.groove = grooveId; model.grooveIntensity = drums.grooveCandidateIntensity;

  if (grooveId === "straight") {
    for (let lane = 0; lane < drums.rows.length; lane += 1) for (let step = 0; step < total; step += 1) if (model.pattern[lane][step]) { setGrooveTiming(model, lane, step, 0); setGrooveVelocity(model, lane, step, step % 4 === 0 ? .92 : .74); model.probabilities[lane][step] = 1; }
  } else {
    for (let bar = 0; bar < model.bars; bar += 1) {
      const offset = bar * model.stepsPerBar;
      for (let local = 0; local < model.stepsPerBar; local += 1) {
        const step = offset + local; const odd = local % 2 === 1; const beat = local % 4 === 0; const barShape = (bar % 2 === 0 ? -1 : 1) * amount;
        for (let lane = 0; lane < drums.rows.length; lane += 1) {
          if (!model.pattern[lane][step]) continue;
          let timing = 0; let velocity = model.velocities[lane][step];
          if (grooveId === "boom-bap") { timing = lane === 1 ? 18 * strength : lane === 2 && odd ? 25 * strength : lane === 0 ? (local % 8 === 3 ? -9 : 5) * strength : 10 * strength; velocity = lane === 1 && (local === 4 || local === 12) ? .98 : lane === 2 ? (odd ? .48 : .86) : beat ? .92 : .68; }
          if (grooveId === "loose-pocket") { timing = ((random() - .48) * (lane === 1 ? 36 : 28) + (lane === 1 ? 13 : 0) + barShape * 4) * strength; velocity = .48 + random() * .5; }
          if (grooveId === "dilla") { timing = (lane === 1 ? 26 + bar * 3 : lane === 0 ? (local % 8 < 4 ? -13 : 11) : odd ? 31 : -6) * strength; velocity = lane === 2 ? (local % 4 === 0 ? .9 : .38 + random() * .3) : .5 + random() * .48; }
          if (grooveId === "pete-rock") { timing = (lane === 1 || lane === 3 ? 20 : odd ? 18 : 3) * strength; velocity = lane === 2 ? (odd ? .42 : .7) : lane === 1 ? .9 : .62 + (beat ? .2 : 0); }
          if (grooveId === "premier") { timing = (lane === 1 ? 7 : lane === 2 && odd ? 12 : 0) * strength; velocity = lane === 1 ? .98 : lane === 2 ? (local % 4 === 2 ? .9 : .5) : beat ? .92 : .7; }
          if (grooveId === "mpc") { timing = (odd ? 18 : 0) * strength; velocity = local % 4 === 0 ? .95 : local % 4 === 2 ? .72 : .52; }
          if (grooveId === "sp") { timing = (lane === 2 ? 12 : 18 + barShape * 3) * strength; velocity = beat ? .96 : lane === 2 ? .42 : .66; }
          if (grooveId === "house") { timing = lane === 0 ? 0 : lane === 2 && odd ? 13 * strength : 3 * strength; velocity = lane === 0 ? .95 : lane === 2 ? (local % 4 === 2 ? .92 : .55) : .82; }
          if (grooveId === "shuffle") { timing = (local % 4 === 1 ? 28 : local % 4 === 2 ? -10 : local % 4 === 3 ? 20 : 0) * strength; velocity = local % 4 === 0 ? .94 : local % 4 === 2 ? .78 : .46; }
          if (grooveId === "jersey") { timing = (local % 3 === 1 ? 16 : local % 3 === 2 ? -8 : 0) * strength; velocity = local % 3 === 0 ? .96 : .62; }
          if (grooveId === "garage") { timing = lane === 0 ? (local === 6 || local === 14 ? -10 : 0) : lane === 2 ? (odd ? 24 : -4) * strength : 9 * strength; velocity = lane === 2 ? (odd ? .88 : .48) : .72 + (beat ? .18 : 0); }
          if (grooveId === "breakbeat") { timing = ((lane === 1 ? 10 : lane === 0 ? -5 : odd ? 17 : 0) + barShape * 3) * strength; velocity = .5 + random() * .48; }
          if (grooveId === "rnb") { timing = (lane === 1 ? 19 : lane === 2 && odd ? 15 : 5) * strength; velocity = lane === 1 ? .78 : lane === 2 ? .42 + (beat ? .22 : 0) : .62; }
          if (grooveId === "humanize") { timing = (random() - .5) * 34 * strength; velocity = Math.max(.35, Math.min(1, velocity + (random() - .5) * .38 * strength)); }
          if (grooveId === "cinematic-trap") { timing = lane === 1 ? 6 : lane === 2 && odd ? 9 * strength : 0; velocity = lane === 1 ? .98 : lane === 2 ? (local >= 12 ? .55 + (local - 12) * .11 : odd ? .4 : .72) : beat ? .95 : .65; }
          velocity = original.velocities[lane][step] + (velocity - original.velocities[lane][step]) * strength;
          setGrooveTiming(model, lane, step, timing); setGrooveVelocity(model, lane, step, velocity);
        }
      }

      if (amount > .22 && grooveId === "boom-bap") { setGrooveHit(model, 1, offset + 11, true, .28 + amount * .15, .65); setGrooveHit(model, 2, offset + 6, true, .58, .9); }
      if (amount > .22 && grooveId === "dilla") { setGrooveHit(model, 1, offset + (bar % 2 ? 10 : 3), true, .24 + amount * .16, .72); if (bar % 2) setGrooveHit(model, 2, offset + 15, false); }
      if (amount > .22 && grooveId === "pete-rock") { setGrooveHit(model, 3, offset + 4, true, .42, .9); setGrooveHit(model, 3, offset + 12, true, .46, .9); }
      if (amount > .22 && grooveId === "premier") { if (bar === model.bars - 1) setGrooveHit(model, 1, offset + 15, true, .48, .8); }
      if (amount > .22 && grooveId === "sp") { [1, 3, 5, 7, 9, 11, 13, 15].forEach((local) => { if (random() < .5 * strength) setGrooveHit(model, 2, offset + local, false); }); }
      if (amount > .22 && grooveId === "house") { [0, 4, 8, 12].forEach((local) => setGrooveHit(model, 0, offset + local, true, .94, 1)); [4, 12].forEach((local) => setGrooveHit(model, 3, offset + local, true, .86, 1)); [2, 6, 10, 14].forEach((local) => setGrooveHit(model, 2, offset + local, true, .9, 1)); }
      if (amount > .22 && grooveId === "shuffle") { [2, 6, 10, 14].forEach((local) => setGrooveHit(model, 2, offset + local, true, .88, 1)); [3, 7, 11, 15].forEach((local) => setGrooveHit(model, 2, offset + local, amount > .45, .42, .78)); }
      if (amount > .22 && grooveId === "jersey") { [0, 3, 6, 10, 11].forEach((local) => setGrooveHit(model, 0, offset + local, true, local === 0 ? .98 : .78, 1)); [4, 12].forEach((local) => setGrooveHit(model, 3, offset + local, true, .92, 1)); }
      if (amount > .22 && grooveId === "garage") { [0, 6, 10].forEach((local) => setGrooveHit(model, 0, offset + local, true, .9, 1)); if (amount > .5) setGrooveHit(model, 0, offset + 8, false); [4, 12].forEach((local) => setGrooveHit(model, 1, offset + local, true, .9, 1)); [1, 3, 6, 9, 11, 14].forEach((local) => setGrooveHit(model, 2, offset + local, true, local % 3 === 0 ? .82 : .52, .9)); }
      if (amount > .22 && grooveId === "breakbeat") { setGrooveHit(model, 0, offset + 3, true, .72, .9); setGrooveHit(model, 1, offset + 10, true, .36, .7); setGrooveHit(model, 1, offset + 15, bar === model.bars - 1, .55, .85); }
      if (amount > .22 && grooveId === "rnb") { [1, 3, 5, 7, 9, 11, 13, 15].forEach((local) => { if (amount > .45) setGrooveHit(model, 2, offset + local, false); }); setGrooveHit(model, 1, offset + 11, true, .24, .55); }
      if (amount > .22 && grooveId === "cinematic-trap") { [4, 12].forEach((local) => setGrooveHit(model, 1, offset + local, false)); setGrooveHit(model, 1, offset + 8, true, .98, 1); if (!drums.grooveLocks.kick) [4, 12].forEach((local) => { if (amount > .35) setGrooveHit(model, 0, offset + local, false); }); [12, 13, 14, 15].forEach((local, index) => setGrooveHit(model, 2, offset + local, true, .48 + index * .13, .95)); }
    }
  }

  drums.grooveCandidate = model;
  drums.grooveMetrics = measureGrooveDifference(original, model);
  if (DECKFORGE_DEVELOPMENT) {
    console.debug(`[DeckForge][Groove] selected: ${profile.name}`);
    console.debug("[DeckForge][Groove] pattern version before", original.version);
    console.debug("[DeckForge][Groove] changed step count", drums.grooveMetrics.changedNotes);
    console.debug("[DeckForge][Groove] velocity changes", drums.grooveMetrics.velocityChanges);
    console.debug("[DeckForge][Groove] timing offset range", drums.grooveMetrics.timingRange);
    console.debug("[DeckForge][Groove] probability changes", drums.grooveMetrics.probabilityChanges);
  }
  renderBeatGrooves(); renderBeatDiagnostics();
  return model;
}

function measureGrooveDifference(original, candidate) {
  let changedNotes = 0; let added = 0; let removed = 0; let velocityChanges = 0; let velocityDifference = 0; let probabilityChanges = 0; let timingSum = 0; let timingCount = 0; let ghostNotes = 0;
  const timing = []; let originalHats = 0; let candidateHats = 0;
  original.pattern.forEach((row, lane) => row.forEach((active, step) => { const next = candidate.pattern[lane][step]; if (active !== next) { changedNotes += 1; if (next) added += 1; else removed += 1; } if (next) { const difference = Math.abs((candidate.velocities[lane][step] || 0) - (original.velocities[lane][step] || 0)); if (difference > .01) velocityChanges += 1; velocityDifference += difference; const offset = candidate.timingOffsets[lane][step] || 0; timing.push(offset); timingSum += offset; timingCount += 1; if (!active && candidate.velocities[lane][step] < .5) ghostNotes += 1; } if (Math.abs((candidate.probabilities[lane][step] || 0) - (original.probabilities[lane][step] || 0)) > .01) probabilityChanges += 1; if (lane === 2) { originalHats += active; candidateHats += next; } }));
  const timingRange = timing.length ? [Math.min(...timing), Math.max(...timing)] : [0, 0]; const meanVelocityDifference = velocityDifference / Math.max(1, candidate.pattern.flat().filter(Boolean).length); const score = Math.min(100, Math.round(changedNotes * 2.2 + velocityChanges * .55 + (timingRange[1] - timingRange[0]) * .65 + probabilityChanges + Math.abs(candidateHats - originalHats) * 2));
  return { changedNotes, added, removed, velocityChanges, probabilityChanges, meanTiming: timingSum / Math.max(1, timingCount), timingRange, meanVelocityDifference, swingAmount: (drumGrooves.find((item) => item.id === candidate.groove)?.swing || 0) * candidate.grooveIntensity, ghostNotes, hatDensityDifference: candidateHats - originalHats, patternVersionChange: 1, score };
}

function assignGrooveModel(model) {
  drums.pattern = model.pattern.map((row) => [...row]); drums.velocities = model.velocities.map((row) => [...row]); drums.probabilities = model.probabilities.map((row) => [...row]); drums.timingOffsets = model.timingOffsets.map((row) => [...row]); drums.automation = model.automation.map((row) => [...row]); drums.groove = model.groove; drums.grooveIntensity = model.grooveIntensity; normalizeDrumPatternModel();
}

function applyGrooveCandidate() {
  if (!drums.grooveCandidate) buildGrooveCandidate();
  if (!drums.grooveCandidate) return;
  drums.lastGrooveUndo = captureGrooveModel();
  drums.lastAppliedGroove = cloneGrooveModel(drums.grooveCandidate);
  snapshotDrumPattern(`Apply ${drums.grooveCandidate.groove} groove`);
  assignGrooveModel(drums.grooveCandidate);
  drums.grooveCandidate = null;
  drums.grooveCandidateIntensity = null;
  touchDrumPattern("Groove Applied");
  if (drums.lastAppliedGroove) drums.lastAppliedGroove.version = drums.version;
  renderBeatForge();
  document.querySelector("#grooveDifference").textContent = `Applied ${activeDrumGroove().name} at ${drums.grooveIntensity}%. Scheduler will read pattern version ${drums.version}.`;
}

function cancelGrooveCandidate() {
  stopBeatPreview(); drums.grooveCandidate = null; drums.grooveCandidateIntensity = null; drums.grooveMetrics = null; drums.grooveAnchor = null; renderBeatGrooves();
}

function undoLastGroove() {
  if (!drums.lastGrooveUndo) { document.querySelector("#grooveDifference").textContent = "No applied groove to undo."; return; }
  const current = captureGrooveModel(); assignGrooveModel(drums.lastGrooveUndo); drums.lastAppliedGroove = current; drums.lastGrooveUndo = null; drums.grooveCandidate = null; drums.grooveCandidateIntensity = null; drums.grooveMetrics = null; drums.grooveAnchor = null; touchDrumPattern("Groove Undo"); renderBeatForge();
}

function reapplyLastGroove() {
  if (!drums.lastAppliedGroove) { document.querySelector("#grooveDifference").textContent = "No previous groove transformation to reapply."; return; }
  drums.grooveAnchor = captureGrooveModel(); drums.grooveCandidate = cloneGrooveModel(drums.lastAppliedGroove); drums.grooveMetrics = measureGrooveDifference(drums.grooveAnchor, drums.grooveCandidate); applyGrooveCandidate();
}

async function previewGrooveModel(model, label = "Groove") {
  if (!model) return; await AudioEngine.init(); stopDrums(); stopBeatPreview(); drums.previewing = true;
  const bpm = Number(document.querySelector("#globalBpm")?.value) || 124; const interval = 60 / bpm / 4; const steps = Math.min(model.stepsPerBar || 16, model.pattern[0].length);
  for (let step = 0; step < steps; step += 1) drums.rows.forEach((name, lane) => { if (!model.pattern[lane][step]) return; if (seededDrumValue(lane, step, model.version || 0) > (model.probabilities[lane][step] ?? 1)) return; const timing = (model.timingOffsets[lane][step] || 0) / 1000; playDrumVoice(name, Math.max(AudioEngine.context.currentTime, AudioEngine.context.currentTime + step * interval + timing), (model.velocities[lane][step] || .85) * (model.automation[lane][step] || 1) * .78, { laneIndex: lane }); });
  drums.previewLabel = label; drums.previewTimer = setTimeout(stopBeatPreview, steps * interval * 1000 + 150); renderBeatDiagnostics();
}

async function alternateGroovePreview() {
  if (!drums.grooveCandidate) buildGrooveCandidate(); const original = drums.grooveAnchor; const candidate = drums.grooveCandidate; if (!original || !candidate) return;
  await AudioEngine.init(); stopDrums(); stopBeatPreview(); drums.previewing = true; const bpm = Number(document.querySelector("#globalBpm")?.value) || 124; const interval = 60 / bpm / 4; const steps = Math.min(16, original.pattern[0].length);
  [original, candidate].forEach((model, pass) => { for (let step = 0; step < steps; step += 1) drums.rows.forEach((name, lane) => { if (!model.pattern[lane][step]) return; const when = AudioEngine.context.currentTime + (pass * steps + step) * interval + (model.timingOffsets[lane][step] || 0) / 1000; playDrumVoice(name, Math.max(AudioEngine.context.currentTime, when), (model.velocities[lane][step] || .85) * .72, { laneIndex: lane }); }); });
  drums.previewLabel = "Original A then Groove B"; drums.previewTimer = setTimeout(stopBeatPreview, steps * 2 * interval * 1000 + 150); renderBeatDiagnostics();
}

function renderBeatInspector() {
  const lane = drums.lanes[drums.selectedLane]; if (!lane) return;
  document.querySelector("#beatLaneName").textContent = `${lane.name} · Step ${(drums.selectedStep % drums.stepsPerBar) + 1}`;
  const values = { beatLaneVolume: lane.volume, beatLanePan: lane.pan, beatLaneFilter: lane.filter, beatLanePitch: lane.pitch, beatStepVelocity: drums.velocities[drums.selectedLane][drums.selectedStep], beatStepProbability: drums.probabilities[drums.selectedLane][drums.selectedStep], beatStepTiming: drums.timingOffsets[drums.selectedLane][drums.selectedStep], beatLaneChoke: lane.choke };
  Object.entries(values).forEach(([id, value]) => { const input = document.querySelector(`#${id}`); if (input) input.value = value; });
  document.querySelector("#beatLaneMute").checked = lane.muted; document.querySelector("#beatLaneSolo").checked = lane.solo;
}

function setBeatBars(value) {
  snapshotDrumPattern("Change pattern length"); const previous = drumStepCount(); drums.bars = Number(value); normalizeDrumPatternModel();
  if (drumStepCount() > previous) drums.rows.forEach((_, lane) => { for (let step = previous; step < drumStepCount(); step += 1) { const source = step % previous; drums.pattern[lane][step] = drums.pattern[lane][source]; drums.velocities[lane][step] = drums.velocities[lane][source]; } });
  touchDrumPattern(); renderSequencer();
}

function undoBeatEdit() {
  const previous = drums.undoStack.pop(); if (!previous) { document.querySelector("#aiBeatProducerMessage").textContent = "Nothing to undo."; return; }
  Object.assign(drums, previous); normalizeDrumPatternModel(); touchDrumPattern("Undo"); renderBeatForge();
}

function createSeededGenerator(seed) { let state = seed >>> 0; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; }; }

function inferBeatPrompt(prompt) {
  const lower = prompt.toLowerCase();
  const style = beatStyles.find((item) => lower.includes(item.toLowerCase().replace("-", " "))) || (lower.includes("cinematic") ? "Cinematic Trap" : lower.includes("trap") ? "Trap" : lower.includes("house") ? "House" : lower.includes("garage") ? "Garage" : lower.includes("break") ? "Breakbeat" : lower.includes("r&b") ? "R&B" : "Boom Bap");
  const bpmMatch = lower.match(/\b(\d{2,3})\s*bpm\b/); const section = ["intro", "verse", "hook", "breakdown", "transition", "outro"].find((item) => lower.includes(item)) || drums.section.toLowerCase();
  return { style, bpm: bpmMatch ? Math.max(60, Math.min(190, Number(bpmMatch[1]))) : Number(document.querySelector("#globalBpm")?.value) || 124, section: section[0].toUpperCase() + section.slice(1), bars: lower.includes("eight-bar") || lower.includes("8 bar") ? 8 : lower.includes("four-bar") || lower.includes("4 bar") ? 4 : Math.max(2, drums.bars), preserveKick: /keep|preserve/.test(lower) && lower.includes("kick"), preserveSnare: /keep|preserve/.test(lower) && lower.includes("snare"), hatsOnly: /hat/.test(lower) && /(only|regenerate)/.test(lower), preserveBars12: /preserve bars? 1( and| &) 2/.test(lower), keepKit: lower.includes("keep") && lower.includes("kit"), keepGroove: lower.includes("keep") && lower.includes("groove") };
}

function generateBeatPattern(style, bars, seed, density = 1) {
  const random = createSeededGenerator(seed); const steps = bars * 16; const pattern = drums.rows.map(() => Array(steps).fill(0)); const velocities = drums.rows.map(() => Array(steps).fill(0.82));
  const house = /House|Garage|Jersey/.test(style); const trap = /Trap|Drill/.test(style); const breakbeat = style === "Breakbeat"; const soulful = /Boom|Soul|R&B|Neo|Lo-Fi/.test(style);
  for (let bar = 0; bar < bars; bar += 1) {
    const offset = bar * 16;
    for (let step = 0; step < 16; step += 1) {
      const beat = step % 4 === 0; const backbeat = step === 4 || step === 12;
      if (house ? beat : (step === 0 || step === 8 || random() < (trap ? .12 : breakbeat ? .22 : .18) * density)) pattern[0][offset + step] = 1;
      if ((trap && step === 8) || (!trap && backbeat) || (breakbeat && random() < .16)) pattern[1][offset + step] = 1;
      if ((trap ? step % 2 === 0 : house ? step % 2 === 0 : step % 4 === 2) || random() < .06 * density) pattern[2][offset + step] = 1;
      if ((house && backbeat) || (soulful && backbeat && random() > .45)) pattern[3][offset + step] = 1;
      if ((trap && (step === 0 || step === 10 || random() < .08)) || (!trap && step === 0 && random() > .45)) pattern[4][offset + step] = 1;
      drums.rows.forEach((_, lane) => { velocities[lane][offset + step] = Math.max(.25, Math.min(1, .68 + random() * .3 + (beat ? .08 : 0))); });
    }
    if (bar === bars - 1) { pattern[1][offset + 14] = 1; pattern[2][offset + 13] = 1; pattern[2][offset + 14] = 1; pattern[2][offset + 15] = 1; }
    if (bar % 2 === 1) pattern[0][offset + (trap ? 11 : 15)] = 1;
  }
  return { pattern, velocities };
}

function buildBeatPromptPlan(kind = "new") {
  const prompt = document.querySelector("#beatPrompt").value.trim() || `${drums.section} ${activeDrumGroove().name}`; const intent = inferBeatPrompt(prompt); const seed = Math.floor(Date.now() % 1000000) + drums.version + (kind === "variation" ? 97 : 0); const generated = generateBeatPattern(intent.style, intent.bars, seed, kind === "busier" ? 1.35 : kind === "simplify" ? .6 : 1);
  if (intent.preserveKick || intent.hatsOnly) generated.pattern[0] = Array.from({ length: intent.bars * 16 }, (_, index) => drums.pattern[0][index % drumStepCount()]);
  if (intent.preserveSnare || intent.hatsOnly) generated.pattern[1] = Array.from({ length: intent.bars * 16 }, (_, index) => drums.pattern[1][index % drumStepCount()]);
  if (intent.hatsOnly) [3, 4].forEach((lane) => { generated.pattern[lane] = Array.from({ length: intent.bars * 16 }, (_, index) => drums.pattern[lane][index % drumStepCount()]); });
  if (intent.preserveBars12 && intent.bars >= 2) drums.rows.forEach((_, lane) => { for (let step = 0; step < 32; step += 1) generated.pattern[lane][step] = drums.pattern[lane][step % drumStepCount()]; });
  const groove = intent.keepGroove ? drums.groove : /Trap/.test(intent.style) ? "cinematic-trap" : /House/.test(intent.style) ? "house" : /Garage/.test(intent.style) ? "garage" : /Break/.test(intent.style) ? "breakbeat" : "boom-bap";
  drums.pendingPlan = { id: `beat-${seed}`, kind, prompt, style: intent.style, bpm: intent.bpm, section: intent.section, bars: intent.bars, groove, kit: intent.keepKit ? drums.machine : (/House/.test(intent.style) ? "house909" : /Trap/.test(intent.style) ? "analog808" : "spBoomBap"), pattern: generated.pattern, velocities: generated.velocities, probabilities: generated.pattern.map((row) => row.map(() => 1)), timingOffsets: generated.pattern.map((row) => row.map(() => 0)), automation: generated.pattern.map((row) => row.map(() => 1)), preserved: [intent.preserveKick && "Kick", intent.preserveSnare && "Snare", intent.hatsOnly && "All except Hats", intent.preserveBars12 && "Bars 1 and 2", intent.keepKit && "Kit", intent.keepGroove && "Groove"].filter(Boolean), seed, confidence: prompt ? "High" : "Medium" };
  drums.lastPrompt = prompt; drums.lastGeneration = `${kind} · ${intent.style} · seed ${seed}`; renderBeatPromptPlan(); renderBeatDiagnostics();
}

function renderBeatPromptPlan() {
  const plan = drums.pendingPlan; const output = document.querySelector("#beatPromptPlan"); if (!output) return;
  if (!plan) { output.textContent = "No generated plan yet."; return; }
  output.textContent = JSON.stringify({ style: plan.style, bpm: plan.bpm, section: plan.section, patternLength: `${plan.bars} bars`, groove: drumGrooves.find((item) => item.id === plan.groove)?.name, kit: drumMachines.find((item) => item.id === plan.kit)?.name, activeLanes: drums.rows.filter((_, lane) => plan.pattern[lane].some(Boolean)), summaryOfChanges: `${plan.kind} pattern with ${plan.pattern.flat().filter(Boolean).length} active steps`, preservedElements: plan.preserved.length ? plan.preserved : ["None"], seed: plan.seed, confidence: plan.confidence }, null, 2);
  document.querySelector("#previewBeatPlan").disabled = false; document.querySelector("#applyBeatPlan").disabled = false;
}

async function previewGeneratedBeat() {
  if (!drums.pendingPlan) return; await AudioEngine.init(); stopDrums(); stopBeatPreview(); drums.previewing = true;
  const plan = drums.pendingPlan; const interval = 60 / plan.bpm / 4; const previewSteps = Math.min(32, plan.bars * 16);
  for (let step = 0; step < previewSteps; step += 1) drums.rows.forEach((name, lane) => { if (plan.pattern[lane][step]) playDrumVoice(name, AudioEngine.context.currentTime + step * interval, plan.velocities[lane][step] * .75, { laneIndex: lane }); });
  drums.previewTimer = setTimeout(stopBeatPreview, previewSteps * interval * 1000 + 100); renderBeatDiagnostics();
}

function applyBeatPromptPlan() {
  const plan = drums.pendingPlan; if (!plan) return;
  snapshotDrumPattern("Apply AI plan"); drums.bars = plan.bars; drums.pattern = plan.pattern.map((row) => [...row]); drums.velocities = plan.velocities.map((row) => [...row]); drums.probabilities = plan.probabilities.map((row) => [...row]); drums.timingOffsets = plan.timingOffsets.map((row) => [...row]); drums.automation = plan.automation.map((row) => [...row]); drums.groove = plan.groove; drums.section = plan.section; drums.name = `${plan.style} ${plan.section}`; drums.seed = plan.seed; drums.source = "AI Prompt Plan"; drums.step = 0; drums.currentBar = 0;
  document.querySelector("#globalBpm").value = plan.bpm; if (plan.kit !== drums.machine) { drums.machine = plan.kit; drums.kit = { ...drums.kit, ...drumMachines.find((item) => item.id === plan.kit)?.kit }; document.querySelector("#drumMachine").value = drums.machine; }
  touchDrumPattern("AI Applied"); renderBeatForge(); document.querySelector("#aiBeatProducerMessage").textContent = `Applied ${plan.style} ${plan.section}. Undo remains available.`;
}

function transformCurrentBeat(action) {
  snapshotDrumPattern(action); const random = createSeededGenerator(drums.seed + drums.version * 31); const end = drumStepCount();
  if (action === "simplify") drums.pattern.forEach((row) => row.forEach((active, step) => { if (active && step % 4 !== 0 && random() < .42) row[step] = 0; }));
  if (action === "busier") drums.pattern.forEach((row, lane) => row.forEach((active, step) => { if (!active && random() < (lane === 2 ? .2 : .07)) row[step] = 1; }));
  if (action === "fill") { for (let step = Math.max(0, end - 4); step < end; step += 1) { drums.pattern[1][step] = step % 2 === 0 ? 1 : drums.pattern[1][step]; drums.pattern[2][step] = 1; } }
  if (action === "humanize") drums.rows.forEach((_, lane) => drums.pattern[lane].forEach((active, step) => { if (active) { drums.velocities[lane][step] = .55 + random() * .45; drums.timingOffsets[lane][step] = Math.round((random() - .5) * 30); } }));
  if (action === "swing") drums.grooveIntensity = Math.min(100, drums.grooveIntensity + 15);
  if (action === "straight") drums.grooveIntensity = Math.max(0, drums.grooveIntensity - 15);
  touchDrumPattern(`AI ${action}`); renderBeatForge();
}

function convertBeatSection(section) {
  snapshotDrumPattern(`Convert to ${section}`); drums.section = section; drums.name = `${drums.patternId} ${section}`; const random = createSeededGenerator(drums.seed + section.length * 71);
  if (["Intro", "Breakdown", "Outro"].includes(section)) drums.pattern.forEach((row, lane) => row.forEach((active, step) => { if (active && lane !== 2 && step % 4 !== 0 && random() < (section === "Breakdown" ? .65 : .45)) row[step] = 0; }));
  if (section === "Hook") drums.pattern.forEach((row, lane) => row.forEach((active, step) => { if (!active && (lane === 2 ? step % 2 === 0 : random() < .09)) row[step] = 1; }));
  if (section === "Transition") { const end = drumStepCount(); for (let step = Math.max(0, end - 8); step < end; step += 1) { drums.pattern[2][step] = 1; if (step % 2 === 0) drums.pattern[1][step] = 1; } }
  touchDrumPattern(`Section ${section}`); renderBeatForge();
}

function toggleBeatRecording(overdub = false) {
  if (drums.recording) { drums.recording = false; drums.overdub = false; document.querySelector("#beatRecord").classList.remove("is-active"); document.querySelector("#beatOverdub").classList.remove("is-active"); renderBeatDiagnostics(); return; }
  drums.recording = true; drums.overdub = overdub; drums.liveEvents = []; drums.recordStartedAt = AudioEngine.context.currentTime; if (!overdub) snapshotDrumPattern("Record take");
  document.querySelector(overdub ? "#beatOverdub" : "#beatRecord").classList.add("is-active"); renderBeatDiagnostics();
}

function sendBeatToArrangement() {
  const bpm = Number(document.querySelector("#globalBpm")?.value) || 124; const duration = drums.bars * 4 * 60 / bpm;
  const source = { id: `beat-${drums.patternId}-${drums.version}`, label: drums.name, sourceKind: "drums", type: "drums", duration, patternSnapshot: serializeBeatPattern() };
  addEditorClipFromSource(source, 0, editorState.playhead); editorStatus(`Sent ${drums.name} to Arrangement with Beat Forge pattern metadata.`);
}

function renderBeatPatternBuffer(laneOnly = null) {
  if (!AudioEngine.context) return null; const sampleRate = AudioEngine.context.sampleRate; const bpm = Number(document.querySelector("#globalBpm")?.value) || 124; const stepSeconds = 60 / bpm / 4; const duration = drumStepCount() * stepSeconds; const buffer = AudioEngine.context.createBuffer(1, Math.ceil(duration * sampleRate), sampleRate); const data = buffer.getChannelData(0);
  drums.rows.forEach((name, lane) => { if (laneOnly !== null && lane !== laneOnly) return; drums.pattern[lane].forEach((active, step) => { if (!active) return; const start = Math.floor(step * stepSeconds * sampleRate); const length = Math.min(data.length - start, Math.floor(sampleRate * (name === "Sub" ? .4 : .12))); const frequency = name === "Kick" ? 70 : name === "Sub" ? 45 : name === "Hat" ? 7200 : name === "Clap" ? 1400 : 1800; const amp = (drums.velocities[lane][step] || .8) * .28; for (let i = 0; i < length; i += 1) { const envelope = 1 - i / length; const sample = name === "Kick" || name === "Sub" ? Math.sin(2 * Math.PI * frequency * i / sampleRate) : (seededDrumValue(lane, start + i, 9) * 2 - 1); data[start + i] += sample * envelope * amp; } }); }); return buffer;
}

function sendBeatToPads(laneOnly = null) {
  const empty = sampler.buffers.findIndex((buffer) => !buffer); if (empty < 0) { setPadEditorStatus("All pads in the current bank are occupied. Switch banks or clear a pad first; Beat Forge will not overwrite them silently."); return; }
  const buffer = renderBeatPatternBuffer(laneOnly); if (!buffer) return; const label = laneOnly === null ? drums.name : `${drums.name} ${drums.rows[laneOnly]}`; setPadBuffer(empty, buffer, label, { mode: "loop", category: "Loops", source: "Rendered from Beat Forge" }); setPadEditorStatus(`Sent ${label} to Pad ${empty + 1} without changing occupied pads.`);
}

function serializeBeatPattern() { return { patternId: drums.patternId, name: drums.name, bars: drums.bars, stepsPerBar: drums.stepsPerBar, rows: drums.rows, pattern: drums.pattern, velocities: drums.velocities, probabilities: drums.probabilities, timingOffsets: drums.timingOffsets, automation: drums.automation, groove: drums.groove, grooveIntensity: drums.grooveIntensity, grooveLocks: drums.grooveLocks, kit: drums.machine, preset: drums.preset, section: drums.section, seed: drums.seed, version: drums.version, source: drums.source, lanes: drums.lanes }; }

function saveBeatPattern() { const saved = { ...serializeBeatPattern(), savedAt: new Date().toISOString() }; drums.patterns = [...drums.patterns.filter((pattern) => pattern.name !== saved.name), saved]; saveBeatForgeState(); document.querySelector("#aiBeatProducerMessage").textContent = `Saved ${saved.name} locally.`; }

function saveBeatForgeState() { try { localStorage.setItem("deckforge-beat-forge", JSON.stringify({ active: serializeBeatPattern(), patterns: drums.patterns.slice(-30), promptHistory: drums.promptHistory.slice(-30), workspaceMode: drums.workspaceMode || "simple" })); } catch (error) { drums.lastError = `Persistence: ${error.message}`; } }

function restoreBeatForgeState() { try { const saved = JSON.parse(localStorage.getItem("deckforge-beat-forge") || "null"); if (!saved?.active) return; const active = saved.active; Object.assign(drums, active, { patterns: saved.patterns || [], promptHistory: saved.promptHistory || [], workspaceMode: saved.workspaceMode || "simple", playing: false, paused: false, timer: null, voices: [], undoStack: [], previewing: false, restored: true }); const machine = drumMachines.find((item) => item.id === drums.machine); if (machine) drums.kit = { ...drums.kit, ...machine.kit }; normalizeDrumPatternModel(); } catch (error) { drums.lastError = `Restore: ${error.message}`; } }

function exportBeatPattern() { const blob = new Blob([JSON.stringify(serializeBeatPattern(), null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${drums.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.beatforge.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

async function importBeatPattern(file) { try { const data = JSON.parse(await file.text()); if (!Array.isArray(data.pattern) || !data.bars) throw new Error("Not a Beat Forge pattern file"); snapshotDrumPattern("Import"); Object.assign(drums, data); normalizeDrumPatternModel(); touchDrumPattern("Imported"); renderBeatForge(); } catch (error) { drums.lastError = error.message; document.querySelector("#aiBeatProducerMessage").textContent = `Import failed: ${error.message}`; } }

function renderBeatMatch() { const deck = deckState.a.buffer ? deckState.a : deckState.b.buffer ? deckState.b : null; const output = document.querySelector("#beatMatchSuggestion"); if (!output) return; if (!deck) { output.textContent = "Load a deck to receive a project-aware rhythm suggestion."; return; } const bpm = deck.analysis?.bpm || Number(document.querySelector("#globalBpm")?.value) || 124; drums.beatMatch = bpm >= 120 ? { action: "house", text: `Deck ${deck.id.toUpperCase()} is near ${Math.round(bpm)} BPM. Try lighter house hats and reduce kick density during the transition.` } : { action: "boom-bap", text: `Deck ${deck.id.toUpperCase()} is near ${Math.round(bpm)} BPM. A loose boom-bap pocket with sparse percussion should leave room for the vocal.` }; output.textContent = drums.beatMatch.text; }

function applyBeatMatch() { if (!drums.beatMatch) return; snapshotDrumPattern("AI Beat Match"); drums.groove = drums.beatMatch.action; if (drums.beatMatch.action === "house") drums.pattern[2].forEach((_, step) => { if (step % 2 === 0) drums.pattern[2][step] = 1; }); else drums.pattern[0].forEach((_, step) => { if (step % 4 !== 0 && step % 8 !== 3) drums.pattern[0][step] = 0; }); touchDrumPattern("AI Beat Match"); renderBeatForge(); }

async function previewBeatMatch() { if (!drums.beatMatch) return; const field = document.querySelector("#beatPrompt"); const previous = field.value; field.value = drums.beatMatch.action === "house" ? "Create a light house transition with sparse kicks and active hats" : "Create a light boom bap verse with sparse percussion and room for vocals"; buildBeatPromptPlan("variation"); field.value = previous; await previewGeneratedBeat(); }

function renderBeatDiagnostics() { const details = document.querySelector("#beatDiagnostics"); if (details) details.hidden = !DECKFORGE_DEVELOPMENT; const output = document.querySelector("#beatDiagnosticsOutput"); if (!output || !DECKFORGE_DEVELOPMENT) return; const activeVelocities = drums.velocities.flatMap((row, lane) => row.filter((_, step) => drums.pattern[lane][step])); const timings = drums.timingOffsets.flat(); const probabilities = drums.probabilities.flat(); output.textContent = JSON.stringify({ pattern: drums.name, patternVersion: drums.version, seed: drums.seed, groove: drums.groove, grooveIntensity: drums.grooveIntensity, grooveCandidate: drums.grooveCandidate?.groove || null, grooveDifference: drums.grooveMetrics, kit: drums.machine, scheduler: { playing: drums.playing, paused: drums.paused, timerActive: Boolean(drums.timer), version: drums.schedulerVersion, loadedPatternVersion: drums.schedulerLoadedVersion }, activeSteps: drums.pattern.flat().filter(Boolean).length, averageVelocity: activeVelocities.length ? activeVelocities.reduce((sum, value) => sum + value, 0) / activeVelocities.length : 0, timingRange: [Math.min(...timings), Math.max(...timings)], probabilityRange: [Math.min(...probabilities), Math.max(...probabilities)], currentBar: drums.currentBar + 1, recording: drums.recording, previewing: drums.previewing, previewLabel: drums.previewLabel || null, lastAiGeneration: drums.lastGeneration, lastPrompt: drums.lastPrompt, lastError: drums.lastError }, null, 2); }

async function recordMicSample() {
  await AudioEngine.init();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordStreamToPad(stream, "Mic Grab", "#micSample", "Mic Sample", 2500);
}

async function recordTabSample() {
  await AudioEngine.init();
  if (!navigator.mediaDevices.getDisplayMedia) {
    alert("Tab audio capture is not available in this browser.");
    return;
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((track) => track.stop());
    alert("Choose a browser tab or screen source with audio sharing enabled.");
    return;
  }
  recordStreamToPad(stream, "Tab Grab", "#tabSample", "Tab Audio", 6000);
}

function recordStreamToPad(stream, name, buttonSelector, idleText, duration) {
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType });
    const buffer = await AudioEngine.context.decodeAudioData(await blob.arrayBuffer());
    addBufferToPad(buffer, name);
  };
  recorder.start();
  document.querySelector(buttonSelector).textContent = "Recording...";
  setTimeout(() => {
    recorder.stop();
    document.querySelector(buttonSelector).textContent = idleText;
  }, duration);
}

function toggleMixRecording() {
  if (!AudioEngine.destination) return;
  const recordButton = document.querySelector("#recordMix");
  const downloadButton = document.querySelector("#downloadMix");
  if (AudioEngine.recorder && AudioEngine.recorder.state === "recording") {
    AudioEngine.recorder.stop();
    recordButton.textContent = "●";
    return;
  }
  AudioEngine.chunks = [];
  AudioEngine.recorder = new MediaRecorder(AudioEngine.destination.stream);
  AudioEngine.recorder.ondataavailable = (event) => AudioEngine.chunks.push(event.data);
  AudioEngine.recorder.onstop = () => {
    if (AudioEngine.mixUrl) URL.revokeObjectURL(AudioEngine.mixUrl);
    const blob = new Blob(AudioEngine.chunks, { type: AudioEngine.recorder.mimeType });
    AudioEngine.mixUrl = URL.createObjectURL(blob);
    downloadButton.disabled = false;
    emitProjectContextChange("playback", "mix-recording-finished", { summary: "Finished mix recording", decision: { domain: "Playback", action: "Mix recording finished", summary: "Finished mix recording and prepared the take", initiatedBy: "user" } });
  };
  AudioEngine.recorder.start();
  recordButton.textContent = "■";
  emitProjectContextChange("playback", "mix-recording-started", { summary: "Started mix recording", decision: { domain: "Playback", action: "Mix recording started", summary: "Started mix recording", initiatedBy: "user" } });
}

function readProducerStudioStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRODUCER_STUDIO_KEY) || "null");
    if (!saved) return;
    producerStudioState.mode = saved.mode === "advanced" ? "advanced" : "simple";
    producerStudioState.projectId = saved.projectId || producerStudioState.projectId;
    producerStudioState.projectName = saved.projectName || producerStudioState.projectName;
    producerStudioState.description = saved.description || "";
    producerStudioState.genre = saved.genre && saved.genre !== "Open Format" ? saved.genre : null;
    producerStudioState.subgenre = saved.subgenre && saved.subgenre !== "Live Remix" ? saved.subgenre : null;
    producerStudioState.era = saved.era || null;
    producerStudioState.region = saved.region || null;
    producerStudioState.mood = saved.mood || null;
    producerStudioState.energy = saved.energy || null;
    producerStudioState.tags = Array.isArray(saved.tags) ? saved.tags : producerStudioState.tags;
    producerStudioState.createdAt = saved.createdAt || producerStudioState.createdAt;
    producerStudioState.history = Array.isArray(saved.history) ? saved.history : [];
    producerStudioState.savedPrompts = Array.isArray(saved.savedPrompts) ? saved.savedPrompts : [];
  } catch {
    // Producer Studio stays usable with default in-memory UI state.
  }
}

function writeProducerStudioStorage() {
  try {
    localStorage.setItem(PRODUCER_STUDIO_KEY, JSON.stringify({
      mode: producerStudioState.mode,
      projectId: producerStudioState.projectId,
      projectName: producerStudioState.projectName,
      description: producerStudioState.description,
      genre: producerStudioState.genre,
      subgenre: producerStudioState.subgenre,
      era: producerStudioState.era,
      region: producerStudioState.region,
      mood: producerStudioState.mood,
      energy: producerStudioState.energy,
      tags: producerStudioState.tags,
      createdAt: producerStudioState.createdAt,
      history: producerStudioState.history.slice(0, 20),
      savedPrompts: producerStudioState.savedPrompts.slice(0, 20)
    }));
  } catch {
    // Producer Studio stays usable when local persistence is unavailable.
  }
}

function projectMixLength() {
  return editorState.clips.reduce((max, clip) => Math.max(max, Number(clip.start || 0) + Number(clip.duration || 0)), 0);
}

function mostCommonEvidence(values) {
  const usable = values.filter(Boolean);
  if (!usable.length) return { value: null, count: 0, total: 0, conflicts: [] };
  const counts = usable.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map());
  const [value, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { value, count, total: usable.length, conflicts: [...counts.keys()].filter((item) => item !== value) };
}

function contextEvidence(value, options = {}) {
  return {
    value: value ?? null,
    confidence: value == null ? 0 : Math.max(0, Math.min(100, Math.round(options.confidence ?? 100))),
    source: options.source || "Not set",
    lastUpdated: options.lastUpdated || new Date().toISOString(),
    userConfirmed: Boolean(options.userConfirmed),
    conflictingEvidence: options.conflictingEvidence || []
  };
}

function camelotKey(key) {
  const normalized = String(key || "").toLowerCase().replace(/\s+/g, " ").trim();
  const map = { "c major": "8B", "g major": "9B", "d major": "10B", "a major": "11B", "e major": "12B", "b major": "1B", "f# major": "2B", "gb major": "2B", "db major": "3B", "c# major": "3B", "ab major": "4B", "eb major": "5B", "bb major": "6B", "f major": "7B", "a minor": "8A", "e minor": "9A", "b minor": "10A", "f# minor": "11A", "gb minor": "11A", "c# minor": "12A", "db minor": "12A", "g# minor": "1A", "ab minor": "1A", "d# minor": "2A", "eb minor": "2A", "bb minor": "3A", "a# minor": "3A", "f minor": "4A", "c minor": "5A", "g minor": "6A", "d minor": "7A" };
  return map[normalized] || null;
}

function arrangementIntelligence() {
  const clips = [...editorState.clips].sort((a, b) => a.start - b.start);
  const timelineLength = projectMixLength();
  const gaps = [];
  let coveredUntil = 0;
  clips.forEach((clip) => {
    if (clip.start - coveredUntil > 1) gaps.push({ start: coveredUntil, end: clip.start, duration: clip.start - coveredUntil });
    coveredUntil = Math.max(coveredUntil, clip.start + clip.duration);
  });
  const transitionRegions = clips.filter((clip) => clip.type === "fx" || /transition|blend|echo|filter/i.test(`${clip.name} ${clip.effect || ""}`)).map((clip) => ({ id: clip.id, name: clip.name, start: clip.start, duration: clip.duration }));
  const introClip = clips.find((clip) => /intro|cold open/i.test(clip.name));
  const outroClip = clips.find((clip) => /outro|closing|finale/i.test(clip.name));
  return {
    timelineLength,
    trackLanes: editorState.tracks.map(({ id, name, role }) => ({ id, name, role })),
    clips: clips.map((clip) => ({ id: clip.id, name: clip.name, type: clip.type, sourceKind: clip.sourceKind, trackIndex: clip.trackIndex, start: clip.start, duration: clip.duration, effect: clip.effect || "none", muted: Boolean(clip.muted), loop: Boolean(clip.loop) })),
    clipCount: clips.length,
    currentPlayhead: editorState.playhead,
    selectedClip: editorState.selectedClipId,
    unresolvedGaps: gaps,
    transitionRegions,
    introStatus: introClip ? `Planned: ${introClip.name}` : "Not planned",
    outroStatus: outroClip ? `Planned: ${outroClip.name}` : "Not planned",
    recordingState: editorState.recording ? "Recording" : editorState.playing ? "Playing" : editorState.paused ? "Paused" : "Idle",
    exportReadiness: Boolean(clips.length && introClip && outroClip && !gaps.length)
  };
}

function projectProgressModel(arrangement) {
  const songClips = arrangement.clips.filter((clip) => ["song", "deck", "file"].includes(clip.type) || clip.sourceKind === "crate");
  const expectedTransitions = Math.max(0, songClips.length - 1);
  const plannedTransitions = Math.min(expectedTransitions, arrangement.transitionRegions.length);
  const factors = [
    { id: "tracks", label: "Tracks collected", complete: sourceFiles.length > 0, detail: `${sourceFiles.length} local track${sourceFiles.length === 1 ? "" : "s"}` },
    { id: "intro", label: "Intro planned", complete: arrangement.introStatus !== "Not planned", detail: arrangement.introStatus },
    { id: "transitions", label: "Transitions planned", complete: expectedTransitions > 0 && plannedTransitions >= expectedTransitions, detail: expectedTransitions ? `${plannedTransitions} of ${expectedTransitions}` : "No multi-track arrangement" },
    { id: "outro", label: "Outro planned", complete: arrangement.outroStatus !== "Not planned", detail: arrangement.outroStatus },
    { id: "beat", label: "Beat elements created", complete: drums.source !== "Preset" && drums.pattern.flat().some(Boolean), detail: drums.source !== "Preset" ? drums.name : "No created pattern" },
    { id: "harmony", label: "Harmony elements created", complete: instrument.pattern.notes.length > 0, detail: instrument.pattern.notes.length ? instrument.pattern.name : "No harmony material" },
    { id: "pads", label: "Pads prepared", complete: sampler.buffers.some(Boolean), detail: `${sampler.buffers.filter(Boolean).length} playable pad${sampler.buffers.filter(Boolean).length === 1 ? "" : "s"}` },
    { id: "stems", label: "Stems prepared", complete: stemState.stems.length > 0, detail: `${stemState.stems.length} stem${stemState.stems.length === 1 ? "" : "s"}` },
    { id: "arrangement", label: "Arrangement started", complete: arrangement.clipCount > 0, detail: `${arrangement.clipCount} clip${arrangement.clipCount === 1 ? "" : "s"}` },
    { id: "recording", label: "Recording completed", complete: Boolean(AudioEngine.mixUrl), detail: AudioEngine.mixUrl ? "Take ready" : "No completed recording" },
    { id: "export", label: "Export ready", complete: arrangement.exportReadiness && Boolean(AudioEngine.mixUrl), detail: arrangement.exportReadiness && AudioEngine.mixUrl ? "Ready" : "Not ready" }
  ];
  return { percentage: Math.round(factors.filter((factor) => factor.complete).length / factors.length * 100), factors, completed: factors.filter((factor) => factor.complete).length, total: factors.length };
}

function projectIdentityModel() {
  const analyzed = [deckState.a.analysis, deckState.b.analysis, ...sourceFiles.map((source) => source.analysis)].filter((analysis) => analysis && !analysis.status);
  const genreResult = mostCommonEvidence(analyzed.map((analysis) => analysis.genre));
  const moodResult = mostCommonEvidence(analyzed.map((analysis) => analysis.mood));
  const energyResult = mostCommonEvidence(analyzed.map((analysis) => analysis.energy));
  const activeDeck = detectActiveDeck();
  const deckKey = activeDeck ? deckState[activeDeck].analysis?.key : deckState.a.analysis?.key || deckState.b.analysis?.key;
  const harmonyKey = instrument.pattern.notes.length ? `${instrument.key} ${instrument.scale}` : null;
  const keyValue = deckKey || harmonyKey;
  const analyzedBpms = analyzed.map((analysis) => Number(analysis.bpm)).filter(Number.isFinite);
  const genreValue = producerStudioState.genre || genreResult.value;
  const genreConfirmed = Boolean(producerStudioState.genre);
  const identity = {
    genre: contextEvidence(genreValue, { confidence: genreConfirmed ? 100 : genreResult.total ? genreResult.count / genreResult.total * 100 : 0, source: genreConfirmed ? "User confirmed" : genreResult.total ? "Analyzed decks and DITC tracks" : "Not set", userConfirmed: genreConfirmed, conflictingEvidence: genreResult.conflicts }),
    subgenre: contextEvidence(producerStudioState.subgenre, { source: producerStudioState.subgenre ? "User confirmed" : "Not set", userConfirmed: Boolean(producerStudioState.subgenre) }),
    era: contextEvidence(producerStudioState.era, { source: producerStudioState.era ? "User confirmed" : "Not set", userConfirmed: Boolean(producerStudioState.era) }),
    region: contextEvidence(producerStudioState.region, { source: producerStudioState.region ? "User confirmed" : "Not set", userConfirmed: Boolean(producerStudioState.region) }),
    mood: contextEvidence(producerStudioState.mood || moodResult.value, { confidence: producerStudioState.mood ? 100 : moodResult.total ? moodResult.count / moodResult.total * 100 : 0, source: producerStudioState.mood ? "User confirmed" : moodResult.total ? "Analyzed tracks" : "Not set", userConfirmed: Boolean(producerStudioState.mood), conflictingEvidence: moodResult.conflicts }),
    energy: contextEvidence(producerStudioState.energy || energyResult.value, { confidence: producerStudioState.energy ? 100 : energyResult.total ? energyResult.count / energyResult.total * 100 : 0, source: producerStudioState.energy ? "User confirmed" : energyResult.total ? "Analyzed tracks" : "Not set", userConfirmed: Boolean(producerStudioState.energy), conflictingEvidence: energyResult.conflicts }),
    bpmRange: contextEvidence(analyzedBpms.length ? `${Math.min(...analyzedBpms)}–${Math.max(...analyzedBpms)} BPM` : null, { confidence: analyzedBpms.length ? 90 : 0, source: analyzedBpms.length ? "Analyzed decks and DITC tracks" : "Not analyzed" }),
    keyCenter: contextEvidence(keyValue, { confidence: deckKey ? 88 : harmonyKey ? 100 : 0, source: deckKey ? "Loaded deck analysis" : harmonyKey ? "Active Harmony Lab material" : "Not analyzed" }),
    influences: contextEvidence(mixtapeInspirationState?.structure?.theme || null, { confidence: mixtapeInspirationState ? 80 : 0, source: mixtapeInspirationState ? "Reference mixtape analysis" : "Not set" }),
    themes: contextEvidence(mixtapeInspirationState?.structure?.sampleWorld || null, { confidence: mixtapeInspirationState ? 75 : 0, source: mixtapeInspirationState ? "Reference mixtape analysis" : "Not set" }),
    preferredTransitions: contextEvidence(tempoSafetyPreferences.transitionPreference || null, { confidence: 100, source: "Configured tempo safety preference" }),
    preferredDrumFeel: contextEvidence(drums.source !== "Preset" ? drums.groove : null, { confidence: drums.source !== "Preset" ? 85 : 0, source: drums.source !== "Preset" ? "Active created Beat Forge pattern" : "Not set" }),
    preferredHarmony: contextEvidence(instrument.pattern.notes.length ? `${instrument.key} ${instrument.scale}` : null, { confidence: instrument.pattern.notes.length ? 90 : 0, source: instrument.pattern.notes.length ? "Active Harmony Lab pattern" : "Not set" }),
    preferredClipsOrPads: contextEvidence(sampler.buffers.some(Boolean) ? sampler.names.filter((_, index) => sampler.buffers[index]).slice(0, 8) : null, { confidence: sampler.buffers.some(Boolean) ? 100 : 0, source: sampler.buffers.some(Boolean) ? "Active pad bank" : "Not set" })
  };
  return identity;
}

function safeSavedSources() {
  try { return JSON.parse(localStorage.getItem("deckforge-sources") || "[]"); } catch { return []; }
}

function buildProjectIntelligenceSnapshot() {
  const now = new Date().toISOString();
  const savedSources = safeSavedSources();
  const selectedItems = selectedCrateItems();
  const arrangement = arrangementIntelligence();
  const progress = projectProgressModel(arrangement);
  const identity = projectIdentityModel();
  const activeDeckId = detectActiveDeck();
  const registry = window.AudioPlaybackRegistry;
  const registrySnapshot = registry?.snapshot() || [];
  const activeSources = registrySnapshot.filter((source) => source.playing || source.paused);
  const primarySource = registry?.primary();
  const activeLoops = sampler.active.map((active, index) => active?.source?.loop ? index + 1 : null).filter(Boolean);
  const assignedPads = sampler.buffers.map((buffer, index) => buffer ? ({ index: index + 1, name: sampler.names[index], mode: sampler.modes[index], category: sampler.categories[index], duration: getPadRegion(index).end - getPadRegion(index).start }) : null).filter(Boolean);
  const genreConflicts = identity.genre.conflictingEvidence || [];
  const missingContext = [!identity.genre.value && "Genre", !identity.keyCenter.value && "Key", !sourceFiles.length && "DITC tracks", !deckState.a.buffer && !deckState.b.buffer && "Loaded deck", !instrument.pattern.notes.length && "Harmony material", !arrangement.clipCount && "Arrangement"].filter(Boolean);
  const risks = [];
  if (arrangement.clipCount && arrangement.outroStatus === "Not planned") risks.push({ id: "missing-outro", domain: "Arrangement", severity: "Medium", summary: "No outro is planned in the arrangement." });
  if (arrangement.unresolvedGaps.length) risks.push({ id: "arrangement-gaps", domain: "Arrangement", severity: "Medium", summary: `${arrangement.unresolvedGaps.length} empty arrangement region${arrangement.unresolvedGaps.length === 1 ? "" : "s"} detected.` });
  if (activeLoops.length && deckState.b.playing && deckState.b.analysis?.vocalDensity === "High") risks.push({ id: "pad-vocal-clash", domain: "Pads", severity: "Medium", summary: "An active pad loop may compete with Deck B's high vocal density." });
  const priorities = [arrangement.clipCount && arrangement.outroStatus === "Not planned" ? "Finish the outro" : null, !arrangement.clipCount ? "Start the arrangement" : null, !sourceFiles.length ? "Collect tracks in DITC" : null, !instrument.pattern.notes.length ? "Create a harmony idea" : null].filter(Boolean).slice(0, 3);
  const previousHistory = ProjectIntelligenceEngine.getProjectContext().aiHistory || { decisions: [], recentSummary: null };
  const recentDecisions = previousHistory.decisions || [];
  const recentSummary = { generatedAt: now, events: recentDecisions.slice(0, 5).map((decision) => decision.summary), suggestedNextStep: priorities[0] || "Review today's suggestions" };
  const projectBpm = Number(document.querySelector("#globalBpm")?.value) || null;
  const keyValue = identity.keyCenter.value;
  const analyzedGenre = identity.genre.value;
  const projectPhase = AudioEngine.mixUrl ? "Recorded" : arrangement.clipCount ? "Arranging" : drums.source !== "Preset" || instrument.pattern.notes.length || assignedPads.length ? "Producing" : sourceFiles.length ? "Collecting" : "Setup";
  const contextConfidenceValues = Object.values(identity).map((field) => field.confidence).filter((value) => value > 0);
  const contextConfidence = contextConfidenceValues.length ? Math.round(contextConfidenceValues.reduce((sum, value) => sum + value, 0) / contextConfidenceValues.length) : 0;
  return {
    project: {
      projectId: producerStudioState.projectId,
      projectName: producerStudioState.projectName || "Not set",
      description: producerStudioState.description || null,
      genre: analyzedGenre,
      subgenre: identity.subgenre.value,
      era: identity.era.value,
      region: identity.region.value,
      mood: identity.mood.value,
      energy: identity.energy.value,
      bpm: projectBpm,
      key: keyValue,
      camelotKey: camelotKey(keyValue),
      tags: [...producerStudioState.tags],
      referenceMixtape: mixtapeReferenceState.name || mixtapeInspirationState?.structure?.name || null,
      projectPhase,
      projectProgress: progress.percentage,
      progressFactors: progress.factors,
      identity,
      createdAt: producerStudioState.createdAt,
      updatedAt: now
    },
    ditc: {
      totalTracks: sourceFiles.length + savedSources.length,
      playableTracks: sourceFiles.length,
      selectedTracks: selectedItems.map((item) => ({ id: item.id, name: item.name, kind: item.kind, bpm: item.analysis?.bpm || null, key: item.analysis?.key || null })),
      favorites: [...sourceFiles.filter((track) => track.favorite).map((track) => ({ id: track.id, name: track.name })), ...savedSources.filter((track) => track.favorite).map((track, index) => ({ id: `saved-${index}`, name: track.name }))],
      recentlyAdded: sourceFiles.filter((track) => Date.now() - track.addedAt < 86400000).map((track) => ({ id: track.id, name: track.name, addedAt: track.addedAt })),
      tagsInUse: [...new Set(sourceFiles.flatMap((track) => track.tags || []))].sort(),
      currentFilters: { search: ditcState.search, filter: ditcState.filter, sort: ditcState.sort },
      currentCollection: ditcState.filter,
      smartMixEligibleTracks: sourceFiles.filter((track) => ditcState.smartMixIds.has(track.id) || crateSelection.local.has(track.id)).map((track) => ({ id: track.id, name: track.name })),
      recentRecommendations: recentDecisions.filter((decision) => decision.domain === "DITC").slice(0, 5),
      verifiedReferenceTracks: savedSources.filter((track) => track.verified || track.fingerprintConfirmed).map((track, index) => ({ id: `saved-${index}`, name: track.name }))
    },
    decks: ["a", "b"].map((id) => {
      const deck = deckState[id];
      const tempo = Number(document.querySelector(`#pitch-${id}`)?.value || 1);
      return {
        id,
        loadedTrack: deck.buffer ? { name: deck.trackName, duration: deck.buffer.duration } : null,
        playbackState: deck.playing ? "Playing" : deck.status === "paused" ? "Paused" : deck.buffer ? "Ready" : "Empty",
        currentTime: deck.buffer ? currentDeckTime(id) : 0,
        duration: deck.buffer?.duration || 0,
        bpm: deck.analysis?.bpm || null,
        originalBpm: deck.analysis?.bpm || null,
        key: deck.analysis?.key || null,
        gain: deck.gain?.gain?.value ?? null,
        tempo,
        channelVolume: Number(document.querySelector(`#channel-${id}`)?.value ?? 1),
        cuePoints: [deck.selectionStart, deck.selectionEnd].filter(Number.isFinite),
        loops: deck.loop ? [{ start: deck.loopStart, end: deck.loopEnd, beats: deck.loopBeats }] : [],
        activeStems: [],
        manualOverrideState: deck.manualOverride,
        smartMixControlled: deck.smartMixControlled,
        analysis: deck.analysis ? { genre: deck.analysis.genre || null, mood: deck.analysis.mood || null, energy: deck.analysis.energy || null, vocalDensity: deck.analysis.vocalDensity || null } : null
      };
    }),
    smartMix: {
      enabled: autoMixState.running,
      state: autoMixState.state,
      currentMode: autoMixState.mode,
      outgoingDeck: autoMixState.activeDeck || null,
      incomingDeck: autoMixState.incomingDeck || null,
      currentPlan: autoMixState.plan.map((transition) => ({ from: transition.from?.name || null, to: transition.to?.name || null, style: transition.style || null, startAt: transition.startAt ?? null, overlap: transition.overlap ?? null })),
      source: autoMixState.promptPlan?.planSource || autoMixState.sourceMode || null,
      transitionStyle: autoMixState.transition?.style || autoMixState.plan[autoMixState.index]?.style || smartPromptState.plan?.transitionStyle || null,
      trigger: smartPromptState.plan?.triggerType || smartPromptState.plan?.transitionTrigger || null,
      countdown: Number.isFinite(autoMixState.estimatedTransitionAt) && AudioEngine.context ? Math.max(0, autoMixState.estimatedTransitionAt - AudioEngine.context.currentTime) : null,
      tempoSafetyResult: smartPromptState.plan?.tempoSafety || null,
      bpmRecovery: { active: bpmRecoveryState.active, pending: bpmRecoveryState.pending, progress: bpmRecoveryState.progress, originalBpm: bpmRecoveryState.originalBpm || null, targetRatio: bpmRecoveryState.targetRatio },
      confidence: smartPromptState.plan?.confidence ?? null,
      manualOverride: autoMixState.lastManualOverride !== "None" ? autoMixState.lastManualOverride : null,
      lastCompletedTransition: recentDecisions.find((decision) => decision.action === "Transition completed") || null
    },
    pads: {
      activeBank: sampler.bank,
      activeScene: sampler.scene,
      assignedPads,
      assignedPadCount: assignedPads.length,
      activeLoops,
      recentTriggers: sampler.recentTriggers.slice(0, 12),
      savedMacros: [],
      recentAiPadBank: sampler.pendingAiPlan?.plan ? { prompt: sampler.pendingAiPlan.prompt, suggestedBank: sampler.pendingAiPlan.plan.suggestedBank } : null,
      recordingState: editorState.recording ? "Recording to arrangement" : "Idle"
    },
    beatForge: {
      activePattern: drums.source === "Preset" ? null : { id: drums.patternId, name: drums.name },
      activeKit: drumMachines.find((machine) => machine.id === drums.machine)?.name || null,
      activeGroove: drums.groove || null,
      section: drums.section,
      bpm: projectBpm,
      bars: drums.bars,
      patternVersion: drums.version,
      recentAiGenerations: drums.lastGeneration && drums.lastGeneration !== "None" ? [drums.lastGeneration] : [],
      recentPrompt: drums.lastPrompt !== "None" ? drums.lastPrompt : null,
      currentLocks: { ...drums.grooveLocks },
      playbackState: drums.playing ? "Playing" : drums.paused ? "Paused" : drums.previewing ? "Previewing" : "Idle",
      recordingState: drums.recording ? "Recording" : drums.overdub ? "Overdubbing" : "Idle",
      activeStepCount: drums.pattern.flat().filter(Boolean).length,
      source: drums.source
    },
    harmonyLab: {
      activeInstrument: getInstrumentPreset()?.name || null,
      currentKey: instrument.pattern.notes.length ? instrument.key : null,
      currentScale: instrument.pattern.notes.length ? instrument.scale : null,
      activeChordProgression: instrument.pattern.notes.some((note) => note.type === "chord") ? { name: instrument.pattern.name, chordCount: instrument.pattern.notes.filter((note) => note.type === "chord").length } : null,
      activeBassline: instrument.pattern.notes.some((note) => note.type === "bass") ? { name: instrument.pattern.name, noteCount: instrument.pattern.notes.filter((note) => note.type === "bass").length } : null,
      melody: instrument.pattern.notes.length ? { name: instrument.pattern.name, type: instrument.pattern.type, noteCount: instrument.pattern.notes.length, bars: instrument.pattern.bars, version: instrument.pattern.version } : null,
      recentAiGenerations: instrument.pattern.source === "AI Composer" ? [instrument.pattern.name] : [],
      currentPrompt: instrument.lastPrompt || null,
      playbackState: instrument.patternPlaying ? "Playing" : instrument.patternPaused ? "Paused" : instrument.previewing ? "Previewing" : "Idle",
      recordingState: instrument.recording ? "Recording" : "Idle"
    },
    stems: {
      separatedTracks: stemState.stems.length ? [{ source: stemState.sourceName || "Unknown source", stemCount: stemState.stems.length }] : [],
      availableStemTypes: stemState.stems.map((stem) => stem.name),
      selectedStem: stemState.previewSource ? stemState.previewStemId || null : null,
      recentStemCombinations: [],
      mashupCandidates: stemState.stems.length >= 2 ? stemState.stems.slice(0, 4).map((stem) => stem.name) : [],
      currentPreview: Boolean(stemState.previewSource),
      processingState: document.querySelector("#splitStems")?.disabled && stemState.sourceBuffer ? "Processing" : "Idle"
    },
    arrangement,
    mixtape: {
      referenceAnalysis: mixtapeInspirationState?.structure ? { name: mixtapeInspirationState.structure.name, genre: mixtapeInspirationState.structure.genre, mood: mixtapeInspirationState.structure.mood, bpmRange: mixtapeInspirationState.structure.bpmRange || null } : null,
      verifiedTracklist: (mixtapeInspirationState?.structure?.detectedTracklist || []).filter((track) => /verified|confirmed/i.test(track.status || "")).map((track) => ({ artist: track.artist, title: track.title, confidence: track.confidence })),
      detectedIdentity: mixtapeInspirationState?.structure?.theme || null,
      themes: mixtapeInspirationState?.structure?.sampleWorld || [],
      pacing: mixtapeInspirationState?.structure?.pacing || null,
      energyCurve: mixtapeInspirationState?.structure?.energyArc || null,
      djTags: mixtapeInspirationState?.structure?.tagsAndDrops || null,
      clips: [],
      recommendations: mixtapeInspirationState?.blueprint?.chapters?.map((chapter) => ({ title: chapter.title, detail: chapter.detail })) || []
    },
    playback: {
      activeAudioSources: activeSources.map((source) => ({ id: source.id, type: source.type, name: source.metadata?.name || source.displayName, playing: Boolean(source.playing), paused: Boolean(source.paused), looping: Boolean(source.looping), recording: Boolean(source.recording) })),
      masterVolume: Number(document.querySelector("#masterVolume")?.value || 0),
      currentSource: primarySource ? { id: primarySource.id, name: primarySource.metadata?.name || primarySource.displayName } : null,
      globalStopState: registry?.lastStopEvent || "None",
      audioContextStatus: AudioEngine.context?.state || "Not started",
      recordingStatus: AudioEngine.recorder?.state === "recording" ? "Recording" : AudioEngine.mixUrl ? "Take ready" : "Not recording"
    },
    aiHistory: { ...previousHistory, recentSummary },
    creativePreferences: { transitionPreference: tempoSafetyPreferences.transitionPreference, preferredTempoShift: tempoSafetyPreferences.preferredShift, warningThreshold: tempoSafetyPreferences.warningThreshold, absoluteMaximumShift: tempoSafetyPreferences.absoluteMaximumShift, preserveIncomingBpm: tempoSafetyPreferences.preserveIncomingBpm },
    systemStatus: {
      activeModules: [sourceFiles.length && "DITC", (deckState.a.buffer || deckState.b.buffer) && "Decks", autoMixState.running && "Smart Mix", assignedPads.length && "Pads", drums.source !== "Preset" && "Beat Forge", instrument.pattern.notes.length && "Harmony Lab", stemState.stems.length && "Stems", arrangement.clipCount && "Arrangement", mixtapeInspirationState && "Mixtape Analyzer"].filter(Boolean),
      missingContext,
      conflictingContext: genreConflicts.map((value) => ({ field: "Genre", value, source: "Analyzed track" })),
      confidence: contextConfidence,
      currentCreativePriorities: priorities,
      currentRisks: risks,
      lastContextError: "None"
    }
  };
}

function initializeProjectIntelligence() {
  ProjectIntelligenceEngine.configure({ projectId: producerStudioState.projectId, adapter: buildProjectIntelligenceSnapshot });
  projectIntelligenceReady = true;
  ProjectIntelligenceEngine.syncFromAdapter({ domain: "systemStatus", type: "context-initialized", summary: "Project context initialized", meaningful: false, force: true });
  producerStudioState.contextUnsubscribe = ProjectIntelligenceEngine.subscribeToProjectContext(() => {
    if (recommendationEngineReady) RecommendationEngine.scheduleRefresh("Project context updated");
    if (document.querySelector("#ai")?.classList.contains("is-active")) renderProducerStudio({ sync: false });
    renderProjectIntelligenceDiagnostics();
  });
}

function removeRecommendationArrangementClip(clipId) {
  if (!clipId || !editorState.clips.some((clip) => clip.id === clipId)) return false;
  editorState.clips = editorState.clips.filter((clip) => clip.id !== clipId);
  if (editorState.selectedClipId === clipId) editorState.selectedClipId = null;
  renderEditor();
  emitProjectContextChange("arrangement", "recommendation-undone", { summary: "Removed a recommendation-created arrangement clip" });
  return true;
}

async function executeContextualRecommendationAction(actionId, recommendation, options = {}) {
  const mode = options.mode || "apply";
  if (mode === "undo") {
    const token = options.undoToken || {};
    if (token.kind === "arrangement-clip") return { success: removeRecommendationArrangementClip(token.clipId), message: "Removed the recommendation-created arrangement clip." };
    if (token.kind === "beat-edit") { undoBeatEdit(); return { success: true, message: "Restored the previous Beat Forge pattern." }; }
    if (token.kind === "harmony-edit") { undoHarmony(); return { success: true, message: "Restored the previous Harmony Lab pattern." }; }
    if (token.kind === "recording" && AudioEngine.recorder?.state === "recording") { toggleMixRecording(); return { success: true, message: "Stopped the recommendation-started recording." }; }
    return { success: false, message: "No reversible before-state is available for this action." };
  }
  if (actionId === "open-ditc") { switchView("sources"); return { success: true, message: "Opened DITC." }; }
  if (actionId === "open-pads") { switchView("sampler"); return { success: true, message: "Opened Pads." }; }
  if (actionId === "open-smart-mix") { switchView("decks"); document.querySelector("#smartMixPrompt")?.focus(); return { success: true, message: "Opened Smart Mix transition planning." }; }
  if (actionId === "open-arrangement") { switchView("editor"); return { success: true, message: "Opened Arrangement." }; }
  if (actionId === "open-project-intelligence") { producerStudioState.mode = "advanced"; switchView("ai"); document.querySelector("#projectIntelligenceTitle")?.scrollIntoView({ block: "start" }); return { success: true, message: "Opened Project Intelligence." }; }
  if (actionId === "open-mixtape-analysis") { producerStudioState.mode = "advanced"; switchView("ai"); document.querySelector("#mixtapeInspirationNotes")?.closest("details")?.setAttribute("open", ""); return { success: true, message: "Opened the reference mixtape blueprint." }; }
  if (actionId === "smart-safe-transition") {
    switchView("decks");
    document.querySelector("#smartMixPrompt").value = "Use a short filter handoff or quick cut at original tempo in 8 bars. Keep the active deck tempo and avoid a long blend.";
    planSmartPrompt();
    if (!smartPromptState.plan) return { success: false, message: "Smart Mix could not build a transition plan from the current decks." };
    if (smartPromptState.plan.requiresSaferPlan) {
      const alternatives = generateSaferTransitionPlans(smartPromptState.plan);
      if (!alternatives[0]) return { success: false, message: "No executable safer transition is available." };
      if (mode === "preview") { selectSaferTransitionPlan(alternatives[0].id, false); setSmartMixStatus("Recommendation preview: safer transition plan prepared. No audio was changed."); return { success: true, message: "Prepared a safer Smart Mix plan without changing audio." }; }
      selectSaferTransitionPlan(alternatives[0].id, false);
      const started = await applySmartPromptPlan();
      return { success: Boolean(started), message: started ? "Applied the safer plan through the existing Smart Mix transition controller." : "Smart Mix could not start the safer transition plan." };
    }
    if (mode === "preview") { setSmartMixStatus(`Recommendation preview: ${smartPromptState.plan.transitionStyleLabel}. No audio was changed.`); return { success: true, message: "Prepared a Smart Mix plan without changing audio." }; }
    const started = await applySmartPromptPlan();
    return { success: Boolean(started), message: started ? "Applied the recommendation through the existing Smart Mix transition controller." : "Smart Mix could not start the recommended transition." };
  }
  if (actionId === "beat-match") {
    renderBeatMatch();
    if (!drums.beatMatch) return { success: false, message: "Beat Match requires a loaded deck." };
    if (mode === "preview") { await previewBeatMatch(); return { success: true, message: "Previewing the Beat Forge Match candidate." }; }
    applyBeatMatch();
    return { success: true, message: "Applied the lighter pattern through Beat Forge.", undoToken: { kind: "beat-edit" } };
  }
  if (actionId === "beat-to-arrangement") {
    const beforeIds = new Set(editorState.clips.map((clip) => clip.id));
    sendBeatToArrangement();
    const clip = editorState.clips.find((item) => !beforeIds.has(item.id));
    return clip ? { success: true, message: "Added the canonical Beat Forge pattern to Arrangement.", undoToken: { kind: "arrangement-clip", clipId: clip.id } } : { success: false, message: "No Beat Forge clip was added." };
  }
  if (actionId === "harmony-match") {
    renderHarmonyMatch();
    if (!instrument.matchPlan) return { success: false, message: "Harmony Match could not create a supported candidate." };
    if (mode === "preview") { await previewHarmonyPattern(instrument.matchPlan); return { success: true, message: "Previewing the Harmony Match candidate." }; }
    applyHarmonyPlan(instrument.matchPlan);
    return { success: true, message: "Applied the candidate through Harmony Lab.", undoToken: { kind: "harmony-edit" } };
  }
  if (actionId === "harmony-to-arrangement") {
    const beforeIds = new Set(editorState.clips.map((clip) => clip.id));
    sendHarmonyToArrangement();
    const clip = editorState.clips.find((item) => !beforeIds.has(item.id));
    return clip ? { success: true, message: "Added the Harmony Lab pattern to Arrangement.", undoToken: { kind: "arrangement-clip", clipId: clip.id } } : { success: false, message: "No Harmony clip was added." };
  }
  if (actionId === "stop-pad-loops") { stopPadLoops(); return { success: true, message: "Stopped active pad loops without changing the bank." }; }
  if (actionId === "preview-pad") {
    const padNumber = Number(recommendation.relatedPadIds?.[0]);
    if (!padNumber || !sampler.buffers[padNumber - 1]) return { success: false, message: "The recommended pad is no longer playable." };
    await AudioEngine.init(); triggerPad(padNumber - 1); return { success: true, message: `Previewing Pad ${padNumber}. Global Stop remains available.` };
  }
  if (actionId === "preview-stem") {
    const name = recommendation.evidence.find((item) => item.label === "Suggested preview")?.value;
    const stem = stemState.stems.find((item) => item.name === name);
    if (!stem) return { success: false, message: "The recommended stem is no longer available." };
    await handleStemAction("preview", stem.id); return { success: true, message: `Previewing the ${stem.name} stem. Global Stop remains available.` };
  }
  if (actionId === "start-mix-recording") {
    await AudioEngine.init();
    if (AudioEngine.recorder?.state === "recording") return { success: false, message: "A mix recording is already active." };
    toggleMixRecording();
    return { success: AudioEngine.recorder?.state === "recording", message: "Started a test mix recording.", undoToken: { kind: "recording" } };
  }
  if (actionId === "download-mix") {
    const button = document.querySelector("#downloadMix");
    if (!AudioEngine.mixUrl || button?.disabled) return { success: false, message: "No completed mix recording is available." };
    button.click(); return { success: true, message: "Downloaded the completed test mix." };
  }
  return { success: false, message: `Unsupported recommendation action: ${actionId}` };
}

function initializeRecommendationEngine() {
  RecommendationEngine.configure({ projectId: producerStudioState.projectId, getContext: () => ProjectIntelligenceEngine.getProjectContext(), executeAction: executeContextualRecommendationAction });
  recommendationEngineReady = true;
  RecommendationEngine.subscribe((recommendations, meta) => {
    if (document.querySelector("#ai")?.classList.contains("is-active")) renderProducerSuggestions(ProjectIntelligenceEngine.getProjectContext(), recommendations);
    renderRecommendationDiagnostics();
    const status = document.querySelector("#producerRecommendationStatus");
    if (status && meta?.type !== "refreshed") status.textContent = `Recommendation ${meta?.type?.replace(/-/g, " ") || "updated"}.`;
  });
}

function emitProjectContextChange(domain, type, options = {}) {
  if (!projectIntelligenceReady) return false;
  return ProjectIntelligenceEngine.syncFromAdapter({
    domain,
    type,
    summary: options.summary || type,
    meaningful: options.meaningful !== false,
    decision: options.decision || null
  });
}

function refreshProjectContext(options = {}) {
  if (options.sync) emitProjectContextChange(options.domain || "systemStatus", options.type || "context-refreshed", { meaningful: options.meaningful !== false, summary: options.summary });
  return ProjectIntelligenceEngine.getProjectContext();
}

function producerOverviewItems(context) {
  const currentDeck = context.decks.find((deck) => deck.playbackState === "Playing") || context.decks.find((deck) => deck.loadedTrack);
  const incomingDeck = context.smartMix.incomingDeck ? context.decks.find((deck) => deck.id === context.smartMix.incomingDeck) : null;
  return [
    ["Project Name", context.project.projectName || "Not set", "project"],
    ["Genre", context.project.genre || "Not set", "identity"],
    ["Current BPM", context.project.bpm ? `${context.project.bpm} BPM` : "Not set", "tempo"],
    ["Current Key", context.project.key || "Not analyzed", "harmony"],
    ["Current Deck", currentDeck?.loadedTrack ? `Deck ${currentDeck.id.toUpperCase()}: ${currentDeck.loadedTrack.name}` : "No track loaded", "decks"],
    ["Incoming Track", incomingDeck?.loadedTrack?.name || "No incoming track", "decks"],
    ["Track Count", `${context.ditc.totalTracks || 0} total · ${context.ditc.playableTracks || 0} playable`, "ditc"],
    ["Beat Forge", context.beatForge.activePattern?.name || "No active pattern", "beat"],
    ["Harmony Lab", context.harmonyLab.melody?.name || "No harmony material", "harmony"],
    ["Active Pad Bank", `Bank ${context.pads.activeBank || "Not set"} · ${context.pads.activeScene || "No scene"}`, "pads"],
    ["Arrangement Length", context.arrangement.timelineLength ? formatTime(context.arrangement.timelineLength) : "Not started", "arrangement"],
    ["Project Progress", `${context.project.projectProgress || 0}%`, "progress"],
    ["Last Meaningful Update", context.timestamps.lastMeaningfulUpdate ? new Date(context.timestamps.lastMeaningfulUpdate).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "No updates yet", "ai"]
  ];
}

function renderProjectOverview(context) {
  const grid = document.querySelector("#projectOverviewGrid");
  if (!grid) return;
  grid.innerHTML = producerOverviewItems(context).map(([label, value, kind]) => `
    <article class="project-stat" data-stat-kind="${kind}">
      <span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>
      ${kind === "progress" ? `<div class="project-progress-track"><span style="width:${context.project.projectProgress || 0}%"></span></div>` : ""}
    </article>`).join("");
}

const RECOMMENDATION_FILTERS = ["All", "Needs Attention", "Next Steps", "Creative Ideas", "DITC", "Decks", "Smart Mix", "Pads", "Beat Forge", "Harmony Lab", "Stems", "Arrangement", "Beginner Friendly", "Advanced", "High Confidence", "Saved for Later"];

function recommendationMatchesFilter(item, filter) {
  if (filter === "all") return true;
  if (filter === "needs attention") return item.priority === "Needs Attention";
  if (filter === "next steps") return item.priority === "Recommended Next";
  if (filter === "creative ideas") return ["Creative Opportunity", "Optional Experiment"].includes(item.priority);
  if (filter === "beginner friendly") return item.beginnerFriendly;
  if (filter === "advanced") return !item.beginnerFriendly || item.difficulty === "Advanced";
  if (filter === "high confidence") return item.confidenceLabel === "High Confidence";
  if (filter === "saved for later") return item.savedForLater;
  if (filter === "stems") return item.domain === "Stem Lab";
  return item.domain.toLowerCase() === filter;
}

function renderRecommendationFilters() {
  const container = document.querySelector("#producerRecommendationFilters");
  if (!container) return;
  container.innerHTML = RECOMMENDATION_FILTERS.map((filter) => `<button data-recommendation-filter="${filter.toLowerCase()}" class="${producerStudioState.recommendationFilter === filter.toLowerCase() ? "is-active" : ""}">${filter}</button>`).join("");
}

function recommendationEmptyState(context) {
  const projectEmpty = !context.ditc.totalTracks && !context.decks.some((deck) => deck.loadedTrack) && !context.arrangement.clipCount && !context.beatForge.activePattern && !context.harmonyLab.melody && !context.pads.assignedPadCount;
  const message = projectEmpty ? "Add tracks or begin a project to receive contextual suggestions." : "No current recommendations match this view. New evidence or a manual refresh may produce more.";
  return `<div class="producer-empty-state recommendation-empty-state"><p>${message}</p><div class="producer-empty-actions"><button data-recommendation-empty-action="sources">Import Tracks</button><button data-recommendation-empty-action="decks">Load a Deck</button><button data-recommendation-empty-action="drums">Generate a Beat</button><button data-recommendation-empty-action="keys">Open Harmony Lab</button><button data-recommendation-empty-action="sampler">Create a Pad Bank</button><button data-recommendation-empty-action="editor">Start an Arrangement</button></div></div>`;
}

function renderProducerSuggestions(context, suppliedRecommendations = null) {
  const grid = document.querySelector("#producerSuggestionGrid");
  if (!grid) return;
  renderRecommendationFilters();
  const all = suppliedRecommendations || (recommendationEngineReady ? RecommendationEngine.getRecommendations() : []);
  const filtered = all.filter((item) => recommendationMatchesFilter(item, producerStudioState.recommendationFilter));
  let visible = filtered;
  if (producerStudioState.mode === "simple" && !producerStudioState.showAllRecommendations) {
    visible = [...filtered.filter((item) => item.priority !== "Optional Experiment").slice(0, 3), ...filtered.filter((item) => item.priority === "Optional Experiment").slice(0, 2)];
  }
  const seeMore = document.querySelector("#showMoreProducerSuggestions");
  if (seeMore) {
    seeMore.hidden = producerStudioState.mode !== "simple" || producerStudioState.showAllRecommendations || visible.length >= filtered.length;
    seeMore.textContent = `See More Suggestions (${filtered.length - visible.length})`;
  }
  grid.innerHTML = visible.length ? visible.map((item, index) => {
    const applied = item.status === "Applied";
    const evidence = item.evidence.map((entry) => `<li><span>${escapeHtml(entry.label)}</span><strong>${escapeHtml(entry.value)}</strong></li>`).join("");
    const advanced = Object.entries(item.advancedDetails || {}).map(([key, value]) => `<li><span>${escapeHtml(key.replace(/([A-Z])/g, " $1"))}</span><strong>${escapeHtml(value)}</strong></li>`).join("");
    const alternatives = item.alternativeActions.map((action) => `<li><span>Alternative</span><strong>${escapeHtml(action.label)}</strong></li>`).join("");
    const primary = item.applyCapability.available
      ? `<button data-suggestion-action="apply" class="is-primary">${escapeHtml(applied ? "Applied" : item.applyCapability.label || "Apply")}</button>`
      : item.suggestedAction ? `<button data-suggestion-action="navigate" class="is-primary">${escapeHtml(item.suggestedAction.label)}</button>` : "";
    return `<article class="producer-suggestion-card priority-${item.priority.toLowerCase().replace(/\s+/g, "-")}${applied ? " is-applied" : ""}" data-suggestion-id="${escapeHtml(item.recommendationId)}" data-context-version="${item.contextVersion}" tabindex="0" aria-labelledby="recommendation-title-${index}">
      <div class="producer-card-meta"><span><b aria-hidden="true">${item.domainIcon}</b> ${escapeHtml(item.domain)} · ${escapeHtml(item.priority)}</span><strong>${escapeHtml(item.confidenceLabel)}</strong></div>
      <h4 id="recommendation-title-${index}">${escapeHtml(item.title)}</h4><p>${escapeHtml(item.summary)}</p>
      <p class="producer-expected-impact"><span>Expected effect</span>${escapeHtml(item.expectedImpact)}</p>
      ${item.applyCapability.available ? `<small class="recommendation-affected">Affects: ${escapeHtml((item.suggestedAction?.affectedDomains || [item.domain]).join(", "))}</small>` : ""}
      <div class="producer-card-explanation" hidden><p><strong>Why it matters:</strong> ${escapeHtml(item.explanation)}</p><ul class="recommendation-evidence">${evidence}${alternatives}</ul>${item.learningNote ? `<p><strong>Learning note:</strong> ${escapeHtml(item.learningNote)}</p>` : ""}${advanced ? `<ul class="recommendation-evidence producer-advanced-only">${advanced}</ul>` : ""}${!item.previewCapability.available ? `<p><strong>Preview unavailable:</strong> ${escapeHtml(item.previewCapability.reason)}</p>` : ""}<small>Context v${item.contextVersion} · ${escapeHtml(item.confidenceBasis)}</small></div>
      ${item.warnings.length ? `<p class="recommendation-warning">${escapeHtml(item.warnings.join(" "))}</p>` : ""}
      <div class="producer-card-actions">
        ${item.previewCapability.available ? `<button data-suggestion-action="preview">${escapeHtml(item.previewCapability.label || "Preview")}</button>` : ""}
        ${primary}
        <button data-suggestion-action="explain">Explain</button>
        ${item.alternativeActions.length ? `<button data-suggestion-action="alternatives">Other Options</button>` : ""}
        <button data-suggestion-action="save">${item.savedForLater ? "Saved" : "Save for Later"}</button>
        <button data-suggestion-action="reject">Reject</button>
        <button data-suggestion-action="dismiss">Dismiss</button>
        ${applied && item.undoCapability.available ? `<button data-suggestion-action="undo">${escapeHtml(item.undoCapability.label || "Undo")}</button>` : ""}
      </div>
    </article>`;
  }).join("") : recommendationEmptyState(context);
}

const PRODUCER_MISSIONS = [
  ["Build Mixtape", "Create a cohesive mixtape plan using the current project, DITC tracks, decks, pads, and references."],
  ["Create Live Set", "Create a live set with a clear energy arc and safe transitions using the current project."],
  ["Generate Intro", "Generate a memorable project intro with an 8-bar structure, DJ drop space, and a clean first transition."],
  ["Generate Outro", "Generate a strong closing section that resolves the current key, energy arc, and project identity."],
  ["Improve Energy", "Improve the project energy arc without replacing manual arrangement choices."],
  ["Generate Beat", "Generate a Beat Forge pattern that fits the current BPM, genre, decks, and arrangement."],
  ["Compose Harmony", "Compose a Harmony Lab idea that fits the current key, Beat Forge groove, and project space."],
  ["Find Better Songs", "Find better intro, transition, and closing songs in the current DITC selection."],
  ["Master Session", "Review this session and create a non-destructive mastering checklist."],
  ["Build Pad Bank", "Build a project-aware pad bank for intros, drops, transitions, scratches, and the outro."],
  ["Generate Transition", "Generate a safe, editable transition plan for the current decks and selected songs."]
];

function renderProducerMissions() {
  const grid = document.querySelector("#producerMissionGrid");
  if (!grid) return;
  grid.innerHTML = PRODUCER_MISSIONS.map(([label, prompt], index) => `<button class="producer-mission" data-producer-mission="${index}"><span>${escapeHtml(label)}</span><small>${escapeHtml(prompt)}</small><b>Start mission →</b></button>`).join("");
}

function rememberProducerPrompt(prompt, options = {}) {
  const value = String(prompt || "").trim();
  if (!value) return;
  const existing = producerStudioState.history.find((item) => item.prompt === value);
  const item = { prompt: value, favorite: existing?.favorite || false, createdAt: Date.now() };
  producerStudioState.history = [item, ...producerStudioState.history.filter((entry) => entry.prompt !== value)].slice(0, 20);
  if (options.saved && !producerStudioState.savedPrompts.some((entry) => entry.prompt === value)) producerStudioState.savedPrompts.unshift(item);
  writeProducerStudioStorage();
  renderProducerPromptLibrary();
}

function renderProducerPromptLibrary() {
  const templates = ["Create a DJ Clue intro", "Generate Boom Bap drums", "Generate Rhodes chords", "Create a 20-minute house mix"];
  const renderButtons = (items, kind) => items.length ? items.map((item, index) => `<span class="producer-library-entry"><button data-producer-prompt-kind="${kind}" data-producer-prompt-index="${index}">${escapeHtml(item.prompt || item)}</button>${kind === "history" ? `<button class="producer-favorite-toggle" data-producer-favorite-index="${index}" aria-label="${item.favorite ? "Remove from" : "Add to"} favorites">${item.favorite ? "★" : "☆"}</button>` : ""}</span>`).join("") : `<small>Nothing here yet.</small>`;
  const history = document.querySelector("#producerPromptHistory");
  if (!history) return;
  history.innerHTML = renderButtons(producerStudioState.history.slice(0, 6), "history");
  document.querySelector("#producerFavoritePrompts").innerHTML = renderButtons(producerStudioState.history.filter((item) => item.favorite).slice(0, 6), "favorite");
  document.querySelector("#producerSavedPrompts").innerHTML = renderButtons(producerStudioState.savedPrompts.slice(0, 6), "saved");
  document.querySelector("#producerPromptTemplates").innerHTML = renderButtons(templates, "template");
  document.querySelector("#producerSuggestedPrompts").innerHTML = templates.map((prompt) => `<button data-producer-prompt-value="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("");
}

function recordProducerEvent(action, options = {}) {
  const entry = ProjectIntelligenceEngine.recordDecision({
    id: options.id || createId(),
    timestamp: new Date().toISOString(),
    domain: options.domain || "AI",
    action: options.action || action,
    summary: options.summary || action,
    before: options.before,
    after: options.after,
    undoRef: options.undo ? "runtime" : null,
    initiatedBy: options.initiatedBy || "user"
  });
  if (options.undo) producerStudioState.undoActions.set(entry.id, options.undo);
  writeProducerStudioStorage();
  renderProducerTimeline();
  return entry;
}

function producerTimelineGroup(timestamp) {
  const value = new Date(timestamp);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday.getTime() - 86400000);
  if (value >= startToday) return "Today";
  if (value >= startYesterday) return "Yesterday";
  return "Earlier";
}

function renderProducerTimeline() {
  const timeline = document.querySelector("#producerTimeline");
  if (!timeline) return;
  const allEntries = ProjectIntelligenceEngine.getProjectContext().aiHistory?.decisions || [];
  const entries = producerStudioState.timelineFilter === "all" ? allEntries : allEntries.filter((entry) => entry.domain.toLowerCase() === producerStudioState.timelineFilter);
  const filters = document.querySelector("#producerTimelineFilters");
  const domains = ["all", "DITC", "Decks", "Smart Mix", "Pads", "Beat Forge", "Harmony Lab", "Stems", "Arrangement", "AI"];
  if (filters) filters.innerHTML = domains.map((domain) => `<button data-producer-timeline-filter="${domain.toLowerCase()}" class="${producerStudioState.timelineFilter === domain.toLowerCase() ? "is-active" : ""}">${domain}</button>`).join("");
  if (!entries.length) { timeline.innerHTML = `<div class="producer-empty-state">No meaningful ${producerStudioState.timelineFilter === "all" ? "project" : escapeHtml(producerStudioState.timelineFilter)} activity has been recorded.</div>`; return; }
  const grouped = entries.reduce((result, entry) => { const group = producerTimelineGroup(entry.timestamp); (result[group] ||= []).push(entry); return result; }, {});
  timeline.innerHTML = ["Today", "Yesterday", "Earlier"].filter((group) => grouped[group]?.length).map((group) => `<section class="producer-timeline-group"><h4>${group}</h4>${grouped[group].map((entry) => `<article class="producer-timeline-entry"><span class="producer-timeline-dot"></span><div><time datetime="${entry.timestamp}">${new Date(entry.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${escapeHtml(entry.domain)}</time><strong>${escapeHtml(entry.summary)}</strong></div>${producerStudioState.undoActions.has(entry.id) ? `<button data-producer-timeline-undo="${entry.id}">Undo</button>` : ""}</article>`).join("")}</section>`).join("");
}

function renderProducerIntelligence(context) {
  const graph = document.querySelector("#producerProjectGraph");
  if (!graph) return;
  const nodes = [
    ["DITC", context.ditc.totalTracks || 0], ["Decks", context.decks.filter((deck) => deck.loadedTrack).length], ["Beat Forge", context.beatForge.activePattern ? 1 : 0],
    ["Harmony", context.harmonyLab.melody ? 1 : 0], ["Pads", context.pads.assignedPadCount || 0], ["Stems", context.stems.availableStemTypes?.length || 0], ["Arrangement", context.arrangement.clipCount || 0]
  ];
  graph.innerHTML = `<div class="project-graph-core"><span>${escapeHtml(context.project.projectName || "Not set")}</span><strong>v${context.contextVersion}</strong></div>${nodes.map(([label, count]) => `<div class="project-graph-node"><span>${escapeHtml(label)}</span><strong>${count}</strong></div>`).join("")}`;
  const confidence = context.systemStatus.confidence || 0;
  document.querySelector("#producerConfidence").textContent = `Confidence · ${confidence}%`;
  document.querySelector("#producerReasoning").textContent = `Context v${context.contextVersion} uses ${context.systemStatus.activeModules.length} active module${context.systemStatus.activeModules.length === 1 ? "" : "s"}. Identity confidence is evidence-weighted; missing and conflicting fields remain visible instead of being invented.`;
  const renderList = (selector, items, empty) => { const element = document.querySelector(selector); if (element) element.innerHTML = items.length ? items.map((item) => `<div>${item}</div>`).join("") : `<span class="fine-print">${escapeHtml(empty)}</span>`; };
  renderList("#producerPriorities", context.systemStatus.currentCreativePriorities.map((item) => escapeHtml(item)), "No priority inferred yet.");
  renderList("#producerActiveModules", context.systemStatus.activeModules.map((item) => `<span>${escapeHtml(item)}</span>`), "No active creative modules detected.");
  document.querySelector("#producerIntelligenceUpdated").textContent = context.timestamps.updatedAt ? `Last updated ${new Date(context.timestamps.updatedAt).toLocaleString()}` : "No context updates yet.";
  renderList("#producerProgressFactors", (context.project.progressFactors || []).map((factor) => `<span class="${factor.complete ? "is-complete" : ""}">${factor.complete ? "✓" : "○"} ${escapeHtml(factor.label)}</span><small>${escapeHtml(factor.detail)}</small>`), "No progress factors available.");
  renderList("#producerIdentityProvenance", Object.entries(context.project.identity || {}).map(([field, evidence]) => `<span>${escapeHtml(field.replace(/([A-Z])/g, " $1"))}: ${escapeHtml(evidence.value == null ? "Not set" : Array.isArray(evidence.value) ? evidence.value.join(", ") : evidence.value)}</span><small>${evidence.confidence}% · ${escapeHtml(evidence.source)}${evidence.userConfirmed ? " · Confirmed" : " · Inferred"}</small>`), "No identity evidence available.");
  renderList("#producerMissingContext", (context.systemStatus.missingContext || []).map((item) => `<span>${escapeHtml(item)}</span>`), "No required context is missing.");
  renderList("#producerContextConflicts", (context.systemStatus.conflictingContext || []).map((item) => `<span>${escapeHtml(item.field)}: ${escapeHtml(item.value)}</span><small>${escapeHtml(item.source)}</small>`), "No conflicting evidence detected.");
  renderList("#producerContextRisks", (context.systemStatus.currentRisks || []).map((risk) => `<span>${escapeHtml(risk.summary)}</span><small>${escapeHtml(risk.domain)} · ${escapeHtml(risk.severity)}</small>`), "No supported risks detected.");
  renderList("#producerRecentDecisions", (context.aiHistory?.decisions || []).slice(0, 8).map((decision) => `<span>${escapeHtml(decision.summary)}</span><small>${escapeHtml(decision.domain)} · ${new Date(decision.timestamp).toLocaleString()}</small>`), "No decisions recorded.");
}

function selectedPromptContextDomains() {
  return Object.entries(producerStudioState.promptDomains).filter(([, included]) => included).map(([domain]) => domain);
}

function renderPromptContextPreview() {
  const preview = document.querySelector("#producerContextPreview");
  if (!preview) return;
  const summary = ProjectIntelligenceEngine.getContextSummary({ include: ["project", ...selectedPromptContextDomains()] });
  summary.recommendations = recommendationEngineReady ? RecommendationEngine.getPromptSummary() : [];
  preview.textContent = JSON.stringify(summary, null, 2);
  document.querySelector("#producerContextVersionLabel").textContent = `v${summary.contextVersion}`;
}

function resetPromptContextDomains() {
  Object.keys(producerStudioState.promptDomains).forEach((domain) => { producerStudioState.promptDomains[domain] = true; });
  document.querySelectorAll("[data-prompt-context-domain]").forEach((input) => { input.checked = true; });
  renderPromptContextPreview();
}

function renderProducerWelcome(context) {
  const summary = context.aiHistory?.recentSummary;
  const container = document.querySelector("#producerWelcomeSummary");
  if (!container) return;
  const events = summary?.events || [];
  container.innerHTML = events.length ? `<strong>Last session</strong><ul>${events.map((event) => `<li>${escapeHtml(event)}</li>`).join("")}</ul><p><span>Suggested next step</span><b>${escapeHtml(summary.suggestedNextStep || "Review today's suggestions")}</b></p>` : "No meaningful project events have been recorded yet.";
  document.querySelector("#producerWelcomeVersion").textContent = `Context v${context.contextVersion}`;
}

function renderProjectIntelligenceDiagnostics() {
  const details = document.querySelector("#projectIntelligenceDiagnostics");
  if (details) details.hidden = !DECKFORGE_DEVELOPMENT;
  const output = document.querySelector("#projectIntelligenceDiagnosticsOutput");
  if (output && DECKFORGE_DEVELOPMENT) output.textContent = JSON.stringify(ProjectIntelligenceEngine.getDiagnostics(), null, 2);
}

function renderRecommendationDiagnostics() {
  const details = document.querySelector("#recommendationEngineDiagnostics");
  if (details) details.hidden = !DECKFORGE_DEVELOPMENT;
  const output = document.querySelector("#recommendationEngineDiagnosticsOutput");
  if (output && DECKFORGE_DEVELOPMENT && recommendationEngineReady) output.textContent = JSON.stringify(RecommendationEngine.getDiagnostics(), null, 2);
}

function renderProducerStudio(options = {}) {
  const context = refreshProjectContext(options);
  const studio = document.querySelector("#ai");
  if (!studio) return;
  studio.dataset.producerMode = producerStudioState.mode;
  document.querySelectorAll("[data-producer-mode-choice]").forEach((button) => {
    const active = button.dataset.producerModeChoice === producerStudioState.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderProjectOverview(context);
  renderProducerPromptLibrary();
  renderProducerSuggestions(context);
  renderProducerMissions();
  renderProducerTimeline();
  renderProducerIntelligence(context);
  renderProducerWelcome(context);
  renderPromptContextPreview();
  renderProjectIntelligenceDiagnostics();
  renderRecommendationDiagnostics();
  renderAiContext();
  const sync = document.querySelector("#producerSyncStatus");
  if (sync) sync.textContent = context.timestamps.lastMeaningfulUpdate ? `Project context updated · v${context.contextVersion} · ${new Date(context.timestamps.lastMeaningfulUpdate).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : `Context v${context.contextVersion} · No meaningful updates yet`;
}

function previewProducerPrompt(prompt, sourceLabel) {
  const input = document.querySelector("#aiPrompt");
  input.value = prompt;
  generateAiPlan();
  recordProducerEvent(`Previewed ${sourceLabel}`);
  document.querySelector("#aiPlanOutput")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showStaleRecommendationDialog(action) {
  producerStudioState.pendingStaleAction = action;
  const dialog = document.querySelector("#staleRecommendationDialog");
  const detail = document.querySelector("#staleRecommendationDetail");
  if (detail) detail.textContent = `This recommendation was created before the project changed. Refresh it from context v${ProjectIntelligenceEngine.getContextVersion()}, recalculate all suggestions, ${action.forceLabel || "apply it anyway"}, or cancel.`;
  const forceButton = document.querySelector("#applyStaleRecommendationAnyway");
  if (forceButton) forceButton.textContent = action.forceButtonLabel || "Apply Anyway";
  if (dialog?.showModal) dialog.showModal();
}

function closeStaleRecommendationDialog() {
  document.querySelector("#staleRecommendationDialog")?.close();
  producerStudioState.pendingStaleAction = null;
}

async function runContextualRecommendationAction(recommendationId, mode, options = {}) {
  const recommendation = RecommendationEngine.getRecommendation(recommendationId);
  if (!recommendation) return { success: false, reason: "The recommendation is no longer available." };
  let result;
  if (mode === "navigate") {
    const validation = RecommendationEngine.validateRecommendation(recommendation, ProjectIntelligenceEngine.getProjectContext(), { allowStale: options.force });
    if (!validation.valid) result = { success: false, ...validation, recommendation };
    else result = await executeContextualRecommendationAction(recommendation.suggestedAction.actionId, recommendation, { mode: "navigate", force: options.force });
  } else if (mode === "preview") result = await RecommendationEngine.previewRecommendation(recommendationId, { force: options.force });
  else if (mode === "apply") result = await RecommendationEngine.applyRecommendation(recommendationId, { force: options.force });
  else if (mode === "undo") result = await RecommendationEngine.undoRecommendation(recommendationId);
  if (result?.stale) {
    showStaleRecommendationDialog({
      label: recommendation.title,
      forceLabel: mode === "preview" ? "preview it anyway" : mode === "navigate" ? "open it anyway" : "apply it anyway",
      forceButtonLabel: mode === "preview" ? "Preview Anyway" : mode === "navigate" ? "Open Anyway" : "Apply Anyway",
      recalculate: () => { RecommendationEngine.refreshRecommendations({ reason: `Refreshed stale recommendation: ${recommendation.title}` }); renderProducerStudio({ sync: false }); },
      applyAnyway: () => runContextualRecommendationAction(recommendationId, mode, { force: true })
    });
    return result;
  }
  if (!result?.success) {
    const status = document.querySelector("#producerRecommendationStatus");
    if (status) status.textContent = result?.reason || result?.message || "Recommendation action failed.";
    renderProducerSuggestions(ProjectIntelligenceEngine.getProjectContext());
    return result;
  }
  if (mode === "apply") recordProducerEvent(`Applied ${recommendation.title}`, { domain: recommendation.domain, action: "Recommendation applied", summary: `Applied ${recommendation.title}`, initiatedBy: "user", before: { contextVersion: recommendation.contextVersion }, after: { affectedDomains: recommendation.suggestedAction?.affectedDomains || [] } });
  if (mode === "undo") recordProducerEvent(`Undid ${recommendation.title}`, { domain: recommendation.domain, action: "Recommendation undone", summary: `Undid ${recommendation.title}`, initiatedBy: "user" });
  renderProducerSuggestions(ProjectIntelligenceEngine.getProjectContext());
  const card = document.querySelector(`[data-suggestion-id="${CSS.escape(recommendationId)}"]`);
  card?.focus();
  return result;
}

function setupProducerStudioEvents() {
  document.querySelectorAll("[data-producer-mode-choice]").forEach((button) => button.addEventListener("click", () => {
    producerStudioState.mode = button.dataset.producerModeChoice;
    writeProducerStudioStorage();
    renderProducerStudio();
  }));
  document.querySelector("#producerSuggestedPrompts").addEventListener("click", (event) => {
    const button = event.target.closest("[data-producer-prompt-value]");
    if (button) document.querySelector("#aiPrompt").value = button.dataset.producerPromptValue;
  });
  document.querySelector("#producerContextDomains").addEventListener("change", (event) => {
    const input = event.target.closest("[data-prompt-context-domain]");
    if (!input) return;
    producerStudioState.promptDomains[input.dataset.promptContextDomain] = input.checked;
    renderPromptContextPreview();
  });
  document.querySelector(".producer-prompt-library").addEventListener("click", (event) => {
    const favorite = event.target.closest("[data-producer-favorite-index]");
    if (favorite) {
      const item = producerStudioState.history[Number(favorite.dataset.producerFavoriteIndex)];
      if (item) item.favorite = !item.favorite;
      writeProducerStudioStorage(); renderProducerPromptLibrary(); return;
    }
    const button = event.target.closest("[data-producer-prompt-kind]");
    if (!button) return;
    const kind = button.dataset.producerPromptKind;
    const index = Number(button.dataset.producerPromptIndex);
    const templates = ["Create a DJ Clue intro", "Generate Boom Bap drums", "Generate Rhodes chords", "Create a 20-minute house mix"];
    const collections = { history: producerStudioState.history, favorite: producerStudioState.history.filter((item) => item.favorite), saved: producerStudioState.savedPrompts, template: templates };
    const item = collections[kind]?.[index];
    document.querySelector("#aiPrompt").value = item?.prompt || item || "";
  });
  document.querySelector("#saveProducerPrompt").addEventListener("click", () => {
    const prompt = document.querySelector("#aiPrompt").value.trim();
    if (!prompt) return;
    rememberProducerPrompt(prompt, { saved: true });
    recordProducerEvent("Saved a Prompt Studio prompt");
  });
  document.querySelector("#producerMissionGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-producer-mission]");
    if (!button) return;
    const mission = PRODUCER_MISSIONS[Number(button.dataset.producerMission)];
    previewProducerPrompt(mission[1], mission[0]);
  });
  document.querySelector("#producerSuggestionGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-suggestion-action]");
    const card = event.target.closest("[data-suggestion-id]");
    if (!button || !card) return;
    const action = button.dataset.suggestionAction;
    if (action === "explain" || action === "alternatives") { const explanation = card.querySelector(".producer-card-explanation"); explanation.hidden = !explanation.hidden; return; }
    if (action === "preview" || action === "apply" || action === "navigate" || action === "undo") { runContextualRecommendationAction(card.dataset.suggestionId, action); return; }
    if (action === "save") { RecommendationEngine.saveRecommendation(card.dataset.suggestionId); renderProducerSuggestions(ProjectIntelligenceEngine.getProjectContext()); return; }
    if (action === "reject") { producerStudioState.pendingRecommendationRejectionId = card.dataset.suggestionId; document.querySelector("#rejectRecommendationDialog")?.showModal(); return; }
    if (action === "dismiss") {
      const recommendation = RecommendationEngine.getRecommendation(card.dataset.suggestionId);
      if (!recommendation) return;
      RecommendationEngine.dismissRecommendation(recommendation.recommendationId);
      producerStudioState.lastDismissedRecommendationId = recommendation.recommendationId;
      const undo = document.querySelector("#undoDismissedRecommendation");
      if (undo) { undo.hidden = false; undo.textContent = `Undo Dismiss: ${recommendation.title}`; }
      recordProducerEvent(`Dismissed ${recommendation.title}`, { domain: recommendation.domain, action: "Recommendation dismissed", summary: `Dismissed ${recommendation.title}`, initiatedBy: "user" });
      renderProducerSuggestions(ProjectIntelligenceEngine.getProjectContext());
    }
  });
  document.querySelector("#refreshProducerSuggestions").addEventListener("click", () => {
    producerStudioState.showAllRecommendations = false;
    RecommendationEngine.refreshRecommendations({ reason: "User requested refresh" });
    renderProducerStudio({ sync: false });
  });
  document.querySelector("#producerRecommendationFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-recommendation-filter]");
    if (!button) return;
    producerStudioState.recommendationFilter = button.dataset.recommendationFilter;
    producerStudioState.showAllRecommendations = false;
    renderProducerSuggestions(ProjectIntelligenceEngine.getProjectContext());
  });
  document.querySelector("#showMoreProducerSuggestions").addEventListener("click", () => { producerStudioState.showAllRecommendations = true; renderProducerSuggestions(ProjectIntelligenceEngine.getProjectContext()); });
  document.querySelector("#undoDismissedRecommendation").addEventListener("click", () => {
    const id = producerStudioState.lastDismissedRecommendationId;
    if (id && RecommendationEngine.restoreRecommendation(id)) {
      producerStudioState.lastDismissedRecommendationId = null;
      document.querySelector("#undoDismissedRecommendation").hidden = true;
      renderProducerSuggestions(ProjectIntelligenceEngine.getProjectContext());
    }
  });
  document.querySelector("#producerSuggestionGrid").addEventListener("click", (event) => {
    const action = event.target.closest("[data-recommendation-empty-action]")?.dataset.recommendationEmptyAction;
    if (action) switchView(action);
  });
  document.querySelector("#producerTimeline").addEventListener("click", (event) => {
    const button = event.target.closest("[data-producer-timeline-undo]");
    const undo = button && producerStudioState.undoActions.get(button.dataset.producerTimelineUndo);
    if (!undo) return;
    undo(); producerStudioState.undoActions.delete(button.dataset.producerTimelineUndo); renderProducerTimeline();
  });
  document.querySelector("#producerTimelineFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-producer-timeline-filter]");
    if (!button) return;
    producerStudioState.timelineFilter = button.dataset.producerTimelineFilter;
    renderProducerTimeline();
  });
  document.querySelector("#clearProducerTimeline").addEventListener("click", () => {
    producerStudioState.undoActions.clear();
    ProjectIntelligenceEngine.updateProjectContext("aiHistory", { decisions: [], recentSummary: null }, { type: "decision-log-cleared", summary: "Creative decision log cleared" });
    writeProducerStudioStorage();
    renderProducerTimeline();
  });
  document.querySelector("#globalBpm").addEventListener("change", (event) => {
    emitProjectContextChange("project", "project-bpm-changed", { summary: `Project BPM changed to ${event.target.value}`, decision: { domain: "Project", action: "BPM changed", summary: `Set project BPM to ${event.target.value}`, initiatedBy: "user" } });
  });
  document.querySelector("#recalculateStaleRecommendation").addEventListener("click", () => { const action = producerStudioState.pendingStaleAction; closeStaleRecommendationDialog(); action?.recalculate?.(); });
  document.querySelector("#recalculateAllStaleRecommendations").addEventListener("click", () => { closeStaleRecommendationDialog(); RecommendationEngine.refreshRecommendations({ reason: "Recalculated all stale recommendations" }); renderProducerStudio({ sync: false }); });
  document.querySelector("#applyStaleRecommendationAnyway").addEventListener("click", () => { const action = producerStudioState.pendingStaleAction; closeStaleRecommendationDialog(); action?.applyAnyway?.(); });
  document.querySelector("#cancelStaleRecommendation").addEventListener("click", closeStaleRecommendationDialog);
  document.querySelector("#confirmRejectRecommendation").addEventListener("click", () => {
    const id = producerStudioState.pendingRecommendationRejectionId;
    const recommendation = id && RecommendationEngine.getRecommendation(id);
    const reason = document.querySelector("#rejectRecommendationReason").value;
    if (recommendation && RecommendationEngine.rejectRecommendation(id, reason)) recordProducerEvent(`Rejected ${recommendation.title}`, { domain: recommendation.domain, action: "Recommendation rejected", summary: `Rejected ${recommendation.title}: ${reason}`, initiatedBy: "user", before: { contextVersion: recommendation.contextVersion }, after: { reason, evidenceFingerprint: recommendation.fingerprint } });
    producerStudioState.pendingRecommendationRejectionId = null;
    document.querySelector("#rejectRecommendationDialog")?.close();
    renderProducerSuggestions(ProjectIntelligenceEngine.getProjectContext());
  });
  document.querySelector("#cancelRejectRecommendation").addEventListener("click", () => { producerStudioState.pendingRecommendationRejectionId = null; document.querySelector("#rejectRecommendationDialog")?.close(); });
}

function switchView(target) {
  const leavingDitc = document.querySelector("#sources")?.classList.contains("is-active") && target !== "sources";
  if (leavingDitc && ditcState.previewTrackId) stopDitcPreview();
  document.querySelectorAll(".tab-button, .view").forEach((el) => el.classList.remove("is-active"));
  const button = document.querySelector(`.tab-button[data-target="${target}"]`);
  const view = document.querySelector(`#${target}`);
  if (button) button.classList.add("is-active");
  if (view) view.classList.add("is-active");
  if (target === "ai") renderProducerStudio();
  if (target === "editor") renderEditor();
}

function hasSupportedExtension(file, extensions) {
  const name = (file?.name || "").toLowerCase();
  return extensions.some((extension) => name.endsWith(extension));
}

function isSupportedAudioFile(file) {
  return Boolean(file && (file.type.startsWith("audio/") || hasSupportedExtension(file, supportedAudioExtensions)));
}

function isSupportedImageFile(file) {
  return Boolean(file && (file.type.startsWith("image/") || hasSupportedExtension(file, supportedImageExtensions)));
}

function fileFolderPath(file) {
  return droppedFilePaths.get(file) || file.webkitRelativePath || file.name;
}

function setDroppedFilePath(file, path) {
  if (file && path) droppedFilePaths.set(file, path.replace(/^\/+/, ""));
  return file;
}

function firstAudioFile(dataTransfer) {
  return [...dataTransfer.files].find(isSupportedAudioFile);
}

function audioFilesFromDrop(dataTransfer) {
  return [...dataTransfer.files].filter(isSupportedAudioFile);
}

async function collectSupportedDropFiles(dataTransfer, options = {}) {
  const includeImages = Boolean(options.includeImages);
  const files = [];
  const items = [...(dataTransfer.items || [])];
  const entries = items
    .map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length) {
    for (const entry of entries) {
      await collectEntryFiles(entry, "", files);
    }
  } else {
    [...dataTransfer.files].forEach((file) => files.push(setDroppedFilePath(file, file.webkitRelativePath || file.name)));
  }

  const accepted = files.filter((file) => isSupportedAudioFile(file) || (includeImages && isSupportedImageFile(file)));
  const seen = new Set();
  return accepted.filter((file) => {
    const key = `${fileFolderPath(file)}-${file.size}-${file.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => fileFolderPath(a).localeCompare(fileFolderPath(b), undefined, { numeric: true, sensitivity: "base" }));
}

async function collectEntryFiles(entry, parentPath, files) {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await entryToFile(entry);
    files.push(setDroppedFilePath(file, path));
    return;
  }
  if (!entry.isDirectory) return;
  const reader = entry.createReader();
  const entries = await readAllDirectoryEntries(reader);
  for (const child of entries) {
    await collectEntryFiles(child, path, files);
  }
}

function entryToFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readAllDirectoryEntries(reader) {
  const entries = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return entries;
    entries.push(...batch);
  }
}

function setupDropZone(element, onFileDrop) {
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    element.classList.add("is-drop-target");
    if (element.id === "sourceDrop") ditcState.dragTarget = "DITC import";
  });
  element.addEventListener("dragleave", () => {
    element.classList.remove("is-drop-target");
    if (element.id === "sourceDrop") ditcState.dragTarget = "None";
  });
  element.addEventListener("drop", async (event) => {
    event.preventDefault();
    element.classList.remove("is-drop-target");
    const ditcTrackId = event.dataTransfer.getData("application/x-deckforge-ditc-track");
    if (ditcTrackId) {
      if (element.matches(".deck[data-deck]")) await handleSourceFileAction(`deck-${element.dataset.deck}`, ditcTrackId);
      else if (element.id === "stemDrop") await handleSourceFileAction("stems", ditcTrackId);
      else setSourceStatus("That DITC track cannot be dropped here. Use a supported DeckForge destination.");
      ditcState.dragTarget = "None";
      return;
    }
    let files = [];
    try {
      files = await collectSupportedDropFiles(event.dataTransfer);
    } catch {
      ditcState.lastError = "The dropped folder could not be read. Check browser folder permissions and try again.";
      setSourceStatus(ditcState.lastError);
      return;
    }
    if (element.id === "sourceDrop" && files.length) {
      const imported = files.filter((file) => addLocalSourceFile(file, { folderPath: fileFolderPath(file), silent: true })).length;
      ditcState.lastImportResult = `Imported ${imported} of ${files.length} dropped audio files`;
      setSourceStatus(imported ? `Added ${imported} audio file${imported === 1 ? "" : "s"} to DITC.` : "No new playable files were added. Duplicates were skipped.");
      renderSources();
      renderEditorSourceBin();
      renderAiContext();
      return;
    }
    if (element.id === "mixtapeReferenceDrop") {
      const dropped = await collectSupportedDropFiles(event.dataTransfer, { includeImages: true });
      if (dropped.length) {
        await loadMixtapeReferenceFiles(dropped);
        return;
      }
    }
    const file = files[0] || firstAudioFile(event.dataTransfer);
    if (file) {
      await onFileDrop(file);
      return;
    }
    const uri = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    if (uri && element.id === "sourceDrop") {
      addDroppedSourceUrl(uri.trim());
    }
  });
}

function addDroppedSourceUrl(url) {
  try {
    const parsed = new URL(url);
    const sources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
    sources.unshift({
      url: parsed.href,
      name: parsed.hostname.replace("www.", "")
    });
    localStorage.setItem("deckforge-sources", JSON.stringify(sources.slice(0, 20)));
    renderSources();
  } catch {
    /* Ignore non-url text drops. */
  }
}

function setupEvents() {
  document.querySelector("#audioEnable").addEventListener("click", async () => {
    try {
      await AudioEngine.init();
      document.querySelector("#audioEnable").textContent = "Audio On";
      renderGlobalTransport();
    } catch (error) {
      globalTransportState.lastError = error.message || "Audio could not start";
      document.querySelector("#audioEnable").textContent = "Audio Error";
    }
  });

  document.querySelector("#globalResume").addEventListener("click", async () => {
    await resumeContextualPlayback();
  });
  document.querySelector("#globalPause").addEventListener("click", pauseGlobalAudio);
  document.querySelector("#globalRestart").addEventListener("click", restartContextualPlayback);
  document.querySelector("#globalStop").addEventListener("click", stopAllAudio);
  document.querySelector("#globalPlaybackSourceList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-global-stop-source]");
    if (button) window.AudioPlaybackRegistry?.stopSource(button.dataset.globalStopSource).then(renderGlobalTransport);
  });

  document.querySelector("#masterVolume").addEventListener("input", (event) => {
    if (AudioEngine.masterGain) AudioEngine.masterGain.gain.value = Number(event.target.value);
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.target);
    });
  });

  document.querySelector("#deckModeToggle").addEventListener("click", (event) => {
    const advanced = document.querySelector("#decks").classList.toggle("is-advanced");
    event.currentTarget.setAttribute("aria-pressed", advanced ? "true" : "false");
    event.currentTarget.textContent = advanced ? "Simple Controls" : "Advanced Controls";
  });

  document.querySelector("#editorSourceBin").addEventListener("dragstart", (event) => {
    const source = event.target.closest("[data-editor-source]");
    if (!source) return;
    event.dataTransfer.setData("application/x-deckforge-editor-source", source.dataset.editorSource);
    event.dataTransfer.effectAllowed = "copy";
  });

  document.querySelector("#editorTimeline").addEventListener("dragover", (event) => {
    const lane = event.target.closest(".editor-track-lane");
    if (!lane) return;
    event.preventDefault();
    lane.classList.add("is-drop-target");
  });

  document.querySelector("#editorTimeline").addEventListener("dragleave", (event) => {
    const lane = event.target.closest(".editor-track-lane");
    if (lane) lane.classList.remove("is-drop-target");
  });

  document.querySelector("#editorTimeline").addEventListener("drop", async (event) => {
    const lane = event.target.closest(".editor-track-lane");
    if (!lane) return;
    event.preventDefault();
    lane.classList.remove("is-drop-target");
    const trackIndex = Number(lane.dataset.trackIndex);
    const start = editorLaneTimeFromEvent(lane, event);
    const sourceJson = event.dataTransfer.getData("application/x-deckforge-editor-source");
    if (sourceJson) {
      await addEditorClipFromSource(JSON.parse(sourceJson), trackIndex, start);
      return;
    }
    const files = await collectSupportedDropFiles(event.dataTransfer);
    for (const file of files) {
      await addEditorFileClip(file, trackIndex, start);
    }
  });

  document.querySelector("#editorTimeline").addEventListener("pointerdown", (event) => {
    const clipEl = event.target.closest(".editor-clip");
    if (!clipEl) return;
    const clip = editorState.clips.find((item) => item.id === clipEl.dataset.clipId);
    if (!clip) return;
    event.preventDefault();
    editorState.selectedClipId = clip.id;
    editorState.pointerDrag = {
      clipId: clip.id,
      startX: event.clientX,
      startY: event.clientY,
      originalStart: clip.start,
      originalTrack: clip.trackIndex
    };
    clipEl.setPointerCapture(event.pointerId);
    renderEditor();
  });

  document.querySelector("#editorTimeline").addEventListener("pointermove", (event) => {
    const drag = editorState.pointerDrag;
    if (!drag) return;
    const clip = editorState.clips.find((item) => item.id === drag.clipId);
    if (!clip) return;
    const deltaSeconds = (event.clientX - drag.startX) / editorPixelsPerSecond();
    clip.start = snapEditorTime(drag.originalStart + deltaSeconds);
    clip.trackIndex = Math.max(0, Math.min(editorState.tracks.length - 1, editorTrackIndexFromY(event.clientY)));
    renderEditor();
  });

  document.querySelector("#editorTimeline").addEventListener("pointerup", () => {
    editorState.pointerDrag = null;
  });

  document.addEventListener("pointermove", (event) => {
    const drag = editorState.pointerDrag;
    if (!drag) return;
    const clip = editorState.clips.find((item) => item.id === drag.clipId);
    if (!clip) return;
    const deltaSeconds = (event.clientX - drag.startX) / editorPixelsPerSecond();
    clip.start = snapEditorTime(drag.originalStart + deltaSeconds);
    clip.trackIndex = Math.max(0, Math.min(editorState.tracks.length - 1, editorTrackIndexFromY(event.clientY)));
    renderEditor();
  });

  document.addEventListener("pointerup", () => {
    editorState.pointerDrag = null;
  });

  document.querySelector("#editorTimeline").addEventListener("click", (event) => {
    const clipEl = event.target.closest(".editor-clip");
    if (clipEl) {
      editorState.selectedClipId = clipEl.dataset.clipId;
    } else if (event.target.closest(".editor-track-lane")) {
      editorState.selectedClipId = null;
    }
    renderEditor();
  });

  document.querySelector("#editorInspector").addEventListener("input", (event) => {
    const field = event.target.dataset.editorField;
    if (!field) return;
    setEditorClipField(field, event.target.type === "checkbox" ? event.target.checked : event.target.value);
  });

  document.querySelector("#editorInspector").addEventListener("change", (event) => {
    const field = event.target.dataset.editorField;
    if (!field) return;
    setEditorClipField(field, event.target.type === "checkbox" ? event.target.checked : event.target.value);
  });

  document.querySelector("#editorInspector").addEventListener("click", (event) => {
    const command = event.target.closest("[data-editor-command]")?.dataset.editorCommand;
    if (command === "delete-clip") deleteSelectedEditorClip();
  });

  document.querySelector("#editorSnap").addEventListener("change", (event) => {
    editorState.snap = event.target.value;
    renderEditor();
  });
  document.querySelector("#editorZoom").addEventListener("input", (event) => {
    editorState.zoom = Number(event.target.value);
    renderEditor();
  });
  document.querySelector("#editorPlayhead").addEventListener("input", (event) => {
    editorState.playhead = Number(event.target.value);
    renderEditor();
  });
  document.querySelector("#editorPlay").addEventListener("click", playEditorArrangement);
  document.querySelector("#editorPause").addEventListener("click", pauseEditorArrangement);
  document.querySelector("#editorStop").addEventListener("click", stopEditorArrangement);
  document.querySelector("#editorRestart").addEventListener("click", () => {
    stopEditorArrangement();
    editorState.playhead = 0;
    playEditorArrangement();
  });
  document.querySelector("#editorRecordPerformance").addEventListener("click", () => {
    editorState.recording ? stopEditorPerformanceRecording() : startEditorPerformanceRecording(false);
  });
  document.querySelector("#editorOverdubPerformance").addEventListener("click", () => {
    editorState.recording ? stopEditorPerformanceRecording() : startEditorPerformanceRecording(true);
  });
  document.querySelector("#editorAddTrack").addEventListener("click", addEditorTrack);
  document.querySelector("#editorSplit").addEventListener("click", splitSelectedEditorClip);
  document.querySelector("#editorDuplicate").addEventListener("click", duplicateSelectedEditorClip);
  document.querySelector("#editorLoop").addEventListener("click", loopSelectedEditorClip);
  document.querySelector("#editorQuantize").addEventListener("click", quantizeSelectedEditorClip);
  document.querySelector("#editorDelete").addEventListener("click", deleteSelectedEditorClip);
  document.querySelector("#editorAiSuggest").addEventListener("click", generateEditorAiSuggestions);
  document.querySelector("#editorEventQuantize").addEventListener("change", (event) => {
    editorState.eventQuantize = event.target.value;
  });

  document.querySelector("#smartMixToggle").addEventListener("click", () => {
    startSmartMix(document.querySelector("#smartMixMode").value, document.querySelector("#smartMixSource").value);
  });
  document.querySelector("#smartMixStop").addEventListener("click", () => stopAiMix());
  document.querySelector("#smartMixMode").addEventListener("change", (event) => {
    if (autoMixState.running) {
      triggerManualOverride("Changed the transition style");
      return;
    }
    if (!autoMixState.running) {
      setSmartMixStatus(`${getSmartMixProfile(event.target.value).name} selected. Press Smart Mix to analyze and start.`);
    }
  });
  document.querySelector("#smartMixSource").addEventListener("change", (event) => {
    if (autoMixState.running) {
      triggerManualOverride("Changed the Smart Mix source");
      return;
    }
    if (!autoMixState.running) {
      setSmartMixStatus(`Smart Mix will use ${smartMixSourceLabel(event.target.value)} and return each incoming song to original BPM after transitions.`);
    }
  });
  document.querySelector("#planSmartPrompt").addEventListener("click", planSmartPrompt);
  document.querySelector("#smartMixPrompt").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); planSmartPrompt(); }
  });
  document.querySelector("#applySmartPrompt").addEventListener("click", applySmartPromptPlan);
  document.querySelector("#cancelSmartPrompt").addEventListener("click", cancelSmartPromptPlan);
  document.querySelector("#clearSmartPrompt").addEventListener("click", () => {
    document.querySelector("#smartMixPrompt").value = "";
    cancelSmartPromptPlan();
    smartPromptState.state = "Prompt Idle";
  });
  document.querySelector("#previewSmartPrompt").addEventListener("click", () => {
    if (!smartPromptState.plan) return;
    setSmartMixStatus(`Plan preview: ${smartPromptState.plan.transitionTrigger}, ${smartPromptState.plan.blendLengthBars}-bar ${smartPromptState.plan.transitionStyleLabel.toLowerCase()}, ${smartPromptState.plan.bpmRecoveryEnabled ? `${smartPromptState.plan.bpmRecoveryDurationBars}-bar BPM recovery` : "no BPM recovery"}. No audio was changed.`);
  });
  document.querySelector("#explainSmartPrompt").addEventListener("click", () => {
    if (smartPromptState.plan) document.querySelector("#smartPromptExplanation").textContent = smartPromptState.plan.explanation;
  });
  document.querySelector("#saferSmartPrompt").addEventListener("click", useSaferSmartPrompt);
  document.querySelector("#saferTransitionPlans").addEventListener("click", (event) => {
    const previewId = event.target.closest("[data-safer-preview]")?.dataset.saferPreview;
    const applyId = event.target.closest("[data-safer-apply]")?.dataset.saferApply;
    if (previewId) selectSaferTransitionPlan(previewId, false);
    if (applyId) selectSaferTransitionPlan(applyId, true);
  });
  document.querySelector("#saveSmartRecipe").addEventListener("click", saveSmartPromptRecipe);
  document.querySelector("#retrySmartPrompt").addEventListener("click", applySmartPromptPlan);
  document.querySelector("#executePromptNow").addEventListener("click", () => {
    if (!smartPromptState.plan) return;
    smartPromptState.plan.executeImmediately = true;
    smartPromptState.plan.targetPlaybackTime = currentDeckTime(detectActiveDeck() || smartPromptState.plan.activeDeck);
    smartPromptState.plan.estimatedTimeUntilTransition = 0;
    clearSmartPromptExecutionError();
    applySmartPromptPlan();
  });
  document.querySelector("#nextPhrasePrompt").addEventListener("click", () => {
    const plan = smartPromptState.plan;
    const active = detectActiveDeck();
    if (!plan || !active) return;
    const delay = phraseLengthSeconds(Number(deckState[active].analysis?.bpm || 120), 16);
    plan.executeImmediately = false;
    plan.triggerType = "phrase-boundary";
    plan.targetPlaybackTime = currentDeckTime(active) + delay;
    plan.estimatedTimeUntilTransition = delay;
    plan.transitionTrigger = "Next estimated 16-bar boundary";
    clearSmartPromptExecutionError();
    applySmartPromptPlan();
  });
  document.querySelector("#delayPromptFromNow").addEventListener("click", () => {
    const plan = smartPromptState.plan;
    const active = detectActiveDeck();
    if (!plan || !active) return;
    const delay = Number(plan.relativeDelaySeconds || 10);
    plan.executeImmediately = false;
    plan.triggerType = "relative-seconds";
    plan.relativeDelaySeconds = delay;
    plan.targetPlaybackTime = currentDeckTime(active) + delay;
    plan.estimatedTimeUntilTransition = delay;
    clearSmartPromptExecutionError();
    applySmartPromptPlan();
  });
  document.querySelector("#editSmartPrompt").addEventListener("click", () => {
    clearSmartPromptExecutionError();
    smartPromptState.state = smartPromptState.plan ? "Plan Ready" : "Prompt Idle";
    renderSmartPromptPlan();
    document.querySelector("#smartMixPrompt").focus();
  });
  document.querySelector("#loadIncomingTrack").addEventListener("click", () => {
    const active = detectActiveDeck();
    const incoming = active ? (active === "a" ? "b" : "a") : smartPromptState.plan?.incomingDeck || "b";
    document.querySelector(`#file-${incoming}`)?.click();
  });
  document.querySelector("#changeSmartSource").addEventListener("click", () => {
    const decksView = document.querySelector("#decks");
    decksView.classList.add("is-advanced");
    const toggle = document.querySelector("#deckModeToggle");
    toggle.setAttribute("aria-pressed", "true");
    toggle.textContent = "Simple Controls";
    document.querySelector("#smartMixSource").focus();
  });
  document.querySelector("#dismissSmartPromptError").addEventListener("click", cancelSmartPromptPlan);
  document.querySelectorAll("[data-quick-deck]").forEach((control) => {
    control.addEventListener("click", (event) => {
      const deckId = control.dataset.quickDeck;
      const delayButton = event.target.closest("[data-quick-delay]");
      if (delayButton) executeQuickTransition(deckId, { delaySeconds: Number(delayButton.dataset.quickDelay) });
      if (event.target.closest("[data-quick-custom]")) openQuickTransitionPanel(deckId, "seconds");
      if (event.target.closest("[data-quick-timestamp]")) openQuickTransitionPanel(deckId, "timestamp");
      if (event.target.closest("[data-quick-phrase]")) {
        const bpm = Number(deckState[deckId].analysis?.bpm || 120);
        executeQuickTransition(deckId, { delaySeconds: phraseLengthSeconds(bpm, 16), triggerType: "phrase-boundary", interpretation: "Next estimated 16-bar phrase boundary" });
      }
    });
  });
  document.querySelector("#closeQuickTransition").addEventListener("click", () => { document.querySelector("#quickTransitionCustom").hidden = true; });
  document.querySelector("#scheduleQuickCustom").addEventListener("click", scheduleCustomQuickTransition);
  const tempoPreferenceBindings = {
    safetyPreferredShift: ["preferredShift", "number"], safetyWarningThreshold: ["warningThreshold", "number"], safetyAbsoluteMaximum: ["absoluteMaximumShift", "number"],
    safetyAutoSuggest: ["automaticallySuggest", "checkbox"], safetyAutoExecute: ["automaticallyExecute", "checkbox"], safetyAskReplace: ["askBeforeReplacing", "checkbox"],
    safetyHalfDouble: ["allowHalfDouble", "checkbox"], safetyBridgeSuggestions: ["allowBridgeSuggestions", "checkbox"], safetyPreserveIncoming: ["preserveIncomingBpm", "checkbox"],
    safetyLargeTransition: ["largeMismatchTransition", "value"], safetyTransitionPreference: ["transitionPreference", "value"]
  };
  Object.entries(tempoPreferenceBindings).forEach(([id, [key, type]]) => {
    document.querySelector(`#${id}`).addEventListener("change", (event) => {
      tempoSafetyPreferences[key] = type === "number" ? Number(event.target.value) : type === "checkbox" ? event.target.checked : event.target.value;
      if (tempoSafetyPreferences.warningThreshold < tempoSafetyPreferences.preferredShift) tempoSafetyPreferences.warningThreshold = tempoSafetyPreferences.preferredShift;
      if (tempoSafetyPreferences.absoluteMaximumShift < tempoSafetyPreferences.warningThreshold) tempoSafetyPreferences.absoluteMaximumShift = tempoSafetyPreferences.warningThreshold;
      if (tempoSafetyPreferences.absoluteMaximumShift > 20) setSmartMixStatus("Tempo safety warning: automatic beatmatching above 20% can cause extreme stretching. Safer natural-tempo transitions remain recommended.");
      writeTempoSafetyPreferences();
      renderTempoSafetyPreferences();
      if (smartPromptState.plan) renderSmartPromptPlan();
    });
  });
  document.querySelector("#promptMaxShift").addEventListener("change", (event) => {
    tempoSafetyPreferences.absoluteMaximumShift = Number(event.target.value);
    if (tempoSafetyPreferences.warningThreshold > tempoSafetyPreferences.absoluteMaximumShift) tempoSafetyPreferences.warningThreshold = tempoSafetyPreferences.absoluteMaximumShift;
    if (tempoSafetyPreferences.preferredShift > tempoSafetyPreferences.warningThreshold) tempoSafetyPreferences.preferredShift = tempoSafetyPreferences.warningThreshold;
    writeTempoSafetyPreferences();
    renderTempoSafetyPreferences();
    if (smartPromptState.plan) renderSmartPromptPlan();
  });
  document.querySelector("#smartPromptChips").addEventListener("click", (event) => {
    const chip = event.target.closest("button");
    if (!chip) return;
    const input = document.querySelector("#smartMixPrompt");
    input.value = input.value.trim() ? `${input.value.trim()}. ${chip.textContent}.` : chip.textContent;
    input.focus();
  });
  document.querySelector(".smart-prompt-library").addEventListener("click", (event) => {
    const index = Number(event.target.dataset.promptIndex);
    const kind = event.target.dataset.promptLibrary || event.target.dataset.promptDelete;
    if (event.target.dataset.promptLibrary) {
      const item = kind === "history" ? smartPromptState.history[index] : smartPromptState.recipes[index];
      if (item) { document.querySelector("#smartMixPrompt").value = item.prompt; document.querySelector("#smartMixPrompt").focus(); }
    }
    if (event.target.dataset.promptDelete) {
      if (kind === "history") smartPromptState.history.splice(index, 1); else smartPromptState.recipes.splice(index, 1);
      writeSmartPromptStorage(); renderSmartPromptLibrary();
    }
    if (event.target.hasAttribute("data-prompt-favorite") && smartPromptState.history[index]) {
      smartPromptState.history[index].favorite = !smartPromptState.history[index].favorite;
      writeSmartPromptStorage(); renderSmartPromptLibrary();
    }
  });
  document.querySelector("#promptRecoveryBars").addEventListener("change", (event) => {
    if (smartPromptState.plan) { smartPromptState.plan.bpmRecoveryDurationBars = Number(event.target.value); renderSmartPromptPlan(); }
  });
  document.querySelector("#promptRecoveryCurve").addEventListener("change", (event) => {
    if (smartPromptState.plan) { smartPromptState.plan.bpmRecoveryCurve = event.target.value; renderSmartPromptPlan(); }
  });
  document.querySelector("#resumeBpmRecovery").addEventListener("click", runBpmRecovery);
  document.querySelector("#recalculateBpmRecovery").addEventListener("click", () => {
    if (!bpmRecoveryState.plan) return;
    bpmRecoveryState.durationBars = Number(document.querySelector("#promptRecoveryBars")?.value || bpmRecoveryState.durationBars);
    bpmRecoveryState.curve = document.querySelector("#promptRecoveryCurve")?.value || bpmRecoveryState.curve;
    bpmRecoveryState.durationSeconds = phraseLengthSeconds(bpmRecoveryState.originalBpm * Number(document.querySelector(`#pitch-${bpmRecoveryState.deckId}`)?.value || 1), bpmRecoveryState.durationBars);
    bpmRecoveryState.progress = 0;
    runBpmRecovery();
  });
  document.querySelector("#cancelBpmRecovery").addEventListener("click", () => cancelBpmRecovery("Cancelled", false, true));

  for (const id of ["a", "b"]) {
    document.querySelector(`#file-${id}`).addEventListener("change", async (event) => {
      const file = event.target.files[0];
      await loadFileToDeck(file, id);
    });

    document.querySelector(`#pitch-${id}`).addEventListener("input", (event) => {
      if ((bpmRecoveryState.active || bpmRecoveryState.pending) && bpmRecoveryState.deckId === id) {
        bpmRecoveryState.currentRatio = Number(event.target.value);
        cancelBpmRecovery("Manual tempo override", true, false);
      }
      triggerManualOverride(`Adjusted Deck ${id.toUpperCase()} tempo`, id);
      const deck = deckState[id];
      if (deck.source) deck.source.playbackRate.value = Number(event.target.value);
    });

    document.querySelector(`#filter-${id}`).addEventListener("input", (event) => {
      triggerManualOverride(`Adjusted Deck ${id.toUpperCase()} filter`, id);
      if (deckState[id].filter) deckState[id].filter.frequency.value = Number(event.target.value);
      const mixerFilter = document.querySelector(`#mixer-filter-${id}`);
      if (mixerFilter) mixerFilter.value = event.target.value;
    });

    document.querySelector(`#gain-${id}`).addEventListener("input", (event) => {
      triggerManualOverride(`Adjusted Deck ${id.toUpperCase()} gain`, id);
      const mixerTrim = document.querySelector(`#mixer-trim-${id}`);
      if (mixerTrim) mixerTrim.value = event.target.value;
      updateDeckGain(id);
    });
  }

  document.querySelectorAll("[data-sync-gain]").forEach((slider) => {
    slider.addEventListener("input", (event) => {
      const id = event.target.dataset.syncGain;
      triggerManualOverride(`Adjusted Deck ${id.toUpperCase()} gain`, id);
      document.querySelector(`#gain-${id}`).value = event.target.value;
      updateDeckGain(id);
    });
  });

  document.querySelectorAll("[data-sync-filter]").forEach((slider) => {
    slider.addEventListener("input", (event) => {
      const id = event.target.dataset.syncFilter;
      triggerManualOverride(`Adjusted Deck ${id.toUpperCase()} filter`, id);
      document.querySelector(`#filter-${id}`).value = event.target.value;
      if (deckState[id].filter) deckState[id].filter.frequency.value = Number(event.target.value);
    });
  });

  document.querySelectorAll("[data-channel-fader]").forEach((slider) => {
    slider.addEventListener("input", (event) => {
      triggerManualOverride(`Adjusted Deck ${event.target.dataset.channelFader.toUpperCase()} channel volume`, event.target.dataset.channelFader);
      updateDeckGain(event.target.dataset.channelFader);
      renderDeckMeta(event.target.dataset.channelFader);
    });
  });

  document.querySelectorAll("[data-action='cue-monitor']").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("is-active");
      button.setAttribute("aria-pressed", button.classList.contains("is-active") ? "true" : "false");
    });
  });

  document.querySelectorAll(".deck").forEach((deckEl) => {
    setupDropZone(deckEl, (file) => loadFileToDeck(file, deckEl.dataset.deck));
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deck;
      const action = button.dataset.action;
      const controllerTimelineControl = ["play", "cue", "rewind", "forward", "restart"].includes(action) && transitionController.schedulerActive && transitionController.activePlan?.activeDeck === id;
      if (autoMixState.running && !controllerTimelineControl && ["play", "stop", "cue", "rewind", "forward", "restart", "loop", "clear-deck"].includes(action)) {
        triggerManualOverride(`${action} on Deck ${id.toUpperCase()}`, id);
      }
      if (action === "play") deckState[id].playing ? pauseDeck(id) : await playDeck(id);
      if (action === "stop") stopDeck(id);
      if (action === "restart") await restartDeck(id);
      if (action === "clear-deck") clearDeck(id);
      if (action === "cue") cueDeck(id);
      if (action === "rewind") nudgeDeck(id, -15);
      if (action === "forward") nudgeDeck(id, 15);
      if (action === "loop") updateDeckLoop(id, !deckState[id].loop);
      if (action === "mark-in") markSelection(id, "in");
      if (action === "mark-out") markSelection(id, "out");
      if (action === "preview-selection") previewSelection(id);
      if (action === "split-to-pads") splitDeckToPads(id);
      if (action === "sample-to-pad") sampleDeckToPad(id);
      if (action === "selection-to-pad") sendSelectionToPad(id);
      if (action === "selection-to-crate") saveDeckClipToCrate(id);
      if (action === "selection-to-deck") trimDeckToSelection(id);
    });
  });

  document.querySelectorAll("[data-seek-deck]").forEach((seek) => {
    seek.addEventListener("input", (event) => {
      const id = event.target.dataset.seekDeck;
      const deck = deckState[id];
      if (!deck.buffer) return;
      if (!(transitionController.schedulerActive && transitionController.activePlan?.activeDeck === id)) triggerManualOverride(`Seeked Deck ${id.toUpperCase()}`, id);
      seekDeck(id, (Number(event.target.value) / 1000) * deck.buffer.duration);
    });
  });

  document.querySelectorAll("[data-loop-size]").forEach((select) => {
    select.addEventListener("change", () => {
      const id = select.dataset.loopSize;
      deckState[id].loopBeats = Number(select.value);
      if (deckState[id].loop) updateDeckLoop(id, true);
      else renderDeckLoopStatus(id);
    });
  });

  document.querySelectorAll(".waveform").forEach((canvas) => {
    canvas.addEventListener("pointerdown", (event) => {
      const id = canvas.id.replace("wave-", "");
      const deck = deckState[id];
      if (!deck.buffer) return;
      canvas.setPointerCapture(event.pointerId);
      deck.dragSelectStart = waveformTimeFromEvent(canvas, event, id);
      deck.dragSelectMoved = false;
    });
    canvas.addEventListener("pointermove", (event) => {
      const id = canvas.id.replace("wave-", "");
      const deck = deckState[id];
      if (!deck.buffer || deck.dragSelectStart === null) return;
      const current = waveformTimeFromEvent(canvas, event, id);
      if (Math.abs(current - deck.dragSelectStart) < 0.05) return;
      deck.dragSelectMoved = true;
      deck.selectionStart = deck.dragSelectStart;
      deck.selectionEnd = current;
      updateSelectionDisplay(id);
      drawPlayhead(id, currentDeckTime(id) / deck.buffer.duration);
    });
    canvas.addEventListener("pointerup", (event) => {
      const id = canvas.id.replace("wave-", "");
      const deck = deckState[id];
      if (!deck.buffer) return;
      const current = waveformTimeFromEvent(canvas, event, id);
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* Pointer capture may already be released. */
      }
      if (deck.dragSelectMoved) {
        deck.selectionEnd = current;
        updateSelectionDisplay(id);
        drawPlayhead(id, currentDeckTime(id) / deck.buffer.duration);
      } else {
        seekDeck(id, current);
      }
      deck.dragSelectStart = null;
      deck.dragSelectMoved = false;
    });
    canvas.addEventListener("pointercancel", () => {
      const id = canvas.id.replace("wave-", "");
      deckState[id].dragSelectStart = null;
      deckState[id].dragSelectMoved = false;
    });
  });

  document.querySelectorAll(".platter").forEach((platter) => {
    platter.addEventListener("pointerdown", (event) => startScratch(event, platter.dataset.deck));
    platter.addEventListener("pointermove", (event) => moveScratch(event, platter.dataset.deck));
    platter.addEventListener("pointerup", (event) => endScratch(event, platter.dataset.deck));
    platter.addEventListener("pointercancel", (event) => endScratch(event, platter.dataset.deck));
  });

  document.querySelectorAll("#crossfader, #mixerCrossfader").forEach((slider) => {
    slider.addEventListener("input", (event) => {
      triggerManualOverride("Moved the crossfader");
      setCrossfaderValue(event.target.value);
    });
  });
  document.querySelector("#sampleFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const buffer = await loadAudioFile(file);
    addBufferToPad(buffer, file.name);
  });
  document.querySelector("#padStart").addEventListener("input", (event) => updateSelectedPadRange("start", event.target.value));
  document.querySelector("#padEnd").addEventListener("input", (event) => updateSelectedPadRange("end", event.target.value));
  document.querySelector("#padMode").addEventListener("change", (event) => updateSelectedPadMode(event.target.value));
  document.querySelector("#padQuantize").addEventListener("change", (event) => updatePadQuantize(event.target.value));
  document.querySelector("#previewPadRegion").addEventListener("click", previewSelectedPadRegion);
  document.querySelector("#slicePadToPads").addEventListener("click", sliceSelectedPadToPads);
  document.querySelector("#padClipToCrate").addEventListener("click", saveSelectedPadClipToCrate);
  document.querySelector("#padWaveform").addEventListener("click", (event) => {
    const buffer = sampler.buffers[sampler.selected];
    if (!buffer) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const time = ((event.clientX - rect.left) / rect.width) * buffer.duration;
    const region = getPadRegion(sampler.selected);
    updateSelectedPadRange(Math.abs(time - region.start) < Math.abs(time - region.end) ? "start" : "end", (time / buffer.duration) * 1000);
  });
  document.querySelector("#micSample").addEventListener("click", recordMicSample);
  document.querySelector("#tabSample").addEventListener("click", recordTabSample);
  document.querySelector("#stopPads").addEventListener("click", stopAllPads);
  document.querySelector("#stopPadsLocal").addEventListener("click", stopAllPads);
  document.querySelector("#stopPadLoops").addEventListener("click", stopPadLoops);
  document.querySelector("#releaseHeldPads").addEventListener("click", releaseHeldPads);
  document.querySelector("#panicPads").addEventListener("click", panicPads);
  document.querySelector("#clearSelectedPad").addEventListener("click", () => deletePad(sampler.selected));
  document.querySelector("#padWorkspaceMode").addEventListener("change", (event) => { sampler.workspaceMode = event.target.value; renderPadWorkspaceControls(); savePadWorkspace(); });
  document.querySelector("#padBank").addEventListener("change", (event) => switchPadBank(event.target.value));
  document.querySelector("#padScene").addEventListener("change", (event) => switchPadScene(event.target.value));
  document.querySelector("#loadStarterBank").addEventListener("click", loadStarterPadBank);
  document.querySelector("#padSearch").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll("#pads .pad-slot").forEach((slot, index) => { const haystack = `${sampler.names[index]} ${sampler.categories[index]} ${sampler.sources[index]}`.toLowerCase(); slot.hidden = Boolean(query && !haystack.includes(query)); });
  });
  document.querySelector("#padCategories").addEventListener("click", (event) => {
    const button = event.target.closest("[data-pad-category-filter]");
    if (!button) return;
    const category = button.dataset.padCategoryFilter;
    document.querySelector("#padSearch").value = category === "DITC" ? "" : category;
    document.querySelector("#padSearch").dispatchEvent(new Event("input"));
    setPadEditorStatus(category === "DITC" ? `${sourceFiles.length} decoded local DITC source(s) can be dragged or planned into pads.` : `Showing pads matching ${category}.`);
  });
  [["padGain", "gains"], ["padPan", "pans"], ["padPitch", "pitches"], ["padFilter", "filters"], ["padCategory", "categories"], ["padChoke", "chokes"]].forEach(([id, key]) => document.querySelector(`#${id}`).addEventListener("input", (event) => updateSelectedPadSetting(key, event.target.value)));
  document.querySelector("#openAiPadBuilder").addEventListener("click", () => document.querySelector("#aiPadBuilder").showModal());
  document.querySelector("#previewAiPadPlan").addEventListener("click", (event) => { event.preventDefault(); previewAiPadPlan(); });
  document.querySelector("#applyAiPadPlan").addEventListener("click", (event) => { event.preventDefault(); applyAiPadPlan(); });
  document.querySelector("#saveAiPadPrompt").addEventListener("click", (event) => { event.preventDefault(); const prompt = document.querySelector("#aiPadPrompt").value.trim(); if (prompt) { sampler.promptHistory.push(prompt); savePadWorkspace(); document.querySelector("#aiPadPlan").textContent = "Prompt saved locally."; } });
  document.querySelector("#previewPadMacro").addEventListener("click", previewPadMacro);
  document.querySelector("#runPadMacro").addEventListener("click", runPadMacro);
  document.querySelector("#cancelPadMacro").addEventListener("click", cancelPadMacro);
  document.querySelector("#padRecord").addEventListener("click", async () => { await AudioEngine.init(); editorState.recording ? stopEditorPerformanceRecording() : startEditorPerformanceRecording(false); document.querySelector("#padRecord").classList.toggle("is-active", Boolean(editorState.recording)); renderPadDiagnostics(); });
  document.querySelector("#padOverdub").addEventListener("click", async () => { await AudioEngine.init(); editorState.recording ? stopEditorPerformanceRecording() : startEditorPerformanceRecording(true); document.querySelector("#padOverdub").classList.toggle("is-active", Boolean(editorState.recording)); renderPadDiagnostics(); });
  document.querySelector("#padUndoTake").addEventListener("click", () => { const index = [...editorState.clips].map((clip) => clip.type).lastIndexOf("pad"); if (index < 0) { setPadEditorStatus("No saved pad take to undo."); return; } sampler.takeHistory.push(editorState.clips.splice(index, 1)[0]); renderEditor(); setPadEditorStatus("Removed the latest pad performance clip. Arrangement Undo can restore broader edits."); });
  document.querySelector("#drumMachine").addEventListener("change", (event) => { const index = drumMachines.findIndex((machine) => machine.id === event.target.value); drums.filteredKits = drumMachines; drums.kitIndex = Math.max(0, index); loadSelectedDrumKit(); });
  document.querySelector("#drumPreset").addEventListener("change", updatePresetNotes);
  document.querySelector("#applyPreset").addEventListener("click", () => {
    applyDrumPreset(document.querySelector("#drumPreset").value);
  });
  document.querySelector("#beatForgeMode").addEventListener("change", (event) => { drums.workspaceMode = event.target.value; saveBeatForgeState(); renderBeatForge(); });
  document.querySelector("#drumStop").addEventListener("click", stopDrums);
  document.querySelector("#beatMetronome").addEventListener("click", (event) => { drums.metronome = !drums.metronome; event.currentTarget.classList.toggle("is-active", drums.metronome); event.currentTarget.setAttribute("aria-pressed", String(drums.metronome)); });
  document.querySelector("#beatLoop").addEventListener("click", (event) => { drums.loop = !drums.loop; event.currentTarget.classList.toggle("is-active", drums.loop); event.currentTarget.setAttribute("aria-pressed", String(drums.loop)); });
  document.querySelector("#beatBars").addEventListener("change", (event) => setBeatBars(event.target.value));
  document.querySelector("#beatPreviousBar").addEventListener("click", () => { drums.currentBar = (drums.currentBar - 1 + drums.bars) % drums.bars; renderSequencer(); });
  document.querySelector("#beatNextBar").addEventListener("click", () => { drums.currentBar = (drums.currentBar + 1) % drums.bars; renderSequencer(); });
  document.querySelectorAll("[data-beat-view]").forEach((button) => button.addEventListener("click", () => { drums.view = button.dataset.beatView; document.querySelectorAll("[data-beat-view]").forEach((item) => item.classList.toggle("is-active", item === button)); renderSequencer(); }));
  document.querySelector("#drumPerformancePads").addEventListener("pointerdown", async (event) => { const button = event.target.closest("[data-drum-pad]"); if (!button) return; await AudioEngine.init(); button.classList.add("is-hit"); triggerDrumPerformancePad(Number(button.dataset.drumPad), event.pressure || .85); });
  document.querySelector("#drumPerformancePads").addEventListener("pointerup", (event) => event.target.closest("[data-drum-pad]")?.classList.remove("is-hit"));
  document.querySelector("#kitCategories").addEventListener("click", (event) => { const button = event.target.closest("[data-kit-category]"); if (!button) return; drums.kitCategory = button.dataset.kitCategory; drums.kitIndex = 0; renderKitBrowser(); });
  document.querySelector("#kitResults").addEventListener("click", (event) => { const button = event.target.closest("[data-kit-index]"); if (!button) return; drums.kitIndex = Number(button.dataset.kitIndex); renderKitBrowser(); });
  document.querySelector("#kitSearch").addEventListener("input", renderKitBrowser);
  document.querySelector("#kitPrevious").addEventListener("click", () => { const count = drums.filteredKits?.length || 1; drums.kitIndex = (drums.kitIndex - 1 + count) % count; renderKitBrowser(); });
  document.querySelector("#kitNext").addEventListener("click", () => { const count = drums.filteredKits?.length || 1; drums.kitIndex = (drums.kitIndex + 1) % count; renderKitBrowser(); });
  document.querySelector("#kitPreview").addEventListener("click", previewSelectedDrumKit);
  document.querySelector("#kitStopPreview").addEventListener("click", stopBeatPreview);
  document.querySelector("#loadDrumKit").addEventListener("click", loadSelectedDrumKit);
  document.querySelector("#loadDrumKitPattern").addEventListener("click", loadSelectedDrumKitAndPattern);
  document.querySelector("#favoriteDrumKit").addEventListener("click", () => { const machine = drums.filteredKits?.[drums.kitIndex]; if (!machine) return; const favorites = new Set(JSON.parse(localStorage.getItem("deckforge-beat-kit-favorites") || "[]")); favorites.has(machine.id) ? favorites.delete(machine.id) : favorites.add(machine.id); localStorage.setItem("deckforge-beat-kit-favorites", JSON.stringify([...favorites])); renderKitBrowser(); });
  document.querySelector("#beatGroove").addEventListener("change", (event) => buildGrooveCandidate(event.target.value));
  document.querySelector("#grooveIntensity").addEventListener("input", (event) => { drums.grooveCandidateIntensity = Number(event.target.value); buildGrooveCandidate(document.querySelector("#beatGroove").value); });
  document.querySelectorAll("[data-groove-lock]").forEach((input) => input.addEventListener("change", () => { drums.grooveLocks[input.dataset.grooveLock] = input.checked; buildGrooveCandidate(document.querySelector("#beatGroove").value); }));
  document.querySelector("#previewOriginalGroove").addEventListener("click", () => previewGrooveModel(drums.grooveAnchor || captureGrooveModel(), "Original A"));
  document.querySelector("#previewCandidateGroove").addEventListener("click", () => previewGrooveModel(drums.grooveCandidate || buildGrooveCandidate(), "Groove B"));
  document.querySelector("#alternateGroovePreview").addEventListener("click", alternateGroovePreview);
  document.querySelector("#applyGroove").addEventListener("click", applyGrooveCandidate);
  document.querySelector("#cancelGroove").addEventListener("click", cancelGrooveCandidate);
  document.querySelector("#undoGroove").addEventListener("click", undoLastGroove);
  document.querySelector("#reapplyGroove").addEventListener("click", reapplyLastGroove);
  document.querySelector("#resetGroove").addEventListener("click", () => { drums.grooveCandidateIntensity = 60; buildGrooveCandidate("straight"); applyGrooveCandidate(); });
  [["beatLaneVolume", "volume"], ["beatLanePan", "pan"], ["beatLaneFilter", "filter"], ["beatLanePitch", "pitch"], ["beatLaneChoke", "choke"]].forEach(([id, key]) => document.querySelector(`#${id}`).addEventListener("input", (event) => { drums.lanes[drums.selectedLane][key] = Number(event.target.value); touchDrumPattern(); }));
  document.querySelector("#beatStepVelocity").addEventListener("input", (event) => { drums.velocities[drums.selectedLane][drums.selectedStep] = Number(event.target.value); touchDrumPattern(); renderSequencer(); });
  document.querySelector("#beatStepProbability").addEventListener("input", (event) => { drums.probabilities[drums.selectedLane][drums.selectedStep] = Number(event.target.value); touchDrumPattern(); renderSequencer(); });
  document.querySelector("#beatStepTiming").addEventListener("input", (event) => { drums.timingOffsets[drums.selectedLane][drums.selectedStep] = Number(event.target.value); touchDrumPattern(); });
  document.querySelector("#beatLaneMute").addEventListener("change", (event) => { drums.lanes[drums.selectedLane].muted = event.target.checked; touchDrumPattern(); renderSequencer(); });
  document.querySelector("#beatLaneSolo").addEventListener("change", (event) => { drums.lanes[drums.selectedLane].solo = event.target.checked; touchDrumPattern(); renderSequencer(); });
  document.querySelector("#accentBeatVelocity").addEventListener("click", () => { snapshotDrumPattern("Accent velocity"); drums.velocities[drums.selectedLane] = drums.velocities[drums.selectedLane].map((value, step) => drums.pattern[drums.selectedLane][step] ? (step % 4 === 0 ? 1 : Math.min(value, .68)) : value); touchDrumPattern(); renderSequencer(); });
  document.querySelector("#randomizeBeatVelocity").addEventListener("click", () => { snapshotDrumPattern("Randomize velocity"); const random = createSeededGenerator(drums.seed + drums.version); drums.velocities[drums.selectedLane] = drums.velocities[drums.selectedLane].map((value, step) => drums.pattern[drums.selectedLane][step] ? .5 + random() * .5 : value); touchDrumPattern(); renderSequencer(); });
  document.querySelector("#resetBeatVelocity").addEventListener("click", () => { snapshotDrumPattern("Reset velocity"); drums.velocities[drums.selectedLane].fill(.85); touchDrumPattern(); renderSequencer(); });
  document.querySelector("#resetBeatAutomation").addEventListener("click", () => { snapshotDrumPattern("Reset automation"); drums.automation[drums.selectedLane].fill(1); touchDrumPattern(); renderSequencer(); });
  document.querySelector("#generateBeat").addEventListener("click", () => buildBeatPromptPlan("new"));
  document.querySelector("#generateBeatVariation").addEventListener("click", () => buildBeatPromptPlan("variation"));
  document.querySelector("#generateAnotherBeat").addEventListener("click", () => buildBeatPromptPlan("variation"));
  document.querySelector("#simplifyBeat").addEventListener("click", () => transformCurrentBeat("simplify"));
  document.querySelector("#busierBeat").addEventListener("click", () => transformCurrentBeat("busier"));
  document.querySelector("#fillBeat").addEventListener("click", () => transformCurrentBeat("fill"));
  document.querySelector("#humanizeBeat").addEventListener("click", () => transformCurrentBeat("humanize"));
  document.querySelector("#swingBeat").addEventListener("click", () => transformCurrentBeat("swing"));
  document.querySelector("#straightBeat").addEventListener("click", () => transformCurrentBeat("straight"));
  document.querySelector("#beatSection").addEventListener("change", (event) => convertBeatSection(event.target.value));
  document.querySelector("#previewBeatPlan").addEventListener("click", previewGeneratedBeat);
  document.querySelector("#stopBeatPlanPreview").addEventListener("click", stopBeatPreview);
  document.querySelector("#applyBeatPlan").addEventListener("click", applyBeatPromptPlan);
  document.querySelector("#refineBeatPrompt").addEventListener("click", () => { const field = document.querySelector("#beatPrompt"); field.value = `${field.value.trim()} ${field.value.trim() ? "" : "Create a groove. "}Keep the strongest pocket, add purposeful variation across bars, and leave space for vocals.`; field.focus(); });
  document.querySelector("#saveBeatPrompt").addEventListener("click", () => { const prompt = document.querySelector("#beatPrompt").value.trim(); if (prompt) { drums.promptHistory.push(prompt); saveBeatForgeState(); renderBeatPromptHistory(); document.querySelector("#aiBeatProducerMessage").textContent = "Prompt saved locally."; } });
  document.querySelector("#beatPromptHistory").addEventListener("change", (event) => { if (event.target.value === "") return; document.querySelector("#beatPrompt").value = drums.promptHistory.slice().reverse()[Number(event.target.value)] || ""; });
  document.querySelector("#clearBeatPrompt").addEventListener("click", () => { document.querySelector("#beatPrompt").value = ""; drums.pendingPlan = null; renderBeatPromptPlan(); document.querySelector("#previewBeatPlan").disabled = true; document.querySelector("#applyBeatPlan").disabled = true; });
  document.querySelector("#beatRecord").addEventListener("click", async () => { await AudioEngine.init(); toggleBeatRecording(false); });
  document.querySelector("#beatOverdub").addEventListener("click", async () => { await AudioEngine.init(); toggleBeatRecording(true); });
  document.querySelector("#beatUndo").addEventListener("click", undoBeatEdit);
  document.querySelector("#saveBeatPattern").addEventListener("click", saveBeatPattern);
  document.querySelector("#sendBeatArrangement").addEventListener("click", sendBeatToArrangement);
  document.querySelector("#sendBeatPads").addEventListener("click", async () => { await AudioEngine.init(); sendBeatToPads(null); });
  document.querySelector("#sendBeatLanePads").addEventListener("click", async () => { await AudioEngine.init(); sendBeatToPads(drums.selectedLane); });
  document.querySelector("#exportBeatPattern").addEventListener("click", exportBeatPattern);
  document.querySelector("#importBeatPattern").addEventListener("change", (event) => { if (event.target.files[0]) importBeatPattern(event.target.files[0]); });
  document.querySelector("#previewBeatMatch").addEventListener("click", previewBeatMatch);
  document.querySelector("#applyBeatMatch").addEventListener("click", applyBeatMatch);
  document.querySelector("#rejectBeatMatch").addEventListener("click", () => { drums.beatMatch = null; document.querySelector("#beatMatchSuggestion").textContent = "Suggestion rejected. Load or change a deck to refresh context."; });
  document.querySelector("#explainBeatMatch").addEventListener("click", () => { document.querySelector("#beatMatchSuggestion").textContent = drums.beatMatch ? `${drums.beatMatch.text} This is inferred from deck BPM and keeps the current project pattern editable.` : "No active suggestion to explain."; });
  document.querySelector("#synthMachine").addEventListener("change", (event) => {
    instrument.machine = event.target.value;
    updateInstrumentNotes(); saveHarmonyState();
  });
  document.querySelector("#instrumentPreset").addEventListener("change", (event) => {
    instrument.preset = event.target.value;
    updateInstrumentNotes(); saveHarmonyState(); renderHarmonyInstrumentBrowser();
  });
  document.querySelector("#harmonyMode").addEventListener("change", (event) => { instrument.workspaceMode = event.target.value; saveHarmonyState(); renderHarmonyLab(); });
  document.querySelector("#harmonyKey").addEventListener("change", (event) => { instrument.key = event.target.value; saveHarmonyState(); renderKeyboard(); renderHarmonyMatch(); });
  document.querySelector("#harmonyScale").addEventListener("change", (event) => { instrument.scale = event.target.value; saveHarmonyState(); renderKeyboard(); renderHarmonyMatch(); });
  document.querySelector("#harmonyChordMode").addEventListener("change", (event) => { instrument.chordMode = event.target.value; saveHarmonyState(); });
  document.querySelector("#oneFingerChords").addEventListener("change", (event) => { instrument.oneFingerChords = event.target.checked; saveHarmonyState(); });
  document.querySelector("#harmonyVelocity").addEventListener("input", (event) => { instrument.velocity = Number(event.target.value); });
  document.querySelector("#harmonyPitchBend").addEventListener("input", (event) => { instrument.pitchBend = Number(event.target.value); updateHarmonyVoiceModulation(); });
  document.querySelector("#harmonyPitchBend").addEventListener("change", (event) => { event.target.value = 0; instrument.pitchBend = 0; updateHarmonyVoiceModulation(); });
  document.querySelector("#harmonyModulation").addEventListener("input", (event) => { instrument.modulation = Number(event.target.value); updateHarmonyVoiceModulation(); });
  document.querySelector("#harmonySustain").addEventListener("click", (event) => { instrument.sustain = !instrument.sustain; event.currentTarget.classList.toggle("is-active", instrument.sustain); event.currentTarget.setAttribute("aria-pressed", String(instrument.sustain)); if (!instrument.sustain) stopAllInstrumentVoices(); renderHarmonyDiagnostics(); });
  document.querySelector("#harmonyPlay").addEventListener("click", playHarmonyPattern);
  document.querySelector("#harmonyPause").addEventListener("click", pauseHarmonyPattern);
  document.querySelector("#harmonyStop").addEventListener("click", stopHarmonyPattern);
  document.querySelector("#harmonyRestart").addEventListener("click", async () => { stopHarmonyPattern(); await playHarmonyPattern(); });
  document.querySelector("#harmonyLoop").addEventListener("click", (event) => { instrument.patternLoop = !instrument.patternLoop; event.currentTarget.classList.toggle("is-active", instrument.patternLoop); event.currentTarget.setAttribute("aria-pressed", String(instrument.patternLoop)); });
  document.querySelector("#harmonyRecord").addEventListener("click", async (event) => { await AudioEngine.init(); instrument.recording = !instrument.recording; if (instrument.recording) { snapshotHarmony("Live recording"); instrument.recordStartedAt = AudioEngine.context.currentTime; } event.currentTarget.classList.toggle("is-active", instrument.recording); event.currentTarget.textContent = instrument.recording ? "Stop Rec" : "Record"; renderHarmonyDiagnostics(); });
  document.querySelector("#harmonyInstrumentSearch").addEventListener("input", renderHarmonyInstrumentBrowser);
  document.querySelector("#harmonyInstrumentCategories").addEventListener("click", (event) => { const button = event.target.closest("[data-harmony-category]"); if (!button) return; instrument.instrumentCategory = button.dataset.harmonyCategory; instrument.selectedInstrumentIndex = 0; renderHarmonyInstrumentBrowser(); });
  document.querySelector("#harmonyInstrumentResults").addEventListener("click", (event) => { const button = event.target.closest("[data-harmony-instrument-index]"); if (!button) return; instrument.selectedInstrumentIndex = Number(button.dataset.harmonyInstrumentIndex); renderHarmonyInstrumentBrowser(); });
  document.querySelector("#previewHarmonyInstrument").addEventListener("click", previewHarmonyInstrument);
  document.querySelector("#loadHarmonyInstrument").addEventListener("click", loadHarmonyInstrument);
  document.querySelector("#favoriteHarmonyInstrument").addEventListener("click", () => { const preset = instrument.filteredPresets?.[instrument.selectedInstrumentIndex]; if (!preset) return; instrument.favorites = instrument.favorites.includes(preset.id) ? instrument.favorites.filter((id) => id !== preset.id) : [...instrument.favorites, preset.id]; saveHarmonyState(); renderHarmonyInstrumentBrowser(); });
  document.querySelector("#enableHarmonyMidi").addEventListener("click", enableHarmonyMidi);
  document.querySelector("#harmonyArp").addEventListener("change", (event) => { instrument.arpeggiator.enabled = event.target.checked; saveHarmonyState(); });
  document.querySelector("#harmonyArpRate").addEventListener("change", (event) => { instrument.arpeggiator.rate = event.target.value; saveHarmonyState(); });
  document.querySelector("#harmonyArpDirection").addEventListener("change", (event) => { instrument.arpeggiator.direction = event.target.value; saveHarmonyState(); });
  document.querySelectorAll("[data-harmony-view]").forEach((button) => button.addEventListener("click", () => { instrument.harmonyView = button.dataset.harmonyView; document.querySelectorAll("[data-harmony-view]").forEach((item) => item.classList.toggle("is-active", item === button)); renderHarmonyEditor(); }));
  document.querySelector("#harmonyNoteDuration").addEventListener("input", (event) => { const note = instrument.pattern.notes.find((item) => item.id === instrument.selectedNoteId); if (!note) return; note.duration = Number(event.target.value); touchHarmony(); });
  document.querySelector("#duplicateHarmonyNote").addEventListener("click", () => { const note = instrument.pattern.notes.find((item) => item.id === instrument.selectedNoteId); if (!note) return; snapshotHarmony("Duplicate note"); const copy = { ...note, id: createId(), start: Math.min(instrument.pattern.bars * 16 - 1, note.start + note.duration), automation: { ...note.automation } }; instrument.pattern.notes.push(copy); instrument.selectedNoteId = copy.id; touchHarmony(); });
  document.querySelector("#deleteHarmonyNote").addEventListener("click", () => { if (!instrument.selectedNoteId) return; snapshotHarmony("Delete note"); instrument.pattern.notes = instrument.pattern.notes.filter((note) => note.id !== instrument.selectedNoteId); instrument.selectedNoteId = null; touchHarmony(); });
  document.querySelector("#quantizeHarmony").addEventListener("click", () => { snapshotHarmony("Quantize"); instrument.pattern.notes.forEach((note) => { note.start = Math.round(note.start); note.duration = Math.max(1, Math.round(note.duration)); }); touchHarmony(); });
  document.querySelector("#saveHarmonyPattern").addEventListener("click", () => { instrument.patterns = [...instrument.patterns.filter((pattern) => pattern.name !== instrument.pattern.name), JSON.parse(JSON.stringify(instrument.pattern))]; saveHarmonyState(); document.querySelector("#harmonyAiMessage").textContent = `Saved ${instrument.pattern.name} to the local pattern library.`; });
  document.querySelector("#sendHarmonyArrangement").addEventListener("click", sendHarmonyToArrangement);
  document.querySelector("#undoHarmony").addEventListener("click", undoHarmony);
  document.querySelector("#generateHarmonyPlan").addEventListener("click", () => buildHarmonyPlan(false));
  document.querySelector("#generateHarmonyVariation").addEventListener("click", () => buildHarmonyPlan(true));
  document.querySelector("#previewHarmonyPlan").addEventListener("click", () => previewHarmonyPattern());
  document.querySelector("#explainHarmonyPlan").addEventListener("click", () => { if (instrument.pendingPlan) document.querySelector("#harmonyAiMessage").textContent = `${instrument.pendingPlan.type} notes follow ${instrument.key} ${instrument.scale}; spacing leaves room for ${activeDrumGroove().name} and the current deck.`; });
  document.querySelector("#applyHarmonyPlan").addEventListener("click", () => applyHarmonyPlan());
  document.querySelector("#saveHarmonyPrompt").addEventListener("click", () => { const prompt = document.querySelector("#harmonyPrompt").value.trim(); if (prompt) { instrument.promptHistory.push(prompt); saveHarmonyState(); document.querySelector("#harmonyAiMessage").textContent = "Composer prompt saved locally."; } });
  document.querySelector("#clearHarmonyPrompt").addEventListener("click", () => { document.querySelector("#harmonyPrompt").value = ""; instrument.pendingPlan = null; document.querySelector("#harmonyPlanOutput").textContent = "No composition plan yet."; ["previewHarmonyPlan", "explainHarmonyPlan", "applyHarmonyPlan"].forEach((id) => { document.querySelector(`#${id}`).disabled = true; }); });
  document.querySelector("#generateBassline").addEventListener("click", () => generateBassPlan(false));
  document.querySelector("#varyBassline").addEventListener("click", () => generateBassPlan(true));
  document.querySelector("#previewBassline").addEventListener("click", () => previewHarmonyPattern(instrument.pendingBass));
  document.querySelector("#applyBassline").addEventListener("click", () => applyHarmonyPlan(instrument.pendingBass));
  document.querySelector("#previewHarmonyMatch").addEventListener("click", () => previewHarmonyPattern(instrument.matchPlan));
  document.querySelector("#applyHarmonyMatch").addEventListener("click", () => applyHarmonyPlan(instrument.matchPlan));
  document.querySelector("#rejectHarmonyMatch").addEventListener("click", () => { instrument.matchPlan = null; document.querySelector("#harmonyMatchSuggestion").textContent = "Harmony Match suggestion rejected. Manual performance remains unchanged."; });
  document.querySelector("#explainHarmonyMatch").addEventListener("click", () => { document.querySelector("#harmonyMatchSuggestion").textContent += " The recommendation uses deck BPM/key when available, Beat Forge groove identity, and the selected Harmony scale."; });
  document.querySelector("#undoHarmonyMatch").addEventListener("click", undoHarmony);
  document.querySelector("#bassMode").addEventListener("click", () => {
    setBassMode(!instrument.bassMode);
  });
  document.querySelector("#releaseKeys").addEventListener("click", stopAllInstrumentVoices);
  document.querySelectorAll("[data-chord]").forEach((button) => {
    button.addEventListener("click", () => playInstrumentChord(button.dataset.chord));
  });
  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.target.matches("input, select, textarea, [contenteditable='true']")) return;
    if (event.code === "Escape" || (event.code === "Space" && event.shiftKey && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      stopAllAudio();
      return;
    }
    if (event.code === "Space" && event.shiftKey) {
      event.preventDefault();
      restartContextualPlayback();
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      const active = window.AudioPlaybackRegistry?.active() || [];
      if (globalTransportState.paused || AudioEngine.context?.state === "suspended") {
        resumeContextualPlayback();
      } else if (active.some((source) => source.playing)) {
        pauseGlobalAudio();
      } else {
        resumeContextualPlayback();
      }
      return;
    }
    const padIndex = PAD_KEYS.indexOf(event.key.toLowerCase());
    if (padIndex >= 0 && document.querySelector("#drums")?.classList.contains("is-active")) {
      event.preventDefault();
      AudioEngine.init().then(() => { triggerDrumPerformancePad(padIndex, 0.85); document.querySelector(`[data-drum-pad="${padIndex}"]`)?.classList.add("is-hit"); });
      return;
    }
    if (padIndex >= 0 && document.querySelector("#sampler")?.classList.contains("is-active")) {
      event.preventDefault();
      AudioEngine.init().then(() => triggerPad(padIndex, { held: true }));
      return;
    }
    const note = instrument.keyboard.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
    if (!note || !document.querySelector("#keys")?.classList.contains("is-active")) return;
    event.preventDefault();
    const button = [...document.querySelectorAll(".key-button")][instrument.keyboard.indexOf(note)];
    instrument.heldComputerVoices ||= new Map();
    playInstrumentNote(note.offset, false, button, instrument.sustain ? 30 : 4).then((voice) => { if (voice) instrument.heldComputerVoices.set(note.key.toLowerCase(), voice); });
  });
  document.addEventListener("keyup", (event) => {
    const padIndex = PAD_KEYS.indexOf(event.key.toLowerCase());
    if (padIndex >= 0) document.querySelector(`[data-drum-pad="${padIndex}"]`)?.classList.remove("is-hit");
    if (padIndex >= 0) releasePad(padIndex);
    const harmonyKey = event.key.toLowerCase(); const voice = instrument.heldComputerVoices?.get(harmonyKey); if (voice && !instrument.sustain) releaseSynthVoice(voice); instrument.heldComputerVoices?.delete(harmonyKey);
  });
  document.querySelector("#drumPlay").addEventListener("click", async () => { await AudioEngine.init(); startDrums(); });
  document.querySelector("#drumPause").addEventListener("click", pauseDrums);
  document.querySelector("#drumRestart").addEventListener("click", async () => {
    await AudioEngine.init();
    stopDrums();
    drums.step = 0;
    startDrums();
  });
  document.querySelector("#drumClear").addEventListener("click", () => {
    snapshotDrumPattern("Clear pattern"); drums.pattern = drums.pattern.map((row) => row.map(() => 0)); touchDrumPattern(); renderSequencer();
  });
  document.querySelector("#recordMix").addEventListener("click", async () => {
    await AudioEngine.init();
    toggleMixRecording();
  });
  document.querySelector("#downloadMix").addEventListener("click", () => {
    const anchor = document.createElement("a");
    anchor.href = AudioEngine.mixUrl;
    anchor.download = "deckforge-mix.webm";
    anchor.click();
  });
  document.querySelector("#stemFile").addEventListener("change", async (event) => {
    await loadStemFile(event.target.files[0]);
  });
  document.querySelector("#splitStems").addEventListener("click", splitCurrentStemFile);
  document.querySelector("#stopStemPreview").addEventListener("click", stopStemPreview);
  document.querySelector("#stemResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-stem-action]");
    if (!button) return;
    handleStemAction(button.dataset.stemAction, button.dataset.stem);
  });
  document.querySelector("#sourceList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-source-action]");
    if (!button) return;
    if (button.dataset.sourceId) {
      handleSourceFileAction(button.dataset.sourceAction, button.dataset.sourceId);
      return;
    }
    handleSavedSourceAction(button.dataset.sourceAction, button.dataset.sourceIndex);
  });
  document.querySelector("#sourceList").addEventListener("dragstart", (event) => {
    const row = event.target.closest("[data-track-id]");
    if (!row) return;
    const source = editorSources().find((candidate) => candidate.sourceKind === "crate" && candidate.id === row.dataset.trackId);
    event.dataTransfer.setData("application/x-deckforge-ditc-track", row.dataset.trackId);
    if (source) event.dataTransfer.setData("application/x-deckforge-editor-source", JSON.stringify(source));
    event.dataTransfer.effectAllowed = "copy";
    ditcState.dragTarget = "Dragging DITC track";
  });
  document.querySelector("#sourceList").addEventListener("dragend", () => {
    ditcState.dragTarget = "None";
  });
  document.querySelector("#ditcInspector").addEventListener("click", (event) => {
    const action = event.target.closest("[data-source-action]");
    if (action) {
      handleSourceFileAction(action.dataset.sourceAction, action.dataset.sourceId);
      return;
    }
    const addTag = event.target.closest("[data-ditc-add-tag]");
    if (addTag) {
      addDitcTag(addTag.dataset.ditcAddTag, document.querySelector("#ditcInspectorTag").value);
      return;
    }
    const removeTag = event.target.closest("[data-ditc-remove-tag]");
    if (removeTag) removeDitcTag(removeTag.dataset.sourceId, removeTag.dataset.ditcRemoveTag);
  });
  document.querySelector("#sourceList").addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-crate-kind]");
    if (!checkbox) return;
    const set = checkbox.dataset.crateKind === "local" ? crateSelection.local : crateSelection.saved;
    if (checkbox.checked) {
      set.add(checkbox.dataset.crateId);
    } else {
      set.delete(checkbox.dataset.crateId);
    }
    renderAiContext();
    renderSources();
    emitProjectContextChange("ditc", "selection-changed", { summary: `DITC selection changed to ${crateSelection.local.size + crateSelection.saved.size} track${crateSelection.local.size + crateSelection.saved.size === 1 ? "" : "s"}` });
  });
  document.querySelector("#sourceList").addEventListener("input", (event) => {
    const notes = event.target.closest("[data-crate-note-kind]");
    if (!notes) return;
    saveCrateNotes(notes.dataset.crateNoteKind, notes.dataset.crateNoteId, notes.value);
  });
  document.querySelector("#ditcInspector").addEventListener("input", (event) => {
    const notes = event.target.closest("[data-crate-note-kind]");
    if (notes) saveCrateNotes(notes.dataset.crateNoteKind, notes.dataset.crateNoteId, notes.value);
  });
  document.querySelector("#ditcSearch").addEventListener("input", (event) => {
    ditcState.search = event.target.value.trim();
    renderSources();
  });
  document.querySelector("#ditcClearSearch").addEventListener("click", () => {
    document.querySelector("#ditcSearch").value = "";
    ditcState.search = "";
    renderSources();
  });
  document.querySelector("#ditcSort").addEventListener("change", (event) => {
    ditcState.sort = event.target.value;
    renderSources();
  });
  document.querySelector("#ditcCollectionList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-ditc-filter]");
    if (!button) return;
    ditcState.filter = button.dataset.ditcFilter;
    renderSources();
  });
  document.querySelector("#ditcModeToggle").addEventListener("click", (event) => {
    ditcState.advanced = !ditcState.advanced;
    document.querySelector("#sources").classList.toggle("is-advanced", ditcState.advanced);
    event.currentTarget.setAttribute("aria-pressed", ditcState.advanced ? "true" : "false");
    event.currentTarget.textContent = ditcState.advanced ? "Simple" : "Advanced";
  });
  document.querySelector("#ditcViewToggle").addEventListener("click", (event) => {
    ditcState.comfortable = !ditcState.comfortable;
    document.querySelector("#sources").classList.toggle("is-comfortable", ditcState.comfortable);
    event.currentTarget.setAttribute("aria-pressed", ditcState.comfortable ? "true" : "false");
    event.currentTarget.textContent = ditcState.comfortable ? "Compact View" : "Comfortable View";
  });
  const importDitcFiles = (files) => {
    const accepted = [...files].filter((file) => addLocalSourceFile(file, { folderPath: fileFolderPath(file), silent: true })).length;
    ditcState.lastImportResult = `Imported ${accepted} of ${files.length} selected files`;
    setSourceStatus(accepted ? `Added ${accepted} track${accepted === 1 ? "" : "s"} to DITC.` : "No new playable files were added.");
    renderSources();
    renderEditorSourceBin();
    renderAiContext();
  };
  document.querySelector("#ditcFileInput").addEventListener("change", (event) => importDitcFiles(event.target.files));
  document.querySelector("#ditcFolderInput").addEventListener("change", (event) => importDitcFiles(event.target.files));
  document.querySelector("#ditcApplyBatchTag").addEventListener("click", () => {
    const tag = document.querySelector("#ditcBatchTag").value.trim();
    if (!tag || !crateSelection.local.size) {
      setSourceStatus(!tag ? "Enter a tag first." : "Select at least one local track first.");
      return;
    }
    crateSelection.local.forEach((id) => addDitcTag(id, tag, { silent: true }));
    document.querySelector("#ditcBatchTag").value = "";
    setSourceStatus(`Added “${tag}” to ${crateSelection.local.size} selected track${crateSelection.local.size === 1 ? "" : "s"}.`);
    renderSources();
  });
  document.querySelector("#ditcAnalyzeSelected").addEventListener("click", analyzeSelectedCrateTracks);
  document.querySelector("#ditcExportList").addEventListener("click", exportDitcTrackList);
  document.querySelector("#ditcDeleteSelected").addEventListener("click", () => {
    const ids = [...crateSelection.local];
    if (!ids.length) {
      setSourceStatus("Select at least one local track first.");
      return;
    }
    if (!window.confirm(`Remove ${ids.length} selected track${ids.length === 1 ? "" : "s"} from this DITC session?`)) return;
    ids.forEach((id) => deleteLocalSourceFile(id));
    setSourceStatus(`Removed ${ids.length} selected track${ids.length === 1 ? "" : "s"} from this session.`);
  });
  const setupDitcDropAction = (selector, action) => {
    const target = document.querySelector(selector);
    target.addEventListener("dragover", (event) => {
      if (![...event.dataTransfer.types].includes("application/x-deckforge-ditc-track")) return;
      event.preventDefault();
      target.classList.add("is-drop-target");
      ditcState.dragTarget = selector;
    });
    target.addEventListener("dragleave", () => target.classList.remove("is-drop-target"));
    target.addEventListener("drop", (event) => {
      const id = event.dataTransfer.getData("application/x-deckforge-ditc-track");
      if (!id) return;
      event.preventDefault();
      target.classList.remove("is-drop-target");
      handleSourceFileAction(action, id);
      ditcState.dragTarget = "None";
    });
  };
  setupDitcDropAction("#sampler", "pad");
  setupDitcDropAction("#smartMixPanel", "smartmix");
  setupDropZone(document.querySelector("#sourceDrop"), async (file) => {
    addLocalSourceFile(file);
  });
  setupDropZone(document.querySelector("#stemDrop"), loadStemFile);
  setupDropZone(document.querySelector("#mixtapeReferenceDrop"), loadMixtapeReferenceFile);
  document.querySelector("#mixtapeReferenceFile").addEventListener("change", async (event) => {
    await loadMixtapeReferenceFiles(event.target.files);
  });
  document.querySelector("#generateAiPlan").addEventListener("click", generateAiPlan);
  document.querySelector("#applyAiPlan").addEventListener("click", applyAiPlan);
  document.querySelector("#analyzeSelectedCrate").addEventListener("click", analyzeSelectedCrateTracks);
  document.querySelector("#analyzeMixtapeInspiration").addEventListener("click", analyzeMixtapeInspiration);
  document.querySelector("#applyMixtapeBlueprint").addEventListener("click", applyMixtapeBlueprintAsPlan);
  document.querySelector("#searchAudioSections").addEventListener("click", searchAudioSections);
  document.querySelector("#clearAudioSearch").addEventListener("click", () => {
    document.querySelector("#aiSectionSearch").value = "";
    aiSearchResultsState = [];
    document.querySelector("#aiSearchResults").textContent = "No section search yet.";
  });
  document.querySelector("#aiSearchResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-search-action]");
    if (!button) return;
    handleAiSearchAction(button.dataset.aiSearchAction, button.dataset.aiSearchId);
  });
  document.querySelector("#startAiMix").addEventListener("click", startAiMix);
  document.querySelector("#stopAiMix").addEventListener("click", stopAiMix);
  document.querySelector("#clearAiPrompt").addEventListener("click", () => {
    document.querySelector("#aiPrompt").value = "";
    document.querySelector("#aiPlanOutput").textContent = "No plan generated yet.";
    aiPlanState = null;
    stopAiMix();
    document.querySelector("#applyAiPlan").disabled = true;
    document.querySelector("#startAiMix").disabled = true;
    document.querySelector("#stopAiMix").disabled = true;
  });
  document.querySelector("#sourceForm").addEventListener("submit", addSource);
}

function startScratch(event, id) {
  const deck = deckState[id];
  if (!deck.buffer) return;
  event.currentTarget.setPointerCapture(event.pointerId);
  deck.scratchWasPlaying = deck.playing;
  deck.lastScratchX = event.clientX;
  if (deck.playing) pauseDeck(id);
  document.querySelector(`.deck[data-deck="${id}"]`).classList.add("is-scratching");
}

function moveScratch(event, id) {
  const deck = deckState[id];
  if (!deck.buffer || !document.querySelector(`.deck[data-deck="${id}"]`).classList.contains("is-scratching")) return;
  const delta = event.clientX - deck.lastScratchX;
  deck.lastScratchX = event.clientX;
  deck.offset = Math.max(0, Math.min(deck.buffer.duration - 0.05, deck.offset + delta * 0.012));
  playScratchSlice(deck);
  drawPlayhead(id, deck.offset / deck.buffer.duration);
}

function endScratch(event, id) {
  const deck = deckState[id];
  if (!deck.buffer) return;
  try {
    event.currentTarget.releasePointerCapture(event.pointerId);
  } catch {
    /* capture may have already been released */
  }
  document.querySelector(`.deck[data-deck="${id}"]`).classList.remove("is-scratching");
  if (deck.scratchWasPlaying) playDeck(id);
}

function playScratchSlice(deck) {
  connectDeck(deck);
  const source = makeSource(deck);
  source.start(0, deck.offset, 0.08);
}

function addSource(event) {
  event.preventDefault();
  const urlInput = document.querySelector("#sourceUrl");
  const nameInput = document.querySelector("#sourceName");
  const item = {
    url: urlInput.value,
    name: nameInput.value || new URL(urlInput.value).hostname.replace("www.", "")
  };
  const sources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
  sources.unshift(item);
  localStorage.setItem("deckforge-sources", JSON.stringify(sources.slice(0, 20)));
  event.target.reset();
  renderSources();
}

function ditcTrackStorageId(file, folderPath = "") {
  return [file.name, file.size || 0, file.lastModified || 0, folderPath].join("::");
}

function readDitcMetadata() {
  try {
    return JSON.parse(localStorage.getItem(DITC_METADATA_KEY) || "{}");
  } catch {
    ditcState.lastError = "DITC metadata could not be read. Defaults are being used.";
    return {};
  }
}

function persistDitcTrack(track) {
  try {
    const metadata = readDitcMetadata();
    metadata[track.storageId] = {
      favorite: Boolean(track.favorite),
      tags: track.tags || [],
      notes: track.notes || "",
      title: track.title || "",
      artist: track.artist || "",
      album: track.album || "",
      year: track.year || "",
      analysis: track.analysis || null
    };
    localStorage.setItem(DITC_METADATA_KEY, JSON.stringify(metadata));
  } catch {
    ditcState.lastError = "DITC metadata could not be saved. Browser storage may be full.";
    setSourceStatus(ditcState.lastError);
  }
}

function inferDitcMetadata(fileName) {
  const base = fileName.replace(/\.[^/.]+$/, "");
  const parts = base.split(/\s+-\s+/);
  return {
    title: parts.length > 1 ? parts.slice(1).join(" - ").trim() : base,
    artist: parts.length > 1 ? parts[0].trim() : "Unknown artist",
    album: "Unknown album"
  };
}

function addLocalSourceFile(file, options = {}) {
  if (!isSupportedAudioFile(file)) {
    ditcState.lastError = `${file?.name || "File"} is not a supported audio format.`;
    if (!options.silent) setSourceStatus(ditcState.lastError);
    return false;
  }
  const folderPath = options.folderPath || fileFolderPath(file);
  const storageId = ditcTrackStorageId(file, folderPath);
  if (sourceFiles.some((source) => source.storageId === storageId)) {
    ditcState.lastError = `${file.name} is already in DITC.`;
    if (!options.silent) setSourceStatus(ditcState.lastError);
    return false;
  }
  const inferred = inferDitcMetadata(file.name);
  const saved = readDitcMetadata()[storageId] || {};
  sourceFiles.unshift({
    id: createId(),
    storageId,
    name: file.name,
    title: saved.title || inferred.title,
    artist: saved.artist || inferred.artist,
    album: saved.album || inferred.album,
    year: saved.year || "",
    folderPath,
    file,
    buffer: options.buffer || null,
    analysis: options.analysis || saved.analysis || null,
    notes: options.notes || saved.notes || "",
    tags: Array.isArray(saved.tags) ? saved.tags : [],
    favorite: Boolean(saved.favorite),
    addedAt: Date.now(),
    padReady: false,
    stemReady: false
  });
  ditcState.lastImportResult = `Imported ${file.name}`;
  if (!options.silent) {
    setSourceStatus(`Added ${file.name} to DITC.`);
    renderSources();
    renderEditorSourceBin();
    renderAiContext();
  }
  emitProjectContextChange("ditc", "track-imported", { summary: `Imported ${file.name} into DITC`, decision: { domain: "DITC", action: "Track imported", summary: `Imported ${file.name}`, after: { name: file.name, folderPath }, initiatedBy: "user" } });
  return true;
}

function addBufferToCrate(buffer, label, notes = "") {
  const fileName = `${sanitizeFileName(label)}.wav`;
  const file = new File([audioBufferToWav(buffer)], fileName, { type: "audio/wav" });
  const analysis = analyzeAudioBuffer(buffer, label);
  addLocalSourceFile(file, { buffer, analysis, notes });
}

function sanitizeFileName(name) {
  return name
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "deck-clip";
}

function createId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return String(Date.now() + Math.random());
}

function setSourceStatus(message) {
  const status = document.querySelector("#sourceStatus");
  if (status) status.textContent = message;
}

async function getSourceFileBuffer(id) {
  const item = sourceFiles.find((source) => source.id === id);
  if (!item) return null;
  if (!item.buffer) {
    item.buffer = await loadAudioFile(item.file);
  }
  return item.buffer;
}

async function analyzeSelectedCrateTracks() {
  const selected = selectedCrateItems();
  if (!selected.length) {
    setSourceStatus("Select crate tracks first, then analyze.");
    switchView("sources");
    return;
  }
  setSourceStatus(`Analyzing ${selected.length} selected crate track${selected.length === 1 ? "" : "s"}...`);
  for (const item of selected) {
    try {
      const buffer = item.kind === "local"
        ? await getSourceFileBuffer(item.id)
        : await loadAudioFromUrl(item.url);
      const analysis = analyzeAudioBuffer(buffer, item.name);
      if (item.kind === "local") {
        const source = sourceFiles.find((sourceItem) => sourceItem.id === item.id);
        if (source) {
          source.analysis = analysis;
          persistDitcTrack(source);
        }
      } else {
        saveSourceAnalysis(item.index, analysis);
      }
    } catch {
      if (item.kind === "saved") saveSourceAnalysis(item.index, { status: "Unavailable: not a direct audio URL" });
    }
  }
  setSourceStatus("Selected crate analysis complete.");
  renderSources();
  renderAiContext();
  emitProjectContextChange("ditc", "tracks-analyzed", { summary: `Analyzed ${selected.length} selected crate track${selected.length === 1 ? "" : "s"}`, decision: { domain: "DITC", action: "Tracks analyzed", summary: `Analyzed ${selected.length} selected crate track${selected.length === 1 ? "" : "s"}`, after: { analyzedCount: selected.length }, initiatedBy: "user" } });
}

function analyzeAudioBuffer(buffer, name) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const stride = Math.max(1, Math.floor(sampleRate / 100));
  const envelope = [];
  let totalSquare = 0;
  let zeroCrossings = 0;
  for (let i = 0; i < data.length; i += stride) {
    let sum = 0;
    for (let j = 0; j < stride && i + j < data.length; j += 1) {
      const sample = data[i + j];
      sum += Math.abs(sample);
      totalSquare += sample * sample;
      if (i + j > 0 && Math.sign(sample) !== Math.sign(data[i + j - 1])) zeroCrossings += 1;
    }
    envelope.push(sum / stride);
  }
  const energy = Math.sqrt(totalSquare / data.length);
  const bpm = estimateBpmFromEnvelope(envelope);
  const zcr = zeroCrossings / data.length;
  const duration = buffer.duration;
  const key = estimateKeyFromName(name);
  return {
    bpm,
    key,
    energy: energy > 0.18 ? "High" : energy > 0.09 ? "Medium" : "Low",
    loudness: energy,
    genre: inferGenreFromNameAndTempo(name, bpm, zcr),
    mood: inferMoodFromAnalysis(name, { energy: energy > 0.18 ? "High" : energy > 0.09 ? "Medium" : "Low" }),
    vocalDensity: estimateVocalDensityFromName(name, inferGenreFromNameAndTempo(name, bpm, zcr)),
    percussionIntensity: estimatePercussionIntensity(bpm, inferGenreFromNameAndTempo(name, bpm, zcr), energy > 0.18 ? "High" : energy > 0.09 ? "Medium" : "Low"),
    intro: duration > 20 ? "First 16-32 bars likely usable for intro/cue setup" : "Short clip",
    outro: duration > 45 ? "Last 16-32 bars likely usable for fade/crossfade" : "Short clip",
    duration
  };
}

function estimateBpmFromEnvelope(envelope) {
  const peaks = [];
  const avg = envelope.reduce((sum, value) => sum + value, 0) / envelope.length;
  for (let i = 1; i < envelope.length - 1; i += 1) {
    if (envelope[i] > avg * 1.35 && envelope[i] > envelope[i - 1] && envelope[i] > envelope[i + 1]) {
      peaks.push(i / 100);
    }
  }
  if (peaks.length < 4) return 120;
  const intervals = [];
  for (let i = 1; i < Math.min(peaks.length, 80); i += 1) {
    const diff = peaks[i] - peaks[i - 1];
    if (diff > 0.22 && diff < 1.25) intervals.push(diff);
  }
  if (!intervals.length) return 120;
  const median = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
  let bpm = Math.round(60 / median);
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm = Math.round(bpm / 2);
  return bpm;
}

function estimateKeyFromName(name) {
  const match = name.match(/\b([A-G](?:#|b)?)(?:\s|-)?(?:minor|maj|major|min|m)?\b/i);
  if (match) return match[0];
  const keys = ["C minor", "D minor", "E minor", "F minor", "G minor", "A minor", "Bb minor", "C major", "F major", "G major"];
  let hash = 0;
  for (const char of name) hash += char.charCodeAt(0);
  return keys[hash % keys.length];
}

function inferGenreFromNameAndTempo(name, bpm, zcr) {
  const text = name.toLowerCase();
  if (/jungle|dnb|drum.?bass|break/.test(text) || bpm >= 155) return "Jungle / DnB";
  if (/house|garage|club|dance/.test(text) || (bpm >= 118 && bpm <= 130)) return "House / Dance";
  if (/trap|808|drill/.test(text) || bpm >= 132) return "Trap / Rap";
  if (/soul|rnb|r&b/.test(text)) return "R&B / Soul";
  if (/funk|disco/.test(text)) return "Funk / Disco";
  if (zcr > 0.16) return "Bright / Percussive";
  return "Hip-Hop / Open Format";
}

function saveSourceAnalysis(index, analysis) {
  const sources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
  if (!sources[Number(index)]) return;
  sources[Number(index)].analysis = analysis;
  localStorage.setItem("deckforge-sources", JSON.stringify(sources));
}

async function handleSourceFileAction(action, id) {
  const item = sourceFiles.find((source) => source.id === id);
  if (!item) return;
  if (action === "select") {
    ditcState.selectedTrackId = id;
    renderSources();
    return;
  }
  if (action === "favorite") {
    const before = item.favorite;
    item.favorite = !item.favorite;
    persistDitcTrack(item);
    renderSources();
    emitProjectContextChange("ditc", "track-favorite-changed", { summary: `${item.favorite ? "Favorited" : "Unfavorited"} ${item.name}`, decision: { domain: "DITC", action: item.favorite ? "Track favorited" : "Track unfavorited", summary: `${item.favorite ? "Favorited" : "Unfavorited"} ${item.name}`, before: { favorite: before }, after: { favorite: item.favorite }, initiatedBy: "user" } });
    return;
  }
  if (action === "stop-preview") {
    stopDitcPreview();
    return;
  }
  if (action === "delete") {
    if (window.confirm(`Remove ${item.name} from this DITC session?`)) deleteLocalSourceFile(id);
    return;
  }
  setSourceStatus(`Loading ${item.name}...`);
  let buffer;
  try {
    buffer = await getSourceFileBuffer(id);
  } catch (error) {
    ditcState.lastError = `${item.name} could not be decoded. Try a different audio file.`;
    setSourceStatus(ditcState.lastError);
    return;
  }
  if (!buffer) return;
  if (action === "preview") {
    ditcState.previewTrackId = id;
    playBufferPreview(buffer, {
      ditcTrackId: id,
      onended: () => {
        if (ditcState.previewTrackId === id) {
          ditcState.previewTrackId = null;
          renderSources();
        }
      }
    });
    renderSources();
    setSourceStatus(`Previewing ${item.name}.`);
    return;
  }
  if (action === "analyze") {
    item.analysis = analyzeAudioBuffer(buffer, item.name);
    persistDitcTrack(item);
    setSourceStatus(`Analyzed ${item.name}.`);
    renderSources();
    emitProjectContextChange("ditc", "track-analyzed", { summary: `Analyzed ${item.name}`, decision: { domain: "DITC", action: "Track analyzed", summary: `Analyzed ${item.name}`, after: { name: item.name, bpm: item.analysis.bpm || null, key: item.analysis.key || null }, initiatedBy: "user" } });
    return;
  }
  if (action === "smartmix") {
    ditcState.smartMixIds.add(id);
    crateSelection.local.add(id);
    setSourceStatus(`${item.name} added to the Smart Mix selection.`);
    renderSources();
    return;
  }
  if (action === "arrangement") {
    const source = editorSources().find((candidate) => candidate.sourceKind === "crate" && candidate.id === id);
    if (source) await addEditorClipFromSource(source, 0, editorState.playhead);
    switchView("editor");
    return;
  }
  if (action === "deck-a") {
    loadBufferToDeck(buffer, item.name, "a");
    switchView("decks");
  }
  if (action === "deck-b") {
    loadBufferToDeck(buffer, item.name, "b");
    switchView("decks");
  }
  if (action === "pad") {
    addBufferToPad(buffer, item.name);
    item.padReady = true;
  }
  if (action === "stems") {
    stemState.file = item.file;
    stemState.sourceBuffer = buffer;
    stemState.sourceName = item.name.replace(/\.[^/.]+$/, "");
    stemState.stems = [];
    item.stemReady = true;
    document.querySelector("#splitStems").disabled = false;
    document.querySelector("#stemStatus").textContent = `Loaded ${item.name}. Ready to split.`;
    renderStemResults();
    switchView("stems");
  }
  setSourceStatus(`${item.name} loaded.`);
}

async function handleSavedSourceAction(action, index) {
  const sources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
  const item = sources[Number(index)];
  if (!item) return;
  if (action === "delete") {
    if (window.confirm(`Delete the ${item.name} reference from DITC?`)) deleteSavedSource(index);
    return;
  }
  setSourceStatus(`Trying to load ${item.name}...`);
  try {
    const buffer = await loadAudioFromUrl(item.url);
    if (action === "deck-a") {
      loadBufferToDeck(buffer, item.name, "a");
      switchView("decks");
    }
    if (action === "deck-b") {
      loadBufferToDeck(buffer, item.name, "b");
      switchView("decks");
    }
    if (action === "pad") addBufferToPad(buffer, item.name);
    if (action === "stems") {
      stemState.file = null;
      stemState.sourceBuffer = buffer;
      stemState.sourceName = item.name;
      stemState.stems = [];
      document.querySelector("#splitStems").disabled = false;
      document.querySelector("#stemStatus").textContent = `Loaded ${item.name}. Ready to split.`;
      renderStemResults();
      switchView("stems");
    }
    setSourceStatus(`${item.name} loaded from URL.`);
  } catch {
    setSourceStatus("This link could not be decoded as direct audio. Streaming platforms usually block browser loading; drop a downloaded file or use tab audio capture.");
  }
}

async function loadAudioFromUrl(url) {
  await AudioEngine.init();
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) {
    throw new Error("Unable to fetch audio URL.");
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.includes("audio") && !contentType.includes("octet-stream")) {
    throw new Error("URL is not direct audio.");
  }
  return AudioEngine.context.decodeAudioData(await response.arrayBuffer());
}

function deleteLocalSourceFile(id) {
  const index = sourceFiles.findIndex((source) => source.id === id);
  if (index === -1) return;
  const [removed] = sourceFiles.splice(index, 1);
  if (ditcState.previewTrackId === id) stopDitcPreview();
  if (ditcState.selectedTrackId === id) ditcState.selectedTrackId = null;
  crateSelection.local.delete(id);
  ditcState.smartMixIds.delete(id);
  setSourceStatus(`Removed ${removed.name} from this DITC session.`);
  renderSources();
  renderAiContext();
  emitProjectContextChange("ditc", "track-removed", { summary: `Removed ${removed.name} from DITC`, decision: { domain: "DITC", action: "Track removed", summary: `Removed ${removed.name}`, before: { id: removed.id, name: removed.name }, initiatedBy: "user" } });
}

function deleteSavedSource(index) {
  const sources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
  const [removed] = sources.splice(Number(index), 1);
  localStorage.setItem("deckforge-sources", JSON.stringify(sources));
  setSourceStatus(removed ? `Deleted ${removed.name} from the crate.` : "Crate item deleted.");
  renderSources();
  renderAiContext();
}

function selectedCrateItems() {
  const savedSources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
  return [
    ...sourceFiles
      .filter((source) => crateSelection.local.has(source.id))
      .map((source) => ({ kind: "local", id: source.id, name: source.name, file: source.file, analysis: source.analysis, notes: source.notes || "", tags: source.tags || [], favorite: source.favorite })),
    ...savedSources
      .map((source, index) => ({ ...source, kind: "saved", index, id: String(index) }))
      .filter((source) => crateSelection.saved.has(String(source.index)))
  ];
}

function analysisSummary(analysis) {
  if (!analysis) return "Not analyzed";
  if (analysis.status) return analysis.status;
  return `${analysis.bpm} BPM, ${analysis.key}, ${analysis.energy} energy, ${analysis.genre}`;
}

function saveCrateNotes(kind, id, value) {
  if (kind === "local") {
    const source = sourceFiles.find((item) => item.id === id);
    if (source) {
      source.notes = value;
      persistDitcTrack(source);
    }
  } else {
    const sources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
    if (sources[Number(id)]) {
      sources[Number(id)].notes = value;
      localStorage.setItem("deckforge-sources", JSON.stringify(sources));
    }
  }
  renderAiContext();
}

function addDitcTag(id, value, options = {}) {
  const track = sourceFiles.find((item) => item.id === id);
  const tag = String(value || "").trim().replace(/\s+/g, " ");
  if (!track || !tag) return false;
  if (!(track.tags || []).some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
    track.tags = [...(track.tags || []), tag].slice(0, 30);
    persistDitcTrack(track);
  }
  if (!options.silent) {
    setSourceStatus(`Added “${tag}” to ${track.title}.`);
    renderSources();
  }
  emitProjectContextChange("ditc", "track-tagged", { summary: `Tagged ${track.title} with ${tag}`, decision: { domain: "DITC", action: "Track tagged", summary: `Added ${tag} to ${track.title}`, after: { tag }, initiatedBy: "user" } });
  return true;
}

function removeDitcTag(id, value) {
  const track = sourceFiles.find((item) => item.id === id);
  if (!track) return;
  track.tags = (track.tags || []).filter((tag) => tag !== value);
  persistDitcTrack(track);
  renderSources();
  emitProjectContextChange("ditc", "track-tag-removed", { summary: `Removed ${value} from ${track.title}` });
}

async function searchAudioSections() {
  const query = document.querySelector("#aiSectionSearch").value.trim();
  if (!query) return;
  const targets = await searchableAudioTargets();
  const timestampRanges = parseTimestampRanges(query);
  const results = [];
  if (timestampRanges.length) {
    for (const target of targets) {
      for (const range of timestampRanges) {
        if (range.start < target.buffer.duration) {
          results.push({
            id: createId(),
            target,
            start: Math.max(0, range.start),
            end: Math.min(target.buffer.duration, range.end),
            label: `${target.name} ${formatTime(range.start)}-${formatTime(Math.min(target.buffer.duration, range.end))}`,
            reason: "Timestamp match"
          });
        }
      }
    }
  } else {
    const needle = query.toLowerCase().replace(/^["']|["']$/g, "");
    for (const target of targets) {
      const matches = cueMatches(target.notes || "", needle);
      matches.forEach((match) => {
        results.push({
          id: createId(),
          target,
          start: match.start,
          end: Math.min(target.buffer.duration, match.end),
          label: `${target.name} ${formatTime(match.start)}-${formatTime(Math.min(target.buffer.duration, match.end))}`,
          reason: `Cue text: ${match.text}`
        });
      });
    }
  }
  aiSearchResultsState = results;
  renderAiSearchResults(query, timestampRanges.length > 0);
}

async function searchableAudioTargets() {
  const selected = selectedCrateItems();
  const selectedLocalIds = new Set(selected.filter((item) => item.kind === "local").map((item) => item.id));
  const selectedSaved = selected.filter((item) => item.kind === "saved");
  const localSources = selectedLocalIds.size ? sourceFiles.filter((source) => selectedLocalIds.has(source.id)) : sourceFiles;
  const targets = [];
  for (const source of localSources) {
    const buffer = await getSourceFileBuffer(source.id);
    if (buffer) targets.push({ name: source.name, buffer, notes: source.notes || "" });
  }
  for (const source of selectedSaved) {
    try {
      const buffer = await loadAudioFromUrl(source.url);
      targets.push({ name: source.name, buffer, notes: source.notes || "" });
    } catch {
      /* Saved streaming links are not searchable unless they are direct audio URLs. */
    }
  }
  for (const id of ["a", "b"]) {
    const deck = deckState[id];
    if (deck.buffer) targets.push({ name: `Deck ${id.toUpperCase()} - ${document.querySelector(`#title-${id}`).textContent}`, buffer: deck.buffer, notes: "" });
  }
  stemState.stems.forEach((stem) => {
    targets.push({ name: `Stem - ${stem.name}`, buffer: stem.buffer, notes: "" });
  });
  return targets;
}

function parseTimestampRanges(query) {
  const ranges = [];
  const rangePattern = /(\d{1,2}(?::\d{2}){1,2})\s*(?:-|to|through|until)\s*(\d{1,2}(?::\d{2}){1,2})/gi;
  let match;
  while ((match = rangePattern.exec(query)) !== null) {
    ranges.push({ start: parseTimecode(match[1]), end: parseTimecode(match[2]) });
  }
  const atPattern = /(?:at|from)?\s*(\d{1,2}(?::\d{2}){1,2})(?:\s*(?:for|length)\s*(\d{1,2})\s*(?:s|sec|seconds)?)?/gi;
  while ((match = atPattern.exec(query)) !== null) {
    const start = parseTimecode(match[1]);
    const length = match[2] ? Number(match[2]) : 8;
    if (!ranges.some((range) => Math.abs(range.start - start) < 0.01)) {
      ranges.push({ start, end: start + length });
    }
  }
  return ranges.filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start);
}

function parseTimecode(value) {
  const parts = value.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number.NaN;
}

function cueMatches(notes, needle) {
  if (!notes || !needle) return [];
  return notes.split("\n").flatMap((line) => {
    if (!line.toLowerCase().includes(needle)) return [];
    const ranges = parseTimestampRanges(line);
    if (ranges.length) {
      return ranges.map((range) => ({ ...range, text: line.trim() }));
    }
    return [{ start: 0, end: 8, text: line.trim() }];
  });
}

function renderAiSearchResults(query, usedTimestamps) {
  const container = document.querySelector("#aiSearchResults");
  if (!aiSearchResultsState.length) {
    container.textContent = usedTimestamps
      ? "No loaded/selected audio matched that timestamp range."
      : "No cue text matched. Add lyric/quote lines with timestamps to crate cue text, then search again.";
    return;
  }
  container.innerHTML = aiSearchResultsState.map((result) => `
    <div class="ai-search-result">
      <strong>${result.label}</strong>
      <small>${result.reason}</small>
      <div class="stem-actions">
        <button data-ai-search-action="preview" data-ai-search-id="${result.id}">Preview</button>
        <button data-ai-search-action="pad" data-ai-search-id="${result.id}">Pad</button>
        <button data-ai-search-action="deck-a" data-ai-search-id="${result.id}">Deck A</button>
        <button data-ai-search-action="deck-b" data-ai-search-id="${result.id}">Deck B</button>
      </div>
    </div>
  `).join("");
}

function handleAiSearchAction(action, id) {
  const result = aiSearchResultsState.find((item) => item.id === id);
  if (!result) return;
  const clip = clipAudioBuffer(result.target.buffer, result.start, result.end);
  if (action === "preview") playBufferPreview(clip);
  if (action === "pad") addBufferToPad(clip, result.label);
  if (action === "deck-a") loadBufferToDeck(clip, result.label, "a");
  if (action === "deck-b") loadBufferToDeck(clip, result.label, "b");
}

function renderSources() {
  const list = document.querySelector("#sourceList");
  const sources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
  const visible = sortedDitcTracks(sourceFiles.filter(matchesDitcFilter));
  list.innerHTML = "";
  if (!sourceFiles.length && !sources.length) {
    list.innerHTML = `<div class="ditc-empty"><strong>Drop music here, then load a song onto Deck A or Deck B.</strong><p>Import files or a folder to start digging.</p></div>`;
  } else if (!visible.length && sourceFiles.length) {
    list.innerHTML = `<div class="ditc-empty"><strong>No tracks match this view.</strong><p>Clear search or choose All Tracks.</p></div>`;
  }
  visible.forEach((source) => list.appendChild(renderDitcTrackRow(source)));
  if (!ditcState.search && ditcState.filter === "all") {
    sources.forEach((source, index) => list.appendChild(renderDitcReferenceRow(source, index)));
  }
  document.querySelector("#ditcTrackCount").textContent = `${sourceFiles.length + sources.length} track${sourceFiles.length + sources.length === 1 ? "" : "s"}`;
  document.querySelector("#ditcPlayableCount").textContent = `${sourceFiles.length} playable`;
  document.querySelector("#ditcResultCount").textContent = `${visible.length} result${visible.length === 1 ? "" : "s"}`;
  renderDitcCollections();
  renderDitcInspector();
  renderDitcDiagnostics();
  updateSmartMixSourceOptions();
}

function ditcSearchText(track) {
  return [track.title, track.artist, track.album, track.name, track.analysis?.genre, track.notes, track.folderPath, ...(track.tags || [])].join(" ").toLowerCase();
}

function matchesDitcFilter(track) {
  if (ditcState.search && !ditcSearchText(track).includes(ditcState.search.toLowerCase())) return false;
  const filter = ditcState.filter;
  if (filter === "favorites") return track.favorite;
  if (filter === "recent") return Date.now() - track.addedAt < 24 * 60 * 60 * 1000;
  if (filter === "analyzed") return Boolean(track.analysis);
  if (filter === "unanalyzed") return !track.analysis;
  if (filter === "stems") return track.stemReady;
  if (filter === "pads") return track.padReady;
  if (filter === "smartmix") return ditcState.smartMixIds.has(track.id) || crateSelection.local.has(track.id);
  if (filter === "folders") return Boolean(track.folderPath && track.folderPath !== track.name);
  if (filter === "intro") return (track.tags || []).some((tag) => tag.toLowerCase() === "intro") || Boolean(track.analysis?.intro);
  if (filter === "outro") return (track.tags || []).some((tag) => tag.toLowerCase() === "outro") || Boolean(track.analysis?.outro);
  if (filter === "transition") return (track.tags || []).some((tag) => tag.toLowerCase() === "transition") || Boolean(ditcTransitionMatch(track));
  return true;
}

function sortedDitcTracks(tracks) {
  const value = (track, key) => {
    if (key === "title") return track.title || track.name || "";
    if (key === "artist") return track.artist || "";
    if (key === "album") return track.album || "";
    if (key === "bpm") return track.analysis?.bpm ?? Number.MAX_SAFE_INTEGER;
    if (key === "key") return track.analysis?.key || "~";
    if (key === "duration") return track.analysis?.duration ?? track.buffer?.duration ?? Number.MAX_SAFE_INTEGER;
    if (key === "energy") return ({ Low: 1, Medium: 2, High: 3 })[track.analysis?.energy] || 0;
    if (key === "transition") return ditcTransitionMatch(track)?.rank || 0;
    return track.addedAt || 0;
  };
  return [...tracks].sort((a, b) => {
    const left = value(a, ditcState.sort);
    const right = value(b, ditcState.sort);
    if (typeof left === "number" && typeof right === "number") return ditcState.sort === "recent" ? right - left : left - right;
    return String(left).localeCompare(String(right));
  });
}

function ditcCamelot(key) {
  const map = { "C major": "8B", "G major": "9B", "F major": "7B", "A minor": "8A", "E minor": "9A", "D minor": "7A", "G minor": "6A", "C minor": "5A", "F minor": "4A", "Bb minor": "3A" };
  return map[key] || "N/A";
}

function ditcTransitionMatch(track) {
  const activeId = detectActiveDeck();
  const active = activeId ? deckState[activeId] : null;
  if (!active?.analysis || !track.analysis) return null;
  const bpmDistance = Math.abs(normalizeBpmForMix(active.analysis.bpm, track.analysis.bpm) - track.analysis.bpm);
  const harmonic = areKeysCompatible(active.analysis.key, track.analysis.key);
  const rank = harmonic && bpmDistance <= 6 ? 3 : bpmDistance <= 12 ? 2 : 1;
  return { rank, label: `${rank === 3 ? "Strong" : rank === 2 ? "Possible" : "Wide"} Basic Match` };
}

function renderDitcTrackRow(source) {
  const row = document.createElement("article");
  row.className = `ditc-track-row${ditcState.selectedTrackId === source.id ? " is-selected" : ""}${ditcState.previewTrackId === source.id ? " is-previewing" : ""}`;
  row.dataset.trackId = source.id;
  row.draggable = true;
  const duration = source.analysis?.duration || source.buffer?.duration;
  const transition = ditcTransitionMatch(source);
  row.innerHTML = `
    <label><span class="sr-only">Select ${escapeHtml(source.title)}</span><input type="checkbox" data-crate-kind="local" data-crate-id="${source.id}" ${crateSelection.local.has(source.id) ? "checked" : ""}></label>
    <span class="ditc-artwork" aria-hidden="true">${escapeHtml((source.title || source.name).slice(0, 2).toUpperCase())}</span>
    <button class="ditc-track-title" data-source-action="select" data-source-id="${source.id}" title="Inspect ${escapeHtml(source.title)}">${escapeHtml(source.title)}<span class="ditc-track-subtitle">${escapeHtml(source.artist)} · ${escapeHtml(source.album)}</span></button>
    <span class="ditc-cell ditc-optional">${escapeHtml(source.analysis?.genre || "Unknown genre")}</span>
    <span class="ditc-cell">${source.analysis?.bpm || "N/A"} BPM</span>
    <span class="ditc-cell">${escapeHtml(source.analysis?.key || "N/A")}<br>${ditcCamelot(source.analysis?.key)}</span>
    <span class="ditc-cell ditc-optional">${duration ? formatTime(duration) : "N/A"}<br>${transition?.label || "Not Scored"}</span>
    <div class="ditc-row-actions">
      <button data-source-action="${ditcState.previewTrackId === source.id ? "stop-preview" : "preview"}" data-source-id="${source.id}" title="${ditcState.previewTrackId === source.id ? "Stop Preview" : "Preview"}">${ditcState.previewTrackId === source.id ? "■" : "▶"}</button>
      <button data-source-action="deck-a" data-source-id="${source.id}" title="Load Deck A">A</button>
      <button data-source-action="deck-b" data-source-id="${source.id}" title="Load Deck B">B</button>
      <button class="${source.favorite ? "is-active" : ""}" data-source-action="favorite" data-source-id="${source.id}" title="Favorite">★</button>
      <details><summary title="More actions">•••</summary><div class="ditc-more-menu">
        <button data-source-action="smartmix" data-source-id="${source.id}">Add to Smart Mix</button>
        <button data-source-action="pad" data-source-id="${source.id}">Send to Pads</button>
        <button data-source-action="stems" data-source-id="${source.id}">Send to Stem Lab</button>
        <button data-source-action="arrangement" data-source-id="${source.id}">Send to Arrangement</button>
        <button data-source-action="analyze" data-source-id="${source.id}">Analyze</button>
        <button data-source-action="delete" data-source-id="${source.id}">Delete</button>
      </div></details>
    </div>`;
  return row;
}

function renderDitcReferenceRow(source, index) {
  const row = document.createElement("article");
  row.className = "ditc-track-row";
  row.innerHTML = `<label><input type="checkbox" data-crate-kind="saved" data-crate-id="${index}" ${crateSelection.saved.has(String(index)) ? "checked" : ""}></label><span class="ditc-artwork">↗</span><div><strong>${escapeHtml(source.name)}</strong><span class="ditc-track-subtitle">${escapeHtml(detectPlatform(source.url))} reference</span></div><span class="ditc-cell ditc-optional">Metadata reference</span><span class="ditc-cell">N/A BPM</span><span class="ditc-cell">N/A</span><span class="ditc-cell ditc-optional">Not Scored</span><div class="ditc-row-actions"><button data-source-action="deck-a" data-source-index="${index}" title="Try Deck A">A</button><button data-source-action="deck-b" data-source-index="${index}" title="Try Deck B">B</button><button data-source-action="delete" data-source-index="${index}" title="Delete">×</button></div>`;
  return row;
}

function renderDitcCollections() {
  const container = document.querySelector("#ditcCollectionList");
  const definitions = [
    ["all", "All Tracks"], ["recent", "Recently Added"], ["favorites", "Favorites"], ["smartmix", "Smart Mix Candidates"],
    ["intro", "Intro Ideas"], ["outro", "Outro Ideas"], ["transition", "Transition Songs"], ["analyzed", "Analyzed"],
    ["unanalyzed", "Unanalyzed"], ["stems", "Stem Ready"], ["pads", "Pad Ready"], ["folders", "Imported Folders"]
  ];
  container.innerHTML = definitions.map(([id, label]) => {
    const count = sourceFiles.filter((track) => {
      const previous = ditcState.filter;
      ditcState.filter = id;
      const matches = matchesDitcFilter(track);
      ditcState.filter = previous;
      return matches;
    }).length;
    return `<button class="ditc-collection-button${ditcState.filter === id ? " is-active" : ""}" data-ditc-filter="${id}"><span>${label}</span><span>${count}</span></button>`;
  }).join("");
}

function renderDitcInspector() {
  const inspector = document.querySelector("#ditcInspector");
  const track = sourceFiles.find((source) => source.id === ditcState.selectedTrackId);
  if (!track) {
    inspector.innerHTML = `<p class="fine-print">Select a track to inspect its metadata and destinations.</p>`;
    return;
  }
  const duration = track.analysis?.duration || track.buffer?.duration;
  const transition = ditcTransitionMatch(track);
  inspector.innerHTML = `
    <div class="ditc-inspector-artwork">${escapeHtml(track.title.slice(0, 2).toUpperCase())}</div>
    <h3>${escapeHtml(track.title)}</h3><p class="fine-print">${escapeHtml(track.artist)} · ${escapeHtml(track.album)}</p>
    <div class="ditc-inspector-actions"><button data-source-action="${ditcState.previewTrackId === track.id ? "stop-preview" : "preview"}" data-source-id="${track.id}">${ditcState.previewTrackId === track.id ? "Stop Preview" : "Preview"}</button><button data-source-action="deck-a" data-source-id="${track.id}">Deck A</button><button data-source-action="deck-b" data-source-id="${track.id}">Deck B</button><button data-source-action="pad" data-source-id="${track.id}">Pads</button><button data-source-action="stems" data-source-id="${track.id}">Stems</button><button data-source-action="arrangement" data-source-id="${track.id}">Arrangement</button></div>
    <dl><dt>Duration</dt><dd>${duration ? formatTime(duration) : "Unknown"}</dd><dt>File</dt><dd>${escapeHtml(track.file.type || track.name.split(".").pop().toUpperCase())}, ${formatFileSize(track.file.size)}</dd><dt>BPM</dt><dd>${track.analysis?.bpm || "Unknown"}</dd><dt>Key</dt><dd>${escapeHtml(track.analysis?.key || "Unknown")} · ${ditcCamelot(track.analysis?.key)}</dd><dt>Genre</dt><dd>${escapeHtml(track.analysis?.genre || "Unknown")}</dd><dt>Mood</dt><dd>${escapeHtml(track.analysis?.mood || "Unknown")}</dd><dt>Energy</dt><dd>${escapeHtml(track.analysis?.energy || "Unknown")}</dd><dt>Source</dt><dd>Local file</dd><dt>Folder</dt><dd>${escapeHtml(track.folderPath || "Local import")}</dd><dt>Analysis</dt><dd>${track.analysis ? "Analyzed" : "Not analyzed"}</dd><dt>Stem state</dt><dd>${track.stemReady ? "Prepared" : "Not prepared"}</dd><dt>Pad state</dt><dd>${track.padReady ? "Prepared" : "Not prepared"}</dd><dt>Project match</dt><dd>Not Scored</dd><dt>Transition</dt><dd>${transition?.label || "Not Scored"}</dd></dl>
    <div class="ditc-tag-list">${(track.tags || []).map((tag) => `<button class="ditc-tag" data-ditc-remove-tag="${escapeHtml(tag)}" data-source-id="${track.id}" title="Remove tag">${escapeHtml(tag)} ×</button>`).join("") || "<span class=\"fine-print\">No tags</span>"}</div>
    <label>Add tag <input id="ditcInspectorTag" type="text" placeholder="Intro, House, NYC"></label><button data-ditc-add-tag="${track.id}" class="secondary-button">Add Tag</button>
    <label>Cue notes<textarea data-crate-note-kind="local" data-crate-note-id="${track.id}" rows="4">${escapeHtml(track.notes || "")}</textarea></label>
    <div class="ditc-inspector-actions"><button data-source-action="analyze" data-source-id="${track.id}">Analyze</button><button data-source-action="smartmix" data-source-id="${track.id}">Add to Smart Mix</button><button data-source-action="favorite" data-source-id="${track.id}">${track.favorite ? "Unfavorite" : "Favorite"}</button><button data-source-action="delete" data-source-id="${track.id}">Delete</button></div>`;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown size";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function exportDitcTrackList() {
  const rows = sourceFiles.map((track) => ({
    title: track.title,
    artist: track.artist,
    album: track.album,
    fileName: track.name,
    folder: track.folderPath,
    duration: track.analysis?.duration || track.buffer?.duration || null,
    bpm: track.analysis?.bpm || null,
    key: track.analysis?.key || null,
    genre: track.analysis?.genre || null,
    energy: track.analysis?.energy || null,
    favorite: track.favorite,
    tags: track.tags || [],
    notes: track.notes || ""
  }));
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "deckforge-ditc-track-list.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSourceStatus(`Exported ${rows.length} DITC track${rows.length === 1 ? "" : "s"}.`);
}

function renderDitcDiagnostics() {
  const details = document.querySelector("#ditcDiagnostics");
  if (details) details.hidden = !DECKFORGE_DEVELOPMENT;
  const output = document.querySelector("#ditcDiagnosticsOutput");
  if (output && DECKFORGE_DEVELOPMENT) output.textContent = JSON.stringify({ totalTrackCount: sourceFiles.length + JSON.parse(localStorage.getItem("deckforge-sources") || "[]").length, playableTrackCount: sourceFiles.length, selectedTrack: ditcState.selectedTrackId, activePreview: ditcState.previewTrackId, objectUrlCount: 0, currentFilter: ditcState.filter, currentSort: ditcState.sort, currentSearch: ditcState.search, dragTarget: ditcState.dragTarget, lastImportResult: ditcState.lastImportResult, lastError: ditcState.lastError }, null, 2);
}

function updateSmartMixSourceOptions() {
  const select = document.querySelector("#smartMixSource");
  if (!select) return;
  const deckCount = ["a", "b"].filter((id) => deckState[id].buffer).length;
  const crateCount = sourceFiles.length;
  const config = {
    both: { label: "Decks + DITC Local", count: deckCount + crateCount },
    decks: { label: "Loaded Decks", count: deckCount },
    crate: { label: crateSelection.local.size ? "DITC Selected Local" : "DITC All Local Tracks", count: crateSelection.local.size || crateCount }
  };
  [...select.options].forEach((option) => {
    const item = config[option.value];
    if (!item) return;
    option.textContent = `${item.label} (${item.count})`;
    option.disabled = item.count === 0;
  });
  if (select.selectedOptions[0]?.disabled) {
    const firstAvailable = [...select.options].find((option) => !option.disabled);
    if (firstAvailable) select.value = firstAvailable.value;
  }
}

function detectPlatform(url) {
  const host = new URL(url).hostname;
  if (host.includes("youtube")) return "YouTube";
  if (host.includes("youtu.be")) return "YouTube";
  if (host.includes("soundcloud")) return "SoundCloud";
  if (host.includes("bandcamp")) return "Bandcamp";
  if (host.includes("spotify")) return "Spotify";
  if (host.includes("music.apple")) return "Apple Music";
  return "Link";
}

restorePadWorkspace();
restoreBeatForgeState();
restoreHarmonyState();
readProducerStudioStorage();
initializePlaybackRegistry();
readSmartPromptStorage();
setupEvents();
setupProducerStudioEvents();
renderPads();
renderPadEditor();
renderPadWorkspaceControls();
renderInstrumentOptions();
renderHarmonyLab();
renderPresetOptions();
if (drums.restored) renderBeatForge(); else applyDrumPreset(drums.preset);
renderSources();
renderAiContext();
initializeProjectIntelligence();
initializeRecommendationEngine();
renderProducerStudio();
renderEditor();
drawWaveform("a");
drawWaveform("b");
setDeckStatus("a", "empty");
setDeckStatus("b", "empty");
renderSmartMixPanel();
renderSmartPromptPlan();
renderSmartPromptLibrary();
renderTempoSafetyPreferences();
renderBpmRecovery();
renderGlobalTransport();
animationLoop();
