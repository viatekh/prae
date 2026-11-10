/**
 * Generates a human-readable, condensed item ID from a name.
 * Rules:
 * - Strip brand if model number is present and distinctive
 * - Keep numbers intact (they're the key differentiator)
 * - Drop vowels from word portions
 * - Max 7 chars + dash + 3-digit zero-padded counter
 * - Uppercase
 *
 * Examples:
 *   "Pioneer CDJ3000"      -> CDJ3000
 *   "Pioneer CDJ2000NXS2"  -> CDJ2NXS
 *   "Pioneer CDJ3000X"     -> CDJ3KX
 *   "Pioneer DJM900NXS2"   -> DJM900N
 *   "Martin Audio XP12"    -> MAXP12
 *   "Shure SM58"           -> SM58
 */

const KNOWN_BRANDS = [
  'pioneer', 'martin audio', 'martin', 'shure', 'allen heath', 'allen & heath',
  'lambda labs', 'lambda', 'funktion one', 'funktion', 'electrovoice', 'electro voice',
  'yamaha', 'qsc', 'crown', 'dbx', 'behringer', 'mackie', 'jbl', 'ev',
  'akg', 'sennheiser', 'neumann', 'rode', 'sony', 'denon', 'reloop',
  'american dj', 'chauvet', 'elation', 'robe', 'clay paky',
]

function stripBrand(name: string): { brand: string; model: string } {
  const lower = name.toLowerCase()
  for (const brand of KNOWN_BRANDS) {
    if (lower.startsWith(brand + ' ') || lower.startsWith(brand)) {
      const model = name.slice(brand.length).trim()
      return { brand, model: model || name }
    }
  }
  return { brand: '', model: name }
}

function condenseToken(token: string): string {
  // If it's purely numeric, keep as-is
  if (/^\d+$/.test(token)) return token
  // If it starts with letters then numbers (like CDJ3000, DJM900, XP12)
  // condense the letter part by removing vowels, keep numbers
  const parts = token.match(/([A-Za-z]+)(\d+.*)?/)
  if (!parts) return token
  const letters = parts[1].replace(/[aeiouAEIOU]/g, '')
  const rest = parts[2] || ''
  return letters + rest
}

function abbreviateNumber(s: string): string {
  // 2000 -> 2K, 3000 -> 3K etc when used to shorten
  return s.replace(/(\d)000(?=[A-Z]|$)/g, '$1K')
}

export function generateItemCode(name: string): string {
  const { brand, model } = stripBrand(name)

  // Tokenise model
  const tokens = model
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  let code = tokens.map(condenseToken).join('').toUpperCase()

  // If still too long, abbreviate thousands
  if (code.length > 7) {
    code = abbreviateNumber(code)
  }

  // If still too long, truncate to 7
  if (code.length > 7) {
    code = code.slice(0, 7)
  }

  // If model had nothing useful, fall back to brand initials + model
  if (code.length < 2 && brand) {
    const brandInitials = brand.split(' ').map(w => w[0].toUpperCase()).join('')
    code = (brandInitials + code).slice(0, 7)
  }

  return code
}

export function formatItemId(code: string, counter: number): string {
  return `${code}-${String(counter).padStart(3, '0')}`
}
