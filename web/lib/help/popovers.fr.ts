// web/lib/help/popovers.fr.ts
// French sibling of popovers.ts — a self-contained record (no import from
// ./popovers, so there is no circular import with the file that imports this
// one). Drafted via the local 3090 tier (ask-local --translate fr) and
// reviewed by hand. On-screen names (Add image, Set primary, Delete, Cancel,
// Save changes, Certificate number(s), Notes) stay in English because the
// editor itself is hardcoded English in every locale. Terminology: Clearance
// = autorisation, Registration = enregistrement; "save" is therefore
// rendered as sauvegarder, never enregistrer.
import type { HelpContent } from '@matthewdbaldwin/microport-ui/help';

export const POPOVERS: Record<'gallery' | 'clearance', HelpContent> = {
  gallery: {
    summary: 'Gérez la galerie de ce produit : ajoutez, définissez l’image principale ou supprimez des images.',
    bullets: [
      'Add image accepte JPEG, PNG ou WebP jusqu’à 6 MB ; la première image ajoutée devient l’image principale.',
      'Set primary détermine l’image affichée sur la fiche du catalogue.',
      'Delete demande une confirmation avant de retirer une image.',
      'Toute modification d’image est sauvegardée immédiatement et n’est pas annulée par Cancel.',
    ],
  },
  clearance: {
    summary: 'Une ligne par région. Status, Certificate number(s), Qualifier et Notes sont indépendants d’une ligne à l’autre.',
    bullets: [
      'Certificate number(s) est la preuve d’enregistrement (Registration) d’une autorisation (Clearance) accordée ; séparez plusieurs numéros par une barre verticale (CE-100|CE-200).',
      'Les modifications d’autorisation sont sauvegardées avec le reste du formulaire, via Save changes.',
      'Un import CSV efface les Notes de chaque région ; les numéros de certificat et les Qualifier sont conservés.',
    ],
  },
};

export const POPOVER_TITLES: Record<'gallery' | 'clearance', string> = {
  gallery:   'Gestion des images du produit',
  clearance: 'Modification de la matrice d’autorisation',
};
