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

  async init() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.destination = this.context.createMediaStreamDestination();
      this.masterAnalyser = this.context.createAnalyser();
      this.masterAnalyser.fftSize = 256;
      this.masterAnalyser.connect(this.context.destination);
      this.masterAnalyser.connect(this.destination);
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
  selected: 0
};

const sourceFiles = [];
const droppedFilePaths = new WeakMap();
const supportedAudioExtensions = [".mp3", ".wav", ".wave", ".aif", ".aiff", ".flac", ".m4a", ".aac", ".alac"];
const supportedImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

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
  handoffArmed: false
};

const drums = {
  playing: false,
  step: 0,
  timer: null,
  rows: ["Kick", "Snare", "Hat", "Clap", "Sub"],
  preset: "boomBapCuts",
  machine: "analog808",
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
  ]
};

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
  activeVoices: [],
  keyboard: [
    { label: "C", key: "A", offset: 0 },
    { label: "D", key: "S", offset: 2 },
    { label: "Eb", key: "D", offset: 3, black: true },
    { label: "F", key: "F", offset: 5 },
    { label: "G", key: "G", offset: 7 },
    { label: "Ab", key: "H", offset: 8, black: true },
    { label: "Bb", key: "J", offset: 10, black: true },
    { label: "C", key: "K", offset: 12 }
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
    minor7: [0, 3, 7, 10],
    major7: [0, 4, 7, 11],
    ninth: [0, 3, 7, 10, 14],
    sus: [0, 5, 7, 10],
    stab: [0, 7, 12],
    octave: [0, 12]
  }
};

function createDeckState(id) {
  return {
    id,
    buffer: null,
    source: null,
    startedAt: 0,
    offset: 0,
    playing: false,
    loop: false,
    scratchWasPlaying: false,
    lastScratchX: 0,
    selectionStart: null,
    selectionEnd: null,
    dragSelectStart: null,
    dragSelectMoved: false,
    gain: null,
    filter: null,
    crossGain: null
  };
}

function connectDeck(deck) {
  const ctx = AudioEngine.context;
  if (deck.gain) return;
  deck.filter = ctx.createBiquadFilter();
  deck.filter.type = "lowpass";
  deck.filter.frequency.value = 16000;
  deck.gain = ctx.createGain();
  updateDeckGain(deck.id);
  deck.crossGain = ctx.createGain();
  deck.crossGain.gain.value = 0.5;
  deck.filter.connect(deck.gain);
  deck.gain.connect(deck.crossGain);
  deck.crossGain.connect(AudioEngine.masterAnalyser);
}

