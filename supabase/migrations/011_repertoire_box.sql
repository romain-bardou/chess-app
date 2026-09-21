-- ============================================================
-- 011_repertoire_box.sql — boîtes de progression sur les ouvertures
-- ============================================================
-- Même logique que `mistakes.box` (010_mistake_box.sql), appliquée aux fins
-- de variante (`is_book_end`) du répertoire : `clean` (008) ne distinguait
-- que « dernière tentative propre ou non », sans mémoire de la première
-- réussite. `box` ajoute le palier manquant : une variante déjà validée doit
-- être réussie une seconde fois pour devenir « maîtrisée ».
--   new         jamais réussie d'une traite
--   unvalidated ratée au moins une fois depuis, quelle que soit sa boîte d'avant
--   validated   réussie une fois depuis new/unvalidated
--   mastered    réussie une seconde fois depuis validated
--
-- Transitions identiques à `nextBox` (app/src/lib/fsrs.ts), appliquées à la
-- fin de variante plutôt qu'à chaque coup : voir RepertoireScreen.tsx, à
-- l'endroit où `clean` était écrit.

alter table repertoire_nodes
  add column if not exists box text not null default 'new'
    check (box in ('new','unvalidated','validated','mastered'));

update repertoire_nodes set box = case when clean then 'validated' else 'new' end;

alter table repertoire_nodes drop column if exists clean;
