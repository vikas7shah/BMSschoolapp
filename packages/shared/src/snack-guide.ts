/**
 * The school's snack guidance, as given to parents. Kept as structured data
 * rather than prose so the app can render it consistently and so a single item
 * can be changed without rewriting a page.
 *
 * This is food policy for young children — several entries are allergy,
 * choking or preservative related. Change wording only with the school.
 */

export interface SnackSection {
  id: string;
  title: string;
  items: string[];
  /** How to prepare or choose — advisory. */
  guidance?: string[];
  /** Not permitted. Rendered distinctly, never mixed in with the items. */
  avoid?: string[];
}

export const SNACK_SECTIONS: SnackSection[] = [
  {
    id: 'fruit',
    title: 'Fruits & vegetables',
    items: [
      'Apples',
      'Bananas',
      'Clementines (small oranges)',
      'Strawberries',
      'Blueberries',
      'Grapes (cut in half)',
      'Melon, sliced — watermelon, cantaloupe or honeydew',
      'Mixed fruit platter from the supermarket',
      'Sliced cucumber',
      'Sliced bell pepper',
      'Celery sticks',
      'Baby carrot sticks',
    ],
    guidance: [
      'De-pit fruits and cut grapes in half.',
      'Wash all fruits and vegetables.',
      'Do not pre-slice apples or cut bananas in half.',
      'Please pre-slice larger fruits and vegetables.',
    ],
  },
  {
    id: 'dry',
    title: 'Dry snacks',
    items: [
      'Veggie Straws',
      'Crackers',
      'Pretzels',
      'Graham crackers',
      'Snap peas',
      'Pirate Booty (white cheddar puffs)',
      'Popcorners (look like chips)',
      "Annie's cheddar bunnies, fruit gummies or bunny grahams",
      "Abe's muffins",
    ],
    guidance: [
      "For birthdays, Abe's muffins are a good substitute for cupcakes.",
      'Look for products with no GMO and no artificial coloring.',
    ],
    avoid: [
      'No cookies, high-salt crackers such as Cheez-It, or sugary cereals.',
      'No Pop-Tarts, Goldfish or Teddy Grahams — they contain harmful '
        + 'preservatives and additives.',
    ],
  },
  {
    id: 'extras',
    title: 'Additional / optional',
    items: [
      'Cheese stick, Babybel wheel or mozzarella ball',
      'Applesauce (pouches are best)',
      'Yogurt — please read the ingredients first; pouches are best',
      'Fruit popsicles, for a birthday in warmer weather',
    ],
    guidance: [
      'Try to stick to original flavors for dry snack products.',
    ],
    avoid: [
      'No hard candy — it is a choking risk — and no candy in general.',
    ],
  },
];

/** School-wide notes that are not about what to buy. */
export const SNACK_POLICY: string[] = [
  'No milk bottles during nap time.',
  'Teachers do not feed the children.',
  'Children are never forced to eat; additional time is given if needed.',
];
