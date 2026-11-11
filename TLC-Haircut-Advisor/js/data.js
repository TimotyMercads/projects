/* =============================================================
   data.js  |  Editable content: shop info, services, face shapes,
               hairstyle advice, and hairstyle illustrations
   -------------------------------------------------------------
   This file holds DATA, not logic. A non-programmer can edit it:
   change the text between the quotes, keep the commas and
   brackets, save, and refresh the page.

   RULE: we do NOT invent TLC Barbershop's prices, services, or
   hours. Everything marked "TO CONFIRM WITH TLC BARBERSHOP" must
   be replaced with the owner's real information.
   ============================================================= */

/* ---------- Shop details (confirmed by the client brief) ---------- */
export const SHOP = {
  name: "TLC Barbershop",
  address: "531 Jose Abad Santos St., Salapungan, Angeles City, Pampanga, 2009",
  phoneDisplay: "0960 814 6420",
  phoneLink: "tel:+639608146420",
  facebook: "https://www.facebook.com/profile.php?id=61593644030045",
  mapLink:
    "https://www.google.com/maps/search/?api=1&query=531+Jose+Abad+Santos+St%2C+Salapungan%2C+Angeles+City%2C+Pampanga+2009",
  hours: "TO CONFIRM WITH TLC BARBERSHOP",
};


/* ---------- Services ----------
   PLACEHOLDERS. These are common barbershop service TYPES, not
   TLC's confirmed menu. For each one, ask the owner:
     - Do you offer it? (if not, delete the whole { ... } block)
     - What is it called on your menu?
     - What is the price?
   Then replace `price` with the real price, e.g. "PHP 150".
   ---------------------------------------------------------------- */
const TO_CONFIRM = "TO CONFIRM WITH TLC BARBERSHOP";

export const SERVICES = {
  haircut:  { name: "Haircut",          note: "Cut and finish",                     price: TO_CONFIRM },
  fade:     { name: "Taper / fade",     note: "Clean, blended sides",               price: TO_CONFIRM },
  beard:    { name: "Beard trim",       note: "Shape and line the beard",           price: TO_CONFIRM },
  shave:    { name: "Shave",            note: "Clean shave or neck line-up",        price: TO_CONFIRM },
  wash:     { name: "Hair wash",        note: "Wash before or after the cut",       price: TO_CONFIRM },
  styling:  { name: "Styling",          note: "Product and styling for the look",   price: TO_CONFIRM },
};

/* ---------- Face shapes and hairstyle advice ----------
   Keys (oval, round, ...) must match the keys used in
   faceShape.js classifyFaceShape().

   Each hairstyle has:
     name   : a common, generic style name (not a TLC product claim)
     why    : one sentence on why it suits this face shape
     icon   : which illustration to draw (see HAIRSTYLE_ICONS below)
     photo  : null for now. LATER, with the barbershop's permission,
              put a photo of TLC's own work in assets/styles/ and
              write its path here, e.g. "assets/styles/textured-crop.jpg".
              app.js shows the photo instead of the illustration.
   services : keys from SERVICES above to suggest for this shape.

   The advice is general grooming guidance commonly used by
   barbers. It is a starting point; the barber has the final say.
   ---------------------------------------------------------------- */
