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

  // Mirrors cfg.brain in both games' game.js: 100 brain levels in ten stages of ten, each stage one look of the 3D
  // Brainer (stills from the game team's Brainer 3D/renders/stages, named as in shared/brainer-showcase.js). Every finished round (a Plane Crash flight or a FogRush round) earns the same 10 brain cells at any bet or
  // difficulty, and brain levels never change the odds or payouts: they change the Brainer's look and, in Plane Crash,
  // unlock worlds. Progress lives in localStorage brainer.xp (cells) and brainer.level (1-100), shared by every game on
  // the site. Tiers colour the stages in pairs with the brand book's level gradients.
  BRAIN: {
    robot: n => `assets/brainer/robots/${n}.webp`,
    names: ['Baby', 'Toddler', 'Kid', 'School kid', 'Teen', 'Student', 'Young pro', 'Pro', 'Expert', 'Master'],
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
      round: 'flight',
      color: '#2E8BD8',
      art: 'assets/games/plane-crash.svg',
      // Published, the game sits at /plane-crash/ next to the site; in the repo it is the sibling folder.
      src: location.pathname.includes('/Website/') ? '../Game%20%231%20-%20Plane%20Crash/index.html' : 'plane-crash/index.html',
      tagline: 'Pick one of five paths while bombs fall ahead. Bail out with the parachute to cash out.',
      about: [
        'A single-player crash game played in steps. At every step the player picks one of five paths while bombs fall on some of them. Every safe path raises the multiplier, and the next one is always shown before the pick.',
        'Bail out with the parachute at any step to lock in the multiplier. Take a bomb and the flight is over. Flights are instant: no betting windows and no waiting for other players.',
        'The Brainer and its plane are 3D. Each flight starts parked on the airfield’s runway and takes off over the meadow; after a jump the Brainer floats down on its parachute and lands on the meadow’s country road.'
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
      fairness: 'Every flight is fixed before the bet: the game shows the SHA-256 hash of its server seed first and reveals the seed when the flight ends. The shield button in the game re-checks the hash and redraws every bomb of your last flight, so the player, the casino or a regulator can recompute it.',
      demoNote: 'Demo build with play money in US dollars; the game’s final name is still being chosen. Brain levels change the Brainer’s look and unlock worlds; they never change the odds or payouts.',
      levelsNote: 'The odds and payouts are the same for every player at every brain level. Whatever the multiplier, a single flight pays at most the $10,000 max win.'
    },
    {
      id: 'fogrush',
      title: 'FogRush',
      status: 'demo',
      genre: 'Mines',
      badge: 'Game #2',
      round: 'round',
      color: '#9BE06E',
      // Cropped from Marketing kit/renders/fogrush-chest.png (the game team's render), 560x700.
      art: 'assets/games/fogrush.webp',
      // Published, the game sits at /fogrush/ next to the site; in the repo it is the sibling folder.
      src: location.pathname.includes('/Website/') ? '../Game%20%232%20-%20FogRush/index.html' : 'fogrush/index.html',
      tagline: 'Walk your Brainer across a foggy valley next to the airfield. Find chests, dodge bombs and cash out any time.',
      about: [
        'A single-player instant game on a 25 × 25 map of grass plots in a valley hidden under fog, next to the airfield Plane Crash flies from. The Brainer starts in the middle and walks one plot at a time in any direction.',
        'Every new tile clears its fog. Most are plain and nudge the multiplier up, some hold a chest that multiplies it by 1.3 to 25, and 8% hide a bomb that ends the round. Tiles already cleared are safe to walk back across, so the player picks the route as well as the moment to stop.',
        'The 3D Brainer is the same one as in Plane Crash: its brain level, look and brain cells carry over between the two games.'
      ],
      how: [
        'Choose a bet in US dollars and, if you like, an auto cash-out from 1.50× to 100×. Then press Play.',
        'Walk with the arrow keys, WASD or the on-screen pad, or tap a tile next to the Brainer. Each new tile shows what was under its fog.',
        'Cash out whenever you like after your first new tile (C on a keyboard). A bomb on a new tile ends the round and the bet is lost.'
      ],
      // Mirrors cfg in Game #2 - FogRush/game.js: each new tile is a bomb with chance `bomb` (%); a safe one is plain or a
      // chest, `chance` being the share of safe tiles. Every safe new tile multiplies the multiplier by `step` and a chest
      // by its `x` as well; the round starts at 0.98×, so the RTP is 98% whatever the route or the cash-out. Final once
      // the game is certified.
      provisional: true,
      rtp: 98,
      maxWin: 10000,
      grid: 25,
      bomb: 8,
      step: 1.0211,
      chests: [
        { name: 'Small chest', x: 1.3, chance: 3 },
        { name: 'Silver chest', x: 2, chance: 1.2 },
        { name: 'Golden chest', x: 4, chance: 0.6 },
        { name: 'Royal chest', x: 10, chance: 0.15 },
        { name: 'Mythic chest', x: 25, chance: 0.05 }
      ],
      specs: [
        ['Type', 'Mines-style instant game, single player'],
        ['RTP', '98% for every player, at every brain level, whatever the route or the cash-out'],
        ['Brain levels', 'Shared with Plane Crash: the same 100 levels and the same 10 brain cells for every finished round. They never change odds or payouts'],
        ['Map', '25 × 25 grass plots under fog; the start tile in the middle is always safe'],
        ['Bomb chance', '8% on every new tile; cleared tiles are safe to cross'],
        ['Chests', 'On 5% of safe tiles: ×1.3, ×2, ×4, ×10 or ×25'],
        ['Auto cash-out', 'Off, or at 1.50× to 100×'],
        ['Bet range', '$0.10 to $200'],
        ['Max win', '$10,000 per round; the game cashes out when a round reaches it'],
        ['Currency', 'US dollars in the demo, local currencies per market'],
        ['Fairness', 'Provably fair, every round and its whole map can be checked in the game'],
        ['Devices', 'Mobile and desktop (HTML5 with WebGL)'],
        ['Languages', 'English now, Georgian in progress'],
        ['Certification', 'Not yet tested by a lab']
      ],
      fairness: 'Every round is fixed before the bet: the game shows the SHA-256 hash of its server seed first and reveals the seed when the round ends. Every tile of the map rolls from that seed, so the route cannot move a bomb. The shield button in the game re-checks the hash and draws the whole map of your last round, with your path on it.',
      demoNote: 'Demo build with play money in US dollars. Brain levels change the Brainer’s look; they never change the odds or payouts.',
      levelsNote: 'The odds and payouts are the same for every player at every brain level. Whatever the multiplier, a single round pays at most the $10,000 max win.'
    }
  ]
};
