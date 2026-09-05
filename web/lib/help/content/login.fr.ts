// web/lib/help/content/login.fr.ts — « Connexion » (section: Account), French.
// Drafted by the local translation model from login.ts and hand-reviewed
// (vouvoiement, typographic apostrophes). `labels` are the exact `auth.*` /
// `profile.*` values from messages/fr.json. The two login-page strings
// (auth.redirecting, auth.signInWithSalesPort) contain a straight apostrophe
// in fr.json, so they are quoted in prose only and not listed as labels.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const login: HelpArticleContent = {
  slug:  'login',
  title: 'Connexion',
  intro: 'ProductPort n’a pas de mot de passe propre. Vous vous connectez via le Portail de l’entreprise (hub.microport.com), et ProductPort fait confiance à la réponse qu’il reçoit.',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'how-it-works', heading: 'Fonctionnement de la connexion',
      blocks: [
        { kind: 'steps', steps: [
          'Ouvrez ProductPort. Si vous n’êtes pas connecté, vous arrivez sur la page de connexion, qui affiche Redirection vers le Portail de l’entreprise… et vous envoie d’elle-même vers le portail. Le bouton Se connecter avec le Portail de l’entreprise n’est qu’une solution de repli : cliquez dessus uniquement si la redirection ne se produit pas.',
          'Connectez-vous au Portail de l’entreprise. Une fois votre identité confirmée, il vous renvoie vers ProductPort.',
          'ProductPort affiche Finalisation de la connexion… pendant un instant, puis ouvre le catalogue.',
        ], labels: ['Finalisation de la connexion…'] },
        { kind: 'paragraph', text: 'Une session dure 8 heures par défaut. Passé ce délai, ProductPort vous renvoie vers la page de connexion au prochain chargement d’une page.' },
      ],
    },
    {
      id: 'access', heading: 'Qui peut se connecter, et ce que vous pouvez faire',
      blocks: [
        { kind: 'paragraph', text: 'Chaque employé dispose par défaut d’un accès en lecture seule : vous pouvez parcourir le catalogue, y effectuer des recherches, ouvrir la fiche d’un produit et copier le lien d’un produit.' },
        { kind: 'paragraph', text: 'Les droits d’administrateur de produit, qui permettent d’ajouter, de modifier, d’importer et d’exporter des produits, sont accordés par un administrateur dans le Portail de l’entreprise, et non dans ProductPort. Votre rôle actuel est affiché dans le panneau de profil.' },
      ],
    },
    {
      id: 'trouble', heading: 'Si la connexion n’aboutit pas',
      blocks: [
        { kind: 'list', items: [
          'La page indique que la connexion n’a pas pu aboutir et propose Retour à la connexion. Cliquez dessus pour recommencer. Si l’échec persiste, contactez votre administrateur.',
          'La page indique que l’accès a été refusé. Demandez à un administrateur de vous accorder l’accès à ProductPort dans le Portail de l’entreprise. Le message peut mentionner SalesPort, l’ancien nom du portail ; il s’agit du même endroit.',
          'La connexion tourne en boucle. Si vous êtes renvoyé vers le portail plus de deux fois en 12 secondes environ, ProductPort s’arrête et affiche un bouton Réessayer. Cliquez dessus une seule fois ; si la même chose se reproduit, contactez votre administrateur.',
          'Les cookies sont bloqués. Si votre navigateur bloque les cookies ou le stockage du site (Safari avec l’option Bloquer tous les cookies activée, et certains modes de navigation privée), la connexion ne peut pas aboutir et la page vous l’indique. Modifiez le réglage ou quittez la navigation privée, puis réessayez.',
        ], labels: ['Retour à la connexion', 'Réessayer'] },
      ],
    },
    {
      id: 'profile', heading: 'Votre profil et la déconnexion',
      blocks: [
        { kind: 'paragraph', text: 'L’icône Profil dans la barre supérieure ouvre un panneau latéral affichant votre nom, votre e-mail et votre rôle. Ces informations sont gérées de manière centralisée et sont en lecture seule ici ; Gérer votre compte ouvre le Portail de l’entreprise dans un nouvel onglet.', labels: ['Profil', 'Gérer votre compte'] },
        { kind: 'paragraph', text: 'Le sélecteur Thème modifie l’apparence de ProductPort. Votre choix est enregistré dans votre compte et vous suit dans les autres applications MicroPort.', labels: ['Thème'] },
        { kind: 'paragraph', text: 'Le bouton Se déconnecter se trouve en bas du panneau ; c’est le seul endroit de ProductPort où vous pouvez vous déconnecter. Vous arrivez ensuite sur la page de connexion, qui relance immédiatement la connexion : fermez donc l’onglet si vous avez terminé.', labels: ['Se déconnecter'] },
      ],
    },
    {
      id: 'faq', heading: 'Questions fréquentes',
      blocks: [
        { kind: 'faq', items: [
          { q: 'Ai-je un mot de passe distinct pour ProductPort ?', a: 'Non. ProductPort ne demande jamais de mot de passe ; vous vous connectez toujours via le Portail de l’entreprise.' },
          { q: 'Pourquoi ai-je été renvoyé vers la page de connexion pendant que je travaillais ?', a: 'Votre session avait expiré. Une session dure 8 heures par défaut ; reconnectez-vous pour poursuivre.' },
          { q: 'Je vois le catalogue, mais je ne peux ni ajouter ni modifier de produits. Pourquoi ?', a: 'Vous disposez d’un accès en lecture seule. Demandez à un administrateur de vous accorder les droits d’administrateur de produit dans le Portail de l’entreprise.' },
          { q: 'Pourquoi le message d’accès refusé mentionne-t-il SalesPort ?', a: 'SalesPort est l’ancien nom du Portail de l’entreprise. Demandez à un administrateur de vous y accorder l’accès.' },
          { q: 'Je me suis déconnecté et j’ai été renvoyé directement vers la page de connexion. Est-ce normal ?', a: 'Oui. La page de connexion relance automatiquement la connexion. Si vous avez terminé, fermez plutôt l’onglet.' },
        ] },
      ],
    },
  ],
  related: ['catalog-browse'],
};

export default login;
