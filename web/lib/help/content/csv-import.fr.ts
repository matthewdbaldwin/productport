// web/lib/help/content/csv-import.fr.ts
// French sibling of csv-import.ts. Drafted via the local 3090 tier
// (ask-local --translate fr) and reviewed by hand. `labels` stay in English
// on purpose: the editor and import UI are hardcoded English in every locale,
// so the on-screen text the renderer bolds and the audit greps for is English.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const csvImport: HelpArticleContent = {
  slug: 'csv-import',
  title: 'Import et export CSV',
  intro: 'Export CSV télécharge l’intégralité du catalogue sous forme de tableur. Import CSV réinjecte un tableur, en créant ou en mettant à jour un produit par ligne. Verify (dry run) vérifie un fichier sans rien écrire. Les trois boutons se trouvent dans la barre supérieure et ne sont visibles que par les administrateurs.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'workflow', heading: 'La marche à suivre recommandée',
      blocks: [
        { kind: 'steps', steps: [
          'Cliquez sur Export CSV pour télécharger productport-catalog.csv : le catalogue actuel, avec exactement la disposition de colonnes qu’attend l’importateur.',
          'Modifiez le fichier dans un tableur. Gardez toutes les colonnes, ajoutez des lignes pour de nouveaux produits, et laissez les lignes que vous ne modifiez pas intactes.',
          'Cliquez sur Verify (dry run) et sélectionnez le fichier ; le sélecteur de fichiers s’ouvre directement.',
          'Lisez le résultat à côté des boutons : Preview: N new, M updated et, si certaines lignes posent problème, K would fail. Cliquez sur Download errors pour obtenir import-errors.csv, qui liste chaque ligne en échec avec son slug et la raison.',
          'Corrigez ces lignes dans votre tableur et vérifiez à nouveau jusqu’à ce qu’aucune ligne n’échoue.',
          'Cliquez sur Import CSV et sélectionnez le fichier. Le résultat indique Imported: N new, M updated, plus K failed si des lignes ont été rejetées, et le catalogue se recharge.',
        ], labels: ['Export CSV', 'Verify (dry run)', 'Download errors', 'Import CSV'] },
        { kind: 'paragraph', text: 'Le résultat est un texte affiché à côté des boutons, pas une notification, et il reste visible jusqu’à l’exécution suivante. Dans import-errors.csv, le numéro de ligne compte l’en-tête comme la ligne 1 ; les lignes vides sont ignorées, donc un fichier avec des lignes vides aura des numéros de ligne décalés par rapport à votre tableur. Les fichiers jusqu’à 15 MB sont acceptés.', labels: ['Download errors', 'Verify (dry run)'] },
      ],
    },
    {
      id: 'header-check', heading: 'La vérification de l’en-tête',
      blocks: [
        { kind: 'paragraph', text: 'Avant même qu’une seule ligne ne soit lue, l’en-tête est vérifié par rapport aux 36 colonnes que Export CSV produit. Toutes doivent être présentes, dans n’importe quel ordre ; les colonnes supplémentaires sont ignorées et listées comme inconnues dans le résultat. Si une colonne est absente, le fichier entier est rejeté et aucune ligne n’est modifiée, car un import remplace toutes les colonnes et un en-tête incomplet effacerait des données. Partez d’un export plutôt que de construire un fichier à la main.', labels: ['Export CSV', 'Import CSV'] },
      ],
    },
    {
      id: 'matching', heading: 'Comment les lignes sont associées aux produits',
      blocks: [
        { kind: 'list', items: [
          'La clé d’association est la colonne id, c’est-à-dire le slug du produit (lettres minuscules, chiffres et tirets), comparé à l’identique. Un slug existant met à jour ce produit ; un nouveau slug en crée un. Les noms ne servent jamais à l’association.',
          'Une mise à jour remplace toutes les colonnes par les valeurs du CSV ; une cellule vide efface le champ. Les exceptions sont tier, classification et status, où une cellule vide conserve la valeur existante.',
          'Les lignes sont traitées une par une et indépendamment. Une ligne en échec est listée et les autres sont quand même écrites ; rien n’est annulé. Si deux lignes partagent le même id, la dernière l’emporte.',
          'Un slug correspondant à un produit supprimé est refusé ; le produit n’est pas restauré.',
          'Les essais cliniques et les images de la galerie ne sont pas touchés par l’import.',
        ] },
      ],
    },
    {
      id: 'row-rules', heading: 'Ce que chaque ligne doit contenir',
      blocks: [
        { kind: 'list', items: [
          'id, name, subsidiary et therapeutic_area sont obligatoires. therapeutic_area doit être l’un des dix noms canoniques, orthographié exactement comme dans l’export.',
          'Les colonnes de marché fda, ce, nmpa, pmda et tga acceptent cleared ou approved, in progress, submitted, not cleared, et vide ou none. Tout autre mot devient silencieusement none, et Verify (dry run) ne le signale pas ; une faute de frappe telle que clearred efface donc le statut de ce marché.',
          'Chaque *_qualifier doit être vide ou valoir l’un de CMD-only, CE-invalid, agent, pending, recently-approved. Chaque *_cert est séparé par des barres verticales (CE-100|CE-200), jusqu’à 1000 caractères.',
          'tier accepte 1, Tier 1, TIER1 et des orthographes similaires ; classification accepte CORE, HIPO, FLAGSHIP et quelques formes en toutes lettres. Un mot inconnu dans l’un ou l’autre devient silencieusement vide, ce qui, lors d’une mise à jour, conserve la valeur existante.',
          'status doit être ACTIVE, DISCONTINUED ou DRAFT ; tout autre mot est une erreur de ligne. Rappelez-vous que DRAFT masque le produit à tout le monde, y compris aux administrateurs, et qu’Import CSV est alors la seule façon de le changer à nouveau.',
          'Les colonnes de texte libre ont les mêmes limites de longueur que l’éditeur, par exemple 255 caractères pour name et 500 pour tagline.',
        ], labels: ['Verify (dry run)', 'Import CSV'] },
      ],
    },
    {
      id: 'notes-warning', heading: 'Les Notes d’autorisation sont effacées par l’import',
      blocks: [
        { kind: 'paragraph', text: 'L’import supprime et recrée les cinq lignes d’autorisation de chaque produit du fichier, et écrit toujours des Notes vides, car il n’y a pas de colonne notes. Importer un produit, même à partir d’un export non modifié, efface toutes les Notes saisies dans la section Regulatory clearances de l’éditeur. Les numéros de certificat et les Qualifier, eux, sont conservés.', labels: ['Notes', 'Regulatory clearances', 'Import CSV'] },
      ],
    },
    {
      id: 'export', heading: 'Ce que contient l’export',
      blocks: [
        { kind: 'list', items: [
          'Chaque produit non supprimé, y compris les DRAFT et les produits désactivés, par ordre de nom, limité à 5 000 lignes, sous le nom productport-catalog.csv.',
          'Les 36 colonnes ; il n’y a pas de colonne Notes. Les statuts de marché sont écrits sous forme de mots (cleared, in progress, submitted, not cleared, ou vide) ; tier, classification et status sous leur valeur d’énumération (TIER1, CORE, ACTIVE, etc.).',
          'Une cellule qui commence par =, +, - ou @ est écrite avec une apostrophe initiale pour que le tableur ne l’exécute pas comme une formule. Cette apostrophe est réimportée comme faisant partie du texte, donc vérifiez ces cellules (par exemple une tagline qui commence par un tiret) avant l’import.',
        ], labels: ['Export CSV', 'Notes'] },
      ],
    },
    {
      id: 'faq', heading: 'Questions fréquentes',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Dois-je vérifier avant chaque import ?', a: 'Ce n’est pas obligatoire, mais Verify (dry run) exécute les mêmes vérifications qu’un import réel sans rien écrire ; c’est donc le moyen le moins coûteux de repérer une ligne incorrecte.' },
          { q: 'Si certaines lignes échouent, est-ce que quelque chose est annulé ?', a: 'Non. Chaque ligne est traitée indépendamment, et les lignes qui ont réussi sont déjà écrites. Corrigez les lignes en échec et réimportez le fichier ; les lignes inchangées sont simplement mises à jour avec les mêmes valeurs.' },
          { q: 'Pourquoi un statut de marché a-t-il disparu après une importation ?', a: 'Très probablement une faute de frappe dans cette colonne de marché. Tout mot que l’importateur ne reconnaît pas devient none sans erreur. Comparez l’orthographe avec l’export et réimportez.' },
          { q: 'Puis-je importer un fichier avec uniquement les colonnes que je veux modifier ?', a: 'Non. Les 36 colonnes doivent toutes être présentes, car une mise à jour remplace toutes les colonnes. Exportez le catalogue, modifiez les cellules dont vous avez besoin, puis importez ce fichier.' },
          { q: 'Puis-je construire le fichier à la main ?', a: 'Vous pouvez, mais il doit contenir les 36 colonnes avec les noms d’en-tête exacts. Commencer à partir d’Export CSV est bien plus sûr.' },
        ] },
      ],
    },
  ],
  related: ['product-edit', 'product-create', 'catalog-browse'],
};

export default csvImport;
