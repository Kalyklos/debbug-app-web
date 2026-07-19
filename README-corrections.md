# Mission Apéro — version corrigée (build v11-audit-fixes)

Cette version reprend l'intégralité du site v10 et corrige les problèmes relevés dans le rapport d'audit (`rapport-audit-mission-apero.md`). Elle est composée de trois fichiers à déployer ensemble, **sur HTTPS obligatoirement** (caméra, capteurs, micro et service worker ne fonctionnent qu'en HTTPS) : `index.html`, `sw.js` et `manifest.json`.

## Corrections intégrées dans le code

**Chronomètre fiable (P0).** Le chrono ne compte plus des ticks de `setInterval` mais des écarts d'horodatage réels (`Date.now()`). Si le téléphone se verrouille ou passe en arrière-plan, le temps est rattrapé au retour au premier plan. L'API Wake Lock est en plus demandée pendant la partie pour éviter la mise en veille de l'écran, et relâchée en pause et en fin de partie.

**Persistance de partie (P0).** L'état complet (mission, temps restant, temps joué, pénalités, historique d'indices, réponses déjà achetées, loupe sélectionnée, mode libre) est sauvegardé dans `localStorage` à chaque seconde et à chaque événement important. Au chargement, si une sauvegarde de moins de 12 h correspond à une mission existante, un écran propose de reprendre la partie (en pause, pour que le groupe relance volontairement) ou d'abandonner.

**Failles XSS (P0).** Tout contenu externe passe par `esc()` avant insertion en `innerHTML` : contenu des QR codes scannés (le vecteur le plus exposé — n'importe qui peut présenter un QR malveillant à la caméra), champs de la base (noms, badges, captions, codes), historique. Les URLs venant de la base passent par `safeUrl()` (protocole http/https imposé, caractères dangereux encodés) avant usage en `src` ou en `background-image`. Le nom de marque est construit en DOM (`textContent`) et non plus en HTML.

**Dépendance réseau (P0 partiel).** Un service worker (`sw.js`) met en cache l'app et tous les médias déjà chargés (images d'indices, sons, polices, jsQR) : une coupure de connexion en cours de partie n'est plus fatale pour ce qui a déjà été vu. Les données Supabase restent en réseau-d'abord avec repli cache. En complément, l'échec de chargement initial affiche désormais un message d'erreur clair avec bouton « Réessayer » au lieu d'un écran silencieux, et `startGame` refuse de lancer une partie sans mission chargée.

**Flux mission unique cassé (P1, bloquant).** `resetGame` relance désormais `init()` : après une partie, l'app recharge les missions et refonctionne, y compris quand une seule glacière existe (l'écran restait auparavant figé sur « Chargement... »).

**Pénalité de réponse re-facturée (P1).** Chaque entrée d'historique porte un drapeau `answered`. La pénalité « voir la réponse » n'est appliquée qu'une fois par carte ; les consultations suivantes affichent « REVOIR LA RÉPONSE (gratuit) ».

**Écran pause inatteignable (P1).** Le bouton pause de la couronne ouvre maintenant réellement l'écran de pause thématique (fond `pause_bg_url` configuré par mission), qui était codé mais jamais affiché.

**Alerte « la glacière se réchauffe » sautable (P1).** Le déclenchement est passé de `=== 600` à `<= 600` avec drapeau `warmingShown` : une pénalité qui fait sauter la seconde exacte ne supprime plus l'alerte. Le bip des 10 dernières secondes est dédupliqué par seconde affichée (il ne dépend plus du rythme des ticks).

**Temps réalisé faussé (P1).** Les écrans victoire et photo souvenir affichent le temps réellement joué (`usedMs`), plus le temps « restant inversé » qui incluait les pénalités.

**Loupe (P1 + perf).** La fermeture du panneau ne fait plus avancer `loupeStep` automatiquement ; des flèches ‹ › permettent de choisir la loupe, le filtre est relu à chaque image (on peut changer de loupe caméra allumée), et le traitement pixel-par-pixel est plafonné à 480 px de large au lieu de la pleine résolution caméra (échauffement et batterie).

**Micro sans reconnaissance vocale (P1).** Un champ de saisie clavier partage la même logique de vérification que la voix (`checkMicroAnswer`). Sur Firefox ou tout navigateur sans Web Speech API, le statut l'indique et le jeu reste jouable.

**Codes limités à 4 chiffres (P1).** Le pavé numérique accepte désormais 8 caractères.

**Divers.** Double chargement du son morse supprimé (un seul élément `<audio>`) ; compteur d'indices initialisé à 0 au lieu de « ∞ » ; bouton REVOIR avec retour visuel quand aucun indice n'a été consulté ; jsQR chargé à la demande à l'ouverture du lecteur QR (plus de dépendance CDN au démarrage) ; `user-scalable=no` retiré et `aria-label` ajoutés (accessibilité) ; `background-size:cover` restauré sur les visuels de mission ; mentions de confidentialité caméra/micro/photo ajoutées ; durée de partie configurable (voir ci-dessous) ; citation de défaite configurable ; code mort supprimé (`codes`, `startCompass`/`stopCompass`/`handleCompass`, `togglePause`, bloc `ic-penalty`, `body::before`, variable `morseAudio`).

