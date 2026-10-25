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

  // The ten Brainer robots, one per brain level, coloured in pairs by the brand book's level gradients.
  // cells and rtp mirror cfg.brain in Game #1 - Plane Crash/game.js: brain cells needed for each level (each path flown
  // earns stake × that step's bomb chance × 10) and the RTP locked in at take-off. Demo feature pending lab and legal review.
  BRAIN: {
    robot: n => `assets/brainer/robots/${n}.png`,
    cells: [0, 50, 150, 300, 550, 900, 1400, 2100, 3000, 4200],
    rtp: [96.5, 96.9, 97.3, 97.65, 98.0, 98.15, 98.3, 98.45, 98.6, 98.75],
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
      // Published, the game sits at /plane-crash/ next to the site; in the repo it is the sibling folder.
      src: location.pathname.includes('/Website/') ? '../Game%20%231%20-%20Plane%20Crash/index.html' : 'plane-crash/index.html',
      tagline: 'Pick one of five paths while bombs fall ahead. Bail out with the parachute to cash out.',
      about: [
        'A single-player crash game played in steps. At every step the player picks one of five paths while bombs fall on some of them. Every safe path raises the multiplier, and the next one is always shown before the pick.',
        'Bail out with the parachute at any step to lock in the multiplier. Take a bomb and the flight is over. Flights are instant: no betting windows and no waiting for other players.'
      ],
      how: [
        'Pick a difficulty and a bet in US dollars, then press Play.',
        'At each step choose one of five paths. Bombs fall on some of them; the multiplier a safe path pays is shown on the ladder.',
        'Jump with the parachute whenever you like to cash out at the current multiplier. A bomb on your path ends the flight.'
      ],
      // Mirrors cfg and LEVELS in Game #1 - Plane Crash/game.js; final once the game is certified.
      provisional: true,
      rtp: 96.5,
      rtpTop: 98.75,
      // first: the first step at brain level 5; tops: the last step at brain levels 1, 5 and 10.
      levels: [
        { name: 'Easy', steps: 24, first: 1.04, tops: [24.61, 25, 25.19] },
        { name: 'Medium', steps: 22, first: 1.11, tops: [393.87, 400, 403.06] },
        { name: 'Hard', steps: 20, first: 1.22, tops: [2461.73, 2500, 2519.13] },
        { name: 'Hardcore', steps: 15, first: 1.6, tops: [9846.93, 10000, 10076.53] }
      ],
      specs: [
        ['Type', 'Crash, single player'],
        ['RTP', '96.5% at brain level 1, 98% at brain level 5, 98.75% at brain level 10'],
        ['Brain levels', 'Ten, earned from the risk played; the RTP is fixed at take-off (demo feature)'],
        ['Difficulties', 'Easy, Medium, Hard, Hardcore'],
        ['Steps per flight', '24, 22, 20, 15'],
        ['Bet range', '$0.10 to $200'],
        ['Max win', '$10,000 per flight'],
        ['Currency', 'US dollars in the demo, local currencies per market'],
        ['Fairness', 'Provably fair, every flight can be checked in the game'],
        ['Devices', 'Mobile and desktop (HTML5)'],
        ['Languages', 'English now, Georgian in progress'],
        ['Certification', 'Not yet tested by a lab']
      ],
      demoNote: 'Demo build with play money in US dollars; the game’s final name is still being chosen. Brain levels are a demo feature pending test-lab and legal review before any real-money use.',
      levelsNote: 'The odds are the same for every player. The brain level only sets the RTP, so the same step pays a little less at brain level 1 and a little more at brain level 10.'
    }
  ]
};