function makeSource(deck) {
  const ctx = AudioEngine.context;
  const source = ctx.createBufferSource();
  source.buffer = deck.buffer;
  source.playbackRate.value = Number(document.querySelector(`#pitch-${deck.id}`).value);
  source.loop = deck.loop;
  source.connect(deck.filter);
  source.onended = () => {
    if (!source.loop && deck.source === source) {
      deck.playing = false;
      deck.offset = 0;
      setDeckPlaying(deck.id, false);
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
  pauseDeck(id);
  deck.buffer = await loadAudioFile(file);
  deck.offset = 0;
  deck.selectionStart = null;
  deck.selectionEnd = null;
  document.querySelector(`#title-${id}`).textContent = file.name;
  connectDeck(deck);
  drawWaveform(id);
  updateDeckTimeDisplay(id);
  updateSelectionDisplay(id);
  renderEditorSourceBin();
  renderAiContext();
}

function loadBufferToDeck(buffer, name, id) {
  const deck = deckState[id];
  pauseDeck(id);
  deck.buffer = buffer;
  deck.offset = 0;
  deck.selectionStart = null;
  deck.selectionEnd = null;
  document.querySelector(`#title-${id}`).textContent = name;
  connectDeck(deck);
  drawWaveform(id);
  updateDeckTimeDisplay(id);
  updateSelectionDisplay(id);
  renderEditorSourceBin();
  renderAiContext();
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
  sampler.selected = index;
  renderPads();
  renderPadEditor();
  renderEditorSourceBin();
}

function playDeck(id) {
  const deck = deckState[id];
  if (!deck.buffer) return;
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
}

function currentDeckTime(id) {
  const deck = deckState[id];
  if (!deck.buffer) return 0;
  if (!deck.playing) return deck.offset;
  return (AudioEngine.context.currentTime - deck.startedAt) % deck.buffer.duration;
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
  if (!deck.playing) return;
  deck.offset = (AudioEngine.context.currentTime - deck.startedAt) % deck.buffer.duration;
  stopDeckSource(deck);
  deck.playing = false;
  setDeckPlaying(id, false);
}

function stopDeck(id) {
  const deck = deckState[id];
  stopDeckSource(deck);
  deck.playing = false;
  deck.offset = 0;
  setDeckPlaying(id, false);
  drawPlayhead(id, 0);
  updateDeckTimeDisplay(id);
}

function clearDeck(id) {
  const deck = deckState[id];
  stopDeck(id);
  deck.buffer = null;
  deck.offset = 0;
  deck.selectionStart = null;
  deck.selectionEnd = null;
  document.querySelector(`#title-${id}`).textContent = "Empty deck";
  updateDeckTimeDisplay(id);
  updateSelectionDisplay(id);
  drawWaveform(id);
  renderAiContext();
}

function cueDeck(id) {
  const deck = deckState[id];
  deck.offset = 0;
  if (deck.playing) playDeck(id);
  drawPlayhead(id, 0);
  updateDeckTimeDisplay(id);
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

function drawWaveform(id) {
  const deck = deckState[id];
  const canvas = document.querySelector(`#wave-${id}`);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0d1014";
  ctx.fillRect(0, 0, width, height);
  if (!deck.buffer) return;

  const data = deck.buffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(data.length / width));
  ctx.strokeStyle = id === "a" ? "#26d6c7" : "#ff3f6e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < width; x += 1) {
    let min = 1;
    let max = -1;
    const start = x * samplesPerPixel;
    for (let i = 0; i < samplesPerPixel; i += 1) {
      const sample = data[start + i] || 0;
      min = Math.min(min, sample);
      max = Math.max(max, sample);
    }
    ctx.moveTo(x, (1 + min) * height * 0.5);
    ctx.lineTo(x, (1 + max) * height * 0.5);
  }
  ctx.stroke();
  drawSelectionOverlay(id, ctx, width, height);
}

function drawPlayhead(id, ratio) {
  const canvas = document.querySelector(`#wave-${id}`);
  const ctx = canvas.getContext("2d");
  drawWaveform(id);
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
    }
  }
  animateMeters();
  monitorSmartMixHandoff();
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
    const mode = sampler.modes[index] === "loop" ? "Loop" : "Trigger";
    button.innerHTML = `<strong>${index + 1}. ${name}</strong><small>${buffer ? `${isPlaying ? "Playing" : mode} - ${formatTime(region.start)}-${formatTime(region.end)}` : "Empty pad"}</small>`;
    button.addEventListener("click", () => {
      selectPad(index);
      triggerPad(index);
    });
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
}

function triggerPad(index) {
  const buffer = sampler.buffers[index];
  if (!buffer || !AudioEngine.context) return;
  stopPad(index);
  const ctx = AudioEngine.context;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const region = getPadRegion(index);
  const startAt = nextPadTriggerTime();
  recordEditorPerformanceEvent({
    kind: "pad",
    padIndex: index,
    name: sampler.names[index],
    regionStart: region.start,
    regionEnd: region.end,
    duration: region.end - region.start,
    loop: sampler.modes[index] === "loop",
    velocity: 0.9
  });
  source.buffer = buffer;
  source.loop = sampler.modes[index] === "loop";
  if (source.loop) {
    source.loopStart = region.start;
    source.loopEnd = region.end;
  }
  gain.gain.value = 0.9;
  source.connect(gain);
  gain.connect(AudioEngine.masterAnalyser);
  sampler.active[index] = { source, gain };
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
}

function stopPad(index) {
  const active = sampler.active[index];
  if (!active) return;
  sampler.active[index] = null;
  active.source.onended = null;
  try {
    active.source.stop();
  } catch {
    /* Pad may already have ended. */
  }
  renderPads();
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

function deletePad(index) {
  stopPad(index);
  sampler.buffers[index] = null;
  sampler.names[index] = `Pad ${index + 1}`;
  sampler.starts[index] = 0;
  sampler.ends[index] = null;
  sampler.modes[index] = "trigger";
  renderPads();
  renderPadEditor();
  renderAiContext();
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
    meta.textContent = "Empty pad. Load a sample or send a deck/crate clip here.";
    start.value = 0;
    end.value = 1000;
    mode.value = "trigger";
    quantize.value = sampler.quantize;
    drawPadWaveform();
    return;
  }
  const region = getPadRegion(index);
  meta.textContent = `${formatTime(buffer.duration)} source / region ${formatTime(region.start)} - ${formatTime(region.end)} / ${sampler.modes[index] === "loop" ? "Loop" : "Trigger"}`;
  start.value = Math.round((region.start / buffer.duration) * 1000);
  end.value = Math.round((region.end / buffer.duration) * 1000);
  mode.value = sampler.modes[index];
  quantize.value = sampler.quantize;
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
}

