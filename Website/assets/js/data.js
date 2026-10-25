/* Site settings and the game catalogue. Adding a game is one entry in GAMES; brand words and legal placeholders live in SITE.
   Values in [brackets] are placeholders until the company, licence and contact details are final. */
window.BLINK = {
  SITE: {
    brand: 'Brainer Games',
    // The brand book's drawn wordmark (B + "Brainer"), 154x36 px until a designer redraws it as a vector with "Games".
    logo: 'assets/brainer/logo/logo-mono.png',
    minAge: 18,
    email: '[partners@domain]',
    linkedin: '[LinkedIn page]',
    operator: '[Company name]',
    regulator: '[Licensing authority]',
    licence: '[Licence no.]',
    lab: '[Testing lab]'
  },

  // The ten Brainer robots, one per brain level, coloured in pairs by the brand book's level gradients.
  // cells and boost mirror cfg.brain in Game #1 - Plane Crash/game.js: brain cells needed for each level (one per path
  // flown) and the extra on every multiplier, locked in at take-off. The boost is a demo feature pending lab and legal review.
  BRAIN: {
    robot: n => `assets/brainer/robots/${n}.png`,
    cells: [0, 10, 25, 45, 70, 100, 140, 190, 250, 320],
    boost: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1],
    tiers: [
      { label: 'Brain levels 1–2', css: 'var(--l2)' },
      { label: 'Brain levels 3–4', css: 'var(--l3)' },
      { label: 'Brain levels 5–6', css: 'var(--l4)' },
      { label: 'Brain levels 7–8', css: 'var(--l5)' },
      { label: 'Brain levels 9–10', css: 'var(--g1)' }
    ]
  },

  GAMES: [
    {
      id: 'plane-crash',
      title: 'Plane Crash',
      workingTitle: true,
      status: 'demo',
      genre: 'Crash',
      badge: 'Game #1',
      color: '#2E8BD8',
      art: 'assets/games/plane-crash.svg',
      src: '../Game%20%231%20-%20Plane%20Crash/index.html',
      tagline: 'Pick one of five paths while bombs fall ahead. Bail out with the parachute to cash out.',
      about: [
        'A single-player crash game played in steps. At every step the player picks one of five paths, each showing the multiplier it pays, while bombs fall on some of them.',
        'Bail out with the parachute at any step to lock in the multiplier. Take a bomb and the flight is over. Sessions are instant: no betting windows and no waiting for other players.'
      ],
      how: [
        'Pick a risk level and a stake, then take off.',
        'At each step choose one of five paths. Every path shows its multiplier; bombs are falling on some of them.',
        'Jump with the parachute whenever you like to cash out at the current multiplier. A bomb hit ends the flight.'
      ],
      // Mirrors cfg and LEVELS in Game #1 - Plane Crash/game.js (rewrite of 2026-10-25); final once the game is certified.
      provisional: true,
      rtp: 98,
      rtpTop: 98.98,
      levels: [
        { name: 'Easy', steps: 24, first: 1.02, top: 24.5 },
        { name: 'Medium', steps: 22, first: 1.11, top: 2254 },
        { name: 'Hard', steps: 20, first: 1.22, top: 52067 },
        { name: 'Hardcore', steps: 15, first: 1.6, top: 3203385 }
      ],
      specs: [
        ['Type', 'Crash, single player'],
        ['RTP', '98% at brain level 1, about 98.98% at brain level 10'],
        ['Brain-level boost', '+0% to +1% on every multiplier, set at take-off (demo feature)'],
        ['Risk levels', 'Easy, Medium, Hard, Hardcore'],
        ['Steps per flight', '24, 22, 20, 15'],
        ['Bet range', '0.10 to 200'],
        ['Max win', '10,000 per flight'],
        ['Fairness', 'Provably fair, every round'],
        ['Devices', 'Mobile and desktop (HTML5)'],
        ['Languages', 'English and Georgian, more per market'],
        ['Certification', 'With [Testing lab], pending']
      ],
      demoNote: 'Demo build with play money; the game’s final name is still being chosen. The brain-level boost is a demo feature pending test-lab and legal review before any real-money use.',
      levelsNote: 'The multipliers below are at brain level 1. Each brain level adds a little to every multiplier, up to 1% higher at brain level 10.',
      assets: [{ label: 'Lobby tile', format: 'SVG, 4:5', href: 'assets/games/plane-crash.svg' }]
    },
    {
      id: 'game-2',
      title: 'Game #2',
      status: 'soon',
      genre: 'In development',
      badge: 'Next',
      color: '#FFC23D',
      tagline: 'Our second game is on the drawing board, starring the same Brainer.'
    }
  ]
};