export const FACE_SHAPES = {
  oval: {
    name: "Oval",
    description:
      "Balanced proportions: your face is a bit longer than it is wide, with a jaw slightly narrower than your forehead. Most haircuts suit an oval face.",
    hairstyles: [
      { name: "Classic side part", icon: "sidepart", photo: "assets/examples/oval/oval-09.jpg",
        why: "A clean, timeless look that shows off your balanced proportions." },
      { name: "Textured crop", icon: "crop", photo: "assets/examples/oval/oval-03.jpg",
        why: "Short and low-maintenance; the textured top keeps it modern." },
      { name: "Quiff", icon: "quiff", photo: "assets/examples/oval/oval-08.jpg",
        why: "Moderate height at the front works because your face isn't too long." },
      { name: "Slick back", icon: "slickback", photo: "assets/examples/oval/oval-11.jpg",
        why: "Pulling hair back highlights your even features." },
    ],
    avoid: [
      { name: "Heavy fringe covering the forehead",
        why: "It can hide the balanced proportions that make an oval face easy to style." },
    ],
    services: ["haircut", "styling", "wash"],
  },

  round: {
    name: "Round",
    description:
      "Your face is about as wide as it is long, with soft, curved lines at the jaw and cheeks.",
    hairstyles: [
      { name: "Pompadour", icon: "quiff", photo: "assets/examples/oval/oval-12.jpg",
        why: "Height on top makes the face look longer and less round." },
      { name: "Side part with fade", icon: "fade", photo: "assets/examples/round/round-09.jpg",
        why: "Short sides slim the face while the part adds a straight line." },
      { name: "Faux hawk", icon: "crop", photo: "assets/examples/round/round-06.jpg",
        why: "Volume in the center draws the eye upward." },
      { name: "Textured quiff", icon: "quiff", photo: "assets/examples/round/round-08.jpg",
        why: "Lift at the front adds length; texture adds some angles." },
    ],
    avoid: [
      { name: "Bowl cut or round fringe",
        why: "Curved lines around the face repeat its roundness." },
      { name: "Full sides with a flat top",
        why: "Width at the sides makes the face look wider." },
    ],
    services: ["haircut", "fade", "styling"],
  },

  square: {
    name: "Square",
    description:
      "A strong, wide jaw and a broad forehead, with a face that is not much longer than it is wide.",
    hairstyles: [
      { name: "Crew cut", icon: "buzz", photo: "assets/examples/square/square-02.jpg",
        why: "Short and clean; it shows off a strong jawline." },
      { name: "Textured crop", icon: "crop", photo: "assets/examples/square/square-13.jpg",
        why: "Soft texture on top balances sharp angles at the jaw." },
      { name: "Side part", icon: "sidepart", photo: "assets/examples/square/square-07.jpg",
        why: "A classic, structured style that suits angular features." },
      { name: "Slick back with taper", icon: "slickback", photo: "assets/examples/square/square-05.jpg",
        why: "Height on top and tidy sides keep the look sharp." },
    ],
    avoid: [
      { name: "Very boxy flat top",
        why: "Straight, square lines on top can exaggerate a square shape." },
    ],
    services: ["haircut", "fade", "beard"],
  },

  rectangle: {
    name: "Rectangle / Oblong",
    description:
      "Your face is noticeably longer than it is wide, with forehead, cheeks, and jaw of similar width.",
    hairstyles: [
      { name: "Side-swept fringe", icon: "fringe", photo: "assets/examples/rectangle/rectangle-12.jpg",
        why: "Hair across the forehead makes a long face look shorter." },
      { name: "Textured crop with fringe", icon: "fringe", photo: "assets/examples/rectangle/rectangle-04.jpg",
        why: "A low, textured top avoids adding extra length." },
      { name: "Classic side part, fuller sides", icon: "sidepart", photo: "assets/examples/rectangle/rectangle-11.jpg",
        why: "Some volume at the sides adds width to balance length." },
      { name: "Medium-length swept style", icon: "medium", photo: "assets/examples/rectangle/rectangle-02.jpg",
        why: "Length at the sides softens and widens the face." },
    ],
    avoid: [
      { name: "Tall pompadour or high quiff",
        why: "Height on top makes a long face look even longer." },
      { name: "Very tight skin fade with height",
        why: "Removing width at the sides stretches the face." },
    ],
    services: ["haircut", "styling", "wash"],
  },

  heart: {
    name: "Heart",
    description:
      "A wider forehead and cheekbones that narrow down to a smaller, often pointed chin.",
    hairstyles: [
      { name: "Textured fringe", icon: "fringe", photo: "assets/examples/heart/heart-11.jpg",
        why: "Covering part of the forehead balances it with the narrower chin." },
      { name: "Side-swept medium length", icon: "medium", photo: "assets/examples/heart/heart-02.jpg",
        why: "Fuller hair lower down adds width near the jaw." },
      { name: "Classic side part", icon: "sidepart", photo: "assets/examples/heart/heart-07.jpg",
        why: "A low-volume top keeps the forehead from looking wider." },
      { name: "Short crop with a beard", icon: "beard", photo: "assets/examples/square/square-12.jpg",
        why: "A beard adds width to the jaw and chin for balance." },
    ],
    avoid: [
      { name: "Big volume slicked back on top",
        why: "It exposes and widens the forehead." },
      { name: "Very short sides with a tall top",
        why: "It makes the top half look heavier than the chin." },
    ],
    services: ["haircut", "beard", "styling"],
  },

  diamond: {
    name: "Diamond",
    description:
      "Wide cheekbones with a narrower forehead and a narrower, defined chin.",
    hairstyles: [
      { name: "Textured fringe", icon: "fringe", photo: "assets/examples/diamond/diamond-07.jpg",
        why: "Adds width at the forehead to balance the cheekbones." },
      { name: "Messy textured crop", icon: "crop", photo: "assets/examples/diamond/diamond-03.jpg",
        why: "Soft volume on top and at the temples evens out the shape." },
      { name: "Side-swept medium length", icon: "medium", photo: "assets/examples/diamond/diamond-10.jpg",
        why: "Fullness near the forehead and jaw balances wide cheekbones." },
      { name: "Crop with a beard", icon: "beard", photo: "assets/examples/round/round-11.jpg",
        why: "A beard fills out a narrow chin." },
    ],
    avoid: [
      { name: "Very short buzzed sides with a tall center",
        why: "It narrows the temples and makes cheekbones look wider." },
    ],
    services: ["haircut", "beard", "styling"],
  },
};

