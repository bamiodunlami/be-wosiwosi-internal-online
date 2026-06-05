/**
 * Staff names are stored as "First Last", but the UI only needs the first name —
 * the team is small and first names are how they're referred to. Use this at every
 * staff-name display site (assigned packer, note author, etc.). Grouping/filter keys
 * should keep the FULL name to avoid merging two people who share a first name.
 */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}
