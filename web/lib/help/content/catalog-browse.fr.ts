import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const catalogBrowse: HelpArticleContent = {
  slug:  'catalog-browse',
  title: 'Parcourir et filtrer le catalogue',
  intro: 'La page du catalogue charge l’intégralité du catalogue de produits une seule fois ; la recherche et le filtrage s’effectuent ensuite instantanément dans votre navigateur. Tout employé connecté peut le parcourir ; les administrateurs de produits disposent en plus des boutons de gestion du catalogue dans la barre supérieure.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'page-layout', heading: 'La page du catalogue en un coup d’œil',
      blocks: [
        { kind: 'list', items: [
          'Barre supérieure : la zone de recherche, une pastille verte indiquant le nombre de produits chargés (elle affiche Loading… en attendant), le sélecteur d’applications et le bouton Profil.',
          'Volet des filtres : Therapeutic area (domaine thérapeutique), Subsidiary (filiale), Regulatory (réglementaire) et Category (catégorie), dans cet ordre.',
          'Ligne de comptage sous le volet : N shown · M in catalog (N affichés · M dans le catalogue). M est la taille du catalogue entier ; N est ce que votre recherche et vos filtres retiennent actuellement.',
          'Grille de produits : une carte par produit, triée par nom. Il n’y a ni pagination ni contrôle de tri ; tout le catalogue tient sur une seule page.',
        ], labels: ['Loading…', 'in catalog'] },
        { kind: 'paragraph', text: 'La page affiche Loading catalog… pendant le chargement de la liste. Si elle affiche Could not load the catalog. Please refresh., la liste de produits n’est pas arrivée ; rechargez la page. Si vous n’êtes pas connecté, la page vous redirige vers la procédure de connexion.', labels: ['Loading catalog…', 'Could not load the catalog'] },
      ],
    },
    {
      id: 'search', heading: 'Recherche',
      blocks: [
        { kind: 'paragraph', text: 'Tapez dans la zone de recherche pour filtrer au fur et à mesure ; il n’y a pas de bouton de recherche et il est inutile d’appuyer sur Entrée. La correspondance ignore la casse et cherche votre texte n’importe où dans le nom, le slogan, l’indication, la catégorie, le type ou la filiale d’un produit. Clear filters (effacer les filtres) vide la zone de recherche ainsi que tous les filtres actifs.', labels: ['Search products, indications, types…', 'Clear filters'] },
        { kind: 'list', items: [
          'La recherche ne consulte pas la présentation ni la liste des caractéristiques.',
          'Elle ne consulte pas les spécifications ni la population de patients.',
          'Elle ne porte pas sur les numéros de modèle, les numéros de certificat ni les notes réglementaires.',
        ] },
      ],
    },
    {
      id: 'filters', heading: 'Filtres',
      blocks: [
        { kind: 'list', items: [
          'Therapeutic area (domaine thérapeutique) : une pastille par domaine présent dans le catalogue, chacune avec un compteur. Cliquez sur une pastille pour la sélectionner ; cliquez de nouveau sur la pastille active pour l’effacer.',
          'Subsidiary (filiale) : un panneau replié dont l’en-tête affiche All subsidiaries tant que vous n’avez rien choisi. Dépliez-le pour choisir une seule filiale parmi les pastilles qu’il contient ; cliquez de nouveau sur la pastille active pour l’effacer.',
          'Regulatory (réglementaire) : cinq pastilles, CE, FDA, NMPA, PMDA et TGA. Une seule peut être active à la fois.',
          'Category (catégorie) : une liste déroulante qui commence par All categories et énumère chaque catégorie avec son nombre de produits.',
        ], labels: ['Therapeutic area', 'Subsidiary', 'Regulatory', 'Category', 'All subsidiaries'] },
        { kind: 'paragraph', text: 'Sélectionner un marché sous Regulatory conserve les produits qui y sont autorisés, en cours ou soumis ; c’est un filtre « présent sur ce marché », pas un filtre « autorisés uniquement ». La légende à côté des pastilles montre les trois couleurs de statut : Cleared (autorisé), In progress (en cours) et Submitted (soumis).', labels: ['Cleared', 'In progress', 'Submitted'] },
        { kind: 'paragraph', text: 'Les filtres et la zone de recherche s’appliquent ensemble : un produit doit satisfaire chaque critère actif. Les compteurs des pastilles et des options de la liste déroulante portent sur le catalogue entier et ne diminuent pas quand vous ajoutez d’autres filtres ; c’est la ligne sous le volet qui reflète votre combinaison actuelle. Clear filters n’apparaît que lorsqu’un filtre ou une recherche est actif et réinitialise tout, y compris la zone de recherche. Les filtres ne sont pas conservés dans la barre d’adresse : un rechargement ou un lien partagé repart du catalogue complet. Quand rien ne correspond, la grille est simplement vide et la ligne de comptage indique 0 shown · M in catalog ; il n’y a pas de message « aucun résultat » distinct.', labels: ['Clear filters', 'All categories', 'in catalog'] },
      ],
    },
    {
      id: 'cards', heading: 'Lire une carte de produit',
      blocks: [
        { kind: 'list', items: [
          'Vignette : l’image principale du produit, ou un espace réservé MicroPort portant le nom du produit lorsqu’il n’en a pas.',
          'Domaine thérapeutique, plus un badge Tier 1, Tier 2 ou Tier 3 lorsque le produit a un niveau.',
          'Nom du produit et slogan.',
          'Filiale · catégorie.',
          'Pastilles de marché, une par marché ayant un statut actif. Un code seul, comme FDA, signifie que le produit y est autorisé ; un code suivi d’un point signifie que l’autorisation est en cours ou soumise. Status: see detail s’affiche à la place lorsqu’aucun marché n’est autorisé, en cours ou soumis.',
        ], labels: ['Tier 1', 'Tier 2', 'Tier 3', 'Status: see detail'] },
        { kind: 'paragraph', text: 'Cliquez sur une carte pour ouvrir la vue détaillée du produit. La barre d’adresse reçoit ?product=<slug> tant qu’elle est ouverte, ce qui permet d’ajouter la page aux favoris ou de la partager ; consultez « Fiche produit » pour le contenu de la vue et la façon de copier un lien.' },
      ],
    },
    {
      id: 'admin-actions', heading: 'Pour les administrateurs de produits',
      blocks: [
        { kind: 'roleBlock', roles: ['product_admin', 'superuser'], blocks: [
          { kind: 'list', items: [
            'Add product (ajouter un produit) ouvre un formulaire de produit vierge (voir « Ajouter un produit »).',
            'Verify (dry run) (vérification à blanc) confronte un fichier CSV au catalogue et indique ce qu’une importation créerait, mettrait à jour ou rejetterait, sans rien écrire.',
            'Import CSV (importer un CSV) exécute réellement l’importation, puis recharge le catalogue.',
            'Export CSV (exporter en CSV) télécharge le catalogue entier sous forme de fichier CSV, y compris les produits désactivés et ceux en statut DRAFT (voir « Import et export CSV »).',
          ], labels: ['Add product', 'Verify (dry run)', 'Import CSV', 'Export CSV'] },
          { kind: 'paragraph', text: 'Les administrateurs voient aussi les produits désactivés dans la grille, estompés et marqués d’une étiquette rouge DISABLED ; les lecteurs (rôle viewer) ne les voient jamais, si bien que le nombre de produits dans la barre supérieure diffère entre les deux rôles. Les produits dont le statut est DRAFT sont masqués pour tout le monde, administrateurs compris, et ne peuvent pas être ouverts depuis le catalogue ; Export CSV est le seul endroit de ProductPort où ils apparaissent encore.', labels: ['DISABLED', 'Export CSV'] },
        ] },
      ],
    },
    {
      id: 'faq', heading: 'Questions fréquentes',
      blocks: [
        { kind: 'faq', items: [
          { q: 'La recherche ne trouve pas un produit dont je connais l’existence. Pourquoi ?', a: 'La recherche ne porte que sur le nom, le slogan, l’indication, la catégorie, le type et la filiale du produit, pas sur sa présentation, ses spécifications, ses numéros de modèle ni ses numéros de certificat. Un filtre Therapeutic area, Subsidiary, Regulatory ou Category actif peut aussi masquer un produit même si son nom correspond ; cliquez sur Clear filters puis relancez la recherche.' },
          { q: 'Pourquoi les compteurs des pastilles de filtre ne changent-ils pas quand j’ajoute un autre filtre ?', a: 'Ces compteurs décrivent toujours le catalogue entier, pour que vous voyiez la taille de chaque groupe. La ligne sous le volet (N shown · M in catalog) est le compte de votre combinaison actuelle de recherche et de filtres.' },
          { q: 'J’ai rechargé la page et mes filtres ont disparu.', a: 'Les filtres et la recherche ne sont enregistrés ni dans la barre d’adresse ni dans votre navigateur ; un rechargement repart donc du catalogue complet. Seul un lien de produit (?product=…) survit à un rechargement.' },
          { q: 'Un collègue m’a envoyé un lien et le catalogue s’ouvre sans rien de sélectionné.', a: 'Le produit est peut-être désactivé (seuls les administrateurs de produits voient les produits désactivés) ou en statut DRAFT (personne ne peut l’ouvrir). Si vous avez d’abord été envoyé vers la page de connexion, connectez-vous puis rouvrez le lien.' },
          { q: 'Comment partager un produit avec quelqu’un ?', a: 'Ouvrez-le et cliquez sur Copy link (copier le lien) dans la vue détaillée, ou copiez la barre d’adresse pendant que le produit est ouvert ; les deux donnent le même lien ?product=. Le destinataire doit être connecté à ProductPort pour le voir.' },
          { q: 'Que signifie Status: see detail sur une carte ?', a: 'Aucun des cinq marchés n’est actuellement autorisé, en cours ou soumis pour ce produit. Ouvrez le produit pour consulter le tableau complet Regulatory status by market (statut réglementaire par marché), qui montre aussi les marchés Not cleared (non autorisés) et ceux sans information.' },
        ], labels: ['Clear filters', 'Copy link', 'Status: see detail', 'Regulatory status by market'] },
      ],
    },
  ],
  related: ['product-detail', 'login', 'csv-import'],
};

export default catalogBrowse;