## Colonnes de base facultatives (nouvelles possibilités)

Deux colonnes optionnelles peuvent être ajoutées à la table `glacieres` — le code fonctionne sans, avec des valeurs par défaut :

- `duree_min` (int) : durée de la partie en minutes, défaut 60. Le code mort `durMin` de la v10 est devenu un vrai réglage.
- `citation_defaite` (text) : citation affichée sur l'écran « temps écoulé », en pendant de `citation_victoire`.

Recommandation de nommage (non bloquante) : renommer `actif` (mission publiée) et `active` (mission jouable/verrouillée) en `publie` / `jouable` pour lever l'ambiguïté relevée dans l'audit. Le code actuel conserve les noms existants et documente leur rôle en commentaire.

## ⚠️ Étape backend indispensable : la triche (P0 sécurité)

**Ce point ne peut pas être corrigé dans le HTML.** Tant que l'API Supabase renvoie les cartes-réponses (`numero + 100`), les cartes micro (`numero ≥ 200` avec `caption_code`) et les colonnes `boussole_code`, `gyro_code`, `boussole_access_code`, `gyro_access_code` à la clé publique, un joueur qui ouvre les outils développeur de son navigateur voit toutes les solutions. Les vérifications de codes du fichier corrigé restent côté client (c'est signalé en commentaire dans le code) : le jeu est fonctionnel à l'identique, mais la protection réelle exige les deux actions suivantes côté Supabase.

**1. Politiques RLS pour masquer les secrets.** Activer Row Level Security et ne servir aux clients anonymes que les données non sensibles :

```sql
alter table glacieres enable row level security;
alter table cartes enable row level security;

-- Les glacières restent lisibles, mais créer une VUE publique sans les colonnes
-- de codes, et faire pointer le front dessus :
create view glacieres_public as
  select id, nom, nom_escape, synopsis, actif, active, created_at,
         penalty_min, penalite_active, duree_min,
         citation_victoire, citation_defaite,
         logo_url, mission_bg_url, game_bg_url, pause_bg_url,
         music_url, bip_url, morse_url, mission_emoji, badge_text, couleur_accent,
         boussole_target, gyro_image_url,
         btn_machine, btn_morse, btn_micro, btn_revoir, btn_boussole, btn_indice,
         btn_gyroscope, btn_scanner, btn_loupe,
         loupe1_url, loupe1_filtre, loupe2_url, loupe2_filtre, loupe3_url, loupe3_filtre
  from glacieres;
-- (adapter la liste : tout SAUF boussole_code, gyro_code, *_access_code)

-- Cartes : ne servir que les indices, jamais les réponses ni les cartes micro
create policy "cartes indices publics" on cartes
  for select to anon
  using (numero < 100);
```

**2. Edge Function de vérification des codes.** Les comparaisons (codes d'accès boussole/labyrinthe, récompenses, mot de passe micro, réponses) se font alors côté serveur. Exemple de fonction `verify-code` :

```ts
// supabase/functions/verify-code/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { glaciere_id, type, code } = await req.json();
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // clé serveur, jamais exposée au client
  );

  if (type === "gate_boussole" || type === "gate_gyroscope") {
    const col = type === "gate_boussole" ? "boussole_access_code" : "gyro_access_code";
    const { data: g } = await supa.from("glacieres").select(col).eq("id", glaciere_id).single();
    return Response.json({ ok: g && String(g[col]).trim() === String(code).trim() });
  }

  if (type === "answer") {
    // code = numéro de carte ; renvoie la carte-réponse seulement à la demande
    const { data: c } = await supa.from("cartes")
      .select("image_url, caption")
      .eq("glaciere_id", glaciere_id).eq("numero", Number(code) + 100).single();
    return Response.json({ ok: !!c, payload: c });
  }

  if (type === "micro") {
    // code = texte entendu/saisi ; la comparaison de similarité se fait ici
    const { data: cs } = await supa.from("cartes")
      .select("caption, caption_code")
      .eq("glaciere_id", glaciere_id).gte("numero", 200);
    // ... reprendre normalizeSpeech/wordOverlapRatio côté serveur ...
    return Response.json({ ok: false });
  }

  return Response.json({ ok: false }, { status: 400 });
});
```

Une fois la fonction déployée, remplacer dans `index.html` les comparaisons locales (`submitGateCode`, `showAnswer`, `checkMicroAnswer`, `onBoussoleWin`, `onMazeWin`) par des appels `fetch` à `/functions/v1/verify-code` — les emplacements sont signalés par des commentaires `NOTE sécurité` dans le code.

## Déploiement

1. Héberger `index.html`, `sw.js` et `manifest.json` dans le même dossier, servis en HTTPS.
2. Ajouter des icônes PWA (192×192 et 512×512) et les déclarer dans `manifest.json` (le tableau `icons` est vide pour l'instant).
3. Appliquer les étapes RLS + Edge Function ci-dessus avant toute exploitation commerciale sérieuse — c'est le seul point de l'audit qui reste ouvert côté serveur.
