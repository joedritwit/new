import type { DonationKind } from './types'

export const DONATION_KINDS: {
  value: DonationKind
  label: string
  destinationHint: string
  linkHint: string
}[] = [
  {
    value: 'paypal',
    label: 'PayPal',
    destinationHint: 'The name or email on the account',
    linkHint: 'https://paypal.me/yourname',
  },
  {
    value: 'venmo',
    label: 'Venmo',
    destinationHint: 'Your public Venmo handle',
    linkHint: 'https://venmo.com/u/yourname',
  },
  {
    value: 'cashapp',
    label: 'Cash App',
    destinationHint: '$Cashtag',
    linkHint: 'https://cash.app/$yourcashtag',
  },
  {
    value: 'zelle',
    label: 'Zelle',
    destinationHint: 'The email or phone number enrolled in Zelle',
    linkHint: 'Leave blank — Zelle is sent through your bank',
  },
  {
    value: 'kofi',
    label: 'Ko-fi',
    destinationHint: 'Your Ko-fi name',
    linkHint: 'https://ko-fi.com/yourname',
  },
  {
    value: 'buymeacoffee',
    label: 'Buy Me a Coffee',
    destinationHint: 'Your page name',
    linkHint: 'https://buymeacoffee.com/yourname',
  },
  {
    value: 'other',
    label: 'Other',
    destinationHint: 'Public handle or instruction',
    linkHint: 'Optional https:// link',
  },
]

export const DONATION_LIMITS = {
  introMax: 600,
  memoMax: 240,
  labelMax: 40,
  destinationMax: 160,
  noteMax: 200,
  urlMax: 300,
  methodsMax: 12,
} as const

export function isDonationKind(value: string): value is DonationKind {
  return DONATION_KINDS.some((kind) => kind.value === value)
}

export function donationKindLabel(value: DonationKind): string {
  return DONATION_KINDS.find((kind) => kind.value === value)?.label ?? 'Other'
}