function updatePadQuantize(value) {
  sampler.quantize = value;
  renderPadEditor();
  setPadEditorStatus(value === "off" ? "Pad quantize off. Pads trigger immediately." : `Pads trigger on the next ${value}.`);
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
    ? createDrumPatternEvents(source.duration || editorSecondsPerBar() * 4)
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
}

function duplicateSelectedEditorClip() {
  const clip = selectedEditorClip();
  if (!clip) return;
  const duplicate = { ...clip, id: createId(), start: snapEditorTime(clip.start + clip.duration), name: `${clip.name} copy`, events: clip.events ? clip.events.map((event) => ({ ...event })) : undefined };
  editorState.clips.push(duplicate);
  editorState.selectedClipId = duplicate.id;
  renderEditor();
}

function deleteSelectedEditorClip() {
  if (!editorState.selectedClipId) return;
  editorState.clips = editorState.clips.filter((clip) => clip.id !== editorState.selectedClipId);
  editorState.selectedClipId = null;
  renderEditor();
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
}

function stopEditorArrangement() {
  editorState.scheduled.forEach((item) => {
    try {
      item.source.stop();
    } catch {
      /* Clip may have already stopped. */
    }
  });
  editorState.scheduled = [];
  editorState.playing = false;
  const play = document.querySelector("#editorPlay");
  if (play) play.textContent = "Play";
}

