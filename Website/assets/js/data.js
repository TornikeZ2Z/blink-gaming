/* Site settings and the game catalogue. Adding a game is one entry in GAMES; brand words and legal status live in SITE.
   An empty value (email, licence) means it is not final yet, and the pages say so instead of showing a placeholder. */
window.BLINK = {
  SITE: {
    brand: 'Brainer Games',
    // The brand book's drawn wordmark (B + "Brainer"), 154x36 px until a designer redraws it as a vector with "Games".
    logo: 'assets/brainer/logo/logo-mono.png',
    minAge: 18,
    email: '',
    legal: 'Licensing in progress. The demos use play money only.'
  },

  // Mirrors cfg.brain in Game #1 - Plane Crash/game.js: 100 brain levels in ten stages of ten, each stage one of the ten
  // brand robots. Every finished flight earns the same 10 brain cells at any bet or difficulty, and brain levels never
  // change the odds or payouts: they change the Brainer's look and unlock worlds. Progress lives in localStorage
  // brainer.xp (cells) and brainer.level (1-100). Tiers colour the stages in pairs with the brand book's level gradients.
  BRAIN: {
    robot: n => `assets/brainer/robots/${n}.png`,
    levels: 100,
    stages: 10,
    perFlight: 10,
    unlocks: [{ at: 20, name: 'Cloud sea' }, { at: 40, name: 'City at dusk' }],
    tiers: [
      { label: 'Levels 1–20', css: 'var(--l2)' },
      { label: 'Levels 21–40', css: 'var(--l3)' },
      { label: 'Levels 41–60', css: 'var(--l4)' },
      { label: 'Levels 61–80', css: 'var(--l5)' },
      { label: 'Levels 81–100', css: 'var(--g1)' }
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
      // Published, the game sits at /plane-crash/ next to the site; in the repo it is the sibling folder.
      src: location.pathname.includes('/Website/') ? '../Game%20%231%20-%20Plane%20Crash/index.html' : 'plane-crash/index.html',
      tagline: 'Pick one of five paths while bombs fall ahead. Bail out with the parachute to cash out.',
      about: [
        'A single-player crash game played in steps. At every step the player picks one of five paths while bombs fall on some of them. Every safe path raises the multiplier, and the next one is always shown before the pick.',
        'Bail out with the parachute at any step to lock in the multiplier. Take a bomb and the flight is over. Flights are instant: no betting windows and no waiting for other players.',
        'The Brainer and its plane are 3D. Each flight starts parked on the road and takes off; after a jump the Brainer floats down on its parachute and lands back on the road.'
      ],
      how: [
        'Pick a difficulty and a bet in US dollars, then press Play.',
        'At each step choose one of five paths. Bombs fall on some of them; the multiplier a safe path pays is shown on the ladder.',
        'Jump with the parachute whenever you like to cash out at the current multiplier. A bomb on your path ends the flight.'
      ],
      // Mirrors cfg and LEVELS in Game #1 - Plane Crash/game.js (Chicken Road's ladder: 25 tiles hide 1, 3, 5 or 10 bombs,
      // multiplier = RTP ÷ chance of surviving, rounded down to the cent); final once the game is certified.
      provisional: true,
      rtp: 98,
      maxWin: 10000,
      levels: [
        { name: 'Easy', bombs: 1, steps: 24, first: 1.02, top: 24.5 },
        { name: 'Medium', bombs: 3, steps: 22, first: 1.11, top: 2254 },
        { name: 'Hard', bombs: 5, steps: 20, first: 1.22, top: 52067.4 },
        { name: 'Hardcore', bombs: 10, steps: 15, first: 1.63, top: 3203384.8 }
      ],
      specs: [
        ['Type', 'Crash, single player'],
        ['RTP', '98% for every player, at every brain level'],
        ['Brain levels', '100 in ten looks; the same 10 brain cells for every finished flight. They never change odds or payouts'],
        ['Difficulties', 'Easy, Medium, Hard, Hardcore: 1, 3, 5 or 10 bombs in 25 tiles'],
        ['Paths per flight', '24, 22, 20, 15'],
        ['Bet range', '$0.10 to $200'],
        ['Max win', '$10,000 per flight, which caps every payout'],
        ['Currency', 'US dollars in the demo, local currencies per market'],
        ['Fairness', 'Provably fair, every flight can be checked in the game'],
        ['Devices', 'Mobile and desktop (HTML5)'],
        ['Languages', 'English now, Georgian in progress'],
        ['Certification', 'Not yet tested by a lab']
      ],
      demoNote: 'Demo build with play money in US dollars; the game’s final name is still being chosen. Brain levels change the Brainer’s look and unlock worlds; they never change the odds or payouts.',
      levelsNote: 'The odds and payouts are the same for every player at every brain level. Whatever the multiplier, a single flight pays at most the $10,000 max win.'
    }
  ]
};
