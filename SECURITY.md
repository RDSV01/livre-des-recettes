# Sécurité

## Versions suivies

Seule la dernière version publiée reçoit les correctifs de sécurité. L'application propose
elle-même la mise à jour, et vérifie le fichier téléchargé par son empreinte SHA-256 avant
de l'installer.

## Signaler une faille

Ne la signalez pas dans une issue publique : tout le monde la verrait avant qu'elle soit
corrigée.

Passez par le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a
vulnerability** ([lien direct](https://github.com/RDSV01/livre-des-recettes/security/advisories/new)).
Seul le mainteneur voit votre message. Sans compte GitHub, écrivez à
[RDSV01@proton.me](mailto:RDSV01@proton.me).

Indiquez si possible :

- la version de l'application et votre système ;
- les étapes pour reproduire le problème ;
- ce qu'une personne malveillante pourrait en tirer.

Ne joignez jamais votre vrai `livre-des-recettes.json` : le jeu de démonstration suffit
pour montrer un problème.

## Ensuite

La faille est confirmée puis corrigée dans une nouvelle version. Elle est décrite
publiquement une fois cette version publiée, en vous citant si vous le souhaitez.

## Périmètre

L'application tourne sur l'ordinateur de l'utilisateur et n'accepte que les connexions
venues de cet ordinateur (127.0.0.1). Sont notamment concernés :

- un accès aux données depuis une page web ou une autre machine ;
- du code exécuté à partir d'un fichier importé (CSV, sauvegarde, PDF) ;
- une mise à jour qui pourrait être falsifiée ;
- une donnée envoyée hors de l'ordinateur sans action de l'utilisateur.
