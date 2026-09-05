import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productDetail: HelpArticleContent = {
  slug:  'product-detail',
  title: 'La fiche détaillée d’un produit',
  intro: 'Cliquer sur une carte du catalogue ouvre la fiche détaillée du produit : ses images, sa description, son indication et ses spécifications, ainsi que son statut réglementaire sur chacun des cinq marchés. Tout employé connecté peut l’ouvrir ; les administrateurs de produits y disposent en plus des boutons Edit (modifier) et Disable (désactiver).',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'opening', heading: 'Ouvrir et fermer un produit',
      blocks: [
        { kind: 'list', items: [
          'Cliquez sur n’importe quelle carte de la grille du catalogue.',
          'Ou ouvrez un lien direct de la forme /?product=<slug> ; le catalogue se charge avec ce produit déjà ouvert.',
          'Tant qu’un produit est ouvert, la barre d’adresse affiche ?product=<slug> ; la fermeture le retire. Le bouton Copy link (copier le lien) vous donne la même adresse sans toucher à la barre d’adresse.',
          'Fermez avec le bouton × dans le coin supérieur (Close), la touche Échap, ou en cliquant en dehors du panneau.',
        ], labels: ['Close', 'Copy link'] },
        { kind: 'paragraph', text: 'Copy link copie l’adresse partageable du produit dans votre presse-papiers et le bouton affiche brièvement ✓ Link copied. Si votre navigateur bloque l’accès au presse-papiers, une petite invite Copy this product link affiche l’adresse pour que vous puissiez la copier à la main. Toute personne disposant du lien doit être connectée à ProductPort pour l’ouvrir.', labels: ['Copy link', '✓ Link copied', 'Copy this product link'] },
        { kind: 'paragraph', text: 'Un lien n’ouvre que les produits que vous êtes autorisé à voir : un lecteur qui suit un lien vers un produit désactivé obtient le catalogue ordinaire sans rien d’ouvert, et un produit en statut DRAFT ne s’ouvre pour personne.' },
      ],
    },
    {
      id: 'header', heading: 'L’en-tête',
      blocks: [
        { kind: 'list', items: [
          'Image principale : l’image principale du produit. Lorsqu’un produit possède plusieurs images de galerie, une rangée de petites vignettes apparaît en dessous ; cliquez sur l’une d’elles pour l’afficher (chacune est intitulée View image, et l’image principale est signalée comme telle).',
          'Domaine thérapeutique · catégorie, avec un badge Tier 1, Tier 2 ou Tier 3 lorsque le produit a un niveau.',
          'Nom du produit, puis son slogan et filiale · type.',
          'Pastilles de marché, selon la même règle que les cartes du catalogue : un code seul, comme FDA, signifie autorisé, un code suivi d’un point signifie en cours ou soumis, et Status: see detail signifie qu’aucun marché n’est actif. Le tableau réglementaire plus bas donne toujours la vue complète.',
        ], labels: ['View image', 'Tier 1', 'Status: see detail'] },
      ],
    },
    {
      id: 'body', heading: 'Description, indication et spécifications',
      blocks: [
        { kind: 'list', items: [
          'Overview (présentation) : la description du produit, suivie de la liste de ses caractéristiques sous forme de puces. La section est omise lorsque les deux sont vides.',
          'Indication : l’affection que ce dispositif est autorisé à traiter par les autorités réglementaires.',
          'Patient population (population de patients) : à qui s’applique l’indication autorisée.',
          'Specifications (spécifications) : tailles de modèles et caractéristiques clés telles que déposées auprès des autorités, affichées sous forme de pastilles clé : valeur.',
          'Chacun de ces éléments n’apparaît que si le produit a cette information enregistrée ; certains produits affichent donc moins de rubriques que d’autres.',
        ], labels: ['Overview', 'Indication', 'Patient population', 'Specifications'] },
      ],
    },
    {
      id: 'regulatory', heading: 'Statut réglementaire par marché',
      blocks: [
        { kind: 'paragraph', text: 'Le tableau Regulatory status by market (statut réglementaire par marché) est toujours affiché. Il liste les cinq marchés dans un ordre fixe, CE (Union européenne), FDA (États-Unis), NMPA (Chine), PMDA (Japon) et TGA (Australie) ; survolez un code pour voir le nom complet. Chaque ligne porte un statut :', labels: ['Regulatory status by market', 'Cleared', 'In progress'] },
        { kind: 'list', items: [
          'Cleared (autorisé) : le produit dispose d’une autorisation sur ce marché.',
          'In progress (en cours) ou Submitted (soumis) : une autorisation est en cours sur ce marché mais n’est pas encore accordée.',
          'Not cleared (non autorisé) : le produit est enregistré comme non autorisé sur ce marché.',
          'Un tiret (—) : rien n’a été enregistré pour ce marché.',
        ], labels: ['Cleared', 'In progress', 'Submitted', 'Not cleared'] },
        { kind: 'paragraph', text: 'Les notes réglementaires enregistrées pour le produit apparaissent directement sous le tableau. Le tableau n’affiche que le statut : les numéros de certificat, les qualificatifs d’autorisation et les notes par marché sont conservés dans la fiche du produit mais ne sont pas affichés dans cette vue.' },
      ],
    },
    {
      id: 'evidence', heading: 'Preuves cliniques clés',
      blocks: [
        { kind: 'paragraph', text: 'Lorsque des essais cliniques sont enregistrés pour un produit, un tableau Key clinical evidence (preuves cliniques clés) les liste avec les colonnes Trial (essai), Identifier (identifiant), N, Design (schéma) et Result (résultat). La plupart des produits n’ont aucun essai enregistré, et la section est alors simplement absente. Les essais proviennent des données initiales du catalogue ; il n’existe aucun moyen de les ajouter ou de les modifier dans ProductPort, ni par formulaire ni par CSV.', labels: ['Key clinical evidence', 'Trial', 'Identifier', 'Design', 'Result'] },
      ],
    },
    {
      id: 'admin-actions', heading: 'Pour les administrateurs de produits',
      blocks: [
        { kind: 'roleBlock', roles: ['product_admin', 'superuser'], blocks: [
          { kind: 'list', items: [
            'Edit (modifier) ouvre l’éditeur de produit prérempli avec ce produit, y compris sa galerie d’images et la matrice des autorisations réglementaires (voir « Modifier un produit »).',
            'Disable (désactiver) masque le produit aux lecteurs sans rien supprimer. Il conserve son statut ACTIVE ou DISCONTINUED et toutes ses données ; les administrateurs le voient toujours dans le catalogue et dans cette vue, marqué Disabled — hidden from the catalog (désactivé, masqué du catalogue).',
            'Enable (activer) remet un produit désactivé dans le catalogue, exactement tel qu’il était.',
            'Pendant qu’une demande Disable ou Enable est en cours, le bouton affiche Disabling… ou Enabling…, et la vue ne peut pas être fermée avant la fin ; une notification confirme le résultat.',
            'La suppression d’un produit ne se fait pas ici ; le bouton Delete se trouve en bas de l’éditeur.',
          ], labels: ['Edit', 'Disable', 'Enable', 'Disabled — hidden from the catalog'] },
          { kind: 'faq', items: [
            { q: 'Dois-je désactiver ou supprimer un produit qui n’est plus vendu ?', a: 'Désactivez-le (Disable) s’il peut revenir ou si vous voulez qu’il reste dans Export CSV et dans l’éditeur ; il disparaît uniquement pour les lecteurs et Enable le rétablit. Delete, dans l’éditeur, le retire du catalogue pour tout le monde, et aucun bouton ne permet de le récupérer. Notez que passer son Status à DISCONTINUED dans l’éditeur ne le masque pas : les lecteurs voient toujours les produits DISCONTINUED.' },
            { q: 'J’ai désactivé un produit mais je le vois encore.', a: 'C’est normal. Les administrateurs voient toujours les produits désactivés, estompés dans la grille avec une étiquette DISABLED et, ici, avec le badge Disabled — hidden from the catalog. Les lecteurs ne les voient pas du tout.' },
          ], labels: ['Disable', 'Enable', 'DISABLED', 'Export CSV'] },
        ] },
      ],
    },
    {
      id: 'faq', heading: 'Questions fréquentes',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Puis-je envoyer à quelqu’un un lien direct vers un produit ?', a: 'Oui. Cliquez sur Copy link dans la fiche détaillée, ou copiez la barre d’adresse pendant que le produit est ouvert ; les deux donnent /?product=<slug>. La personne doit être connectée à ProductPort, et le produit doit lui être visible.' },
          { q: 'Le lien que j’ai reçu ouvre le catalogue mais aucun produit.', a: 'Soit le produit est désactivé (seuls les administrateurs de produits voient les produits désactivés), soit il est en statut DRAFT (personne ne peut l’ouvrir), soit le slug du lien est erroné. Si vous avez d’abord été redirigé vers la connexion, rouvrez le lien après vous être connecté.' },
          { q: 'Où sont les numéros de modèle, les numéros de certificat ou le segment d’activité ?', a: 'La fiche détaillée ne les affiche pas. Les numéros de modèle, les services concernés, le segment d’activité, le statut de développement, la classification, le statut de cycle de vie (ACTIVE ou DISCONTINUED) ainsi que les numéros de certificat, qualificatifs et notes par marché sont conservés dans la fiche du produit et inclus dans l’export CSV, mais seuls les champs décrits ci-dessus apparaissent à l’écran.' },
          { q: 'Pourquoi un produit affiche-t-il un tableau de preuves cliniques et un autre non ?', a: 'Key clinical evidence n’apparaît que lorsque des essais sont enregistrés pour ce produit, et les essais ne peuvent pas être ajoutés via ProductPort.' },
          { q: 'L’en-tête montre moins de marchés que le tableau. Pourquoi ?', a: 'Les pastilles de l’en-tête ne montrent que les marchés ayant un statut actif (autorisé, en cours ou soumis). Le tableau Regulatory status by market liste toujours les cinq, y compris ceux Not cleared (non autorisés) et ceux sans information.' },
        ], labels: ['Copy link', 'Regulatory status by market', 'Not cleared', 'Key clinical evidence'] },
      ],
    },
  ],
  related: ['catalog-browse', 'product-edit', 'login'],
};

export default productDetail;