/* ---------- Hairstyle illustrations (original SVG, app palette) ----------
   Simple drawings made for this app, so no copyright issues.
   Every icon shares the same head; only the hair shape changes.
   Colors: face = cream, hair = TLC gold, shoulders = bronze line.
   The card background (black) comes from styles.css.
   ------------------------------------------------------------------------- */
const HEAD = `
  <path d="M30 100 Q30 82 50 80 Q70 82 70 100 Z" fill="#3A332B"/>
  <rect x="44" y="72" width="12" height="12" fill="#E2B677"/>
  <ellipse cx="50" cy="52" rx="20" ry="25" fill="#F8F3EA"/>`;

const HAIR = {
  // Short textured top with a ragged front edge
  crop: `<path d="M29 48 Q28 24 50 22 Q72 24 71 48 L69 38 L64 34 L59 37 L54 33 L49 37 L44 33 L39 37 L34 34 L31 39 Z" fill="#C98A35"/>`,
  // Tall front (quiff / pompadour)
  quiff: `<path d="M29 48 Q28 30 38 24 Q44 8 62 12 Q74 18 71 48 L69 36 Q56 30 40 33 Q33 35 31 40 Z" fill="#C98A35"/>`,
  // Side part: hair swept to one side with a visible part line
  sidepart: `<path d="M29 48 Q28 24 50 22 Q72 24 71 48 L69 37 Q60 30 42 33 Q34 35 31 41 Z" fill="#C98A35"/>
             <path d="M41 23 Q40 28 42 33" stroke="#0B0A09" stroke-width="1.5" fill="none"/>`,
  // Very short all over (buzz / crew cut)
  buzz: `<path d="M30 44 Q30 25 50 25 Q70 25 70 44 Q60 33 50 33 Q40 33 30 44 Z" fill="#C98A35"/>`,
  // Hair covering the forehead (fringe)
  fringe: `<path d="M28 52 Q26 22 50 21 Q74 22 72 52 L70 42 L65 45 L60 41 L55 45 L50 41 L45 45 L40 41 L35 45 L30 42 Z" fill="#C98A35"/>`,
  // Hair combed straight back with comb lines
  slickback: `<path d="M29 46 Q28 22 50 21 Q72 22 71 46 L69 35 Q50 27 31 35 Z" fill="#C98A35"/>
              <path d="M40 24 Q42 29 41 32 M50 22 Q51 27 50 30 M60 24 Q59 29 60 32" stroke="#8A5A1C" stroke-width="1.5" fill="none"/>`,
  // Longer, swept style covering the sides
  medium: `<path d="M26 64 Q23 22 50 20 Q77 22 74 64 L70 62 L70 40 Q58 32 40 38 Q33 38 30 44 L30 62 Z" fill="#C98A35"/>`,
  // Short top with faded (lighter) sides
  fade: `<path d="M31 42 Q30 24 50 22 Q70 24 69 42 L66 34 Q50 28 34 34 Z" fill="#C98A35"/>
         <path d="M30 44 L34 36 L34 52 L30 54 Z M70 44 L66 36 L66 52 L70 54 Z" fill="#C98A35" opacity="0.4"/>`,
  // Crop plus a beard
  beard: `<path d="M29 48 Q28 24 50 22 Q72 24 71 48 L69 38 L64 34 L59 37 L54 33 L49 37 L44 33 L39 37 L34 34 L31 39 Z" fill="#C98A35"/>
          <path d="M30 52 Q31 76 50 79 Q69 76 70 52 L66 58 Q62 68 50 70 Q38 68 34 58 Z" fill="#C98A35"/>`,
};

// Returns the full SVG markup for one icon key
export function hairstyleIcon(key) {
  const hair = HAIR[key] || HAIR.crop;
  return `<svg viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false">${HEAD}${hair}</svg>`;
}
