// Minimal i18n stub.
//
// Upstream uses i18next + react-i18next + i18next-http-backend +
// browser-language-detector to load JSON translation files at runtime.
// Per Phase 0 decision (5) in TRDD-bdf0, the visual-explainer plugin
// ships English-only — no i18n machinery — so this stub provides the
// minimum surface that `graph/measure.ts` needs:
//
//   import i18n from '@/i18n'
//   const t = i18n.t
//   t('some.translation.key')   ->  'some.translation.key'
//
// Phase 2 will replace each upstream translation key with a hard-coded
// English string in the calling site (or a tiny lookup table here),
// rather than carry a runtime i18n loader for a single language.
export default {
  t: (key: string): string => key,
}
