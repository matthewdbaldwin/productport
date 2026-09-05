// web/lib/help/content/product-edit.fr.ts
// French sibling of product-edit.ts. Drafted via the local 3090 tier
// (ask-local --translate fr) and reviewed by hand. `labels` stay in English
// on purpose: the editor and import UI are hardcoded English in every locale,
// so the on-screen text the renderer bolds and the audit greps for is English.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productEdit: HelpArticleContent = {
  slug: 'product-edit',
  title: 'Modifier un produit',
  intro: 'Ouvrez un produit depuis le catalogue et cliquez sur Edit. Il s’agit du même formulaire que Add product, prérempli, plus deux sections qui n’existent qu’ici : Product images et Regulatory clearances. Les modifications d’images sont sauvegardées dès que vous les faites ; tout le reste est sauvegardé avec Save changes.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'open-the-editor', heading: 'Ouvrir l’éditeur',
      blocks: [
        { kind: 'paragraph', text: 'Cliquez sur une fiche pour ouvrir la vue détaillée, puis cliquez sur Edit (administrateurs uniquement). Le formulaire s’intitule Edit suivi du nom du produit, et chaque champ est prérempli. Slug (url key) peut être renommé, mais le nouveau slug ne doit pas être utilisé par un autre produit ; le renommage modifie le lien du produit et sa colonne id dans le CSV.', labels: ['Edit', 'Slug (url key)'] },
      ],
    },
    {
      id: 'fields', heading: 'Champs du produit et Status',
      blocks: [
        { kind: 'paragraph', text: 'Les champs sont les mêmes que lors de l’ajout d’un produit, y compris les formats séparés par des barres verticales (|) pour Features, Specifications et Model numbers. Vider un champ optionnel l’efface ; Name, Slug (url key), Subsidiary et Therapeutic area ne peuvent pas être vides.', labels: ['Features', 'Specifications', 'Model numbers', 'Name', 'Subsidiary'] },
        { kind: 'list', items: [
          'DISCONTINUED ne masque ni ne supprime le produit, et rien dans le catalogue n’affiche cet état.',
          'Pour masquer un produit aux utilisateurs en lecture seule, utilisez plutôt Disable dans la vue détaillée. Les administrateurs le voient toujours, avec un badge DISABLED, et peuvent l’activer à nouveau.',
          'DRAFT masque le produit à tout le monde, y compris aux administrateurs. Il disparaît de la grille, ne peut pas être ouvert ou édité dans l’application, et la seule façon de le récupérer est Export CSV, modifier la cellule status de cette ligne, puis Import CSV.',
        ], labels: ['Status', 'Disable', 'Export CSV', 'Import CSV'] },
      ],
    },
    {
      id: 'product-images', heading: 'Images du produit (Product images)',
      blocks: [
        { kind: 'paragraph', text: 'Tout changement dans cette section est sauvegardé dès que vous le faites, comme une action distincte. Ajouter une image, Set primary et Delete ne font pas partie de Save changes, et Cancel ne les annule pas.', labels: ['Product images', 'Set primary', 'Delete', 'Save changes', 'Cancel'] },
        { kind: 'list', items: [
          '+ Add image accepte JPEG, PNG ou WebP jusqu’à 6 MB. Les grandes images sont réduites dans le navigateur avant l’envoi ; GIF et SVG sont refusés.',
          'La première image que vous téléversez devient l’image principale et s’affiche sur la fiche du catalogue. Set primary, sous une autre image, déplace le badge Primary vers celle-ci.',
          'Delete affiche Delete? sur place, avec Yes et No. Supprimer l’image principale promeut l’image suivante ; supprimer la dernière laisse le produit sans image.',
        ], labels: ['+ Add image', 'Set primary', 'Primary', 'Delete'] },
      ],
    },
    {
      id: 'regulatory-clearances', heading: 'Autorisations réglementaires (Regulatory clearances)',
      blocks: [
        { kind: 'paragraph', text: 'Une autorisation (Clearance) est le droit de vendre le produit dans une juridiction. La matrice a cinq lignes fixes, CE, FDA, NMPA, PMDA et TGA, chacune avec Status, Certificate number(s), Qualifier et Notes. Les lignes sont indépendantes les unes des autres.', labels: ['Regulatory clearances', 'Status', 'Qualifier', 'Notes'] },
        { kind: 'list', items: [
          'Status est NONE, IN_PROGRESS, SUBMITTED, APPROVED ou NOT_APPROVED. Il détermine les pastilles de marché sur la fiche, le filtre Regulatory et le tableau d’état de la vue détaillée.',
          'Certificate number(s) contient la preuve d’enregistrement (Registration) de cette autorisation : les numéros de certificat ou d’enregistrement, séparés par des barres verticales (|) (ex. CE-100|CE-200), jusqu’à 1000 caractères.',
          'Qualifier est une réserve choisie dans une liste fixe : CMD-only, CE-invalid, agent, pending ou recently-approved.',
          'Notes est du texte libre jusqu’à 2000 caractères. Les Notes ne sont visibles qu’ici, dans l’éditeur.',
        ], labels: ['Status', 'Certificate number(s)', 'Qualifier', 'Notes'] },
        { kind: 'paragraph', text: 'La matrice est sauvegardée avec Save changes, et uniquement si vous avez modifié une cellule. Les champs du produit sont sauvegardés en premier, puis les autorisations. Si la sauvegarde des autorisations échoue, les champs du produit sont déjà sauvegardés, l’erreur s’affiche dans le bandeau et dans une notification, et le formulaire reste ouvert afin que vous puissiez réessayer.', labels: ['Save changes', 'Regulatory clearances'] },
        { kind: 'paragraph', text: 'Un import CSV de ce produit, même à partir d’un export non modifié, efface les Notes de chaque région, car les Notes ne sont jamais exportées. Les numéros de certificat et les Qualifier, eux, sont conservés. Si le catalogue est géré par CSV, ne mettez rien d’important dans les Notes.', labels: ['Notes', 'Import CSV', 'Export CSV'] },
      ],
    },
    {
      id: 'saving', heading: 'Sauvegarder, annuler et supprimer',
      blocks: [
        { kind: 'list', items: [
          'Save changes écrit les champs du produit, et la matrice d’autorisations si vous l’avez modifiée. En cas de succès, une notification Changes saved. apparaît, l’éditeur et la vue détaillée se ferment tous les deux, et le catalogue se recharge ; cliquez à nouveau sur la fiche pour voir la mise à jour.',
          'Cancel, le bouton ×, Esc ou un clic sur l’arrière-plan ferment le formulaire ; si quelque chose a changé, on vous demande Discard your unsaved changes? Les modifications d’images déjà effectuées sont conservées.',
          'Delete (en bas à gauche) demande Delete this product? puis Confirm delete. Il s’agit d’une suppression logique, sans aucun moyen de restauration dans l’application : ramener le produit nécessite une opération en base de données, et d’ici là une ligne CSV avec ce slug est refusée.',
        ], labels: ['Save changes', 'Changes saved.', 'Cancel', 'Delete', 'Confirm delete'] },
      ],
    },
    {
      id: 'faq', heading: 'Questions fréquentes',
      blocks: [
        { kind: 'faq', items: [
          { q: 'J’ai cliqué sur Cancel mais l’image que j’ai supprimée n’est pas revenue.', a: 'Les modifications d’images sont sauvegardées immédiatement, comme des actions distinctes, et ne font pas partie de Save changes ; Cancel ne peut donc pas les annuler. Téléversez à nouveau l’image.' },
          { q: 'DISCONTINUED masque-t-il le produit aux utilisateurs en lecture seule ?', a: 'Non. Rien dans le catalogue n’affiche cet état. Utilisez Disable dans la vue détaillée pour masquer un produit aux utilisateurs en lecture seule, ou Delete pour le retirer.' },
          { q: 'Mes Notes d’autorisation ont disparu.', a: 'Un import CSV réécrit les cinq lignes d’autorisation et écrit toujours des Notes vides, car l’export n’a pas de colonne Notes. Saisissez-les à nouveau dans l’éditeur.' },
          { q: 'Une région peut-elle avoir plus d’un numéro de certificat ?', a: 'Oui. Séparez-les par une barre verticale dans Certificate number(s), ex. CE-100|CE-200.' },
          { q: 'Puis-je annuler une suppression ?', a: 'Pas dans l’application. Le produit est supprimé logiquement en base de données ; demandez une restauration en base. D’ici là, une ligne CSV avec le même slug est refusée.' },
        ] },
      ],
    },
  ],
  related: ['product-create', 'product-detail', 'csv-import'],
};

export default productEdit;