function addEditorTrack() {
  const index = editorState.tracks.length + 1;
  editorState.tracks.push({ id: createId(), name: `Arrangement Track ${index}`, role: "Layer" });
  renderEditor();
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

function createDrumPatternEvents(duration) {
  const bpm = Number(document.querySelector("#globalBpm")?.value) || 124;
  const stepSeconds = 60 / bpm / 4;
  const patternLength = stepSeconds * 16;
  const events = [];
  for (let base = 0; base < duration; base += patternLength) {
    drums.rows.forEach((row, rowIndex) => {
      drums.pattern[rowIndex].forEach((enabled, step) => {
        if (!enabled) return;
        const time = base + step * stepSeconds;
        if (time >= duration) return;
        const tone = row === "Kick" ? drums.kit.kick : row === "Sub" ? drums.kit.sub : row === "Hat" ? drums.kit.hat : row === "Clap" ? drums.kit.clap : drums.kit.snare;
        events.push({
          kind: "drum",
          name: row,
          time,
          velocity: 1,
          duration: tone.decay || 0.12,
          kit: drums.machine,
          preset: drums.preset
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

function generateAiPlan() {
  const prompt = document.querySelector("#aiPrompt").value.trim();
  if (!prompt) return;
  const context = collectAiContext();
  aiPlanState = buildLocalAiPlan(prompt, context);
  renderAiPlan(aiPlanState);
  document.querySelector("#applyAiPlan").disabled = false;
  document.querySelector("#startAiMix").disabled = !(aiPlanState.tags.mixtape || aiPlanState.tags.liveSet);
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

async function applyAiPlan() {
  if (!aiPlanState) return;
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

async function startAiMix(mode = document.querySelector("#smartMixMode")?.value || "club") {
  await startSmartMix(mode, document.querySelector("#smartMixSource")?.value || "both");
}

async function startSmartMix(mode = "club", sourceMode = "both") {
  setSmartMixStatus(`Analyzing ${smartMixSourceLabel(sourceMode).toLowerCase()}...`);
  const items = await collectAutoMixItems(mode, sourceMode);
  if (!items.length) {
    setSmartMixStatus(`Smart Mix needs audio from ${smartMixSourceLabel(sourceMode).toLowerCase()}.`);
    return;
  }
  stopAiMix({ keepDecks: true });
  const plan = buildSmartMixPlan(items, mode, sourceMode);
  autoMixState.running = true;
  autoMixState.mode = mode;
  autoMixState.sourceMode = sourceMode;
  autoMixState.items = plan.items;
  autoMixState.plan = plan.transitions;
  autoMixState.index = 0;
  autoMixState.activeDeck = "a";
  setSmartMixButtons(true);
  setCrossfaderValue(0);
  resetSmartDeckControls("a");
  resetSmartDeckControls("b");
  loadBufferToDeck(plan.items[0].buffer, plan.items[0].name, "a");
  seekDeck("a", plan.items[0].cueIn);
  applySmartMixPitchPolicy("a", plan.items[0]);
  playDeck("a");
  prepareNextSmartMixDeck();
  setSmartMixStatus(`Smart Mix ${getSmartMixProfile(mode).name}: ${plan.summary}`);
  scheduleNextAutoMix();
  switchView("decks");
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

function scheduleNextAutoMix() {
  if (!autoMixState.running || autoMixState.items.length < 2) return;
  prepareNextSmartMixDeck();
  autoMixState.handoffArmed = true;
  const transition = autoMixState.plan[autoMixState.index] || planSmartTransition(
    autoMixState.items[autoMixState.index],
    autoMixState.items[(autoMixState.index + 1) % autoMixState.items.length],
    getSmartMixProfile(autoMixState.mode),
    Number(document.querySelector("#globalBpm").value) || 124
  );
  const currentTime = currentDeckTime(autoMixState.activeDeck);
  const delay = Math.max(1, transition.startAt - currentTime);
  setSmartMixStatus(`Smart Mix preparing: ${transition.note}. Next cue in ${formatTime(delay)}.`);
  const timer = setTimeout(() => transitionToNextAutoMixItem(), delay * 1000);
  autoMixState.timers.push(timer);
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
  loadBufferToDeck(next.buffer, next.name, nextDeck);
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
  return { deck: nextDeck, index: nextIndex };
}

function transitionToNextAutoMixItem() {
  if (!autoMixState.running || autoMixState.transition || !autoMixState.handoffArmed) return;
  autoMixState.handoffArmed = false;
  const nextIndex = (autoMixState.index + 1) % autoMixState.items.length;
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
  setSmartMixStatus(`Smart Mix handoff: Deck ${fromDeck.toUpperCase()} to Deck ${nextDeck.toUpperCase()} with ${transition.style.replace(/-/g, " ")}. Returning Deck ${nextDeck.toUpperCase()} to original BPM after the blend.`);
  performSmartTransition(fromDeck, nextDeck, transition, () => {
    stopDeck(fromDeck);
    resetSmartDeckControls(fromDeck);
    resetSmartDeckControls(nextDeck);
    rampDeckPitchToNatural(nextDeck, transition.tempoRestoreSeconds);
    autoMixState.index = nextIndex;
    autoMixState.activeDeck = nextDeck;
    autoMixState.preparedDeck = null;
    autoMixState.preparedIndex = null;
    autoMixState.transition = null;
    prepareNextSmartMixDeck();
    scheduleNextAutoMix();
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
  autoMixState.running = false;
  autoMixState.timers.forEach((timer) => {
    clearTimeout(timer);
    cancelAnimationFrame(timer);
  });
  autoMixState.timers = [];
  autoMixState.transition = null;
  autoMixState.handoffArmed = false;
  autoMixState.preparedDeck = null;
  autoMixState.preparedIndex = null;
  if (!options.keepDecks) {
    stopDeck("a");
    stopDeck("b");
  }
  resetSmartDeckControls("a");
  resetSmartDeckControls("b");
  setSmartMixButtons(false);
  setSmartMixStatus("Smart Mix stopped. Manual deck control restored.");
}

function panicStopAllAudio() {
  stopAiMix();
  stopDeck("a");
  stopDeck("b");
  stopAllPads();
  stopDrums();
  stopAllInstrumentVoices();
  stopStemPreview();
  stopEditorArrangement();
  if (editorState.recording) stopEditorPerformanceRecording();
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
    button.className = `key-button${note.black ? " is-black" : ""}`;
    button.innerHTML = `<strong>${note.label}</strong><small>${note.key}</small>`;
    button.addEventListener("pointerdown", () => playInstrumentNote(note.offset, false, button));
    keyboard.appendChild(button);
  });

  instrument.bass.forEach((note) => {
    const button = document.createElement("button");
    button.className = "bass-button";
    button.innerHTML = `<strong>${note.label}</strong><small>Bass</small>`;
    button.addEventListener("pointerdown", () => playInstrumentNote(note.offset, true, button));
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

async function playInstrumentNote(offset, forceBass = false, button = null, duration = 0.7) {
  await AudioEngine.init();
  const preset = getInstrumentPreset();
  const isBass = forceBass || instrument.bassMode;
  const midi = preset.root + offset + (isBass ? -12 : 12);
  const frequency = midiToFrequency(midi);
  recordEditorPerformanceEvent({ kind: "key", midi, isBass, duration, presetId: preset.id, machineId: instrument.machine, velocity: isBass ? 0.95 : 0.82 });
  playSynthVoice(frequency, preset, isBass, duration);
  flashInstrumentButton(button);
}

async function playInstrumentChord(type) {
  await AudioEngine.init();
  const preset = getInstrumentPreset();
  const chord = instrument.chords[type] || instrument.chords.minor7;
  const rootOffset = instrument.bassMode ? -12 : 0;
  chord.forEach((offset, index) => {
    const midi = preset.root + rootOffset + offset + 12;
    const frequency = midiToFrequency(midi);
    recordEditorPerformanceEvent({ kind: "key", midi, isBass: false, duration: type === "stab" ? 0.22 : 0.95, presetId: preset.id, machineId: instrument.machine, velocity: 0.74, chord: type });
    playSynthVoice(frequency, preset, false, type === "stab" ? 0.22 : 0.95, index * 0.006);
  });
  const button = document.querySelector(`[data-chord="${type}"]`);
  flashInstrumentButton(button);
}

function playSynthVoice(frequency, preset, isBass, duration, delay = 0, velocityScale = 1) {
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
  filter.frequency.setValueAtTime(isBass ? Math.min(900, preset.filter * machine.filterBoost) : preset.filter * machine.filterBoost, now);
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
  const voice = { oscA, oscB, subOsc, output };
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
}

function stopAllInstrumentVoices() {
  const voices = [...instrument.activeVoices];
  instrument.activeVoices = [];
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
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function flashInstrumentButton(button) {
  if (!button) return;
  button.classList.add("is-active");
  setTimeout(() => button.classList.remove("is-active"), 150);
}

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

function playBufferPreview(buffer) {
  if (!AudioEngine.context) return;
  stopStemPreview();
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
  };
  source.start();
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

function renderSequencer() {
  const sequencer = document.querySelector("#sequencer");
  sequencer.innerHTML = "";
  drums.rows.forEach((row, rowIndex) => {
    const rowEl = document.createElement("div");
    rowEl.className = "seq-row";
    const label = document.createElement("div");
    label.className = "seq-label";
    label.textContent = row;
    rowEl.appendChild(label);
    for (let step = 0; step < 16; step += 1) {
      const button = document.createElement("button");
      button.className = `step${drums.pattern[rowIndex][step] ? " is-on" : ""}`;
      button.ariaLabel = `${row} step ${step + 1}`;
      button.addEventListener("click", () => {
        drums.pattern[rowIndex][step] = drums.pattern[rowIndex][step] ? 0 : 1;
        button.classList.toggle("is-on", Boolean(drums.pattern[rowIndex][step]));
      });
      rowEl.appendChild(button);
    }
    sequencer.appendChild(rowEl);
  });
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
  drums.pattern = (machine.pattern || preset.pattern).map((row) => [...row]);
  drums.kit = {
    ...preset.kit,
    ...machine.kit,
    swing: Math.max(machine.kit.swing || 0, preset.swing)
  };
  drums.step = 0;
  document.querySelector("#globalBpm").value = preset.bpm;
  document.querySelector("#drumPreset").value = preset.id;
  updatePresetNotes();
  renderSequencer();
  if (drums.playing) {
    stopDrums();
    startDrums();
  }
}

function startDrums() {
  drums.playing = true;
  document.querySelector("#drumPlay").textContent = "Stop Drums";
  tickDrums();
}

function stopDrums() {
  drums.playing = false;
  clearTimeout(drums.timer);
  drums.timer = null;
  document.querySelector("#drumPlay").textContent = "Start Drums";
  document.querySelectorAll(".step").forEach((step) => step.classList.remove("is-current"));
}

function tickDrums() {
  if (!drums.playing) return;
  document.querySelectorAll(".step").forEach((step) => step.classList.remove("is-current"));
  drums.rows.forEach((row, rowIndex) => {
    const cell = document.querySelector(`.seq-row:nth-child(${rowIndex + 1}) .step:nth-child(${drums.step + 2})`);
    if (cell) cell.classList.add("is-current");
    if (drums.pattern[rowIndex][drums.step]) playDrum(row);
  });
  drums.step = (drums.step + 1) % 16;
  const bpm = Number(document.querySelector("#globalBpm").value) || 124;
  const baseInterval = (60 / bpm / 4) * 1000;
  const swingOffset = drums.step % 2 === 0 ? drums.kit.swing * baseInterval : -drums.kit.swing * baseInterval;
  drums.timer = setTimeout(tickDrums, Math.max(30, baseInterval + swingOffset));
}

function playDrum(name) {
  if (!AudioEngine.context) return;
  const kit = drums.kit;
  const tone = name === "Kick" ? kit.kick : name === "Sub" ? kit.sub : name === "Hat" ? kit.hat : name === "Clap" ? kit.clap : kit.snare;
  recordEditorPerformanceEvent({ kind: "drum", name, velocity: 1, duration: tone.decay || 0.12, kit: drums.machine, preset: drums.preset });
  playDrumVoice(name, AudioEngine.context.currentTime, 1);
}

function playDrumVoice(name, when, velocityScale = 1) {
  if (!AudioEngine.context) return;
  const ctx = AudioEngine.context;
  const gain = ctx.createGain();
  gain.connect(AudioEngine.masterAnalyser);
  const kit = drums.kit;

  if (name === "Kick" || name === "Sub") {
    const tone = name === "Kick" ? kit.kick : kit.sub;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(tone.start, when);
    osc.frequency.exponentialRampToValueAtTime(tone.end, when + tone.decay * 0.85);
    gain.gain.setValueAtTime(tone.gain * velocityScale, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + tone.decay);
    osc.connect(gain);
    osc.start(when);
    osc.stop(when + tone.decay + 0.02);
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
  gain.gain.setValueAtTime(tone.gain * velocityScale, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + tone.decay);
  noise.connect(filter);
  filter.connect(gain);
  noise.start(when);
  noise.stop(when + Math.max(0.05, tone.decay + 0.04));
}

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
  };
  AudioEngine.recorder.start();
  recordButton.textContent = "■";
}

function switchView(target) {
  document.querySelectorAll(".tab-button, .view").forEach((el) => el.classList.remove("is-active"));
  const button = document.querySelector(`.tab-button[data-target="${target}"]`);
  const view = document.querySelector(`#${target}`);
  if (button) button.classList.add("is-active");
  if (view) view.classList.add("is-active");
  if (target === "ai") renderAiContext();
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
  });
  element.addEventListener("dragleave", () => {
    element.classList.remove("is-drop-target");
  });
  element.addEventListener("drop", async (event) => {
    event.preventDefault();
    element.classList.remove("is-drop-target");
    const files = await collectSupportedDropFiles(event.dataTransfer);
    if (element.id === "sourceDrop" && files.length) {
      files.forEach((file) => addLocalSourceFile(file, { folderPath: fileFolderPath(file), silent: true }));
      setSourceStatus(`Added ${files.length} audio file${files.length === 1 ? "" : "s"} from dropped folder/files to the crate.`);
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
    await AudioEngine.init();
    document.querySelector("#audioEnable").textContent = "Audio On";
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.target);
    });
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
  document.querySelector("#editorStop").addEventListener("click", stopEditorArrangement);
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
    if (!autoMixState.running) {
      setSmartMixStatus(`${getSmartMixProfile(event.target.value).name} selected. Press Smart Mix to analyze and start.`);
    }
  });
  document.querySelector("#smartMixSource").addEventListener("change", (event) => {
    if (!autoMixState.running) {
      setSmartMixStatus(`Smart Mix will use ${smartMixSourceLabel(event.target.value)} and return each incoming song to original BPM after transitions.`);
    }
  });

  for (const id of ["a", "b"]) {
    document.querySelector(`#file-${id}`).addEventListener("change", async (event) => {
      const file = event.target.files[0];
      await loadFileToDeck(file, id);
    });

    document.querySelector(`#pitch-${id}`).addEventListener("input", (event) => {
      const deck = deckState[id];
      if (deck.source) deck.source.playbackRate.value = Number(event.target.value);
    });

    document.querySelector(`#filter-${id}`).addEventListener("input", (event) => {
      if (deckState[id].filter) deckState[id].filter.frequency.value = Number(event.target.value);
      const mixerFilter = document.querySelector(`#mixer-filter-${id}`);
      if (mixerFilter) mixerFilter.value = event.target.value;
    });

    document.querySelector(`#gain-${id}`).addEventListener("input", (event) => {
      const mixerTrim = document.querySelector(`#mixer-trim-${id}`);
      if (mixerTrim) mixerTrim.value = event.target.value;
      updateDeckGain(id);
    });
  }

  document.querySelectorAll("[data-sync-gain]").forEach((slider) => {
    slider.addEventListener("input", (event) => {
      const id = event.target.dataset.syncGain;
      document.querySelector(`#gain-${id}`).value = event.target.value;
      updateDeckGain(id);
    });
  });

  document.querySelectorAll("[data-sync-filter]").forEach((slider) => {
    slider.addEventListener("input", (event) => {
      const id = event.target.dataset.syncFilter;
      document.querySelector(`#filter-${id}`).value = event.target.value;
      if (deckState[id].filter) deckState[id].filter.frequency.value = Number(event.target.value);
    });
  });

  document.querySelectorAll("[data-channel-fader]").forEach((slider) => {
    slider.addEventListener("input", (event) => updateDeckGain(event.target.dataset.channelFader));
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
    button.addEventListener("click", () => {
      const id = button.dataset.deck;
      const action = button.dataset.action;
      if (autoMixState.running && ["play", "stop", "cue", "rewind", "forward", "loop", "clear-deck"].includes(action)) {
        stopAiMix({ keepDecks: true });
      }
      if (action === "play") deckState[id].playing ? pauseDeck(id) : playDeck(id);
      if (action === "stop") stopDeck(id);
      if (action === "clear-deck") clearDeck(id);
      if (action === "cue") cueDeck(id);
      if (action === "rewind") nudgeDeck(id, -15);
      if (action === "forward") nudgeDeck(id, 15);
      if (action === "loop") {
        deckState[id].loop = !deckState[id].loop;
        button.classList.toggle("is-active", deckState[id].loop);
        if (deckState[id].source) deckState[id].source.loop = deckState[id].loop;
      }
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
      seekDeck(id, (Number(event.target.value) / 1000) * deck.buffer.duration);
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
    slider.addEventListener("input", (event) => setCrossfaderValue(event.target.value));
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
  document.querySelector("#drumMachine").addEventListener("change", () => {
    updatePresetNotes();
    applyDrumPreset(document.querySelector("#drumPreset").value);
  });
  document.querySelector("#drumPreset").addEventListener("change", updatePresetNotes);
  document.querySelector("#applyPreset").addEventListener("click", () => {
    applyDrumPreset(document.querySelector("#drumPreset").value);
  });
  document.querySelector("#synthMachine").addEventListener("change", (event) => {
    instrument.machine = event.target.value;
    updateInstrumentNotes();
  });
  document.querySelector("#instrumentPreset").addEventListener("change", (event) => {
    instrument.preset = event.target.value;
    updateInstrumentNotes();
  });
  document.querySelector("#bassMode").addEventListener("click", () => {
    setBassMode(!instrument.bassMode);
  });
  document.querySelectorAll("[data-chord]").forEach((button) => {
    button.addEventListener("click", () => playInstrumentChord(button.dataset.chord));
  });
  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.target.matches("input, select, textarea")) return;
    if (event.code === "Space") {
      event.preventDefault();
      panicStopAllAudio();
      return;
    }
    const note = instrument.keyboard.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
    if (!note) return;
    event.preventDefault();
    const button = [...document.querySelectorAll(".key-button")][instrument.keyboard.indexOf(note)];
    playInstrumentNote(note.offset, false, button);
  });
  document.querySelector("#drumPlay").addEventListener("click", async () => {
    await AudioEngine.init();
    drums.playing ? stopDrums() : startDrums();
  });
  document.querySelector("#drumClear").addEventListener("click", () => {
    drums.pattern = drums.pattern.map((row) => row.map(() => 0));
    renderSequencer();
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
  });
  document.querySelector("#sourceList").addEventListener("input", (event) => {
    const notes = event.target.closest("[data-crate-note-kind]");
    if (!notes) return;
    saveCrateNotes(notes.dataset.crateNoteKind, notes.dataset.crateNoteId, notes.value);
  });
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

function addLocalSourceFile(file, options = {}) {
  if (!isSupportedAudioFile(file)) return;
  sourceFiles.unshift({
    id: createId(),
    name: file.name,
    folderPath: options.folderPath || fileFolderPath(file),
    file,
    buffer: options.buffer || null,
    analysis: options.analysis || null,
    notes: options.notes || ""
  });
  if (!options.silent) {
    setSourceStatus(`Added ${file.name} to the crate.`);
    renderSources();
    renderEditorSourceBin();
    renderAiContext();
  }
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
        if (source) source.analysis = analysis;
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
  if (action === "delete") {
    deleteLocalSourceFile(id);
    return;
  }
  setSourceStatus(`Loading ${item.name}...`);
  const buffer = await getSourceFileBuffer(id);
  if (!buffer) return;
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
    stemState.file = item.file;
    stemState.sourceBuffer = buffer;
    stemState.sourceName = item.name.replace(/\.[^/.]+$/, "");
    stemState.stems = [];
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
    deleteSavedSource(index);
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
  setSourceStatus(`Deleted ${removed.name} from the crate.`);
  renderSources();
  renderAiContext();
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
      .map((source) => ({ kind: "local", id: source.id, name: source.name, file: source.file, analysis: source.analysis, notes: source.notes || "" })),
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
    if (source) source.notes = value;
  } else {
    const sources = JSON.parse(localStorage.getItem("deckforge-sources") || "[]");
    if (sources[Number(id)]) {
      sources[Number(id)].notes = value;
      localStorage.setItem("deckforge-sources", JSON.stringify(sources));
    }
  }
  renderAiContext();
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
  list.innerHTML = sources.length || sourceFiles.length ? "" : "<p class=\"fine-print\">No saved sources yet.</p>";
  sourceFiles.forEach((source) => {
    const item = document.createElement("div");
    item.className = "source-item";
    const folderDetail = source.folderPath && source.folderPath !== source.name
      ? `<br><span class="fine-print">Folder: ${escapeHtml(source.folderPath)}</span>`
      : "";
    item.innerHTML = `
      <div>
        <label class="crate-select"><input type="checkbox" data-crate-kind="local" data-crate-id="${source.id}" ${crateSelection.local.has(source.id) ? "checked" : ""}> Select</label>
        <strong>${escapeHtml(source.name)}</strong><br>
        <span class="fine-print">Local audio file</span>
        ${folderDetail}
        <br><span class="fine-print">${analysisSummary(source.analysis)}</span>
        <textarea class="crate-notes" data-crate-note-kind="local" data-crate-note-id="${source.id}" rows="2" placeholder="Cue text, transcript lines, quotes, timestamps...">${escapeHtml(source.notes || "")}</textarea>
      </div>
      <div class="source-actions">
        <button data-source-action="deck-a" data-source-id="${source.id}">Deck A</button>
        <button data-source-action="deck-b" data-source-id="${source.id}">Deck B</button>
        <button data-source-action="pad" data-source-id="${source.id}">Pad</button>
        <button data-source-action="stems" data-source-id="${source.id}">Stems</button>
        <button data-source-action="delete" data-source-id="${source.id}">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
  sources.forEach((source, index) => {
    const item = document.createElement("div");
    item.className = "source-item";
    item.innerHTML = `
      <div>
        <label class="crate-select"><input type="checkbox" data-crate-kind="saved" data-crate-id="${index}" ${crateSelection.saved.has(String(index)) ? "checked" : ""}> Select</label>
        <strong>${source.name}</strong><br>
        <a href="${source.url}" target="_blank" rel="noreferrer">${source.url}</a>
        <br><span class="fine-print">${detectPlatform(source.url)}</span>
        <br><span class="fine-print">${analysisSummary(source.analysis)}</span>
        <textarea class="crate-notes" data-crate-note-kind="saved" data-crate-note-id="${index}" rows="2" placeholder="Cue text, transcript lines, quotes, timestamps...">${source.notes || ""}</textarea>
      </div>
      <div class="source-actions">
        <button data-source-action="deck-a" data-source-index="${index}">Deck A</button>
        <button data-source-action="deck-b" data-source-index="${index}">Deck B</button>
        <button data-source-action="pad" data-source-index="${index}">Pad</button>
        <button data-source-action="stems" data-source-index="${index}">Stems</button>
        <button data-source-action="delete" data-source-index="${index}">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });
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

setupEvents();
renderPads();
renderPadEditor();
renderInstrumentOptions();
renderKeyboard();
renderPresetOptions();
applyDrumPreset(drums.preset);
renderSources();
renderAiContext();
renderEditor();
drawWaveform("a");
drawWaveform("b");
animationLoop();
