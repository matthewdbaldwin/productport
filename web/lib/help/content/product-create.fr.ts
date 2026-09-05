// web/lib/help/content/product-create.fr.ts
// French sibling of product-create.ts. Drafted via the local 3090 tier
// (ask-local --translate fr) and reviewed by hand. `labels` stay in English
// on purpose: the editor and import UI are hardcoded English in every locale,
// so the on-screen text the renderer bolds and the audit greps for is English.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productCreate: HelpArticleContent = {
  slug: 'product-create',
  title: 'Ajouter un produit',
  intro: 'Add product, dans la barre supérieure, ouvre un formulaire de produit vide. Rien n’est vérifié dans le navigateur : le serveur vérifie la sauvegarde et signale tout champ qu’il rejette. Les images et les autorisations réglementaires sont ajoutées ultérieurement, en mode édition.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'open-the-form', heading: 'Ouvrir le formulaire',
      blocks: [
        { kind: 'paragraph', text: 'Cliquez sur Add product dans la barre supérieure (administrateurs uniquement). Le formulaire s’intitule Add product et le focus se place sur le champ Name. Fermer le formulaire avec Cancel, le bouton ×, Esc ou un clic sur l’arrière-plan après avoir tapé quelque chose demande d’abord : Discard your unsaved changes?', labels: ['Add product', 'Name', 'Cancel'] },
      ],
    },
    {
      id: 'fields', heading: 'Les champs, dans l’ordre',
      blocks: [
        { kind: 'paragraph', text: 'La grille en haut contient les champs courts ; les champs en largeur pleine sous celle-ci contiennent le texte plus long. Les champs obligatoires portent une étoile rouge. Les champs optionnels laissés vides sont stockés vides.' },
        { kind: 'list', items: [
          'Name, Slug (url key), Subsidiary et Therapeutic area sont obligatoires. Subsidiary est du texte libre ; Therapeutic area est une liste déroulante des dix domaines thérapeutiques canoniques.',
          'Slug (url key) ne doit comporter que des lettres minuscules, des chiffres et des tirets. Il devient le lien du produit (/?product=<slug>) et sa colonne id dans le CSV, et un slug déjà utilisé est refusé, donc choisissez quelque chose de court et stable.',
        ], labels: ['Name', 'Slug (url key)', 'Subsidiary', 'Therapeutic area'] },
        { kind: 'list', items: [
          'Business segment, Category et Type sont du texte libre. Image filename est un champ hérité pour les fichiers image livrés avec l’application ; le téléversement d’images n’est possible qu’en mode édition.',
          'Tier, Classification et Status sont des listes fixes (voir la section suivante). Development status est du texte libre.',
          'Tagline, Overview, Indication, Patient population et Regulatory notes sont du texte brut.',
          'Features, Specifications, Model numbers et Applicable departments sont des listes séparées par des barres verticales (|) : a|b|c pour Features, paires clé/valeur pour Specifications. Les Model numbers tapés un par ligne sont acceptés et stockés séparés par des barres verticales.',
        ], labels: ['Business segment', 'Category', 'Image filename', 'Features', 'Specifications'] },
      ],
    },
    {
      id: 'tier-classification-status', heading: 'Tier, Classification et Status',
      blocks: [
        { kind: 'list', items: [
          'Tier (Tier 1, Tier 2, Tier 3 ou none) s’affiche sous forme de badge sur la fiche du catalogue et dans la vue détaillée. Il ne filtre ni ne masque rien.',
          'Classification (CORE, HIPO ou FLAGSHIP) n’est affiché nulle part dans l’application. Il est stocké et ne circule que via l’export et l’import CSV.',
          'Status vaut ACTIVE par défaut. DISCONTINUED n’est affiché nulle part aux utilisateurs en lecture seule et ne masque pas le produit.',
        ], labels: ['Tier', 'Classification', 'Status'] },
        { kind: 'paragraph', text: 'Ne choisissez pas DRAFT à moins que vous ne souhaitiez masquer le produit à tout le monde, y compris aux administrateurs. Un produit DRAFT disparaît de la grille, ne peut pas être ouvert ou édité dans l’application, et la seule façon de le récupérer est Export CSV, modifier la cellule status de cette ligne, puis Import CSV.', labels: ['Status', 'Export CSV', 'Import CSV'] },
      ],
    },
    {
      id: 'saving', heading: 'Sauvegarde et vérifications du serveur',
      blocks: [
        { kind: 'paragraph', text: 'Le formulaire soumet tout ce que vous avez tapé ; il n’y a pas de vérification côté navigateur. Cliquez sur Create (il affiche Saving… pendant que la requête est en cours). Si le serveur rejette la sauvegarde, le champ en cause reçoit un contour rouge et un message sous lui, et le même message apparaît dans un bandeau en haut du formulaire et dans une notification. Corrigez le champ et cliquez à nouveau sur Create.', labels: ['Create', 'Cancel'] },
        { kind: 'list', items: [
          'Un Name, Slug (url key), Subsidiary ou Therapeutic area manquant.',
          'Un slug contenant des lettres majuscules, des espaces ou d’autres caractères, ou un slug qui existe déjà (le message indique already exists).',
          'Un texte plus long que la limite du champ, par exemple 255 caractères pour Name ou 500 pour Tagline.',
        ], labels: ['Name', 'Slug (url key)', 'Tagline'] },
      ],
    },
    {
      id: 'after-create', heading: 'Après la création',
      blocks: [
        { kind: 'paragraph', text: 'En cas de succès, le formulaire se ferme, une notification Product created. apparaît, et le catalogue se recharge avec la nouvelle fiche dans l’ordre alphabétique des noms. Le nouveau produit ne s’ouvre pas automatiquement.', labels: ['Create', 'Product created.'] },
        { kind: 'steps', steps: [
          'Trouvez la nouvelle fiche dans la grille (utilisez la zone de recherche si le catalogue est long) et cliquez dessus.',
          'Cliquez sur Edit dans la vue détaillée.',
          'Utilisez Product images et Regulatory clearances. Ces deux sections existent uniquement en mode édition.',
        ], labels: ['Edit', 'Product images', 'Regulatory clearances'] },
        { kind: 'paragraph', text: 'Un nouveau produit n’a pas encore de lignes d’autorisations : sa fiche affiche Status: see detail et la vue détaillée montre un trait pour les cinq régions jusqu’à ce que vous remplissiez Regulatory clearances.', labels: ['Status: see detail', 'Regulatory clearances'] },
      ],
    },
    {
      id: 'faq', heading: 'Questions fréquentes',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Puis-je ajouter des images ou des autorisations réglementaires pendant la création d’un produit ?', a: 'Non. Créez d’abord le produit, puis ouvrez sa fiche et cliquez sur Edit. Ces deux sections n’apparaissent qu’en mode édition.' },
          { q: 'Pourquoi rien ne m’a empêché de cliquer sur Create avant ?', a: 'Le formulaire n’a pas de vérification côté navigateur. Le serveur vérifie la sauvegarde et met en évidence tout champ qu’il rejette ; corrigez-le et cliquez à nouveau sur Create.' },
          { q: 'J’ai choisi DRAFT et maintenant je ne trouve plus le produit.', a: 'DRAFT masque le produit à tout le monde, y compris à vous. Export CSV, passez la cellule status de cette ligne à ACTIVE, puis Import CSV pour le récupérer.' },
          { q: 'Tier ou Classification changent-ils qui peut voir le produit ?', a: 'Non. Tier est un badge sur la fiche et dans la vue détaillée ; Classification n’est jamais affichée. Aucun des deux ne filtre le catalogue.' },
        ] },
      ],
    },
  ],
  related: ['product-edit', 'csv-import', 'catalog-browse'],
};

export default productCreate;
