# Yumi

App perso de recettes pour iPhone et iPad, installable depuis Safari (« Sur l'écran d'accueil »), sans App Store.

- Recettes avec recherche, catégories, favoris et portions ajustables
- Import depuis Instagram / Facebook (coller la légende, ou raccourci iOS de partage)
- Planning de la semaine et liste de courses calculée
- Synchronisation entre appareils via Supabase

## Structure

- `src/app.html` : le code de l'app (une seule page)
- `build/build.py` : assemble la version installable dans `docs/` (`python3 build/build.py`)
- `build/config.json` : adresse et clé publique Supabase (publique par conception, l'accès aux données est protégé par les règles RLS)
- `docs/` : la version publiée par GitHub Pages
